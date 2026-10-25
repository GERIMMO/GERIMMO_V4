-- Mois offerts : accès gratuit sans souscription, ou crédit sur les prochaines factures.
-- Aucun remboursement, aucune activation de prélèvement. Chaque confirmation est idempotente.
set lock_timeout = '10s';
create table if not exists public.mois_offerts (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 compte uuid references public.accounts(id) on delete set null,
 auteur uuid references public.accounts(id) on delete set null,
 mois integer not null check (mois between 1 and 12),
 motif text not null check (length(motif) between 5 and 500),
 nature text not null check (nature in ('acces','credit')),
 fin date,
 montant_cents bigint,
 client_stripe text,
 abonnement_stripe text,
 reference_stripe text unique,
 cree_le timestamptz not null default now(),
 applique_le timestamptz,
 constraint mois_offerts_coherence check (
  (nature='acces' and fin is not null and montant_cents is null and client_stripe is null and applique_le is not null)
  or (nature='credit' and fin is null and montant_cents is not null and montant_cents > 0 and client_stripe is not null and abonnement_stripe is not null
      and ((applique_le is null) = (reference_stripe is null))))
);
alter table public.mois_offerts enable row level security;
revoke all on public.mois_offerts from public, anon, authenticated;
grant select on public.mois_offerts to service_role;
create index if not exists mois_offerts_organisation on public.mois_offerts(organization_id, cree_le desc);
create index if not exists mois_offerts_compte on public.mois_offerts(compte);
create index if not exists mois_offerts_auteur on public.mois_offerts(auteur);
create unique index if not exists mois_offerts_un_credit_en_attente on public.mois_offerts(organization_id) where applique_le is null;

create or replace function public.offrir_mois_abonnement(p_id uuid, p_compte uuid, p_org uuid, p_mois integer, p_motif text, p_confirmer boolean default false, p_attendu jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 o public.organizations; a public.abonnements; cadeau public.mois_offerts;
 v_fin date; v_montant bigint; v_apercu jsonb;
begin
 if auth.uid() is null or not public.is_permanent_super_admin() then raise exception 'Accès refusé' using errcode='42501'; end if;
 if p_id is null or p_compte is null or p_org is null or p_mois is null or p_mois not between 1 and 12
    or p_motif is null or length(btrim(p_motif)) not between 5 and 500 then raise exception 'Indiquez 1 à 12 mois et un motif.'; end if;
 -- Même verrou que la réservation Checkout : aucun cadeau pendant une page de paiement ouverte.
 perform pg_catalog.pg_advisory_xact_lock(623101, pg_catalog.hashtext(p_org::text));
 select * into cadeau from public.mois_offerts where id=p_id;
 if found then
  if cadeau.compte is distinct from p_compte or cadeau.organization_id<>p_org or cadeau.mois<>p_mois or cadeau.motif<>btrim(p_motif) then
   raise exception 'Cette confirmation a déjà servi à un autre cadeau.';
  end if;
  return to_jsonb(cadeau);
 end if;
 if not exists(select 1 from public.memberships m where m.account_id=p_compte and m.organization_id=p_org
   and m.status='active' and m.role in ('proprietaire_direct','admin_agence')) then
  raise exception 'Choisissez un espace dont cet utilisateur est responsable.';
 end if;
 select * into o from public.organizations where id=p_org for update;
 if not found or o.status not in ('essai','active','suspendue') then raise exception 'Cet espace est archivé : restaurez-le avant de lui offrir des mois.'; end if;
 if exists(select 1 from public.fermetures_comptes f where f.account_id=p_compte and f.statut='programmee') then
  raise exception 'Une fermeture de compte est programmée. Annulez-la avant d’offrir des mois.';
 end if;
 if exists(select 1 from public.intentions_souscription i where i.organization_id=p_org and i.statut='en_cours' and i.expire_le>now()) then
  raise exception 'Une page de paiement est encore ouverte. Attendez sa fermeture avant d’offrir des mois.';
 end if;
 select * into a from public.abonnements where organization_id=p_org for update;
 if a.stripe_subscription_id is not null and coalesce(a.stripe_statut,'inconnu') not in ('canceled','incomplete_expired') then
  if a.stripe_statut not in ('active','trialing','past_due','unpaid') or a.stripe_customer_id is null then
   raise exception 'La souscription doit être vérifiée avant d’offrir des mois.';
  end if;
  v_montant := round(coalesce(a.montant_periode_cents,a.montant_mensuel_cents)::numeric * p_mois /
    case when a.periodicite='annuel' then 12 else 1 end);
  if coalesce(v_montant,0)<=0 then raise exception 'Le tarif de cet abonnement est indisponible.'; end if;
  v_apercu := jsonb_build_object('nature','credit','montant_cents',v_montant,'abonnement',a.stripe_subscription_id,'precedent',(select c.id from public.mois_offerts c where c.organization_id=p_org order by c.cree_le desc,c.id desc limit 1));
  if not coalesce(p_confirmer,false) then return v_apercu; end if;
  if p_attendu is distinct from v_apercu then raise exception 'Le tarif a changé. Vérifiez à nouveau le cadeau avant de confirmer.'; end if;
  insert into public.mois_offerts(id,organization_id,compte,auteur,mois,motif,nature,montant_cents,client_stripe,abonnement_stripe)
   values(p_id,p_org,p_compte,auth.uid(),p_mois,btrim(p_motif),'credit',v_montant,a.stripe_customer_id,a.stripe_subscription_id) returning * into cadeau;
 else
  -- Conserve tout le temps déjà offert ou restant, en mois calendaires (y compris les fins de mois).
  v_fin := (greatest(coalesce(o.essai_fin,public.aujourdhui_paris()),public.aujourdhui_paris()) + make_interval(months=>p_mois))::date;
  v_apercu := jsonb_build_object('nature','acces','fin',v_fin,'reactivation',o.status='suspendue');
  if not coalesce(p_confirmer,false) then return v_apercu; end if;
  if p_attendu is distinct from v_apercu then raise exception 'La période a changé. Vérifiez à nouveau le cadeau avant de confirmer.'; end if;
  insert into support_interne.controles_organisation values(txid_current(),auth.uid(),p_org);
  update public.organizations set status='essai',essai_fin=v_fin where id=p_org;
  delete from support_interne.controles_organisation where transaction_id=txid_current() and auteur=auth.uid() and organization_id=p_org;
  insert into public.mois_offerts(id,organization_id,compte,auteur,mois,motif,nature,fin,applique_le)
   values(p_id,p_org,p_compte,auth.uid(),p_mois,btrim(p_motif),'acces',v_fin,now()) returning * into cadeau;
 end if;
 insert into public.audit_log(account_id,organization_id,action,details)
 values(auth.uid(),p_org,'mois_abonnement_offerts',jsonb_build_object('compte',p_compte,'cadeau',p_id,'mois',p_mois,'motif',btrim(p_motif),
  'nature',cadeau.nature,'fin',cadeau.fin,'montant_cents',cadeau.montant_cents));
 return to_jsonb(cadeau);
end $$;
revoke all on function public.offrir_mois_abonnement(uuid,uuid,uuid,integer,text,boolean,jsonb) from public,anon;
grant execute on function public.offrir_mois_abonnement(uuid,uuid,uuid,integer,text,boolean,jsonb) to authenticated;

-- Historique de la supervision et résumé client : le motif interne reste réservé au superviseur.
create or replace function public.lire_mois_offerts(p_org uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'mois',c.mois,'nature',c.nature,'fin',c.fin,
  'compte',case when public.is_permanent_super_admin() then c.compte end,'motif',case when public.is_permanent_super_admin() then c.motif end,'montant_cents',c.montant_cents,'applique_le',c.applique_le,'cree_le',c.cree_le) order by c.cree_le desc),'[]'::jsonb)
 from public.mois_offerts c where c.organization_id=p_org and
 (public.is_permanent_super_admin() or p_org in (select public.org_ids_avec_roles(array['proprietaire_direct','admin_agence']::public.membership_role[])))
$$;
revoke all on function public.lire_mois_offerts(uuid) from public,anon;
grant execute on function public.lire_mois_offerts(uuid) to authenticated;

-- Les réservations de paiement ne doivent pas court-circuiter une période offerte.
-- Déclencheur partagé sous le verrou de réservation : protège aussi un ancien écran resté ouvert.
create or replace function public.proteger_periode_offerte()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if exists(select 1 from public.mois_offerts c join public.organizations o on o.id=c.organization_id
  where c.organization_id=new.organization_id and c.nature='acces' and c.fin>=public.aujourdhui_paris() and o.status='essai') then
  raise exception 'Votre accès est offert. Vous pourrez souscrire à la fin de cette période, sans prélèvement automatique.';
 end if;
 return new;
end $$;
revoke all on function public.proteger_periode_offerte() from public,anon,authenticated;
drop trigger if exists periode_offerte_checkout on public.intentions_souscription;
create trigger periode_offerte_checkout before insert on public.intentions_souscription for each row execute function public.proteger_periode_offerte();

-- Ce registre d’abonnement reste accessible aux opérations de facturation, même lorsque l’accès métier est fermé.
do $$ declare d text; begin
 select pg_get_functiondef('public.poser_gardes_abonnement()'::regprocedure) into d;
 if strpos(d,'''mois_offerts''')=0 then
  if strpos(d,'''verrous_facturation''')=0 then raise exception 'Liste des exclusions abonnement inattendue'; end if;
  execute replace(d,'''verrous_facturation''','''mois_offerts'', ''verrous_facturation''');
 end if;
end $$;
select public.fermer_fonctions_a_anon();

-- Les crédits utilisent le même verrou court que les changements de formule.
alter table public.verrous_facturation drop constraint if exists verrous_facturation_operation_check;
alter table public.verrous_facturation add constraint verrous_facturation_operation_check check(operation in ('hausse','periodicite','resiliation','echeance','cadeau'));
do $$ declare d text; begin
 select pg_get_functiondef('public.verrou_facturation_prendre(uuid,uuid,text,integer)'::regprocedure) into d;
 if strpos(d,'''cadeau''')=0 then
  if strpos(d,'''resiliation'', ''echeance''')=0 then raise exception 'Verrou de facturation inattendu'; end if;
  execute replace(d,'''resiliation'', ''echeance''','''resiliation'', ''echeance'', ''cadeau''');
 end if;
end $$;
create or replace function public.mois_offert_credit_applique(p_id uuid,p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.mois_offerts;
begin
 if p_reference is null or p_reference !~ '^cbtxn_[A-Za-z0-9]+$' then raise exception 'Référence de crédit invalide'; end if;
 select * into c from public.mois_offerts where id=p_id for update;
 if not found or c.nature<>'credit' then raise exception 'Cadeau introuvable'; end if;
 if c.applique_le is not null then
  if c.reference_stripe<>p_reference then raise exception 'Crédit déjà enregistré'; end if;
  return;
 end if;
 update public.mois_offerts set applique_le=now(),reference_stripe=p_reference where id=p_id;
 insert into public.audit_log(account_id,organization_id,action,details)
 values(c.auteur,c.organization_id,'mois_offerts_credit_applique',jsonb_build_object('compte',c.compte,'cadeau',c.id,'reference',p_reference,'montant_cents',c.montant_cents));
end $$;
revoke all on function public.mois_offert_credit_applique(uuid,text) from public,anon,authenticated;
grant execute on function public.mois_offert_credit_applique(uuid,text) to service_role;

-- Registre de plateforme sans DML utilisateur : seul le geste de console peut l’insérer.
do $$ declare d text; begin
 select pg_get_functiondef('public.poser_gardes_traversee()'::regprocedure) into d;
 if strpos(d,'''mois_offerts''')=0 then
  if strpos(d,'''reseau_interets''')=0 then raise exception 'Exclusions traversée inattendues'; end if;
  execute replace(d,'''reseau_interets''','''reseau_interets'',''mois_offerts''');
 end if;
end $$;
