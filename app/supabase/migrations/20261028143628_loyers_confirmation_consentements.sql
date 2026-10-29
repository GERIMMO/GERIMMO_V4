-- Les accords du locataire sont séparés : accepter les quittances ne vaut jamais accord LRE.
create table if not exists public.consentements_documents_locataire (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 person_id uuid not null,
 quittances_electroniques boolean not null default false,
 recommandes_electroniques boolean not null default false,
 quittances_modifie_le timestamptz,
 recommandes_modifie_le timestamptz,
 adresse_email text not null,
 version_information text not null default '2026-10-28',
 account_id uuid references auth.users(id) on delete set null,
 primary key (organization_id,person_id),
 foreign key (person_id,organization_id) references public.persons(id,organization_id) on delete cascade
);
alter table public.consentements_documents_locataire enable row level security;
revoke all on public.consentements_documents_locataire from public,anon,authenticated;
grant select on public.consentements_documents_locataire to authenticated;
grant all on public.consentements_documents_locataire to service_role;
-- Un locataire sorti conserve le droit de lire et retirer ses accords pour les futurs envois.
create or replace function public.ma_personne_consentements_locataire(p_org uuid)
returns uuid language sql stable security definer set search_path='' as $$
 select p.id from public.persons p where p.organization_id=p_org and p.account_id=auth.uid()
 and exists(select 1 from public.memberships m where m.account_id=auth.uid() and m.organization_id=p_org and m.role='locataire' and m.status in('active','inactive')) limit 1;
$$;
revoke all on function public.ma_personne_consentements_locataire(uuid) from public,anon;
grant execute on function public.ma_personne_consentements_locataire(uuid) to authenticated;
drop policy if exists consentements_documents_lecture on public.consentements_documents_locataire;
create policy consentements_documents_lecture on public.consentements_documents_locataire for select to authenticated
using (person_id=public.ma_personne_consentements_locataire(organization_id) or organization_id in
 (select public.org_ids_avec_roles(array['proprietaire_direct','admin_agence','agent']::public.membership_role[])));
create or replace function public.modifier_consentement_document(p_org uuid,p_nature text,p_accepte boolean,p_email text)
returns boolean language plpgsql security definer set search_path='' as $$
declare personne uuid; adresse text; avant public.consentements_documents_locataire;
begin
 personne:=public.ma_personne_consentements_locataire(p_org);
 if auth.uid() is null or personne is null then raise exception 'Accès refusé.'; end if;
 if p_nature is null or p_nature not in ('quittances','recommandes') or p_accepte is null then raise exception 'Choix invalide.'; end if;
 if not p_accepte then
  select * into avant from public.consentements_documents_locataire where organization_id=p_org and person_id=personne for update;
  if not found or not(case when p_nature='quittances' then avant.quittances_electroniques else avant.recommandes_electroniques end) then return false; end if;
  update public.consentements_documents_locataire set
   quittances_electroniques=case when p_nature='quittances' then false else quittances_electroniques end,
   recommandes_electroniques=case when p_nature='recommandes' then false else recommandes_electroniques end,
   quittances_modifie_le=case when p_nature='quittances' then now() else quittances_modifie_le end,
   recommandes_modifie_le=case when p_nature='recommandes' then now() else recommandes_modifie_le end,account_id=auth.uid()
  where organization_id=p_org and person_id=personne;
  insert into public.audit_log(organization_id,account_id,action,details) values(p_org,auth.uid(),'consentement_document_modifie',jsonb_build_object('person_id',personne,'nature',p_nature,'accepte',false,'version','2026-10-28','adresse_email',avant.adresse_email));
  return false;
 end if;
 if public.ma_personne_locataire(p_org) is null then raise exception 'Votre ancien espace permet de retirer un accord, pas d’en enregistrer un nouveau.'; end if;
 -- Une personne ne peut consentir que pour elle-même, jamais pour les autres colocataires.
 select lower(btrim(email)) into adresse from public.persons where id=personne and organization_id=p_org for update;
 if adresse is null or adresse='' or lower(btrim(p_email)) is distinct from adresse then raise exception 'L’adresse e-mail a changé ou manque. Actualisez vos documents avant de confirmer.'; end if;
 select * into avant from public.consentements_documents_locataire where organization_id=p_org and person_id=personne;
 if found and avant.adresse_email=adresse and (case when p_nature='quittances' then avant.quittances_electroniques else avant.recommandes_electroniques end)=p_accepte then return p_accepte; end if;
 insert into public.consentements_documents_locataire(organization_id,person_id,account_id,adresse_email) values(p_org,personne,auth.uid(),adresse) on conflict do nothing;
 update public.consentements_documents_locataire set
  quittances_electroniques=case when p_nature='quittances' then p_accepte when adresse_email<>adresse then false else quittances_electroniques end,
  recommandes_electroniques=case when p_nature='recommandes' then p_accepte when adresse_email<>adresse then false else recommandes_electroniques end,
  quittances_modifie_le=case when p_nature='quittances' then now() else quittances_modifie_le end,
  recommandes_modifie_le=case when p_nature='recommandes' then now() else recommandes_modifie_le end,
  version_information='2026-10-28',account_id=auth.uid(),adresse_email=adresse
 where organization_id=p_org and person_id=personne;
 insert into public.audit_log(organization_id,account_id,action,details) values(p_org,auth.uid(),'consentement_document_modifie',
  jsonb_build_object('person_id',personne,'nature',p_nature,'accepte',p_accepte,'version','2026-10-28','adresse_email',adresse));
 return p_accepte;
end $$;
revoke all on function public.modifier_consentement_document(uuid,text,boolean,text) from public,anon;
grant execute on function public.modifier_consentement_document(uuid,text,boolean,text) to authenticated;
create or replace function public.quittance_envoi_autorise(p_org uuid,p_bail uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.baux b join public.consentements_documents_locataire c
 on c.organization_id=b.organization_id and c.person_id=b.locataire_principal
 join public.persons p on p.id=b.locataire_principal and p.organization_id=b.organization_id
 where b.id=p_bail and b.organization_id=p_org and c.quittances_electroniques and c.adresse_email=lower(btrim(p.email)));
$$;
revoke all on function public.quittance_envoi_autorise(uuid,uuid) from public,anon;
grant execute on function public.quittance_envoi_autorise(uuid,uuid) to authenticated,service_role;
-- Dernière vérification avant l'effet externe : l'accord vise exactement l'adresse du message.
-- La surcharge sans adresse reste utilisée pour sélectionner les quittances à préparer.
create or replace function public.quittance_envoi_autorise(p_org uuid,p_bail uuid,p_destinataire text)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.baux b join public.consentements_documents_locataire c
 on c.organization_id=b.organization_id and c.person_id=b.locataire_principal
 join public.persons p on p.id=b.locataire_principal and p.organization_id=b.organization_id
 where b.id=p_bail and b.organization_id=p_org and c.quittances_electroniques
 and c.adresse_email=lower(btrim(p.email)) and c.adresse_email=lower(btrim(p_destinataire)));
$$;
revoke all on function public.quittance_envoi_autorise(uuid,uuid,text) from public,anon;
grant execute on function public.quittance_envoi_autorise(uuid,uuid,text) to authenticated,service_role;
-- La collecte des documents reste disponible sans accord ; seule la transmission électronique est filtrée.
do $$ declare definition text; begin
 select pg_get_functiondef('public.quittances_a_envoyer(integer)'::regprocedure) into definition;
 if position('public.quittance_envoi_autorise' in definition)=0 then
  if position('and o.quittances_envoi_auto' in definition)=0 then raise exception 'Fonction quittances inattendue'; end if;
  definition:=replace(definition,'and o.quittances_envoi_auto','and o.quittances_envoi_auto and public.quittance_envoi_autorise(q.organization_id,q.bail_id)');
  execute definition;
 end if;
end $$;
-- Le solde comptable n'est pas une confirmation bancaire. Chaque palier d'un propriétaire direct attend une réponse récente.
create or replace function public.confirmation_relance_proprietaire(p_bail uuid,p_niveau text,p_echeance date)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.baux b join public.organizations o on o.id=b.organization_id
 where b.id=p_bail and (o.type<>'proprietaire_direct' or exists(
  select 1 from public.receptions_loyers_signalees s join public.appels_loyer a on a.id=s.appel_id and a.organization_id=s.organization_id
  where a.bail_id=b.id and a.date_echeance=p_echeance and s.signale_le>=now()-interval '36 hours'
   and (s.signale_le at time zone 'Europe/Paris')::date>=p_echeance+case when p_niveau='relance_1' then o.relance_1_jours else o.relance_2_jours end
   and (p_niveau<>'relance_2' or (s.signale_le at time zone 'Europe/Paris')::date>=coalesce((select max(r.date_envoi) from public.relances r where r.bail_id=b.id and r.niveau='relance_1' and r.date_envoi>=p_echeance),p_echeance)+greatest(1,o.relance_2_jours-o.relance_1_jours))
   and not exists(select 1 from public.relances r where r.bail_id=b.id and r.date_envoi>=p_echeance
     and r.date_envoi>=(s.signale_le at time zone 'Europe/Paris')::date)
 )));
$$;
revoke all on function public.confirmation_relance_proprietaire(uuid,text,date) from public,anon;
grant execute on function public.confirmation_relance_proprietaire(uuid,text,date) to authenticated,service_role;
do $$ declare definition text; begin
 select pg_get_functiondef('public.relances_loyer_dues(integer)'::regprocedure) into definition;
 if position('public.confirmation_relance_proprietaire' in definition)=0 then
  if position('where not n.relance_du_jour' in definition)=0 then raise exception 'Fonction relances inattendue'; end if;
  definition:=replace(definition,'where not n.relance_du_jour','where not n.relance_du_jour and public.confirmation_relance_proprietaire(n.bail_id,case when not n.a_relance_1 then ''relance_1'' else ''relance_2'' end,n.date_echeance)');
  execute definition;
 end if;
end $$;
notify pgrst,'reload schema';
-- La confirmation porte sur le montant montré. Un paiement saisi ailleurs invalide aussi l’autorisation.
alter table public.receptions_loyers_signalees add column if not exists montant_restant_confirme numeric;
create or replace function public.figer_montant_reception_signalee()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 select e.montant_du-e.montant_couvert into new.montant_restant_confirme
 from public.appels_loyer a cross join lateral public.etat_loyers_bail_brut(a.bail_id) e
 where a.id=new.appel_id and a.organization_id=new.organization_id and e.appel_id=a.id;
 return new;
end $$;
revoke all on function public.figer_montant_reception_signalee() from public,anon,authenticated;
drop trigger if exists reception_montant_confirme on public.receptions_loyers_signalees;
create trigger reception_montant_confirme before insert or update on public.receptions_loyers_signalees
for each row execute function public.figer_montant_reception_signalee();
do $$ declare definition text; begin
 select pg_get_functiondef('public.confirmation_relance_proprietaire(uuid,text,date)'::regprocedure) into definition;
 definition:=replace(definition,'where a.bail_id=b.id and a.date_echeance=p_echeance',
 'where a.bail_id=b.id and a.date_echeance=p_echeance and exists(select 1 from public.etat_loyers_bail_brut(b.id) e where e.appel_id=a.id and e.montant_du-e.montant_couvert=s.montant_restant_confirme)');
 execute definition;
end $$;
-- Relecture juste avant l’e-mail : la sélection du début de tâche peut dater de plusieurs secondes.
create or replace function public.relance_loyer_envoi_confirme(p_bail uuid,p_niveau text,p_echeance date,p_reste numeric,p_total numeric)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.relances_loyer_dues(500) r where r.bail_id=p_bail and r.niveau=p_niveau
  and r.date_echeance=p_echeance and r.reste=p_reste and r.total_du is not distinct from p_total);
$$;
revoke all on function public.relance_loyer_envoi_confirme(uuid,text,date,numeric,numeric) from public,anon,authenticated;
grant execute on function public.relance_loyer_envoi_confirme(uuid,text,date,numeric,numeric) to service_role;
notify pgrst,'reload schema';
