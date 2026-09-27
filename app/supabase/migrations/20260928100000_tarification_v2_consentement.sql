-- Nouvelle grille : contrats historiques conservés, aucun appel ni débit Stripe.
-- Les propositions, les paiements et les droits sont trois faits distincts.
alter table public.organizations add column tarification_version text not null default 'historique'
 check (tarification_version in ('historique','2026-09-v2'));
alter table public.organizations alter column tarification_version set default '2026-09-v2';
alter table public.organizations add column essai_fin_v2 timestamptz;

create function public.organisation_initialiser_essai_v2() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.tarification_version='2026-09-v2' then
   new.essai_fin_v2:=coalesce(new.essai_fin_v2,now()+interval '14 days');
   new.essai_fin:=(new.essai_fin_v2 at time zone 'Europe/Paris')::date;
   if not public.is_super_admin() and coalesce(current_setting('gerimmo.systeme',true),'')<>'on' then
     new.status:='essai';
   end if;
 end if;
 return new;
end $$;
revoke all on function public.organisation_initialiser_essai_v2() from public,anon,authenticated;
create trigger organisations_essai_v2 before insert on public.organizations
 for each row execute function public.organisation_initialiser_essai_v2();

create or replace function public.organizations_champs_reserves_sa() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(current_setting('gerimmo.systeme',true),'')='on' then return new; end if;
 if (new.status is distinct from old.status or new.type is distinct from old.type
     or new.essai_fin is distinct from old.essai_fin or new.essai_fin_v2 is distinct from old.essai_fin_v2
     or new.tarification_version is distinct from old.tarification_version)
     and not public.is_super_admin() then
   raise exception 'Seul le super admin modifie le statut, le type ou l''essai d''une organisation';
 end if;
 if new.tarification_version='2026-09-v2' and new.essai_fin is distinct from old.essai_fin
    and new.essai_fin_v2 is not distinct from old.essai_fin_v2 and public.is_super_admin() then
   new.essai_fin_v2:=(new.essai_fin+1)::timestamp at time zone 'Europe/Paris';
 end if;
 return new;
end $$;

create table public.abonnements_v2 (
 organization_id uuid primary key references public.organizations(id),
 stripe_customer_id text unique,
 stripe_subscription_id text unique,
 stripe_statut text not null default 'sans_abonnement',
 formule text check(formule in ('solo','bailleur','investisseur','patrimoine','agence')),
 periodicite text check(periodicite in ('mensuel','annuel')),
 volume_facture integer not null default 0 check(volume_facture>=0),
 capacite integer not null default 0 check(capacite>=0),
 montant_centimes bigint check(montant_centimes>=0),
 total_centimes bigint check(total_centimes>=0),
 taxe_centimes bigint check(taxe_centimes>=0),
 periode_fin timestamptz,
 annulation_demandee boolean not null default false,
 changement_programme jsonb,
 paiement_en_defaut_depuis timestamptz,
 traitement_token uuid,
 traitement_expire_le timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.abonnements_v2 enable row level security;
revoke all on public.abonnements_v2 from anon,authenticated;

create table public.propositions_abonnement_v2 (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 acteur_id uuid not null references public.accounts(id),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 expire_le timestamptz not null,
 consentie_le timestamptz,
 etat text not null default 'preparee' check(etat in ('preparee','consentie','executee','expiree','annulee')),
 created_at timestamptz not null default now()
);
create index propositions_abonnement_v2_org_idx on public.propositions_abonnement_v2(organization_id,created_at desc);
create index propositions_abonnement_v2_acteur_idx on public.propositions_abonnement_v2(acteur_id);
alter table public.propositions_abonnement_v2 enable row level security;
revoke all on public.propositions_abonnement_v2 from anon,authenticated;
create table public.evenements_abonnement_v2 (
 event_id text primary key,
 organization_id uuid not null references public.organizations(id),
 snapshot jsonb not null,
 traite_le timestamptz not null default now()
);
create index evenements_abonnement_v2_org_idx on public.evenements_abonnement_v2(organization_id,traite_le desc);
alter table public.evenements_abonnement_v2 enable row level security;
revoke all on public.evenements_abonnement_v2 from anon,authenticated;

create function public.tarif_abonnement_v2(p_public public.organization_type,p_volume integer,p_periodicite text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_montant bigint; v_capacite integer; v_formule text;
begin
 if p_volume is null or p_volume<0 or p_volume>1000000 then raise exception 'Nombre de biens ou de lots invalide'; end if;
 if p_periodicite not in ('mensuel','annuel') or p_periodicite is null then raise exception 'Périodicité invalide'; end if;
 if p_public='agence' then
   if p_periodicite<>'mensuel' then raise exception 'L''abonnement agence est mensuel'; end if;
   v_montant:=3900 + greatest(0,least(p_volume,50)-10)*200::bigint
    +greatest(0,least(p_volume,200)-50)*150::bigint+greatest(0,p_volume-200)*100::bigint;
   v_capacite:=greatest(10,p_volume);v_formule:='agence';
 else
   v_formule:=case when p_volume<=1 then 'solo' when p_volume<=3 then 'bailleur' when p_volume<=10 then 'investisseur' else 'patrimoine' end;
   v_capacite:=case when p_volume<=1 then 1 when p_volume<=3 then 3 when p_volume<=10 then 10 else greatest(20,p_volume) end;
   v_montant:=case when p_volume<=1 then 599 when p_volume<=3 then 999 when p_volume<=10 then 1999 else 2999+greatest(0,p_volume-20)*100::bigint end;
   if p_periodicite='annuel' then v_montant:=v_montant*10;end if;
 end if;
 return jsonb_build_object('version','2026-09-v2','public_tarif',p_public,'volume',p_volume,'formule',v_formule,
  'periodicite',p_periodicite,'capacite',v_capacite,'montant_centimes',v_montant,
  'base_taxe',case when p_public='agence' then 'HT' else 'TTC' end);
end $$;
revoke all on function public.tarif_abonnement_v2(public.organization_type,integer,text) from public,anon;
grant execute on function public.tarif_abonnement_v2(public.organization_type,integer,text) to authenticated,service_role;

-- Une annexe partage le lot principal et son bail. Une location indépendante
-- est un autre lot facturable. Pas de déduction fondée sur un simple libellé.
alter table public.lots add column annexe_du_lot_id uuid references public.lots(id);
create index lots_annexe_du_lot_idx on public.lots(annexe_du_lot_id);
create function public.controler_annexe_locative_v2() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_parent public.lots%rowtype;
begin
 if new.etat='archive' and exists(select 1 from public.lots where annexe_du_lot_id=new.id and etat<>'archive')
    and exists(select 1 from public.biens where id=new.bien_id and archived_at is null) then
   raise exception 'Archivez les annexes avant le logement principal, ou retirez le bien entier' using errcode='23514';
 end if;
 if new.annexe_du_lot_id is null then return new;end if;
 perform 1 from public.organizations where id=new.organization_id for update;
 select * into v_parent from public.lots where id=new.annexe_du_lot_id for update;
 if not found or new.id=new.annexe_du_lot_id or v_parent.organization_id<>new.organization_id
    or v_parent.bien_id<>new.bien_id or v_parent.annexe_du_lot_id is not null
    or exists(select 1 from public.lots where annexe_du_lot_id=new.id) then
   raise exception 'L''annexe doit appartenir au même bien et à un logement principal, sans rattachement circulaire' using errcode='23514';
 end if;
 if v_parent.etat='archive' and new.etat<>'archive' then
   raise exception 'Rétablissez le logement principal avant son annexe' using errcode='23514';
 end if;
 if exists(select 1 from public.baux where lot_id=new.id and etat in ('brouillon','actif','preavis')) then
   raise exception 'Ce lot a son propre bail : il compte comme un bien distinct' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.controler_annexe_locative_v2() from public,anon,authenticated;
create trigger lots_annexe_locative_v2 before insert or update of annexe_du_lot_id,bien_id,organization_id,etat on public.lots
 for each row execute function public.controler_annexe_locative_v2();
create function public.controler_bail_annexe_v2() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.etat in ('brouillon','actif','preavis') and exists(select 1 from public.lots where id=new.lot_id and annexe_du_lot_id is not null) then
   raise exception 'Une annexe rattachée partage le bail du logement principal. Détachez-la avant de créer un bail séparé' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.controler_bail_annexe_v2() from public,anon,authenticated;
create trigger baux_annexe_v2 before insert or update of lot_id,etat on public.baux
 for each row execute function public.controler_bail_annexe_v2();

create function public.abonnement_volume_v2(p_org uuid) returns integer
language sql stable security definer set search_path='' as $$
 select case when o.type='agence' then (
   select count(distinct ml.lot_id)::integer from public.mandat_lignes ml join public.mandats m on m.id=ml.mandat_id
   where ml.organization_id=o.id and m.etat in ('actif','preavis') and ml.date_debut<=current_date
     and (ml.date_fin is null or ml.date_fin>=current_date)
 ) else (
   select coalesce(sum(case when not exists(select 1 from public.lots l where l.bien_id=b.id) then 1 else
    (select count(*) from public.lots l where l.bien_id=b.id and l.etat<>'archive' and l.annexe_du_lot_id is null) end),0)::integer
   from public.biens b where b.organization_id=o.id and b.archived_at is null
 ) end from public.organizations o where o.id=p_org;
$$;
revoke all on function public.abonnement_volume_v2(uuid) from public,anon,authenticated;
grant execute on function public.abonnement_volume_v2(uuid) to service_role;

create function public.abonnement_v2_responsable(p_org uuid,p_compte uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships m where m.organization_id=p_org and m.account_id=p_compte
   and m.status='active' and m.role in ('admin_agence','proprietaire_direct'));
$$;
revoke all on function public.abonnement_v2_responsable(uuid,uuid) from public,anon,authenticated;

-- La règle historique reste intacte pour les comptes non migrés.
alter function public.org_ecriture_ouverte(uuid) rename to org_ecriture_ouverte_historique;
revoke all on function public.org_ecriture_ouverte_historique(uuid) from public,anon,authenticated;
create function public.org_ecriture_ouverte(p_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when o.tarification_version='historique' then public.org_ecriture_ouverte_historique(o.id)
   when o.status in ('suspendue','archivee') then false
   when o.essai_fin_v2>now() then true
   when a.stripe_subscription_id is not null and a.periode_fin>now()
     and a.stripe_statut in ('active','trialing','canceled','past_due') then
      a.paiement_en_defaut_depuis is null or a.paiement_en_defaut_depuis>now()-interval '15 days'
   else false end
 from public.organizations o left join public.abonnements_v2 a on a.organization_id=o.id where o.id=p_org;
$$;
revoke all on function public.org_ecriture_ouverte(uuid) from public,anon,authenticated;

create function public.lire_abonnement_v2(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.organizations%rowtype;a public.abonnements_v2%rowtype;
begin
 if not public.abonnement_v2_responsable(p_org,(select auth.uid())) and not public.is_super_admin() then raise exception 'Réservé au responsable de cet espace' using errcode='42501';end if;
 select * into o from public.organizations where id=p_org;
 if not found then raise exception 'Espace introuvable';end if;
 select * into a from public.abonnements_v2 where organization_id=p_org;
 return jsonb_build_object('organization_id',p_org,'version',o.tarification_version,'public_tarif',o.type,
  'statut',coalesce(a.stripe_statut,'sans_abonnement'),'essai_fin',o.essai_fin_v2,
  'ecriture_ouverte',public.org_ecriture_ouverte(p_org),'volume_actuel',public.abonnement_volume_v2(p_org),'volume_reserve',public.abonnement_volume_reserve_v2(p_org),
  'capacite',coalesce(a.capacite,0),'volume_facture',coalesce(a.volume_facture,0),'formule',a.formule,'periodicite',a.periodicite,
  'montant_centimes',a.montant_centimes,'total_centimes',a.total_centimes,'taxe_centimes',a.taxe_centimes,
  'periode_fin',a.periode_fin,'annulation_demandee',coalesce(a.annulation_demandee,false),
  'changement_programme',a.changement_programme,'stripe_customer_id',a.stripe_customer_id,
  'stripe_subscription_id',a.stripe_subscription_id,'revision_abonnement',coalesce(a.updated_at::text,'nouveau'));
end $$;
revoke all on function public.lire_abonnement_v2(uuid) from public,anon;
grant execute on function public.lire_abonnement_v2(uuid) to authenticated;

create function public.abonnement_v2_poser_client(p_org uuid,p_customer text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.organizations where id=p_org and tarification_version='2026-09-v2' for update;
 if not found then raise exception 'Cet espace ne relève pas de la nouvelle grille';end if;
 if p_customer is null or p_customer !~ '^cus_[A-Za-z0-9]+$' then raise exception 'Référence client invalide';end if;
 insert into public.abonnements_v2(organization_id,stripe_customer_id) values(p_org,p_customer)
 on conflict(organization_id) do update set stripe_customer_id=coalesce(public.abonnements_v2.stripe_customer_id,excluded.stripe_customer_id);
 if (select stripe_customer_id from public.abonnements_v2 where organization_id=p_org)<>p_customer then raise exception 'Cet espace possède déjà un client de facturation';end if;
end $$;
revoke all on function public.abonnement_v2_poser_client(uuid,text) from public,anon,authenticated;
grant execute on function public.abonnement_v2_poser_client(uuid,text) to service_role;

create function public.proposition_v2_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if new.organization_id<>old.organization_id or new.acteur_id<>old.acteur_id or new.snapshot<>old.snapshot
    or new.expire_le<>old.expire_le or new.created_at<>old.created_at
    or (old.consentie_le is not null and new.consentie_le is distinct from old.consentie_le) then
  raise exception 'Une proposition présentée ne se réécrit pas : préparez un nouveau récapitulatif';
 end if;return new;
end $$;
revoke all on function public.proposition_v2_immutable() from public,anon,authenticated;
create trigger proposition_v2_immutable before update on public.propositions_abonnement_v2 for each row execute function public.proposition_v2_immutable();

create function public.enregistrer_proposition_abonnement_v2(p_org uuid,p_acteur uuid,p_snapshot jsonb,p_expire_le timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare o public.organizations%rowtype; v_prix jsonb;v_id uuid;v_type text:=p_snapshot->>'type';
begin
 select * into o from public.organizations where id=p_org for update;
 if not found or o.tarification_version<>'2026-09-v2' or not public.abonnement_v2_responsable(p_org,p_acteur) then raise exception 'Responsable ou grille de cet espace invalide' using errcode='42501';end if;
 if p_expire_le<=now() or p_expire_le>now()+interval '1 hour' or p_expire_le is null then raise exception 'Durée de validité invalide';end if;
 if p_snapshot->>'version' is distinct from '2026-09-v2' or p_snapshot->>'public_tarif' is distinct from o.type::text
    or p_snapshot->>'acteur_id' is distinct from p_acteur::text
    or coalesce((p_snapshot->>'volume_source')::integer,-1)<>public.abonnement_volume_v2(p_org)
    or coalesce(v_type,'') not in ('souscription','augmentation','baisse','resiliation','annulation_changement') then raise exception 'Le portefeuille ou le récapitulatif a changé. Recalculez le montant';end if;
 if v_type<>'resiliation' then
   if v_type<>'annulation_changement' and coalesce((p_snapshot->>'volume_cible')::integer,-1)<public.abonnement_volume_reserve_v2(p_org) then raise exception 'La formule doit couvrir les biens gérés et les lots déjà confiés par un mandat, y compris ses lignes futures';end if;
   v_prix:=public.tarif_abonnement_v2(o.type,(p_snapshot->>'volume_cible')::integer,p_snapshot->>'periodicite');
   if (p_snapshot->>'capacite')::integer is distinct from (v_prix->>'capacite')::integer
      or p_snapshot->>'formule' is distinct from v_prix->>'formule'
      or (p_snapshot->>'montant_centimes')::bigint is distinct from (v_prix->>'montant_centimes')::bigint then raise exception 'Le montant présenté ne correspond pas à la grille';end if;
 end if;
 if p_snapshot->>'total_centimes' is null or p_snapshot->>'taxe_centimes' is null
    or (p_snapshot->>'total_centimes')::bigint<0 or (p_snapshot->>'taxe_centimes')::bigint<0 then
   raise exception 'La fiscalité et le total à payer doivent être confirmés avant de proposer la souscription';
 end if;
 insert into public.propositions_abonnement_v2(organization_id,acteur_id,snapshot,expire_le)
 values(p_org,p_acteur,p_snapshot,p_expire_le) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.enregistrer_proposition_abonnement_v2(uuid,uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.enregistrer_proposition_abonnement_v2(uuid,uuid,jsonb,timestamptz) to service_role;

create function public.lire_proposition_abonnement_service_v2(p_proposition uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(p) from public.propositions_abonnement_v2 p where id=p_proposition;
$$;
revoke all on function public.lire_proposition_abonnement_service_v2(uuid) from public,anon,authenticated;
grant execute on function public.lire_proposition_abonnement_service_v2(uuid) to service_role;
create function public.lire_proposition_abonnement_v2(p_proposition uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.propositions_abonnement_v2%rowtype;
begin
 select * into p from public.propositions_abonnement_v2 where id=p_proposition;
 if not found or not public.abonnement_v2_responsable(p.organization_id,(select auth.uid())) then raise exception 'Proposition inaccessible' using errcode='42501';end if;
 return to_jsonb(p);
end $$;
revoke all on function public.lire_proposition_abonnement_v2(uuid) from public,anon;
grant execute on function public.lire_proposition_abonnement_v2(uuid) to authenticated;
create function public.consentir_proposition_abonnement_v2(p_proposition uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.propositions_abonnement_v2%rowtype;v_revision text;
begin
 select * into p from public.propositions_abonnement_v2 where id=p_proposition;
 if not found or p.acteur_id<>(select auth.uid()) or not public.abonnement_v2_responsable(p.organization_id,(select auth.uid())) then raise exception 'Seul le responsable ayant demandé ce récapitulatif peut le confirmer' using errcode='42501';end if;
 perform 1 from public.organizations where id=p.organization_id for update;
 select * into p from public.propositions_abonnement_v2 where id=p_proposition for update;
 if p.etat in ('executee','expiree','annulee') then raise exception 'Cette confirmation est terminée. Consultez votre abonnement ou préparez un nouveau récapitulatif';end if;
 if p.consentie_le is not null then return to_jsonb(p);end if;
 if exists(select 1 from public.propositions_abonnement_v2 q where q.organization_id=p.organization_id and q.id<>p.id and q.etat='consentie'
   and not(p.snapshot->>'type'='resiliation' and q.snapshot->>'type'='augmentation')) then
  raise exception 'Une confirmation précédente attend encore le résultat du paiement. Terminez-la ou annulez-la avant de recommencer';
 end if;
 if p.snapshot->>'type'='souscription' and exists(select 1 from public.abonnements_v2 a where a.organization_id=p.organization_id and a.stripe_subscription_id is not null and a.stripe_statut not in ('canceled','incomplete_expired')) then
  raise exception 'Cet espace possède déjà un abonnement. Utilisez le changement de formule';
 end if;
 if p.expire_le<=now() then raise exception 'Ce récapitulatif a expiré. Recalculez le montant';end if;
 if (p.snapshot->>'volume_source')::integer is distinct from public.abonnement_volume_v2(p.organization_id) then raise exception 'Le portefeuille a changé. Recalculez le montant';end if;
 select updated_at::text into v_revision from public.abonnements_v2 where organization_id=p.organization_id;
 if p.snapshot->>'revision_abonnement' is distinct from coalesce(v_revision,'nouveau') then raise exception 'L''abonnement a changé. Recalculez le montant';end if;
 update public.propositions_abonnement_v2 set consentie_le=now(),etat='consentie' where id=p.id returning * into p;
 insert into public.audit_log(account_id,organization_id,action,details) values((select auth.uid()),p.organization_id,'abonnement_v2_accord',jsonb_build_object('proposition',p.id,'type',p.snapshot->>'type','total_centimes',p.snapshot->'total_centimes','date_effet',p.snapshot->'date_effet'));
 return to_jsonb(p);
end $$;
revoke all on function public.consentir_proposition_abonnement_v2(uuid) from public,anon;
grant execute on function public.consentir_proposition_abonnement_v2(uuid) to authenticated;

create function public.appliquer_abonnement_v2(p_org uuid,p_snapshot jsonb,p_event_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare o public.organizations%rowtype;a public.abonnements_v2%rowtype;v_statut text:=p_snapshot->>'stripe_statut';v_prix jsonb;v_pending boolean:=coalesce((p_snapshot->>'pending_update')::boolean,false);
 v_systeme text:=coalesce(current_setting('gerimmo.systeme',true),'');v_statut_org public.organization_status;
begin
 select * into o from public.organizations where id=p_org for update;
 if not found or o.tarification_version<>'2026-09-v2' then raise exception 'La nouvelle grille ne peut pas remplacer un contrat historique';end if;
 if p_event_id is null or length(btrim(p_event_id))<3 then raise exception 'Référence de confirmation manquante';end if;
 if exists(select 1 from public.evenements_abonnement_v2 where event_id=p_event_id) then return false;end if;
 select * into a from public.abonnements_v2 where organization_id=p_org for update;
 if p_snapshot->>'traitement_token' is not null then
   if a.traitement_token is distinct from (p_snapshot->>'traitement_token')::uuid or a.traitement_expire_le<=clock_timestamp() then
     raise exception 'Cette vérification a expiré. Relisez la souscription avant de la confirmer';
   end if;
 elsif a.traitement_expire_le>clock_timestamp() then
   raise exception 'Une confirmation de paiement est en cours. Réessayez après son actualisation';
 end if;
 if a.stripe_customer_id is null or a.stripe_customer_id is distinct from p_snapshot->>'stripe_customer_id' then raise exception 'Le client de facturation ne correspond pas à cet espace';end if;
 if p_snapshot->>'stripe_subscription_id' is null or (a.stripe_subscription_id is not null and a.stripe_subscription_id<>p_snapshot->>'stripe_subscription_id'
   and not(a.stripe_statut in ('canceled','incomplete_expired') and coalesce(a.periode_fin,now())<=now())) then raise exception 'La souscription ne correspond pas à cet espace';end if;
 if p_snapshot->>'version' is distinct from '2026-09-v2' or v_statut not in ('active','trialing','past_due','unpaid','canceled','paused','incomplete','incomplete_expired') then raise exception 'Confirmation de souscription invalide';end if;
 v_prix:=public.tarif_abonnement_v2(o.type,(p_snapshot->>'volume_facture')::integer,p_snapshot->>'periodicite');
 if (p_snapshot->>'capacite')::integer is distinct from (v_prix->>'capacite')::integer
  or p_snapshot->>'formule' is distinct from v_prix->>'formule'
  or (p_snapshot->>'montant_centimes')::bigint is distinct from (v_prix->>'montant_centimes')::bigint then
  raise exception 'Le contrat confirmé ne correspond pas au catalogue Gerimmo';
 end if;
 if p_snapshot->>'taxe_centimes' is null or p_snapshot->>'total_centimes' is null then raise exception 'La confirmation ne contient pas le montant réellement facturé';end if;
 -- Une souscription réellement active doit découler d'un accord enregistré.
 if v_statut in ('active','trialing') and (a.stripe_subscription_id is null or (p_snapshot->>'capacite')::integer>a.capacite
     or p_snapshot->>'periodicite' is distinct from a.periodicite) and not v_pending then
   if not exists(select 1 from public.propositions_abonnement_v2 p where p.organization_id=p_org and p.consentie_le is not null
     and p.snapshot->>'formule'=p_snapshot->>'formule' and p.snapshot->>'periodicite'=p_snapshot->>'periodicite'
     and (p.snapshot->>'capacite')::integer=(p_snapshot->>'capacite')::integer
     and p.snapshot->>'type' in ('souscription','augmentation','baisse')) then
    raise exception 'Aucun accord ne couvre cette souscription ou augmentation';
   end if;
 end if;
 -- Le prestataire peut confirmer un essai ou un paiement en attente. Seuls
 -- les droits déjà acquis survivent à un pending_update ou paiement incomplet.
 update public.abonnements_v2 set
  stripe_subscription_id=p_snapshot->>'stripe_subscription_id',stripe_statut=v_statut,
  formule=case when v_pending or v_statut in ('incomplete','incomplete_expired') then formule else p_snapshot->>'formule' end,
  periodicite=case when v_pending or v_statut in ('incomplete','incomplete_expired') then periodicite else p_snapshot->>'periodicite' end,
  capacite=case when v_pending or v_statut in ('incomplete','incomplete_expired') then capacite else (p_snapshot->>'capacite')::integer end,
  volume_facture=case when v_pending or v_statut in ('incomplete','incomplete_expired') then volume_facture else (p_snapshot->>'volume_facture')::integer end,
  montant_centimes=case when v_pending or v_statut in ('incomplete','incomplete_expired') then montant_centimes else (p_snapshot->>'montant_centimes')::bigint end,
  total_centimes=case when v_pending or v_statut in ('incomplete','incomplete_expired') then total_centimes else (p_snapshot->>'total_centimes')::bigint end,
  taxe_centimes=case when v_pending or v_statut in ('incomplete','incomplete_expired') then taxe_centimes else (p_snapshot->>'taxe_centimes')::bigint end,
  periode_fin=coalesce((p_snapshot->>'periode_fin')::timestamptz,periode_fin),
  annulation_demandee=coalesce((p_snapshot->>'annulation_demandee')::boolean,false),
  changement_programme=case when p_snapshot ? 'changement_programme' then nullif(p_snapshot->'changement_programme','null'::jsonb)
    when changement_programme->>'date_effet' is not null and (changement_programme->>'date_effet')::timestamptz<=now() then null
    else changement_programme end,
  paiement_en_defaut_depuis=case when v_statut in ('past_due','unpaid') then coalesce(paiement_en_defaut_depuis,now())
    when v_statut in ('active','trialing') then null else paiement_en_defaut_depuis end,
  updated_at=clock_timestamp()
 where organization_id=p_org;
 if o.status<>'archivee' then
   v_statut_org:=case
    when v_statut in ('active','trialing') then 'active'::public.organization_status
    when v_statut='canceled' and (p_snapshot->>'periode_fin')::timestamptz>now() then 'active'::public.organization_status
    when v_statut in ('canceled','unpaid','paused','incomplete_expired') then
      case when o.essai_fin_v2>now() then 'essai'::public.organization_status else 'suspendue'::public.organization_status end
    else o.status end;
   if v_statut_org is distinct from o.status then
     perform set_config('gerimmo.systeme','on',true);
     update public.organizations set status=v_statut_org,updated_at=now() where id=p_org;
     perform set_config('gerimmo.systeme',v_systeme,true);
   end if;
 end if;
 insert into public.evenements_abonnement_v2(event_id,organization_id,snapshot) values(p_event_id,p_org,p_snapshot);
 return true;
end $$;
revoke all on function public.appliquer_abonnement_v2(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.appliquer_abonnement_v2(uuid,jsonb,text) to service_role;

-- Sérialisation AVANT chaque modification du volume ; contrôle APRÈS son
-- calcul exact, dans la même transaction. Un refus annule toute la commande.
create function public.abonnement_volume_reserve_v2(p_org uuid) returns integer
language sql stable security definer set search_path='' as $$
 select case when o.type='agence' then (select count(distinct ml.lot_id)::integer
 from public.mandat_lignes ml join public.mandats m on m.id=ml.mandat_id
 where ml.organization_id=o.id and m.etat in ('actif','preavis') and (ml.date_fin is null or ml.date_fin>=current_date))
 else public.abonnement_volume_v2(o.id) end from public.organizations o where o.id=p_org;
$$;
revoke all on function public.abonnement_volume_reserve_v2(uuid) from public,anon,authenticated;
create function public.verrouiller_volume_abonnement_v2() returns trigger language plpgsql security definer set search_path='' as $$
declare v_org uuid:=case when tg_op='DELETE' then old.organization_id else new.organization_id end;
 v_cle text:=tg_relid::text||'_'||(case when tg_op='DELETE' then old.id else new.id end)::text;
 v_mem jsonb:=coalesce(nullif(current_setting('gerimmo.volumes_avant_v2',true),''),'{}')::jsonb;
 v_version text;
begin
 select tarification_version into v_version from public.organizations where id=v_org for update;
 if v_version<>'2026-09-v2' then return coalesce(new,old);end if;
 perform set_config('gerimmo.volumes_avant_v2',(v_mem||jsonb_build_object(v_cle,public.abonnement_volume_reserve_v2(v_org)))::text,true);
 return coalesce(new,old);
end $$;
revoke all on function public.verrouiller_volume_abonnement_v2() from public,anon,authenticated;
create function public.controler_capacite_abonnement_v2() returns trigger language plpgsql security definer set search_path='' as $$
declare v_org uuid:=case when tg_op='DELETE' then old.organization_id else new.organization_id end;
 o public.organizations%rowtype;a public.abonnements_v2%rowtype;v_volume integer;
 v_cle text:=tg_relid::text||'_'||(case when tg_op='DELETE' then old.id else new.id end)::text;
 v_mem jsonb:=coalesce(nullif(current_setting('gerimmo.volumes_avant_v2',true),''),'{}')::jsonb;
 v_avant integer:=coalesce((v_mem->>v_cle)::integer,0);v_limite integer;
begin
 select * into o from public.organizations where id=v_org;
 if o.tarification_version<>'2026-09-v2' then return null;end if;
 select * into a from public.abonnements_v2 where organization_id=v_org;
 v_limite:=coalesce(a.capacite,0);
 if o.essai_fin_v2>now() and a.stripe_subscription_id is null then
   select (snapshot->>'capacite')::integer into v_limite from public.propositions_abonnement_v2
    where organization_id=v_org and etat='consentie' and snapshot->>'type'='souscription'
    order by consentie_le desc limit 1;
   if v_limite is null then return null;end if;
 end if;
 v_volume:=public.abonnement_volume_reserve_v2(v_org);
 perform set_config('gerimmo.volumes_avant_v2',(v_mem-v_cle)::text,true);
 if v_volume>v_avant and a.changement_programme->>'capacite' is not null
    and v_volume>(a.changement_programme->>'capacite')::integer then
  raise exception 'Cette action dépasse la capacité prévue à la prochaine échéance. Annulez le changement programmé dans Mon abonnement avant de poursuivre. Vos données sont conservées.' using errcode='23514';
 end if;
 if v_volume>v_limite and v_volume>v_avant then
  raise exception 'Cette action nécessite une capacité supplémentaire. Consultez le nouveau montant et confirmez-le dans Mon abonnement avant de poursuivre. Vos données sont conservées.' using errcode='23514';
 end if;
 return null;
end $$;
revoke all on function public.controler_capacite_abonnement_v2() from public,anon,authenticated;
do $$ declare t text;begin
 foreach t in array array['biens','lots','mandats','mandat_lignes'] loop
  execute format('create trigger abonnement_v2_verrou before insert or update or delete on public.%I for each row execute function public.verrouiller_volume_abonnement_v2()',t);
  execute format('create trigger abonnement_v2_capacite after insert or update or delete on public.%I for each row execute function public.controler_capacite_abonnement_v2()',t);
 end loop;
end $$;

create function public.configurer_annexe_abonnement_v2(p_org uuid,p_lot uuid,p_principal uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.abonnement_v2_responsable(p_org,(select auth.uid())) then raise exception 'Réservé au responsable de cet espace' using errcode='42501';end if;
 perform 1 from public.organizations where id=p_org for update;
 update public.lots set annexe_du_lot_id=p_principal where id=p_lot and organization_id=p_org;
 if not found then raise exception 'Lot introuvable';end if;
 insert into public.audit_log(account_id,organization_id,action,details) values((select auth.uid()),p_org,'annexe_locative_modifiee',jsonb_build_object('lot',p_lot,'principal',p_principal));
end $$;
revoke all on function public.configurer_annexe_abonnement_v2(uuid,uuid,uuid) from public,anon;
grant execute on function public.configurer_annexe_abonnement_v2(uuid,uuid,uuid) to authenticated;

-- Les fonctions historiques continuent de servir les anciens contrats.
-- Les nouvelles organisations ne sont jamais envoyées au cron de quantité.
create or replace function public.abonnements_a_synchroniser(p_limite integer default 100)
returns table(organization_id uuid,organisation text,stripe_subscription_id text,quantite_posee integer,quantite_cible integer)
language sql stable security definer set search_path='' as $$
 select a.organization_id,o.name,a.stripe_subscription_id,a.quantite,public.abonnement_quantite_cible(a.organization_id)
 from public.abonnements a join public.organizations o on o.id=a.organization_id
 where o.tarification_version='historique' and a.stripe_subscription_id is not null and o.status<>'archivee'
 and (a.a_resynchroniser or a.quantite is distinct from public.abonnement_quantite_cible(a.organization_id))
 order by a.updated_at limit greatest(1,least(coalesce(p_limite,100),500));
$$;
revoke all on function public.abonnements_a_synchroniser(integer) from public,anon,authenticated;
grant execute on function public.abonnements_a_synchroniser(integer) to service_role;

-- Garder les engagements de parrainage antérieurs, pas de nouvelles primes
-- automatiques cumulées avec la grille. Les avantages acquis ne sont pas touchés.
alter table public.parrainages add column avantages_historiques boolean not null default true;
alter table public.parrainages alter column avantages_historiques set default false;
alter function public.parrainage_avantage_filleul(uuid) rename to parrainage_avantage_filleul_historique;
alter function public.parrainage_recompenser(uuid) rename to parrainage_recompenser_historique;
revoke all on function public.parrainage_avantage_filleul_historique(uuid),public.parrainage_recompenser_historique(uuid) from public,anon,authenticated;
create function public.parrainage_avantage_filleul(p_parrainage uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.parrainages p join public.organizations o on o.id=p.filleul_organization_id
  where p.id=p_parrainage and (p.avantages_historiques or o.tarification_version='historique')) then
  perform public.parrainage_avantage_filleul_historique(p_parrainage);
 end if;
end $$;
create function public.parrainage_recompenser(p_filleul uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.parrainages p join public.organizations o on o.id=p.filleul_organization_id
  where p.filleul_organization_id=p_filleul and (p.avantages_historiques or o.tarification_version='historique')) then
  perform public.parrainage_recompenser_historique(p_filleul);
 end if;
end $$;
revoke all on function public.parrainage_avantage_filleul(uuid),public.parrainage_recompenser(uuid) from public,anon,authenticated;

-- Le cumul de deux espaces est permis : une invitation d'agence n'est jamais
-- transformée en abonnement personnel. La séparation reste par organisation.
drop trigger if exists mandats_exclusivite_pd_trg on public.mandats;
do $$ declare v_definition text;v_debut integer;v_fin integer;begin
 select pg_get_functiondef('public.initialiser_espace_proprietaire()'::regprocedure) into v_definition;
 v_debut:=strpos(v_definition,'  if exists (');
 v_fin:=strpos(v_definition,'  -- Création de l''espace.');
 if v_debut=0 or v_fin<=v_debut or substring(v_definition from v_debut for v_fin-v_debut) not like '%exclusivité PD/PM%' then
  raise exception 'La fonction d''inscription a changé : revue nécessaire avant de lever l''exclusivité';
 end if;
 v_definition:=substring(v_definition from 1 for v_debut-1)||substring(v_definition from v_fin);
 execute v_definition;
end $$;

-- Les écrans historiques qui lisent etat_abonnement voient le bon volume et
-- la bonne grille, sans donner les identifiants Stripe aux collaborateurs.
alter function public.etat_abonnement(uuid) rename to etat_abonnement_historique;
revoke all on function public.etat_abonnement_historique(uuid) from public,anon,authenticated;
create function public.etat_abonnement(p_org uuid)
returns table(statut text,ecriture_ouverte boolean,essai_fin date,jours_essai_restants integer,public_tarif public.organization_type,
 unite text,unites_total integer,unites_facturees integer,mensuel numeric,en_ligne_possible boolean)
language plpgsql stable security definer set search_path='' as $$
declare o public.organizations%rowtype;v_volume integer;
begin
 if not (p_org in(select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then return;end if;
 select * into o from public.organizations where id=p_org;
 if o.tarification_version='historique' then return query select * from public.etat_abonnement_historique(p_org);return;end if;
 v_volume:=public.abonnement_volume_v2(p_org);
 return query select o.status::text,public.org_ecriture_ouverte(p_org),o.essai_fin,
 greatest(0,ceil(extract(epoch from (o.essai_fin_v2-now()))/86400))::integer,o.type,
 case when o.type='agence' then 'lot sous mandat' else 'bien' end,v_volume,v_volume,
 ((public.tarif_abonnement_v2(o.type,v_volume,'mensuel')->>'montant_centimes')::numeric/100),true;
end $$;
revoke all on function public.etat_abonnement(uuid) from public,anon;
grant execute on function public.etat_abonnement(uuid) to authenticated;

-- Les propositions restent accessibles après l'essai pour pouvoir souscrire.
do $$ declare v_definition text;begin
 select pg_get_functiondef('public.poser_gardes_abonnement()'::regprocedure) into v_definition;
 if strpos(v_definition,'''abonnements'', ''abonnement_evenements''')=0 then raise exception 'Liste des gardes à vérifier';end if;
 execute replace(v_definition,'''abonnements'', ''abonnement_evenements''','''abonnements'', ''abonnement_evenements'', ''abonnements_v2'', ''propositions_abonnement_v2'', ''evenements_abonnement_v2''');
end $$;
select public.poser_gardes_abonnement();

create function public.finir_proposition_abonnement_v2(p_proposition uuid,p_etat text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_etat not in ('executee','expiree','annulee') or p_etat is null then raise exception 'Résultat de confirmation invalide';end if;
 update public.propositions_abonnement_v2 set etat=p_etat where id=p_proposition and etat in ('preparee','consentie');
end $$;
revoke all on function public.finir_proposition_abonnement_v2(uuid,text) from public,anon,authenticated;
grant execute on function public.finir_proposition_abonnement_v2(uuid,text) to service_role;

-- La capacité doit couvrir aussi les lignes futures d'un mandat déjà activé :
-- leur arrivée à date ne doit jamais augmenter une facture sans accord.
create function public.apercu_volume_mandat_v2(p_org uuid,p_mandat uuid) returns integer
language plpgsql stable security definer set search_path='' as $$
declare v_volume integer;
begin
 if not (p_org in(select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
    or public.mandat_hors_portefeuille(p_org,p_mandat) then raise exception 'Mandat inaccessible' using errcode='42501';end if;
 if not exists(select 1 from public.mandats where id=p_mandat and organization_id=p_org) then raise exception 'Mandat introuvable';end if;
 select count(distinct ml.lot_id)::integer into v_volume from public.mandat_lignes ml join public.mandats m on m.id=ml.mandat_id
 where ml.organization_id=p_org and (m.etat in ('actif','preavis') or m.id=p_mandat)
   and (ml.date_fin is null or ml.date_fin>=current_date);
 return v_volume;
end $$;
revoke all on function public.apercu_volume_mandat_v2(uuid,uuid) from public,anon;
grant execute on function public.apercu_volume_mandat_v2(uuid,uuid) to authenticated;

-- Un webhook ancien ne doit jamais appliquer sa règle commerciale à un
-- compte de la nouvelle grille, même si un identifiant a été mal rattaché.
alter function public.abonnement_appliquer(text,text,text,integer,timestamptz,boolean) rename to abonnement_appliquer_historique;
revoke all on function public.abonnement_appliquer_historique(text,text,text,integer,timestamptz,boolean) from public,anon,authenticated,service_role;
create function public.abonnement_appliquer(p_customer text,p_subscription text,p_statut text,p_quantite integer,p_periode_fin timestamptz,p_annulation boolean)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.abonnements a join public.organizations o on o.id=a.organization_id
   where a.stripe_customer_id=btrim(p_customer) and o.tarification_version<>'historique') then
  raise exception 'Ce contrat doit être confirmé par le parcours de la nouvelle grille';
 end if;
 return public.abonnement_appliquer_historique(p_customer,p_subscription,p_statut,p_quantite,p_periode_fin,p_annulation);
end $$;
revoke all on function public.abonnement_appliquer(text,text,text,integer,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.abonnement_appliquer(text,text,text,integer,timestamptz,boolean) to service_role;

-- Verrou à durée limitée : plusieurs événements du même abonnement doivent
-- relire Stripe successivement, avant d'appliquer le fait le plus récent.
create function public.reserver_traitement_abonnement_v2(p_org uuid,p_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_token is null then raise exception 'Référence de traitement manquante';end if;
 perform 1 from public.organizations where id=p_org and tarification_version='2026-09-v2' for update;
 if not found then return false;end if;
 update public.abonnements_v2 set traitement_token=p_token,traitement_expire_le=clock_timestamp()+interval '90 seconds'
 where organization_id=p_org and (traitement_expire_le is null or traitement_expire_le<=clock_timestamp() or traitement_token=p_token);
 return found;
end $$;
create function public.liberer_traitement_abonnement_v2(p_org uuid,p_token uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.abonnements_v2 set traitement_token=null,traitement_expire_le=null
 where organization_id=p_org and traitement_token=p_token;
end $$;
revoke all on function public.reserver_traitement_abonnement_v2(uuid,uuid),public.liberer_traitement_abonnement_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserver_traitement_abonnement_v2(uuid,uuid),public.liberer_traitement_abonnement_v2(uuid,uuid) to service_role;

-- Une création de compte n'est jamais une souscription ou un ancien cadeau.
alter function public.ouvrir_organisation(text,public.organization_type,text,integer,boolean) rename to ouvrir_organisation_historique;
revoke all on function public.ouvrir_organisation_historique(text,public.organization_type,text,integer,boolean) from public,anon,authenticated,service_role;
create function public.ouvrir_organisation(p_nom text,p_type public.organization_type,p_email_responsable text,p_essai_jours integer default 14,p_active_immediatement boolean default false)
returns table(organization_id uuid,email_responsable text,compte_deja_existant boolean)
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_super_admin() then raise exception 'Réservé au super admin';end if;
 if p_essai_jours is distinct from 14 or p_active_immediatement is distinct from false then
  raise exception 'Tout nouvel espace commence par 14 jours d''essai sans carte. L''abonnement nécessite ensuite l''accord du responsable';
 end if;
 return query select * from public.ouvrir_organisation_historique(p_nom,p_type,p_email_responsable,14,false);
end $$;
revoke all on function public.ouvrir_organisation(text,public.organization_type,text,integer,boolean) from public,anon;
grant execute on function public.ouvrir_organisation(text,public.organization_type,text,integer,boolean) to authenticated;

-- Un événement reçu puis abandonné par une panne doit pouvoir être repris.
-- Le doublon n'est acquitté que si le traitement est réellement terminé.
alter table public.abonnement_evenements add column traitement_commence_le timestamptz;
create or replace function public.abonnement_evenement_a_traiter(p_event_id text,p_type text,p_charge jsonb default null)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare v_n integer;e public.abonnement_evenements%rowtype;
begin
 insert into public.abonnement_evenements(stripe_event_id,type,charge,traitement_commence_le)
 values(p_event_id,p_type,p_charge,clock_timestamp()) on conflict(stripe_event_id) do nothing;
 get diagnostics v_n=row_count;
 if v_n=1 then return true;end if;
 select * into e from public.abonnement_evenements where stripe_event_id=p_event_id for update;
 if e.traite_le is not null then return false;end if;
 if e.traitement_commence_le>clock_timestamp()-interval '90 seconds' then
  raise exception 'Cette notification est encore en cours de traitement. Réessayer plus tard' using errcode='55P03';
 end if;
 update public.abonnement_evenements set traitement_commence_le=clock_timestamp(),erreur=null where stripe_event_id=p_event_id;
 return true;
end $$;
create or replace function public.abonnement_evenement_rejouable(p_event_id text) returns void
language sql volatile security definer set search_path='' as $$
 update public.abonnement_evenements set traitement_commence_le=null where stripe_event_id=p_event_id and traite_le is null;
$$;
revoke all on function public.abonnement_evenement_a_traiter(text,text,jsonb),public.abonnement_evenement_rejouable(text) from public,anon,authenticated;
grant execute on function public.abonnement_evenement_a_traiter(text,text,jsonb),public.abonnement_evenement_rejouable(text) to service_role;
