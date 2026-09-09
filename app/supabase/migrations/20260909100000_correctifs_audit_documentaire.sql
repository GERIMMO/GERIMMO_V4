-- Correctifs de l'audit multi-agents du 09/09 (vagues agence v6 + documentaire).
-- Les trois rapports convergent sur : (1) l'image de signature illisible (la
-- policy ged_select exige une ligne documents), (2) la route fichier locataire
-- cassée pour quittances/courriers (log_document_access non étendue), (3) la
-- fuite des courriers internes (tout courrier rattaché à une fiche devenait
-- visible du locataire — contradiction avec RM-12 « mise à disposition ≠
-- envoi »), (4) « envoyer pour signature » sans garde-fous (type, lien,
-- espace actif, doublons, org du document), (5) le périmètre portefeuille
-- ignoré par Messages et Documents côté agent (RM-18.1.3).

-- ============================================================
-- 1. Mise à disposition : le geste qui rend un courrier/une quittance
--    PDF visible du locataire (RM-12 : la mise à disposition est un geste,
--    jamais un effet de bord du rattachement)
-- ============================================================
alter table public.documents add column partage_le timestamptz;

-- Le geste, réservé aux gérants, borné aux types adressables et aux documents
-- rattachés à une fiche personne (pas d'update client sur documents : la
-- table reste sans policy update, le geste passe par cette fonction)
create function public.partager_document_locataire(
  p_org uuid, p_doc uuid, p_partager boolean
)
returns void
language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke execute on function public.partager_document_locataire(uuid, uuid, boolean) from public, anon;

-- ============================================================
-- 2. Intégrité des demandes de signature : le document appartient à la même
--    organisation que la demande (comme document_liens), et une seule demande
--    en attente par document et par personne
-- ============================================================
alter table public.demandes_signature
  add constraint demandes_signature_document_meme_org_fk
    foreign key (document_id, organization_id)
    references public.documents (id, organization_id),
  add constraint demandes_signature_retour_meme_org_fk
    foreign key (document_retour_id, organization_id)
    references public.documents (id, organization_id);

create unique index demandes_signature_attente_unique
  on public.demandes_signature (document_id, person_id)
  where signee_le is null;

-- ============================================================
-- 3. Envoyer pour signature : les gardes manquantes, réunies en une fonction
--    (l'insert direct restait possible via la policy — la policy demeure,
--    mais l'app passe par ici)
--    - types signables seulement : bail, courrier, quittance — jamais un EDL
--      (RM-13.1.6 : signature tactile sur place) ni une pièce du dossier
--    - le signataire est rattaché AU document (fuite inter-locataires sinon)
--    - le signataire a un espace locataire actif (sinon la demande ne serait
--      jamais visible : message de succès mensonger)
-- ============================================================
create function public.envoyer_pour_signature(
  p_org uuid, p_document uuid, p_person uuid
)
returns uuid
language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke execute on function public.envoyer_pour_signature(uuid, uuid, uuid) from public, anon;

-- Annulation d'une demande en attente (le gérant s'est trompé de personne,
-- ou la signature s'est faite autrement)
create function public.annuler_demande_signature(p_org uuid, p_demande uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (p_org in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  delete from public.demandes_signature
   where id = p_demande and organization_id = p_org and signee_le is null;
  if not found then
    raise exception 'Cette demande n''existe plus ou a déjà été satisfaite';
  end if;
end $$;
revoke execute on function public.annuler_demande_signature(uuid, uuid) from public, anon;

-- ============================================================
-- 4. Retour du document signé : le PDF signé hérite des rattachements du
--    document d'origine (il apparaissait orphelin — ni fiche bail ni lot), et
--    le redépôt du fichier NON signé (même empreinte) reçoit un message
--    métier au lieu d'une violation d'unicité brute
-- ============================================================
create or replace function public.retourner_document_signe(
  p_org uuid, p_demande uuid, p_storage_path text, p_mime text,
  p_taille bigint, p_empreinte text
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_person uuid;
  v_person_nom text;
  v_demande record;
  v_original record;
  v_doc uuid;
begin
  if p_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Format refusé : PDF, JPEG ou PNG uniquement';
  end if;
  if p_storage_path not like p_org::text || '/%' then
    raise exception 'Chemin de fichier invalide';
  end if;
  v_person := public.ma_personne_locataire(p_org);
  if v_person is null then
    raise exception 'Aucune fiche rattachée à votre compte dans cette agence';
  end if;
  select trim(coalesce(prenom || ' ', '') || nom) into v_person_nom
  from public.persons where id = v_person;

  select ds.* into v_demande from public.demandes_signature ds
  where ds.id = p_demande and ds.organization_id = p_org
    and ds.person_id = v_person and ds.signee_le is null;
  if v_demande.id is null then
    raise exception 'Cette demande n''existe plus — elle a peut-être déjà été satisfaite';
  end if;
  select d.* into v_original from public.documents d where d.id = v_demande.document_id;

  begin
    insert into public.documents
      (organization_id, type, titre, storage_path, mime_type, taille_octets,
       empreinte, deposited_by)
    values
      (p_org, v_original.type,
       coalesce(v_original.titre, 'Document') || ' — signé',
       p_storage_path, p_mime, p_taille, p_empreinte, (select auth.uid()))
    returning id into v_doc;
  exception when unique_violation then
    raise exception 'Ce fichier est identique au document reçu : signez-le d''abord, puis déposez la version signée';
  end;

  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, p_org, 'organisation', p_org),
         (v_doc, p_org, 'personne', v_person)
  on conflict (document_id, entite, entite_id) do nothing;
  -- Les rattachements du document d'origine (bail, lot…) suivent le signé
  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  select v_doc, p_org, dl.entite, dl.entite_id
  from public.document_liens dl
  where dl.document_id = v_demande.document_id and dl.organization_id = p_org
  on conflict (document_id, entite, entite_id) do nothing;

  update public.demandes_signature
     set signee_le = now(), document_retour_id = v_doc
   where id = p_demande;

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (p_org, 'signature_retournee', 'normale',
          format('Document signé retourné — %s', v_person_nom),
          jsonb_build_object('document_id', v_doc, 'person_id', v_person,
                             'libelle', coalesce(v_original.titre, 'Document') ||
                                        ' — à contrôler puis classer'));
  return v_doc;
end;
$$;

-- ============================================================
-- 5. Signature préenregistrée : lisible (policy dédiée — le fichier n'a pas
--    de ligne documents, ged_select le refusait : zone vierge sur tous les
--    PDF et aperçu jamais affiché), et l'ancien fichier part en purge au
--    remplacement ou au retrait (image manuscrite = donnée personnelle,
--    RM-A2.1 : rien ne traîne sans règle)
-- ============================================================
create policy ged_select_signature on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.organizations o
      where o.signature_path = name
        and o.id in (select public.org_ids_avec_roles(
          array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    )
  );

create function public.definir_signature_organisation(p_org uuid, p_path text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_ancienne text;
begin
  if not (p_org in (select public.org_ids_avec_roles(
    array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Réservé au responsable de l''organisation';
  end if;
  if p_path is not null and p_path not like p_org::text || '/signature-%' then
    raise exception 'Chemin de signature invalide';
  end if;
  select o.signature_path into v_ancienne from public.organizations o where o.id = p_org;
  update public.organizations set signature_path = p_path where id = p_org;
  if v_ancienne is not null and v_ancienne is distinct from p_path then
    insert into public.purge_fichiers (storage_path) values (v_ancienne);
  end if;
end $$;
revoke execute on function public.definir_signature_organisation(uuid, text) from public, anon;

-- ============================================================
-- 6. Espace locataire : quittances/courriers visibles seulement une fois MIS
--    À DISPOSITION (partage_le) — le test « Courrier interne » redevient la
--    règle ; le PDF signé retourné reste visible (branche demandes) ; le
--    OR-join de la policy storage devient deux jointures d'égalité
-- ============================================================
create or replace function public.mes_pieces_locataire(p_org uuid)
returns table (document_id uuid, type public.document_type, titre text, mime_type text,
               depose_le timestamptz, expire_le date, verifie_le timestamptz, source text)
language sql stable security definer set search_path to '' as $$
  with ma_personne as (
    select p.id from public.persons p
    where p.organization_id = p_org and p.account_id = (select auth.uid())
      and exists (select 1 from public.memberships m where m.account_id = p.account_id and m.organization_id = p_org and m.role = 'locataire' and m.status in ('active', 'inactive'))
  ),
  dossier as (
    select d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.documents d
    join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
    join ma_personne mp on mp.id = dl.entite_id
    where d.organization_id = p_org and d.purged_at is null
      and (d.type in ('attestation_assurance', 'piece_identite', 'justificatif')
           or (d.type in ('quittance', 'courrier') and d.partage_le is not null))
      and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
  ),
  retours_signes as (
    select d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.demandes_signature ds
    join ma_personne mp on mp.id = ds.person_id
    join public.documents d on d.id = ds.document_retour_id
    where ds.organization_id = p_org and d.purged_at is null
  ),
  attestation_validee as (
    select d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.documents d
    join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
    join ma_personne mp on mp.id = dl.entite_id
    where d.organization_id = p_org and d.purged_at is null and d.type = 'attestation_assurance' and d.verifie_le is not null
    order by d.verifie_le desc limit 1
  ),
  pieces_bail as (
    select distinct d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.pieces_bail_locataire() pb
    join public.documents d on d.id = pb.document_id
    where pb.organization_id = p_org and d.purged_at is null
  )
  select id, type, titre, mime_type, created_at, expire_le, verifie_le, 'dossier' from dossier
  union
  select rs.id, rs.type, rs.titre, rs.mime_type, rs.created_at, rs.expire_le, rs.verifie_le, 'dossier'
  from retours_signes rs
  where not exists (select 1 from dossier x where x.id = rs.id)
  union
  select av.id, av.type, av.titre, av.mime_type, av.created_at, av.expire_le, av.verifie_le, 'dossier'
  from attestation_validee av
  where not exists (select 1 from dossier x where x.id = av.id)
    and exists (select 1 from dossier x where x.type = 'attestation_assurance' and x.verifie_le is null)
  union
  select pb.id, pb.type, pb.titre, pb.mime_type, pb.created_at, pb.expire_le, pb.verifie_le, 'bail'
  from pieces_bail pb
  where not exists (select 1 from dossier x where x.id = pb.id)
  order by 5 desc;
$$;

create or replace function public.mon_document_locataire(p_org uuid, p_doc uuid)
returns table (document_id uuid, titre text, mime_type text, storage_path text, purged_at timestamptz)
language sql stable security definer set search_path to '' as $$
  select d.id, d.titre, d.mime_type, d.storage_path, d.purged_at
  from public.documents d
  where d.id = p_doc and d.organization_id = p_org
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
    and (
      ((d.type in ('attestation_assurance', 'piece_identite', 'justificatif')
        or (d.type in ('quittance', 'courrier') and d.partage_le is not null))
       and exists (
        select 1 from public.document_liens dl
        join public.persons p on p.id = dl.entite_id
        where dl.document_id = d.id and dl.entite = 'personne'
          and p.organization_id = p_org
          and p.account_id = (select auth.uid())))
      or exists (select 1 from public.pieces_bail_locataire() pb
                 where pb.document_id = d.id and pb.organization_id = p_org)
      -- Un document qu'on me demande de signer (et mon retour signé)
      or exists (
        select 1 from public.demandes_signature ds
        join public.persons p on p.id = ds.person_id
        where (ds.document_id = d.id or ds.document_retour_id = d.id)
          and ds.organization_id = p_org
          and p.account_id = (select auth.uid()))
      or exists (
        select 1 from public.retenues t
        join public.restitutions r on r.id = t.restitution_id and r.statut = 'finalise'
        where t.justificatif_document = d.id
          and r.organization_id = p_org
          and r.bail_id = public.mon_dernier_bail_locataire(p_org))
      or exists (
        select 1 from public.regularisations_charges rc
        join public.baux b on b.id = rc.bail_id
        join public.persons p on p.organization_id = b.organization_id
                             and p.account_id = (select auth.uid())
        where rc.justificatif_document = d.id
          and b.organization_id = p_org
          and (p.id = b.locataire_principal
               or exists (select 1 from public.bail_personnes bp
                          where bp.bail_id = b.id and bp.person_id = p.id
                            and bp.role = 'colocataire'))));
$$;

create or replace function public.chemins_pieces_locataire()
returns setof text
language sql stable security definer set search_path = '' as $$
  select d.storage_path
  from public.pieces_bail_locataire() pb
  join public.documents d on d.id = pb.document_id
  where d.purged_at is null and d.storage_path is not null
  union
  select d.storage_path
  from public.documents d
  join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
  join public.persons p on p.id = dl.entite_id
                       and p.account_id = (select auth.uid())
  where d.purged_at is null and d.storage_path is not null
    and d.organization_id = p.organization_id
    and (d.type in ('attestation_assurance', 'piece_identite', 'justificatif')
         or (d.type in ('quittance', 'courrier') and d.partage_le is not null))
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = p.organization_id
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
  union
  select d.storage_path
  from public.demandes_signature ds
  join public.persons p on p.id = ds.person_id
                       and p.account_id = (select auth.uid())
  join public.documents d on d.id = ds.document_id
  where d.purged_at is null and d.storage_path is not null
    and d.organization_id = ds.organization_id
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = ds.organization_id
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
  union
  select d.storage_path
  from public.demandes_signature ds
  join public.persons p on p.id = ds.person_id
                       and p.account_id = (select auth.uid())
  join public.documents d on d.id = ds.document_retour_id
  where d.purged_at is null and d.storage_path is not null
    and d.organization_id = ds.organization_id
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = ds.organization_id
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
  union
  select d.storage_path
  from public.retenues r
  join public.restitutions re on re.id = r.restitution_id and re.statut = 'finalise'
  join public.baux b on b.id = re.bail_id
  join public.documents d on d.id = r.justificatif_document
  join public.persons p on p.organization_id = b.organization_id
                       and p.account_id = (select auth.uid())
  where d.purged_at is null and d.storage_path is not null
    and (p.id = b.locataire_principal
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = p.id
                      and bp.role = 'colocataire'))
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = b.organization_id
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
  union
  select d.storage_path
  from public.regularisations_charges rc
  join public.baux b on b.id = rc.bail_id
  join public.documents d on d.id = rc.justificatif_document
  join public.persons p on p.organization_id = b.organization_id
                       and p.account_id = (select auth.uid())
  where d.purged_at is null and d.storage_path is not null
    and (p.id = b.locataire_principal
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = p.id
                      and bp.role = 'colocataire'))
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = b.organization_id
                  and m.role = 'locataire' and m.status in ('active', 'inactive'));
$$;

-- ============================================================
-- 7. Trace d'accès : la liste des droits vivait EN DOUBLE (route fichier =
--    mon_document_locataire, trace = sa propre copie restée au 30/08) — la
--    route refusait donc quittances, courriers, retours signés… et même le
--    locataire sorti (status 'active' seul). La trace délègue désormais à la
--    même fonction que la route : plus jamais de divergence.
-- ============================================================
create or replace function public.log_document_access(doc uuid, acces text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid;
begin
  if acces not in ('consultation', 'telechargement') then raise exception 'log_document_access: action inconnue %', acces; end if;
  select d.organization_id into v_org from public.documents d where d.id = doc;
  if v_org is null then raise exception 'log_document_access: document inconnu'; end if;
  if not (
    v_org in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or public.is_super_admin()
    or exists (select 1 from public.mon_document_locataire(v_org, doc))
  ) then raise exception 'log_document_access: acces refuse'; end if;
  insert into public.acces_pieces_log (organization_id, account_id, document_id, action) values (v_org, (select auth.uid()), doc, acces);
end; $$;

-- ============================================================
-- 8. Rétention des demandes de signature (aucune règle ne les couvrait) :
--    elles suivent le sort du document, et 24 mois au plus après le retour —
--    la demande est un journal de circuit, pas une archive
-- ============================================================
create or replace function public.appliquer_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_regle record;
  v_doc record;
  v_docs_purges int := 0;
  v_journaux jsonb := '{}'::jsonb;
  v_count bigint;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'appliquer_retention: reserve au super admin';
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:tech_log' and actif;
  if found then
    delete from public.tech_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('tech_log', v_count);
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:acces_pieces' and actif;
  if found then
    delete from public.acces_pieces_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('acces_pieces_log', v_count);
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:audit_log' and actif;
  if found then
    delete from public.audit_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('audit_log', v_count);
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'alerte:traitee' and actif;
  if found then
    delete from public.alerts
      where statut = 'fermee'
        and closed_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('alertes', v_count);
  end if;

  delete from public.demandes_devis
    where created_at < now() - make_interval(months => 24);
  get diagnostics v_count = row_count;
  v_journaux := v_journaux || jsonb_build_object('demandes_devis', v_count);

  delete from public.intentions_conge
    where traitee_le is not null
      and traitee_le < now() - make_interval(months => 24);
  get diagnostics v_count = row_count;
  v_journaux := v_journaux || jsonb_build_object('intentions_conge', v_count);

  delete from public.demandes_signature ds
    where exists (select 1 from public.documents d
                  where d.id = ds.document_id and d.purged_at is not null)
       or (ds.signee_le is not null
           and ds.signee_le < now() - make_interval(months => 24));
  get diagnostics v_count = row_count;
  v_journaux := v_journaux || jsonb_build_object('demandes_signature', v_count);

  for v_doc in
    select d.id, d.organization_id, d.type, d.storage_path, r.sort, r.data_type
    from public.documents d
    join public.retention_rules r
      on r.data_type = 'document:' || d.type::text and r.actif
    where d.purged_at is null
      and r.sort in ('suppression', 'anonymisation')
      and d.retention_reference_date + make_interval(months => r.duree_mois) <= now()
  loop
    insert into public.purge_fichiers (storage_path) values (v_doc.storage_path);
    delete from public.document_liens where document_id = v_doc.id;
    update public.documents
      set purged_at = now(), storage_path = null, mime_type = null,
          taille_octets = null, empreinte = null, titre = null,
          deposited_by = null
      where id = v_doc.id;
    insert into public.audit_log (account_id, organization_id, action, details)
    values ((select auth.uid()), v_doc.organization_id, 'purge_retention',
            jsonb_build_object('document_id', v_doc.id, 'type', v_doc.type,
                               'regle', v_doc.data_type, 'sort', v_doc.sort));
    v_docs_purges := v_docs_purges + 1;
  end loop;

  return jsonb_build_object('journaux', v_journaux, 'documents_purges', v_docs_purges,
                            'fichiers_en_attente', (select count(*) from public.purge_fichiers where deleted_at is null));
end;
$$;

-- ============================================================
-- 9. Périmètre portefeuille (RM-18.1.3) : Messages et son badge lisaient
--    toute l'agence quand tout le reste du tableau de bord se filtre au
--    portefeuille. Le périmètre se calcule EN SQL, une fois, et suit la même
--    règle que lib/portefeuille.ts : admin/PD voient tout ; l'agent sans
--    mandat voit tout (état de reprise) ; sinon, les personnes des baux de
--    ses lots sous mandat
-- ============================================================
create function public.perimetre_persons_gerant(p_org uuid)
returns table (person_id uuid)
language sql stable security definer set search_path = '' as $$
  with mes_lots as (
    select ml.lot_id
    from public.mandats md
    join public.mandat_lignes ml on ml.mandat_id = md.id and ml.date_fin is null
    where md.organization_id = p_org
      and md.agent_account_id = (select auth.uid())
      and md.etat in ('brouillon', 'a_signer', 'actif', 'preavis')
  )
  select p.id from public.persons p
  where p.organization_id = p_org
    and (
      exists (select 1 from public.memberships m
              where m.account_id = (select auth.uid())
                and m.organization_id = p_org and m.status = 'active'
                and m.role in ('admin_agence', 'proprietaire_direct'))
      or not exists (select 1 from mes_lots)
      or exists (
        select 1 from public.baux b
        where b.organization_id = p_org
          and b.lot_id in (select lot_id from mes_lots)
          and (b.locataire_principal = p.id
               or exists (select 1 from public.bail_personnes bp
                          where bp.bail_id = b.id and bp.person_id = p.id)))
    );
$$;
revoke execute on function public.perimetre_persons_gerant(uuid) from public, anon;

create or replace function public.fils_messages_gerant(p_org uuid)
returns table (person_id uuid, nom text, prenom text, dernier text,
               dernier_le timestamptz, dernier_auteur public.message_auteur, non_lus integer)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nom, p.prenom,
         (select m2.texte from public.messages m2
          where m2.organization_id = p_org and m2.person_id = p.id
          order by m2.created_at desc limit 1),
         (select m2.created_at from public.messages m2
          where m2.organization_id = p_org and m2.person_id = p.id
          order by m2.created_at desc limit 1),
         (select m2.auteur from public.messages m2
          where m2.organization_id = p_org and m2.person_id = p.id
          order by m2.created_at desc limit 1),
         (select count(*)::integer from public.messages m3
          where m3.organization_id = p_org and m3.person_id = p.id
            and m3.auteur = 'locataire' and m3.lu_le is null)
  from public.persons p
  where p.organization_id = p_org
    and p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and p.id in (select pp.person_id from public.perimetre_persons_gerant(p_org) pp)
    and exists (select 1 from public.messages m
                where m.organization_id = p_org and m.person_id = p.id)
  order by 5 desc;
$$;

create or replace function public.messages_non_lus_gerant(p_org uuid)
returns table (person_id uuid, non_lus integer)
language sql stable security definer set search_path = '' as $$
  select m.person_id, count(*)::integer
  from public.messages m
  where m.organization_id = p_org
    and m.auteur = 'locataire' and m.lu_le is null
    and p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and m.person_id in (select pp.person_id from public.perimetre_persons_gerant(p_org) pp)
  group by m.person_id;
$$;

-- ============================================================
-- 10. Documents au périmètre portefeuille : les trois fonctions de la GED
--     acceptent une liste de lots — un document est du portefeuille s'il est
--     rattaché à un de ces lots, à un bail ou un incident d'un de ces lots,
--     ou à une personne d'un de ces baux ; une pièce sans rattachement
--     lot/bail/personne/incident (pièce d'organisation) reste visible de tous
-- ============================================================
drop function public.documents_a_renouveler(uuid, date);
drop function public.documents_stats_par_type(uuid);
drop function public.documents_courants(uuid);

create function public.documents_courants(p_org uuid, p_lots uuid[] default null)
returns setof public.documents
language sql stable set search_path = '' as $$
  select d.*
  from public.documents d
  where d.organization_id = p_org
    and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
    and (
      p_lots is null
      or exists (
        select 1 from public.document_liens dl
        where dl.document_id = d.id
          and ((dl.entite = 'lot' and dl.entite_id = any(p_lots))
            or (dl.entite = 'bail' and dl.entite_id in (
                  select b.id from public.baux b where b.lot_id = any(p_lots)))
            or (dl.entite = 'incident' and dl.entite_id in (
                  select i.id from public.incidents i where i.lot_id = any(p_lots)))
            or (dl.entite = 'personne' and dl.entite_id in (
                  select b.locataire_principal from public.baux b
                  where b.lot_id = any(p_lots) and b.locataire_principal is not null
                  union
                  select bp.person_id from public.bail_personnes bp
                  join public.baux b on b.id = bp.bail_id
                  where b.lot_id = any(p_lots)))))
      or not exists (
        select 1 from public.document_liens dl2
        where dl2.document_id = d.id
          and dl2.entite in ('lot', 'bail', 'personne', 'incident'))
    );
$$;
revoke execute on function public.documents_courants(uuid, uuid[]) from public, anon;

create function public.documents_stats_par_type(p_org uuid, p_lots uuid[] default null)
returns table (type public.document_type, total bigint)
language sql stable set search_path = '' as $$
  select d.type, count(*)
  from public.documents_courants(p_org, p_lots) d
  where d.purged_at is null
  group by d.type
  order by count(*) desc;
$$;
revoke execute on function public.documents_stats_par_type(uuid, uuid[]) from public, anon;

create function public.documents_a_renouveler(p_org uuid, p_limite date, p_lots uuid[] default null)
returns table (id uuid, titre text, expire_le date)
language sql stable set search_path = '' as $$
  select d.id, d.titre, d.expire_le
  from public.documents_courants(p_org, p_lots) d
  where d.purged_at is null
    and d.expire_le is not null and d.expire_le <= p_limite
  order by d.expire_le;
$$;
revoke execute on function public.documents_a_renouveler(uuid, date, uuid[]) from public, anon;

-- ============================================================
-- 11. Les demandes de signature d'un document, côté gérant (pane de la GED) :
--     l'état du circuit était invisible — demande envoyée dans le vide,
--     aucun moyen de le savoir ni d'annuler
-- ============================================================
create function public.demandes_signature_document(p_org uuid, p_doc uuid)
returns table (id uuid, person_id uuid, demandee_le timestamptz,
               signee_le timestamptz, document_retour_id uuid)
language sql stable security definer set search_path = '' as $$
  select ds.id, ds.person_id, ds.demandee_le, ds.signee_le, ds.document_retour_id
  from public.demandes_signature ds
  where ds.organization_id = p_org
    and (ds.document_id = p_doc or ds.document_retour_id = p_doc)
    and p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  order by ds.demandee_le desc;
$$;
revoke execute on function public.demandes_signature_document(uuid, uuid) from public, anon;
