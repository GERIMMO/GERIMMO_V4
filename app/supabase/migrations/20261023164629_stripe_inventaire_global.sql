-- PAY-5 : inventaire indépendant des clients Gerimmo, sans écriture chez Stripe.
set lock_timeout = '10s';
create table if not exists public.stripe_inventaire (
  singleton boolean primary key default true check(singleton),
  cycle uuid,
  avant_epoch bigint,
  curseur text,
  lus integer not null default 0,
  debut_le timestamptz,
  complet_le timestamptz,
  passage_le timestamptz,
  erreur boolean not null default false,
  verrou_jeton uuid,
  verrou_jusqua timestamptz
);
create table if not exists public.stripe_souscriptions_non_suivies (
  souscription text primary key check(souscription ~ '^sub_[A-Za-z0-9_]{1,200}$'),
  client text not null check(client ~ '^cus_[A-Za-z0-9_]{1,200}$'),
  motif text not null check(motif in ('client_absent','souscription_non_suivie')),
  cycle uuid not null,
  verifie_le timestamptz not null default now()
);
alter table public.stripe_inventaire enable row level security;
alter table public.stripe_souscriptions_non_suivies enable row level security;
revoke all on public.stripe_inventaire,public.stripe_souscriptions_non_suivies from public,anon,authenticated;
grant all on public.stripe_inventaire,public.stripe_souscriptions_non_suivies to service_role;
insert into public.stripe_inventaire(singleton) values(true) on conflict do nothing;

create or replace function public.stripe_inventaire_prendre(p_jeton uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.stripe_inventaire;
begin
  if p_jeton is null then raise exception 'Jeton de contrôle absent'; end if;
  select * into v from public.stripe_inventaire where singleton for update;
  if v.verrou_jusqua > clock_timestamp() then return null; end if;
  if v.curseur is null then
    v.cycle := gen_random_uuid();
    v.avant_epoch := floor(extract(epoch from clock_timestamp()))::bigint;
    v.lus := 0;
    v.debut_le := clock_timestamp();
  end if;
  update public.stripe_inventaire set cycle=v.cycle,avant_epoch=v.avant_epoch,lus=v.lus,debut_le=v.debut_le,
    verrou_jeton=p_jeton,verrou_jusqua=clock_timestamp()+interval '90 seconds' where singleton;
  return jsonb_build_object('cycle',v.cycle,'avant_epoch',v.avant_epoch,'curseur',v.curseur);
end; $$;

-- Une page est confirmée avec son curseur dans la même transaction. Une interruption
-- avant cette confirmation relit la page, sans perdre de souscription ni doubler un écart.
create or replace function public.stripe_inventaire_page(p_jeton uuid,p_curseur text,p_lignes jsonb,p_suite boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.stripe_inventaire; x jsonb; a public.abonnements; m text; n integer; dernier text;
begin
  select * into v from public.stripe_inventaire where singleton for update;
  if p_jeton is null or v.verrou_jeton is distinct from p_jeton or v.verrou_jusqua<=clock_timestamp()
    or v.curseur is distinct from p_curseur then raise exception 'Réservation de contrôle expirée'; end if;
  if p_lignes is null or jsonb_typeof(p_lignes)<>'array' or p_suite is null then raise exception 'Page de contrôle invalide'; end if;
  n := jsonb_array_length(p_lignes);
  if n>100 or (p_suite and n=0) then raise exception 'Page de contrôle invalide'; end if;
  if (select count(distinct j->>'souscription') from jsonb_array_elements(p_lignes) j)<>n then
    raise exception 'Souscription répétée'; end if;
  for x in select * from jsonb_array_elements(p_lignes) loop
    if jsonb_typeof(x)<>'object' or (x - array['souscription','client','statut'])<>'{}'::jsonb
      or coalesce(x->>'souscription','') !~ '^sub_[A-Za-z0-9_]{1,200}$'
      or coalesce(x->>'client','') !~ '^cus_[A-Za-z0-9_]{1,200}$'
      or coalesce(x->>'statut','') not in ('active','trialing','past_due','unpaid','paused','incomplete','canceled','incomplete_expired') then
      raise exception 'Référence de contrôle invalide'; end if;
    dernier := x->>'souscription';
    m := null;
    if x->>'statut' not in ('canceled','incomplete_expired') then
      select * into a from public.abonnements where stripe_customer_id=x->>'client';
      if not found then m := 'client_absent';
      elsif a.stripe_subscription_id is distinct from dernier then m := 'souscription_non_suivie'; end if;
    end if;
    if m is null then delete from public.stripe_souscriptions_non_suivies where souscription=dernier;
    else
      insert into public.stripe_souscriptions_non_suivies(souscription,client,motif,cycle,verifie_le)
        values(dernier,x->>'client',m,v.cycle,clock_timestamp())
        on conflict(souscription) do update set client=excluded.client,motif=excluded.motif,cycle=excluded.cycle,verifie_le=excluded.verifie_le;
    end if;
  end loop;
  if p_suite and dernier is not distinct from p_curseur then raise exception 'Curseur sans progression'; end if;
  if not p_suite then
    -- Seulement après un inventaire terminé : une lecture interrompue n'efface aucun écart ancien.
    delete from public.stripe_souscriptions_non_suivies where cycle<>v.cycle;
  end if;
  update public.stripe_inventaire set curseur=case when p_suite then dernier else null end,
    lus=lus+n,passage_le=clock_timestamp(),erreur=false,
    complet_le=case when p_suite then complet_le else clock_timestamp() end,
    verrou_jusqua=clock_timestamp()+interval '90 seconds' where singleton;
  return jsonb_build_object('lus',v.lus+n,'ecarts',(select count(*) from public.stripe_souscriptions_non_suivies),'incomplet',p_suite);
end; $$;

create or replace function public.stripe_inventaire_liberer(p_jeton uuid,p_erreur boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.stripe_inventaire set verrou_jeton=null,verrou_jusqua=null,
    erreur=coalesce(p_erreur,true),passage_le=clock_timestamp()
    where singleton and verrou_jeton=p_jeton and verrou_jusqua>clock_timestamp();
  get diagnostics n=row_count; return n=1;
end; $$;

create or replace function public.supervision_stripe_inventaire()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.is_super_admin(),false) then raise exception 'Réservé à la supervision' using errcode='42501'; end if;
  return (select jsonb_build_object('lus',i.lus,'debut_le',i.debut_le,'complet_le',i.complet_le,'passage_le',i.passage_le,
    'incomplet',i.curseur is not null,'erreur',i.erreur,
    'ecarts',(select count(*) from public.stripe_souscriptions_non_suivies),
    'dossiers',coalesce((select jsonb_agg(to_jsonb(d)) from
      (select souscription,client,motif,verifie_le from public.stripe_souscriptions_non_suivies order by verifie_le desc,souscription limit 50) d),'[]'::jsonb))
    from public.stripe_inventaire i where singleton);
end; $$;
revoke all on function public.stripe_inventaire_prendre(uuid),public.stripe_inventaire_page(uuid,text,jsonb,boolean),
  public.stripe_inventaire_liberer(uuid,boolean),public.supervision_stripe_inventaire() from public,anon,authenticated;
grant execute on function public.stripe_inventaire_prendre(uuid),public.stripe_inventaire_page(uuid,text,jsonb,boolean),
  public.stripe_inventaire_liberer(uuid,boolean) to service_role;
grant execute on function public.supervision_stripe_inventaire() to authenticated;
select public.fermer_fonctions_a_anon();
