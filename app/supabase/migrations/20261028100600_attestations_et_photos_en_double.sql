-- Attestations et photos déjà déposées ; titre des photos de chantier — audit final du 28/10/2026 (DOC-04, DOC-10, DOC-12)
--
-- 1. DOC-04 — UNE MÊME ATTESTATION POUR DEUX TYPES. L'index `artisan_pieces_empreinte_unique (artisan_id, empreinte)`
--    refusait qu'un même fichier, déjà actif comme décennale, soit déposé comme RC pro ou URSSAF : `deposer_ma_piece_artisan`
--    ne retire que la pièce du MÊME type avant d'insérer, la seconde pièce heurtait l'index (`unique_violation`), et
--    l'artisan lisait « Gerimmo n'a pas pu terminer cette action ». Or une attestation d'assureur unique couvre souvent la
--    décennale ET la responsabilité civile professionnelle. L'unicité devient (artisan, type, empreinte) : le même fichier
--    vaut pour deux attestations, jamais deux fois pour la même (le remplacement du même type le retire d'abord, comme
--    avant). Aucune pièce n'est modifiée : l'ancien index était plus strict, toutes les lignes respectent le nouveau.
--
-- 2. DOC-10 — LA PHOTO D'INCIDENT DÉJÀ CONNUE. `joindre_photo_incident` refusait une photo dont les octets figuraient déjà
--    dans les documents de l'espace (index `documents_empreinte_unique`) : le second incident naissait sans sa photo
--    (« est déjà dans la GED »), sans moyen de la rattacher. Désormais, si ce document existe, n'est pas purgé et est
--    lui-même une photo d'incident, il est RATTACHÉ au nouvel incident (lien `incident` et événement « photo » de la
--    chronologie) au lieu d'être refusé. Le locataire ne rattache que les photos qu'il a lui-même déposées : aucune pièce
--    d'un tiers ni aucun autre type de document (pièce personnelle, bail…) n'est réutilisé — ceux-là restent refusés.
--    Le plafond de dix photos par incident vaut aussi pour un rattachement ; une photo déjà rattachée à CE dossier n'est
--    pas liée deux fois. Sans fichier transmis (`p_storage_path` nul : l'écran du gérant a reconnu le doublon avant tout
--    envoi), seul le rattachement est possible. Reprise de la dernière définition (20260821135221_s7_incidents_garde_fous).
--
-- 3. DOC-12 — TITRE DE LA PHOTO DE CHANTIER. `deposer_photo_intervention` écrivait la valeur brute de l'énumération :
--    « Chantier (apres) — INC-2026-0001 » dans Documents, la fiche incident et le texte de remplacement des images. Le
--    titre devient « Photo de chantier après travaux — INC-2026-0001 » (« avant travaux », « en cours de travaux »).
--    Reprise de la dernière définition (20260911180000_module8_artisans_socle), seul le titre change.
--    DONNÉES RÉÉCRITES (signalé) : les titres déjà écrits selon l'ancien modèle exact
--    « Chantier (avant|pendant|apres) — <numéro> » des documents de type photo_incident sont renommés selon le nouveau ;
--    rien d'autre n'est touché (le retour arrière les remet à l'identique).
--
-- Rejouable : `drop index if exists`, `create unique index if not exists`, `create or replace`, mise à jour ciblée.
-- Retour arrière : supabase/retours-arriere/20261028100600_attestations_et_photos_en_double.retour.sql

-- ── 1. Attestations : unicité par type ───────────────────────────────────
create unique index if not exists artisan_pieces_type_empreinte_unique
  on public.artisan_pieces (artisan_id, type, empreinte)
  where retiree_le is null;
drop index if exists public.artisan_pieces_empreinte_unique;

-- ── 2. Photo d'incident déjà connue : rattachée, plus refusée ────────────
create or replace function public.joindre_photo_incident(
  p_org uuid, p_incident uuid, p_storage_path text,
  p_mime text, p_taille bigint, p_empreinte text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_gerant boolean;
  v_declarant boolean;
  v_doc uuid;
  v_nb bigint;
  v_existant uuid;
  v_existant_type public.document_type;
  v_existant_auteur uuid;
begin
  select i.*, p.account_id as declarant_account into v
  from public.incidents i
  left join public.persons p on p.id = i.declarant_person_id
  where i.id = p_incident and i.organization_id = p_org;
  if not found then raise exception 'Incident introuvable'; end if;

  v_gerant := p_org in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]));
  v_declarant := v.declarant_account = (select auth.uid())
    and p_org in (select public.org_ids_avec_roles(array['locataire']::public.membership_role[]));
  if not (v_gerant or v_declarant) then
    raise exception 'Accès refusé';
  end if;
  if v.etat = 'clos' then
    raise exception 'Cet incident est clos — rouvrez-le si le problème persiste';
  end if;
  if p_mime not in ('image/jpeg', 'image/png') then
    raise exception 'Une photo d''incident est une image (JPEG ou PNG)';
  end if;
  if p_storage_path is not null and p_storage_path not like p_org::text || '/%' then
    raise exception 'Chemin de stockage invalide';
  end if;

  -- Audit final (DOC-10) : une photo déjà connue de l'espace se rattache au dossier.
  select d.id, d.type, d.deposited_by into v_existant, v_existant_type, v_existant_auteur
  from public.documents d
  where d.organization_id = p_org and d.empreinte = p_empreinte and d.purged_at is null;
  if found then
    if v_existant_type <> 'photo_incident' or not (v_gerant or v_existant_auteur = (select auth.uid())) then
      raise exception 'Cette photo a déjà été déposée';
    end if;
    if exists (select 1 from public.document_liens dl
               where dl.document_id = v_existant and dl.entite = 'incident' and dl.entite_id = p_incident) then
      return v_existant;
    end if;
  elsif p_storage_path is null then
    raise exception 'Photo introuvable : renvoyez-la';
  end if;

  -- Plafond par incident (revue n°1) : la limite TS ne portait que sur une
  -- requête — répétée, elle laissait gonfler la GED sans borne.
  select count(*) into v_nb
  from public.document_liens dl
  join public.documents d on d.id = dl.document_id and d.purged_at is null
  where dl.organization_id = p_org and dl.entite = 'incident' and dl.entite_id = p_incident;
  if v_nb >= 10 then
    raise exception 'Dix photos au maximum par incident — faites le tri avant d''en ajouter';
  end if;

  if v_existant is not null then
    insert into public.document_liens (document_id, organization_id, entite, entite_id)
    values (v_existant, p_org, 'incident', p_incident);
    insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
    values (p_org, p_incident, 'photo', (select auth.uid()),
            jsonb_build_object('document_id', v_existant, 'deja_connue', true));
    return v_existant;
  end if;

  begin
    insert into public.documents
      (organization_id, type, titre, storage_path, mime_type, taille_octets,
       empreinte, deposited_by)
    values
      (p_org, 'photo_incident', 'Photo — ' || v.numero, p_storage_path, p_mime,
       p_taille, p_empreinte, (select auth.uid()))
    returning id into v_doc;
  exception when unique_violation then
    raise exception 'Cette photo a déjà été déposée';
  end;

  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, p_org, 'organisation', p_org),
         (v_doc, p_org, 'incident', p_incident);

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'photo', (select auth.uid()),
          jsonb_build_object('document_id', v_doc));

  return v_doc;
end;
$$;
revoke execute on function public.joindre_photo_incident(uuid, uuid, text, text, bigint, text) from public, anon;

-- ── 3. Photo de chantier : un titre en français ──────────────────────────
create or replace function public.deposer_photo_intervention(
  p_intervention uuid, p_moment public.intervention_photo_moment,
  p_storage_path text, p_mime text, p_taille bigint, p_empreinte text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v record; v_doc uuid; v_nb integer; v_numero text;
begin
  select i.* into v from public.incident_interventions i
  where i.id = p_intervention and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null;
  if not found then raise exception 'Accès refusé'; end if;
  if v.statut not in ('acceptee', 'planifiee', 'en_cours') then
    raise exception 'Cette mission n''accepte plus de photo (état : %)', v.statut;
  end if;
  if p_mime not in ('image/jpeg', 'image/png') then
    raise exception 'Une photo de chantier est une image (JPEG ou PNG)';
  end if;
  if p_storage_path not like v.organization_id::text || '/%' then
    raise exception 'Chemin de stockage invalide';
  end if;
  select count(*) into v_nb from public.intervention_photos
  where intervention_id = p_intervention;
  if v_nb >= 10 then
    raise exception 'Dix photos au maximum par intervention';
  end if;

  select numero into v_numero from public.incidents where id = v.incident_id;
  begin
    insert into public.documents
      (organization_id, type, titre, storage_path, mime_type, taille_octets,
       empreinte, deposited_by)
    values (v.organization_id, 'photo_incident',
            'Photo de chantier ' || case p_moment
              when 'avant' then 'avant travaux'
              when 'pendant' then 'en cours de travaux'
              else 'après travaux' end || ' — ' || v_numero,
            p_storage_path, p_mime, p_taille, p_empreinte, (select auth.uid()))
    returning id into v_doc;
  exception when unique_violation then
    raise exception 'Cette photo a déjà été déposée';
  end;

  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, v.organization_id, 'organisation', v.organization_id),
         (v_doc, v.organization_id, 'incident', v.incident_id);
  insert into public.intervention_photos
    (organization_id, intervention_id, document_id, moment, created_by)
  values (v.organization_id, p_intervention, v_doc, p_moment, (select auth.uid()));

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'photo', (select auth.uid()),
          jsonb_build_object('document_id', v_doc, 'moment', p_moment,
                             'intervention_id', p_intervention));
  return v_doc;
end;
$$;
revoke execute on function public.deposer_photo_intervention(uuid, public.intervention_photo_moment, text, text, bigint, text) from public, anon;

-- Les titres déjà écrits selon l'ancien modèle exact (signalé en tête) : renommés, rien d'autre.
update public.documents
set titre = 'Photo de chantier ' || case substring(titre from '^Chantier \((avant|pendant|apres)\) — ')
              when 'avant' then 'avant travaux'
              when 'pendant' then 'en cours de travaux'
              else 'après travaux' end
            || ' — ' || substring(titre from '^Chantier \((?:avant|pendant|apres)\) — (.*)$')
where type = 'photo_incident'
  and titre ~ '^Chantier \((avant|pendant|apres)\) — .+$';

select public.fermer_fonctions_a_anon();
