-- Nouvelle offre : identifiant distinct, sans réécriture des contrats historiques.
insert into public.tarif_formules(code,nom,biens_max,mensuel_cents,annuel_cents,rang)
values ('gerimmo','Gerimmo',1,599,5990,0);

create function public.montant_proprietaire_unique(p_unites integer, p_periodicite text)
returns bigint language plpgsql immutable strict set search_path='' as $$
begin
  if p_unites < 0 or p_periodicite not in ('mensuel','annuel') then raise exception 'Tarif ou quantité invalide'; end if;
  return (case when p_unites = 0 then 0 when p_unites <= 7 then 599 + (p_unites-1)*199
    when p_unites <= 20 then 1990 else 1990 + (p_unites::bigint-20)*99 end)
    * case when p_periodicite='annuel' then 10 else 1 end;
end $$;
revoke all on function public.montant_proprietaire_unique(integer,text) from public,anon;
grant execute on function public.montant_proprietaire_unique(integer,text) to authenticated,service_role;

-- L’ancien calcul reste utilisable pour relire les engagements déjà souscrits.
create or replace function public.formule_couvrante(p_biens integer,p_periodicite text default 'mensuel')
returns text language sql stable security definer set search_path='' as $$
 select f.code from public.tarif_formules f where f.code <> 'gerimmo'
   and (f.biens_max >= greatest(coalesce(p_biens,0),1) or f.code='patrimoine')
 order by (case when p_periodicite='annuel' then f.annuel_cents else f.mensuel_cents end)::bigint
   + case when f.code='patrimoine' then greatest(0::bigint,p_biens::bigint-f.biens_max)*public.tarif_supplement_bien_cents(p_periodicite) else 0 end, f.rang limit 1
$$;

create table public.avantages_fondateurs (
 place smallint primary key check(place between 1 and 10),
 organization_id uuid not null unique references public.organizations(id),
 beneficiaire uuid not null unique references public.accounts(id),
 attribue_par uuid not null references public.accounts(id),
 debut date not null, fin_incluse date not null check(fin_incluse >= debut)
);
alter table public.avantages_fondateurs enable row level security;
revoke all on public.avantages_fondateurs from public,anon,authenticated,service_role;

create function public.accorder_avantage_fondateur(p_org uuid) returns date
language plpgsql security definer set search_path='' as $$
declare v public.organizations; personne uuid; place_libre smallint; jour date := (now() at time zone 'Europe/Paris')::date; fin date;
begin
 if auth.uid() is null or public.is_permanent_super_admin() is not true then raise exception 'Supervision avec double vérification requise'; end if;
 perform pg_catalog.pg_advisory_xact_lock(623101,pg_catalog.hashtext(p_org::text));
 select * into strict v from public.organizations where id=p_org for update;
 if v.type <> 'proprietaire_direct' or v.status <> 'essai'
   or exists(select 1 from public.abonnements where organization_id=p_org)
   or exists(select 1 from public.intentions_souscription where organization_id=p_org)
 then raise exception 'Réservé à un propriétaire en essai avant toute souscription'; end if;
 select account_id into strict personne from public.memberships where organization_id=p_org and role='proprietaire_direct' and status='active';
 lock table public.avantages_fondateurs in exclusive mode;
 select i into place_libre from generate_series(1,10) i where not exists(select from public.avantages_fondateurs f where f.place=i) order by i limit 1;
 if place_libre is null then raise exception 'Les dix places ont déjà été attribuées'; end if;
 fin := (jour + interval '6 months')::date - 1;
 if v.essai_fin > fin then raise exception 'Cet avantage raccourcirait un droit existant'; end if;
 insert into public.avantages_fondateurs values(place_libre,p_org,personne,auth.uid(),jour,fin);
 update public.organizations set essai_fin=fin where id=p_org;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),p_org,'avantage_fondateur_accorde',jsonb_build_object('place',place_libre,'fin',fin));
 return fin;
end $$;
revoke all on function public.accorder_avantage_fondateur(uuid) from public,anon,service_role;
grant execute on function public.accorder_avantage_fondateur(uuid) to authenticated;

-- Empêche une commande concurrente préparée avant la prolongation de conserver l’ancien trial_end.
-- La souscription devient possible à la fin, uniquement par confirmation explicite du propriétaire.
create function public.proteger_essai_fondateur() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select from public.avantages_fondateurs f where f.organization_id=new.organization_id and f.fin_incluse >= (now() at time zone 'Europe/Paris')::date)
 then raise exception 'Votre période fondateur est offerte. Vous pourrez souscrire après sa date de fin.'; end if;
 return new;
end $$;
revoke all on function public.proteger_essai_fondateur() from public,anon,authenticated,service_role;
create trigger proteger_essai_fondateur before insert on public.intentions_souscription for each row execute function public.proteger_essai_fondateur();

-- Conserver les gardes, les droits et le calendrier de Paris de la fonction en place.
do $tarif$
declare
 definition text := pg_get_functiondef('public.etat_abonnement(uuid)'::regprocedure);
 motif constant text := 'then round(public.montant_offre_cents(o.type,';
begin
 if strpos(definition,motif)=0 then raise exception 'Version inattendue de etat_abonnement'; end if;
 execute replace(definition,motif,
   'and o.type = ''proprietaire_direct'' and not exists (
        select 1 from public.abonnements h where h.organization_id=o.id
        and h.stripe_subscription_id is not null and h.formule is distinct from ''gerimmo'')
       then round(public.montant_proprietaire_unique(coalesce(public.capacite_souscrite(o.id),public.unites_a_couvrir(o.id)),''mensuel'') / 100.0,2)
     when o.grille_tarifaire = ''2026-09-28'' then round(public.montant_offre_cents(o.type,');
end $tarif$;
