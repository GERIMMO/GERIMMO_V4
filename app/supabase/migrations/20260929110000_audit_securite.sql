-- Audit sécurité du 29/09 — correctifs base.
--
-- 1. demandes_devis : le formulaire public ne pose plus que ses propres champs.
--    `created_at` et `traitee_le` étaient insérables par anon : une demande
--    antidatée échappait au plafond horaire du déclencheur, une demande
--    « déjà traitée » disparaissait de la file. Le déclencheur force en outre
--    ces deux valeurs (défense en profondeur, y compris pour authenticated).
-- 2. ecritures : la saisie libre (actions/compta.ts, ajouterEcriture) ne pose
--    que organization_id, categorie, sens, montant, date_piece,
--    date_imputation, libelle, lot_id. Les colonnes réservées aux fonctions
--    comptables (systeme, encaissement_id, depot_encaissement_id, mandat_id,
--    contre_ecriture_de, bail_id, motif, id, created_at) ne sont plus
--    insérables par PostgREST. Les fonctions SECURITY DEFINER qui les posent
--    s'exécutent en propriétaire : les droits de colonne ne les touchent pas.
--    Et deux clés composites de même organisation (mandat, encaissement de
--    dépôt), sur le modèle de ecritures_lot_meme_org_fk.
-- 4. Portefeuille de l'agent restreint : partager_document_locataire,
--    valider_attestation, envoyer_pour_signature, log_document_access et
--    decider_avenant_devis vérifiaient l'appartenance à l'agence, pas le
--    portefeuille. Même règle que la RLS des documents
--    (document_deja_visible_agent) et des interventions.
-- 5. document_dans_portefeuille / alerte_dans_portefeuille servent aux
--    politiques RLS (évaluées en tant qu'appelant) : on ne peut pas les
--    révoquer d'authenticated. Elles rendent désormais `false` à qui n'est pas
--    membre actif de l'organisation — plus d'oracle d'existence inter-agences.

-- ─── 1. demandes_devis ───────────────────────────────────────────────────────

revoke insert on table public.demandes_devis from anon, authenticated;
grant insert (nom, email, agence, telephone, nb_lots, message)
  on table public.demandes_devis to anon, authenticated;

create or replace function public.demandes_devis_limiter()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_par_adresse integer; v_total integer;
begin
  -- Audit 29/09 : l'horodatage et l'état de traitement ne viennent jamais du
  -- formulaire. Sans cela, une demande antidatée échappait aux plafonds
  -- ci-dessous et une demande « déjà traitée » sortait de la file.
  new.created_at := now();
  new.traitee_le := null;

  -- Une seule insertion compte à la fois : sans ce verrou, cent envois
  -- simultanés liraient tous « zéro demande dans l'heure ».
  perform pg_advisory_xact_lock(hashtext('public.demandes_devis'));

  new.email := lower(btrim(new.email));

  if exists (select 1 from public.demandes_devis d
             where lower(d.email) = new.email
               and coalesce(d.message, '') = coalesce(new.message, '')
               and d.created_at > now() - interval '24 hours') then
    return null; -- doublon : rien n'est écrit, l'envoyeur n'en sait rien
  end if;

  select count(*) into v_par_adresse from public.demandes_devis d
  where lower(d.email) = new.email and d.created_at > now() - interval '1 hour';
  if v_par_adresse >= 3 then
    raise exception 'Nous avons déjà bien reçu vos demandes : nous revenons vers vous sous 48 h ouvrées.'
      using errcode = 'P0001';
  end if;

  select count(*) into v_total from public.demandes_devis d
  where d.created_at > now() - interval '1 hour';
  if v_total >= 30 then
    raise exception 'Le formulaire reçoit beaucoup de demandes en ce moment : réessayez dans une heure.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

-- ─── 2. ecritures ────────────────────────────────────────────────────────────

revoke insert on table public.ecritures from anon, authenticated;
grant insert (organization_id, categorie, sens, montant, date_piece,
              date_imputation, libelle, lot_id)
  on table public.ecritures to authenticated;

-- Même organisation pour le mandat et l'encaissement de dépôt liés. Les clés
-- simples existantes (ON DELETE SET NULL) restent : elles vident le lien à la
-- suppression, avant que la clé composite (NO ACTION) ne soit vérifiée.
-- `encaissement_id` n'a volontairement AUCUNE clé : une contre-écriture garde
-- la trace d'un encaissement supprimé (supprimer_encaissement). Il n'est plus
-- insérable par PostgREST (ci-dessus), seules les fonctions le posent.
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.depot_encaissements'::regclass
                   and conname = 'depot_encaissements_id_org_unique') then
    alter table public.depot_encaissements
      add constraint depot_encaissements_id_org_unique unique (id, organization_id);
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.mandats'::regclass and contype in ('u', 'p')
                   and pg_get_constraintdef(oid) in ('UNIQUE (id, organization_id)'))
     and not exists (select 1 from pg_indexes
                     where schemaname = 'public' and tablename = 'mandats'
                       and indexname = 'mandats_id_org_unique') then
    alter table public.mandats
      add constraint mandats_id_org_unique unique (id, organization_id);
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.ecritures'::regclass
                   and conname = 'ecritures_mandat_meme_org_fk') then
    alter table public.ecritures
      add constraint ecritures_mandat_meme_org_fk
      foreign key (mandat_id, organization_id) references public.mandats (id, organization_id);
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.ecritures'::regclass
                   and conname = 'ecritures_depot_meme_org_fk') then
    alter table public.ecritures
      add constraint ecritures_depot_meme_org_fk
      foreign key (depot_encaissement_id, organization_id)
      references public.depot_encaissements (id, organization_id);
  end if;
end $$;

-- Chaque clé étrangère a son index couvrant (tests/schema-performance-securite).
create index if not exists ecritures_mandat_organisation_fk_idx
  on public.ecritures (mandat_id, organization_id);
create index if not exists ecritures_depot_organisation_fk_idx
  on public.ecritures (depot_encaissement_id, organization_id);

-- ─── 5. Plus d'oracle d'existence hors de son organisation ──────────────────

create or replace function public.document_dans_portefeuille(p_org uuid, p_doc uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  -- Audit 29/09 : hors de son organisation, rien n'est « dans le
  -- portefeuille ». Sans ce préalable, un compte quelconque sondait
  -- l'existence d'un document d'une autre agence par ses liens.
  select (
    (select auth.uid()) is null
    or public.is_super_admin()
    or exists (select 1 from public.memberships m
               where m.account_id = (select auth.uid())
                 and m.organization_id = p_org and m.status = 'active')
  )
  and (
  exists (
    select 1 from public.document_liens dl
    where dl.document_id = p_doc and (
      (dl.entite = 'lot' and not public.lot_hors_portefeuille(p_org, dl.entite_id))
      or (dl.entite = 'bail' and not public.bail_hors_portefeuille(p_org, dl.entite_id))
      or (dl.entite = 'personne' and not public.person_hors_portefeuille(p_org, dl.entite_id))
      or (dl.entite = 'mandat' and not public.mandat_hors_portefeuille(p_org, dl.entite_id))
      or (dl.entite = 'incident' and not public.incident_hors_portefeuille(p_org, dl.entite_id))
    )
  )
  -- Le contrat signé et le règlement de copropriété d'un bail du portefeuille.
  or exists (
    select 1 from public.baux b
    where b.organization_id = p_org
      and (b.document_signe = p_doc or b.reglement_copropriete = p_doc)
      and not public.bail_hors_portefeuille(p_org, b.id)
  )
  -- Le rapport d'un diagnostic posé sur un lot du portefeuille, ou sur un
  -- bien dont un lot au moins est du portefeuille.
  or exists (
    select 1 from public.diagnostics dg
    where dg.organization_id = p_org
      and dg.document_id = p_doc
      and (
        (dg.lot_id is not null and not public.lot_hors_portefeuille(p_org, dg.lot_id))
        or (dg.lot_id is null and dg.bien_id is not null and exists (
              select 1 from public.lots l
              where l.bien_id = dg.bien_id
                and not public.lot_hors_portefeuille(p_org, l.id)))
      )
  )
  );
$function$;

create or replace function public.alerte_dans_portefeuille(p_org uuid, p_details jsonb)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  -- Audit 29/09 : hors de son organisation, aucune alerte n'est « dans le
  -- portefeuille » (plus de réponse constante `true` à un non-membre).
  select (
    (select auth.uid()) is null
    or public.is_super_admin()
    or exists (select 1 from public.memberships m
               where m.account_id = (select auth.uid())
                 and m.organization_id = p_org and m.status = 'active')
  )
  and case
    when p_details ? 'incident_id' then not public.incident_hors_portefeuille(p_org, (p_details->>'incident_id')::uuid)
    when p_details ? 'intervention_id' then not public.intervention_hors_portefeuille(p_org, (p_details->>'intervention_id')::uuid)
    when p_details ? 'consultation_id' then not public.consultation_hors_portefeuille(p_org, (p_details->>'consultation_id')::uuid)
    when p_details ? 'devis_id' then not public.devis_hors_portefeuille(p_org, (p_details->>'devis_id')::uuid)
    when p_details ? 'bail_id' then not public.bail_hors_portefeuille(p_org, (p_details->>'bail_id')::uuid)
    when p_details ? 'lot_id' then not public.lot_hors_portefeuille(p_org, (p_details->>'lot_id')::uuid)
    when p_details ? 'person_id' then not public.person_hors_portefeuille(p_org, (p_details->>'person_id')::uuid)
    else true
  end;
$function$;

-- ─── 4. Portefeuille dans les fonctions documentaires ────────────────────────

create or replace function public.partager_document_locataire(p_org uuid, p_doc uuid, p_partager boolean)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_doc record;
begin
  if not (p_org in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select d.* into v_doc from public.documents d
  where d.id = p_doc and d.organization_id = p_org and d.purged_at is null;
  if v_doc.id is null then
    raise exception 'Document introuvable';
  end if;
  -- Audit 29/09 : l'agent restreint ne partage que ce qu'il voit.
  if public.est_agent_restreint(p_org)
     and not public.document_deja_visible_agent(p_org, p_doc) then
    raise exception 'Ce document est hors de votre portefeuille' using errcode = '42501';
  end if;
  if v_doc.type not in ('quittance', 'courrier') then
    raise exception 'Seuls les quittances et courriers se mettent à disposition — les pièces du dossier suivent leurs propres règles';
  end if;
  if p_partager and not exists (
    select 1 from public.document_liens dl
    where dl.document_id = p_doc and dl.entite = 'personne'
  ) then
    raise exception 'Rattachez d''abord le document à la fiche de la personne concernée';
  end if;
  update public.documents
     set partage_le = case when p_partager then now() else null end
   where id = p_doc;
end $function$;

create or replace function public.valider_attestation(p_org uuid, p_document uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v record;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into v from public.documents
  where id = p_document and organization_id = p_org
    and type = 'attestation_assurance' and purged_at is null;
  if not found then raise exception 'Attestation introuvable'; end if;
  -- Audit 29/09 : l'agent restreint ne valide que ce qu'il voit.
  if public.est_agent_restreint(p_org)
     and not public.document_deja_visible_agent(p_org, p_document) then
    raise exception 'Cette attestation est hors de votre portefeuille' using errcode = '42501';
  end if;
  if v.verifie_le is not null then
    raise exception 'Cette attestation est déjà validée';
  end if;
  if exists (select 1 from public.documents d2 where d2.remplace_id = p_document) then
    raise exception 'Une version plus récente a été déposée — validez la dernière';
  end if;

  update public.documents
  set verifie_le = now(), verifie_par = (select auth.uid())
  where id = p_document;

  update public.alerts
  set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
      closed_action = 'Attestation vérifiée et validée'
  where organization_id = p_org and statut = 'ouverte'
    and type = 'attestation_a_verifier'
    and details->>'document_id' = p_document::text;
end;
$function$;

create or replace function public.envoyer_pour_signature(p_org uuid, p_document uuid, p_person uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_doc record;
  v_id uuid;
begin
  if not (p_org in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select d.* into v_doc from public.documents d
  where d.id = p_document and d.organization_id = p_org and d.purged_at is null;
  if v_doc.id is null then
    raise exception 'Document introuvable';
  end if;
  -- Audit 29/09 : envoyer un document à signer le met sous les yeux d'un
  -- locataire. L'agent restreint n'envoie que ce qu'il voit lui-même (la
  -- personne, elle, est contrôlée par la garde de demandes_signature).
  if public.est_agent_restreint(p_org)
     and not public.document_deja_visible_agent(p_org, p_document) then
    raise exception 'Ce document est hors de votre portefeuille' using errcode = '42501';
  end if;
  if v_doc.type = 'etat_des_lieux' then
    raise exception 'Un état des lieux se signe sur place, contradictoirement — il ne s''envoie pas pour signature';
  end if;
  if v_doc.type not in ('bail', 'courrier', 'quittance') then
    raise exception 'Ce type de pièce ne s''envoie pas pour signature';
  end if;
  if not exists (
    select 1 from public.document_liens dl
    where dl.document_id = p_document and dl.entite = 'personne' and dl.entite_id = p_person
  ) then
    raise exception 'Cette personne n''est pas rattachée au document — rattachez-la d''abord';
  end if;
  if not exists (
    select 1 from public.persons p
    join public.memberships m
      on m.account_id = p.account_id and m.organization_id = p_org
    where p.id = p_person and p.organization_id = p_org
      and p.archived_at is null
      and m.role = 'locataire' and m.status = 'active'
  ) then
    raise exception 'Cette personne n''a pas d''espace locataire actif : elle ne verrait jamais la demande';
  end if;

  insert into public.demandes_signature
    (organization_id, document_id, person_id, created_by)
  values (p_org, p_document, p_person, (select auth.uid()))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Ce document est déjà en attente de signature chez cette personne';
end $function$;

create or replace function public.log_document_access(doc uuid, acces text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_org uuid;
begin
  if acces not in ('consultation', 'telechargement') then raise exception 'log_document_access: action inconnue %', acces; end if;
  select d.organization_id into v_org from public.documents d where d.id = doc;
  if v_org is null then raise exception 'log_document_access: document inconnu'; end if;
  if not (
    -- Audit 29/09 : l'agent restreint ne consigne que ce qu'il voit.
    (v_org in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
     and (not public.est_agent_restreint(v_org) or public.document_deja_visible_agent(v_org, doc)))
    or public.is_super_admin()
    or exists (select 1 from public.mon_document_locataire(v_org, doc))
  ) then raise exception 'log_document_access: acces refuse'; end if;
  insert into public.acces_pieces_log (organization_id, account_id, document_id, action) values (v_org, (select auth.uid()), doc, acces);
end; $function$;

create or replace function public.decider_avenant_devis(p_avenant uuid, p_accepter boolean, p_motif text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v public.devis_avenants%rowtype; mission public.incident_interventions%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Accès refusé'; end if;
  select * into v from public.devis_avenants where id=p_avenant;
  if v.id is null or public.can_manage_organization(v.organization_id) is not true then raise exception 'Accès refusé'; end if;
  -- Audit 29/09 : l'agent restreint ne décide que pour ses interventions.
  if public.intervention_hors_portefeuille(v.organization_id, v.intervention_id) then
    raise exception 'Cette intervention est hors de votre portefeuille' using errcode = '42501';
  end if;
  -- Ordre de verrou identique à la demande et au compte rendu, sans interblocage.
  select * into mission from public.incident_interventions where id=v.intervention_id for update;
  select * into v from public.devis_avenants where id=p_avenant for update;
  if v.statut<>'a_decider' then raise exception 'Cet avenant a déjà été décidé'; end if;
  if mission.statut not in ('acceptee','planifiee','en_cours') then raise exception 'Cette mission ne peut plus recevoir d’avenant'; end if;
  if p_accepter is null then raise exception 'Choisissez une décision'; end if;
  if length(coalesce(p_motif,''))>4000 then raise exception 'La justification est trop longue'; end if;
  if not p_accepter and length(btrim(coalesce(p_motif,'')))<10 then raise exception 'Expliquez le refus à l’artisan'; end if;
  update public.devis_avenants set statut=case when p_accepter then 'accepte' else 'refuse' end,
    decide_par=(select auth.uid()),decide_le=now(),decision_motif=nullif(btrim(coalesce(p_motif,'')),'') where id=p_avenant;
  update public.alerts set statut='fermee',closed_at=now(),closed_by=(select auth.uid()),
    closed_action=case when p_accepter then 'Dépassement accepté' else 'Dépassement refusé' end
    where organization_id=v.organization_id and type='avenant_devis_a_decider' and statut='ouverte' and details->>'avenant_id'=v.id::text;
end $function$;
