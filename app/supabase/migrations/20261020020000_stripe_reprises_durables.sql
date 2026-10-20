-- File durable : aucune donnée bancaire ni coordonnée dans les références.
set lock_timeout = '10s';
alter table public.abonnement_evenements add column if not exists verrou_jeton uuid;
alter table public.abonnement_evenements add column if not exists verrou_jusqua timestamptz;
alter table public.abonnement_evenements add column if not exists tentatives integer not null default 0;
alter table public.abonnement_evenements add column if not exists reprendre_apres timestamptz not null default now();
alter table public.abonnement_evenements add column if not exists avis_debut_le timestamptz;
alter table public.abonnement_evenements add column if not exists avis_a_verifier boolean not null default false;
create index if not exists abonnement_evenements_reprise on public.abonnement_evenements(reprendre_apres) where traite_le is null;

create or replace function public.stripe_evenement_prendre(p_event_id text,p_type text,p_reference jsonb,p_jeton uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v public.abonnement_evenements; v_client text := p_reference->>'client';
begin
  if p_jeton is null or p_event_id !~ '^evt_[A-Za-z0-9_]{1,200}$'
    or p_type not in ('customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed','customer.subscription.trial_will_end','invoice.paid')
    or p_reference is null or jsonb_typeof(p_reference)<>'object'
    or (p_reference - array['objet','client']) <> '{}'::jsonb
    or coalesce(p_reference->>'objet','') !~ '^(sub|in)_[A-Za-z0-9_]{1,200}$'
    or (v_client is not null and v_client !~ '^cus_[A-Za-z0-9_]{1,200}$') then
    raise exception 'Référence de paiement invalide';
  end if;
  -- Deux événements du même client ne doivent pas appliquer des lectures concurrentes.
  perform pg_catalog.pg_advisory_xact_lock(620200,pg_catalog.hashtext(coalesce(v_client,p_event_id)));
  insert into public.abonnement_evenements(stripe_event_id,type,charge) values(p_event_id,p_type,p_reference)
    on conflict(stripe_event_id) do nothing;
  select * into v from public.abonnement_evenements where stripe_event_id=p_event_id for update;
  if v.type<>p_type or (v.charge is not null and v.charge<>p_reference) then raise exception 'Réception incohérente'; end if;
  if v.traite_le is not null then return 'traite'; end if;
  if v.verrou_jusqua>clock_timestamp() or exists(select 1 from public.abonnement_evenements e
      where e.stripe_event_id<>p_event_id and e.charge->>'client'=v_client and e.verrou_jusqua>clock_timestamp()) then return 'occupe'; end if;
  -- Le service de courrier retient les clés 24 h. Passé 23 h, un avis ambigu
  -- reste visible à examiner ; aucune seconde invitation n'est envoyée à l'aveugle.
  if p_type='customer.subscription.trial_will_end' and
     (v.avis_a_verifier or coalesce(v.avis_debut_le,v.recu_le)<clock_timestamp()-interval '23 hours') then
    update public.abonnement_evenements set avis_a_verifier=true,tentatives=greatest(tentatives,20),
      erreur='Avis de fin d’essai à vérifier : envoi antérieur non confirmé.' where stripe_event_id=p_event_id;
    return 'examiner';
  end if;
  if v.reprendre_apres>clock_timestamp() or v.tentatives>=20 then return 'attendre'; end if;
  update public.abonnement_evenements set charge=p_reference,verrou_jeton=p_jeton,
    verrou_jusqua=clock_timestamp()+interval '90 seconds',tentatives=tentatives+1,
    avis_debut_le=case when p_type='customer.subscription.trial_will_end' then coalesce(avis_debut_le,clock_timestamp()) else avis_debut_le end where stripe_event_id=p_event_id;
  return 'pris';
end; $$;

create or replace function public.stripe_evenement_finir(p_event_id text,p_jeton uuid,p_reussi boolean,p_motif text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  update public.abonnement_evenements set traite_le=case when p_reussi then clock_timestamp() else null end,
    erreur=left(p_motif,500),verrou_jeton=null,verrou_jusqua=null,
    reprendre_apres=clock_timestamp()+case when p_reussi then interval '0 seconds' else interval '1 minute' end
    where stripe_event_id=p_event_id and verrou_jeton=p_jeton and verrou_jusqua>clock_timestamp() and traite_le is null;
  get diagnostics v_n = row_count; return v_n=1;
end; $$;

-- Le verrou est vérifié dans la MÊME transaction que chaque écriture métier.
-- Un ancien travailleur repris après expiration ne peut plus écraser le résultat du suivant.
create or replace function public.stripe_evenement_appliquer(p_event_id text,p_jeton uuid,p_action text,p_params jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.abonnement_evenements; v_resultat uuid;
begin
  select * into v from public.abonnement_evenements where stripe_event_id=p_event_id for update;
  if p_jeton is null or not found or v.verrou_jeton is distinct from p_jeton or v.verrou_jusqua<=clock_timestamp() or v.traite_le is not null then
    raise exception 'Réservation de paiement expirée';
  end if;
  if p_params->>'p_customer' is distinct from v.charge->>'client' then raise exception 'Client de paiement incohérent'; end if;
  if p_action='abonnement_appliquer' then
    if p_params->>'p_subscription' is distinct from v.charge->>'objet' then raise exception 'Souscription incohérente'; end if;
    select public.abonnement_appliquer(p_params->>'p_customer',p_params->>'p_subscription',p_params->>'p_statut',
      (p_params->>'p_quantite')::integer,(p_params->>'p_periode_fin')::timestamptz,(p_params->>'p_annulation')::boolean) into v_resultat;
  elsif p_action='abonnement_details' then
    perform public.abonnement_details(p_params->>'p_customer',p_params->>'p_periodicite',p_params->>'p_formule',
      (p_params->>'p_unites')::integer,(p_params->>'p_montant_periode_cents')::bigint,(p_params->>'p_periode_debut')::timestamptz);
  elsif p_action='abonnement_facture_payee' and v.type='invoice.paid' then
    select public.abonnement_facture_payee(p_params->>'p_customer',p_params->>'p_subscription') into v_resultat;
  else raise exception 'Action de paiement inconnue';
  end if;
  return to_jsonb(v_resultat);
end; $$;
revoke all on function public.stripe_evenement_prendre(text,text,jsonb,uuid),public.stripe_evenement_finir(text,uuid,boolean,text),public.stripe_evenement_appliquer(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.stripe_evenement_prendre(text,text,jsonb,uuid),public.stripe_evenement_finir(text,uuid,boolean,text),public.stripe_evenement_appliquer(text,uuid,text,jsonb) to service_role;
select public.fermer_fonctions_a_anon();

-- Le contrôle quotidien compare seulement les états. Il ne crée ni paiement, ni remboursement.
alter table public.abonnements add column if not exists stripe_controle_le timestamptz;
alter table public.abonnements add column if not exists stripe_controle_ecarts text[] not null default '{}';
create or replace function public.stripe_controles_a_faire(p_limite integer default 20)
returns setof public.abonnements language sql stable security definer set search_path = '' as $$
  select a.* from public.abonnements a where a.stripe_customer_id is not null
    and (a.stripe_controle_le is null or (a.stripe_controle_le at time zone 'Europe/Paris')::date < public.aujourdhui_paris())
    order by a.stripe_controle_le nulls first,a.organization_id limit greatest(1,least(p_limite,200));
$$;
create or replace function public.stripe_controle_enregistrer(p_org uuid,p_ecarts text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_ecarts is null or not p_ecarts <@ array['souscription_absente','plusieurs_souscriptions','souscription_non_suivie','client_incoherent','statut','quantite','montant','periodicite','periode','annulation','facture_non_reportee','lecture_incomplete','prestataire_indisponible']::text[] then
    raise exception 'Résultat de contrôle invalide';
  end if;
  update public.abonnements set stripe_controle_le=clock_timestamp(),stripe_controle_ecarts=p_ecarts where organization_id=p_org;
end; $$;
create or replace function public.supervision_stripe_controles()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.is_super_admin(),false) then raise exception 'Réservé à la supervision' using errcode='42501'; end if;
  return jsonb_build_object(
    'en_attente',(select count(*) from public.abonnement_evenements where traite_le is null),
    'a_reprendre',(select count(*) from public.abonnement_evenements where traite_le is null and (tentatives>=20 or charge is null)),
    'a_controler',(select count(*) from public.abonnements where stripe_customer_id is not null and
      (stripe_controle_le is null or (stripe_controle_le at time zone 'Europe/Paris')::date < public.aujourdhui_paris())),
    'ecarts',(select count(*) from public.abonnements where cardinality(stripe_controle_ecarts)>0),
    'dossiers',coalesce((select jsonb_agg(to_jsonb(d)) from (select a.organization_id,o.name,a.stripe_controle_le,a.stripe_controle_ecarts
      from public.abonnements a join public.organizations o on o.id=a.organization_id
      where cardinality(a.stripe_controle_ecarts)>0 order by a.stripe_controle_le limit 50) d),'[]'::jsonb));
end; $$;
revoke all on function public.stripe_controles_a_faire(integer),public.stripe_controle_enregistrer(uuid,text[]),public.supervision_stripe_controles() from public,anon,authenticated;
grant execute on function public.stripe_controles_a_faire(integer),public.stripe_controle_enregistrer(uuid,text[]) to service_role;
grant execute on function public.supervision_stripe_controles() to authenticated;
select public.fermer_fonctions_a_anon();

-- Anciennes lignes sans référence : un événement devenu indisponible ne bloque pas la file.
create or replace function public.stripe_evenement_lecture_differee(p_event_id text,p_definitif boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  update public.abonnement_evenements set tentatives=case when p_definitif then greatest(tentatives,20) else tentatives+1 end,
    reprendre_apres=clock_timestamp()+interval '15 minutes',erreur='Ancienne réception à rapprocher du prestataire.'
    where stripe_event_id=p_event_id and traite_le is null and charge is null
      and (verrou_jusqua is null or verrou_jusqua<=clock_timestamp());
  get diagnostics v_n=row_count; return v_n=1;
end; $$;
revoke all on function public.stripe_evenement_lecture_differee(text,boolean) from public,anon,authenticated;
grant execute on function public.stripe_evenement_lecture_differee(text,boolean) to service_role;
select public.fermer_fonctions_a_anon();
