-- Sprint 7 (incrément 1) — Incidents : fondation.
-- Source : wiki/concepts/Incident, wiki/processus/Cycle de vie d'un incident
-- (module 7, registre A5). Périmètre : la GESTION de l'incident — déclaration
-- (locataire ou agence), qualification/imputation, clôture, réouverture,
-- contestation. Les états artisans (affecté → en cours → terminé) sont dans la
-- machine mais aucune fonction ne les sert encore : ils arrivent avec les
-- devis/interventions (incréments suivants du S7).
--
-- Toutes les écritures passent par des fonctions SECURITY DEFINER : la table
-- n'a AUCUNE policy insert/update — une transition non listée est interdite
-- par construction (RM-A5.1), pas par convention.

-- Machine à états du registre A5 (7 états) — le code parle V3, pas l'ancien
-- vocabulaire nouveau/cloture_normale (divergence documentée au wiki).
create type public.incident_etat as enum
  ('declare', 'qualifie', 'affecte', 'en_cours', 'termine', 'clos', 'rouvert');
-- Trois imputations du module 7 (RM-7.2) : locative (décret 87-712), charge
-- propriétaire (vétusté, gros œuvre…), dégradation fautive. Les parties
-- communes ne s'imputent pas : elles se clôturent « transmis au syndic »
-- (RM-7.1.4).
create type public.incident_imputation as enum
  ('locataire', 'proprietaire', 'degradation_fautive');
create type public.incident_urgence as enum ('normale', 'urgente');
create type public.incident_canal as enum ('espace_locataire', 'agence');
create type public.incident_cloture as enum ('resolu', 'sans_suite', 'transmis_syndic');

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  numero text not null,
  lot_id uuid not null,
  bail_id uuid,
  declarant_person_id uuid,
  canal public.incident_canal not null,
  categorie text not null,
  piece text,
  description text not null,
  anciennete text,
  urgence public.incident_urgence not null default 'normale',
  etat public.incident_etat not null default 'declare',
  imputation public.incident_imputation,
  imputation_justification text,
  imputation_contestee_le timestamptz,
  imputation_contestation text,
  responsable_account_id uuid references public.accounts (id),
  cloture_motif public.incident_cloture,
  cloture_commentaire text,
  clos_le timestamptz,
  clos_par uuid references public.accounts (id),
  created_by uuid references public.accounts (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint incidents_id_org_unique unique (id, organization_id),
  constraint incidents_numero_org_unique unique (organization_id, numero),
  constraint incidents_lot_meme_org_fk
    foreign key (lot_id, organization_id) references public.lots (id, organization_id),
  constraint incidents_bail_meme_org_fk
    foreign key (bail_id, organization_id) references public.baux (id, organization_id),
  constraint incidents_declarant_meme_org_fk
    foreign key (declarant_person_id, organization_id) references public.persons (id, organization_id),
  constraint incidents_categorie_non_vide check (length(trim(categorie)) > 0),
  constraint incidents_description_non_vide check (length(trim(description)) > 0),
  -- Un incident qualifié (ou plus avancé) porte forcément son imputation et sa
  -- justification opposable (RM-7.2.3) ; l'affectation sans imputation est
  -- donc impossible par construction (RM-7.2.7).
  constraint incidents_qualifie_impute check (
    etat in ('declare', 'rouvert')
    or (imputation is not null and length(trim(coalesce(imputation_justification, ''))) > 0)
    or (etat = 'clos' and imputation is null and cloture_motif in ('sans_suite', 'transmis_syndic'))
  ),
  -- Clos ⇔ motivé et daté ; une réouverture efface les champs de clôture
  -- (l'historique reste dans incident_evenements, append-only).
  constraint incidents_clos_motive check (
    (etat = 'clos') = (clos_le is not null and cloture_motif is not null)
  )
);

-- Historique append-only (module 7 : « réouverture avec historique »)
create table public.incident_evenements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  incident_id uuid not null,
  type text not null check (type in
    ('declaration', 'qualification', 'contestation', 'cloture', 'reouverture', 'attribution', 'photo')),
  acteur_account_id uuid references public.accounts (id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint incident_evenements_incident_meme_org_fk
    foreign key (incident_id, organization_id) references public.incidents (id, organization_id)
);

create index incidents_org_idx on public.incidents (organization_id);
create index incidents_lot_idx on public.incidents (lot_id);
create index incidents_etat_idx on public.incidents (organization_id, etat);
create index incident_evenements_incident_idx on public.incident_evenements (incident_id);

create trigger incidents_updated_at before update on public.incidents
  for each row execute function public.set_updated_at();

-- ============================================================
-- Fonctions internes (non exposées)
-- ============================================================

-- Numéro par agence : INC-AAAA-0001. Verrou consultatif transactionnel : deux
-- déclarations simultanées ne se disputent pas le même numéro.
create function public.incident_prochain_numero(p_org uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_annee text := to_char(now() at time zone 'Europe/Paris', 'YYYY');
  v_rang integer;
begin
  perform pg_advisory_xact_lock(hashtext('incident-numero-' || p_org::text));
  select count(*) + 1 into v_rang
  from public.incidents
  where organization_id = p_org and numero like 'INC-' || v_annee || '-%';
  return 'INC-' || v_annee || '-' || lpad(v_rang::text, 4, '0');
end;
$$;
revoke execute on function public.incident_prochain_numero(uuid) from public, anon, authenticated;

-- Création commune (déclaration locataire et saisie agence) : incident +
-- événement + alerte « à qualifier » (fiche type envoyée au gestionnaire —
-- intention produit v0), doublon signalé sans bloquer (module 7).
create function public.incident_creer(
  p_org uuid, p_lot uuid, p_bail uuid, p_declarant uuid,
  p_canal public.incident_canal, p_categorie text, p_description text,
  p_piece text, p_anciennete text, p_urgence public.incident_urgence,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident uuid;
  v_numero text;
  v_doublon boolean;
begin
  if length(trim(coalesce(p_categorie, ''))) = 0 then
    raise exception 'Choisissez la catégorie du problème';
  end if;
  if length(trim(coalesce(p_description, ''))) = 0 then
    raise exception 'Décrivez le problème en une phrase au moins';
  end if;

  -- Doublon possible : même lot, même catégorie, encore ouvert — alerté, pas
  -- bloqué (module 7 : « doublon alerté »)
  v_doublon := exists (
    select 1 from public.incidents i
    where i.organization_id = p_org and i.lot_id = p_lot
      and i.categorie = p_categorie and i.etat <> 'clos'
  );

  v_numero := public.incident_prochain_numero(p_org);
  insert into public.incidents
    (organization_id, numero, lot_id, bail_id, declarant_person_id, canal,
     categorie, piece, description, anciennete, urgence, created_by)
  values
    (p_org, v_numero, p_lot, p_bail, p_declarant, p_canal,
     trim(p_categorie), nullif(trim(coalesce(p_piece, '')), ''),
     trim(p_description), nullif(trim(coalesce(p_anciennete, '')), ''),
     p_urgence, p_created_by)
  returning id into v_incident;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v_incident, 'declaration', p_created_by,
          jsonb_build_object('canal', p_canal, 'urgence', p_urgence, 'doublon_possible', v_doublon));

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (p_org, 'incident_a_qualifier',
          case when p_urgence = 'urgente' then 'critique' else 'normale' end,
          case when p_urgence = 'urgente'
               then 'Incident urgent à qualifier — ' || v_numero
               else 'Incident à qualifier — ' || v_numero end,
          jsonb_build_object('incident_id', v_incident, 'lot_id', p_lot,
                             'libelle', case when v_doublon
                               then 'Doublon possible : un incident du même type est déjà ouvert sur ce lot'
                               end));
  return v_incident;
end;
$$;
revoke execute on function public.incident_creer(uuid, uuid, uuid, uuid, public.incident_canal, text, text, text, text, public.incident_urgence, uuid)
  from public, anon, authenticated;

-- ============================================================
-- Déclaration
-- ============================================================

-- Le locataire déclare depuis son espace : réservé à un locataire à bail
-- actif (RM-7.1) — principal ou colocataire, préavis compris (il occupe
-- encore les lieux).
create function public.declarer_mon_incident(
  p_org uuid, p_categorie text, p_description text,
  p_piece text, p_anciennete text, p_urgence public.incident_urgence
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid;
  v_bail record;
begin
  if not (p_org in (select public.org_ids_avec_roles(array['locataire']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select id into v_person from public.persons
  where organization_id = p_org and account_id = (select auth.uid())
  limit 1;
  if v_person is null then
    raise exception 'Aucune fiche rattachée à votre compte dans cette agence';
  end if;

  select b.id, b.lot_id into v_bail
  from public.baux b
  where b.organization_id = p_org and b.etat in ('actif', 'preavis')
    and (b.locataire_principal = v_person
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = v_person
                      and bp.role = 'colocataire'))
  order by b.created_at desc
  limit 1;
  if v_bail.id is null then
    raise exception 'La déclaration d''incident est réservée aux locataires à bail actif (RM-7.1)';
  end if;

  return public.incident_creer(p_org, v_bail.lot_id, v_bail.id, v_person,
    'espace_locataire', p_categorie, p_description, p_piece, p_anciennete, p_urgence,
    (select auth.uid()));
end;
$$;
revoke execute on function public.declarer_mon_incident(uuid, text, text, text, text, public.incident_urgence)
  from public, anon;

-- L'agence saisit pour le locataire (appel téléphonique — RM-7.1) : le
-- déclarant est déduit du bail actif du lot quand il existe.
create function public.ouvrir_incident_agence(
  p_org uuid, p_lot uuid, p_categorie text, p_description text,
  p_piece text, p_anciennete text, p_urgence public.incident_urgence
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot record;
  v_bail record;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select id, etat into v_lot from public.lots
  where id = p_lot and organization_id = p_org;
  if v_lot.id is null then
    raise exception 'Lot introuvable dans cette agence';
  end if;
  if v_lot.etat = 'archive' then
    raise exception 'Ce lot est archivé — aucun incident ne peut y être ouvert';
  end if;

  select b.id, b.locataire_principal into v_bail
  from public.baux b
  where b.organization_id = p_org and b.lot_id = p_lot and b.etat in ('actif', 'preavis')
  order by b.created_at desc
  limit 1;

  return public.incident_creer(p_org, p_lot, v_bail.id, v_bail.locataire_principal,
    'agence', p_categorie, p_description, p_piece, p_anciennete, p_urgence,
    (select auth.uid()));
end;
$$;
revoke execute on function public.ouvrir_incident_agence(uuid, uuid, text, text, text, text, public.incident_urgence)
  from public, anon;

-- ============================================================
-- Qualification / imputation (RM-7.2 — le parcours critique)
-- ============================================================

-- Décidée par l'agent, sans proposition automatique (RM-7.2.1) ; la
-- justification est obligatoire car opposable (RM-7.2.3). Le locataire est
-- informé immédiatement : l'imputation apparaît dans son espace dès la
-- transaction (RM-7.2.4).
create function public.qualifier_incident(
  p_org uuid, p_incident uuid,
  p_imputation public.incident_imputation, p_justification text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into v from public.incidents
  where id = p_incident and organization_id = p_org for update;
  if not found then raise exception 'Incident introuvable'; end if;
  if v.etat not in ('declare', 'rouvert') then
    raise exception 'Seul un incident déclaré ou rouvert se qualifie (état actuel : %) (RM-A5.1)', v.etat;
  end if;
  if length(trim(coalesce(p_justification, ''))) = 0 then
    raise exception 'La justification de l''imputation est obligatoire — elle est opposable (RM-7.2.3)';
  end if;

  update public.incidents
  set etat = 'qualifie', imputation = p_imputation,
      imputation_justification = trim(p_justification),
      -- Une requalification remet la contestation à zéro : elle portait sur
      -- l'imputation précédente.
      imputation_contestee_le = null, imputation_contestation = null
  where id = p_incident;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'qualification', (select auth.uid()),
          jsonb_build_object('imputation', p_imputation, 'justification', trim(p_justification),
                             'imputation_precedente', v.imputation));

  -- La qualification solde l'alerte « à qualifier » (une transition, plusieurs
  -- effets — RM-A5.3, même transaction)
  update public.alerts
  set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
      closed_action = 'Incident ' || v.numero || ' qualifié'
  where organization_id = p_org and statut = 'ouverte'
    and type = 'incident_a_qualifier' and details->>'incident_id' = p_incident::text;
end;
$$;
revoke execute on function public.qualifier_incident(uuid, uuid, public.incident_imputation, text)
  from public, anon;

-- Le locataire conteste l'imputation : tracée, jamais bloquante (RM-7.2.5)
create function public.contester_imputation(p_org uuid, p_incident uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  select i.* into v from public.incidents i
  join public.persons p on p.id = i.declarant_person_id
  where i.id = p_incident and i.organization_id = p_org
    and p.account_id = (select auth.uid())
  for update of i;
  if not found then raise exception 'Incident introuvable'; end if;
  if v.imputation is null then
    raise exception 'Cet incident n''est pas encore qualifié — il n''y a rien à contester';
  end if;
  if v.imputation_contestee_le is not null then
    raise exception 'Votre contestation a déjà été transmise';
  end if;
  if length(trim(coalesce(p_message, ''))) = 0 then
    raise exception 'Expliquez pourquoi vous contestez cette imputation';
  end if;

  update public.incidents
  set imputation_contestee_le = now(), imputation_contestation = trim(p_message)
  where id = p_incident;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'contestation', (select auth.uid()),
          jsonb_build_object('imputation', v.imputation, 'message', trim(p_message)));

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (p_org, 'incident_conteste', 'normale',
          'Imputation contestée par le locataire — ' || v.numero,
          jsonb_build_object('incident_id', p_incident, 'lot_id', v.lot_id,
                             'libelle', left(trim(p_message), 140)));
end;
$$;
revoke execute on function public.contester_imputation(uuid, uuid, text) from public, anon;

-- ============================================================
-- Clôture / réouverture
-- ============================================================

-- Clôture par l'agent : depuis « déclaré » (classement, syndic — RM-7.1.4),
-- « qualifié » (résolu sans artisan — RM-7.6.1) ou « terminé » (validation du
-- compte rendu). Jamais depuis « en cours » : le compte rendu est obligatoire
-- (RM-7.5.1). Ferme toutes les alertes de l'incident (RM-7.6.2).
create function public.cloturer_incident(
  p_org uuid, p_incident uuid,
  p_motif public.incident_cloture, p_commentaire text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into v from public.incidents
  where id = p_incident and organization_id = p_org for update;
  if not found then raise exception 'Incident introuvable'; end if;
  if v.etat = 'en_cours' then
    raise exception 'Une intervention en cours ne se clôture pas sans compte rendu (RM-7.5.1)';
  end if;
  if v.etat not in ('declare', 'qualifie', 'termine') then
    raise exception 'Cet incident ne peut pas être clôturé depuis l''état « % » (RM-A5.1)', v.etat;
  end if;
  -- Un incident qualifié a été jugé : il se clôture « résolu », pas « classé » ;
  -- et inversement, « résolu » suppose une imputation déjà tranchée (RM-7.2.7).
  if v.etat = 'qualifie' and p_motif = 'sans_suite' then
    raise exception 'Un incident qualifié se clôture « résolu » — le classement sans suite vaut pour un incident non qualifié';
  end if;
  if v.etat = 'declare' and p_motif = 'resolu' then
    raise exception 'Qualifiez l''incident avant de le clôturer « résolu » — ou classez-le sans suite';
  end if;

  update public.incidents
  set etat = 'clos', cloture_motif = p_motif,
      cloture_commentaire = nullif(trim(coalesce(p_commentaire, '')), ''),
      clos_le = now(), clos_par = (select auth.uid())
  where id = p_incident;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'cloture', (select auth.uid()),
          jsonb_build_object('motif', p_motif,
                             'commentaire', nullif(trim(coalesce(p_commentaire, '')), '')));

  update public.alerts
  set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
      closed_action = 'Incident ' || v.numero || ' clos'
  where organization_id = p_org and statut = 'ouverte'
    and details->>'incident_id' = p_incident::text;
end;
$$;
revoke execute on function public.cloturer_incident(uuid, uuid, public.incident_cloture, text)
  from public, anon;

-- Le désordre réapparaît : réouverture par le gérant OU par le locataire
-- déclarant. Repasse par la qualification (clos → rouvert → qualifié, jamais
-- clos → déclaré — registre A5). L'historique de clôture reste dans les
-- événements.
create function public.rouvrir_incident(p_org uuid, p_incident uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_gerant boolean;
  v_declarant boolean;
begin
  select i.*, p.account_id as declarant_account into v
  from public.incidents i
  left join public.persons p on p.id = i.declarant_person_id
  where i.id = p_incident and i.organization_id = p_org
  for update of i;
  if not found then raise exception 'Incident introuvable'; end if;

  v_gerant := p_org in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]));
  v_declarant := v.declarant_account = (select auth.uid())
    and p_org in (select public.org_ids_avec_roles(array['locataire']::public.membership_role[]));
  if not (v_gerant or v_declarant) then
    raise exception 'Accès refusé';
  end if;
  if v.etat <> 'clos' then
    raise exception 'Seul un incident clos peut être rouvert';
  end if;
  if length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Dites pourquoi vous rouvrez — le désordre réapparu, par exemple';
  end if;

  update public.incidents
  set etat = 'rouvert', cloture_motif = null, cloture_commentaire = null,
      clos_le = null, clos_par = null
  where id = p_incident;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'reouverture', (select auth.uid()),
          jsonb_build_object('motif', trim(p_motif), 'cloture_precedente',
            jsonb_build_object('motif', v.cloture_motif, 'clos_le', v.clos_le)));

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (p_org, 'incident_a_qualifier',
          case when v.urgence = 'urgente' then 'critique' else 'normale' end,
          'Incident rouvert, à requalifier — ' || v.numero,
          jsonb_build_object('incident_id', p_incident, 'lot_id', v.lot_id,
                             'libelle', left(trim(p_motif), 140)));
end;
$$;
revoke execute on function public.rouvrir_incident(uuid, uuid, text) from public, anon;

-- ============================================================
-- Attribution (maquette : responsable du dossier)
-- ============================================================

-- Le responsable d'agence attribue à n'importe quel gérant (ou remet au pot
-- commun) ; un agent ne peut que se saisir d'un dossier libre ou du sien.
create function public.attribuer_incident(p_org uuid, p_incident uuid, p_responsable uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_responsable_org boolean;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into v from public.incidents
  where id = p_incident and organization_id = p_org for update;
  if not found then raise exception 'Incident introuvable'; end if;
  if v.etat = 'clos' then
    raise exception 'Un incident clos ne s''attribue plus';
  end if;

  v_responsable_org := p_org in (select public.org_ids_avec_roles(
    array['admin_agence','proprietaire_direct']::public.membership_role[]));
  if not v_responsable_org then
    -- Agent : se saisir d'un dossier libre, ou rendre le sien
    if not ((p_responsable = (select auth.uid()) and v.responsable_account_id is null)
            or (p_responsable is null and v.responsable_account_id = (select auth.uid()))) then
      raise exception 'Ce dossier est suivi par quelqu''un d''autre — seul le responsable de l''agence peut le réattribuer';
    end if;
  end if;
  if p_responsable is not null and not exists (
    select 1 from public.memberships m
    where m.account_id = p_responsable and m.organization_id = p_org
      and m.status = 'active'
      and m.role in ('admin_agence', 'agent', 'proprietaire_direct')
  ) then
    raise exception 'Le responsable choisi n''est pas un gestionnaire actif de l''agence';
  end if;

  update public.incidents set responsable_account_id = p_responsable where id = p_incident;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'attribution', (select auth.uid()),
          jsonb_build_object('responsable', p_responsable));
end;
$$;
revoke execute on function public.attribuer_incident(uuid, uuid, uuid) from public, anon;

-- ============================================================
-- Photos (GED — type photo_incident, lien entite 'incident')
-- ============================================================

-- Le fichier est déposé au stockage par le client (policies existantes :
-- gérants et locataires écrivent dans le dossier de leur agence), puis cette
-- fonction crée la fiche document + les liens. Gérant, ou locataire déclarant.
create function public.joindre_photo_incident(
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
  -- Le chemin doit rester dans le dossier de l'agence (isolation Storage)
  if p_storage_path not like p_org::text || '/%' then
    raise exception 'Chemin de stockage invalide';
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
revoke execute on function public.joindre_photo_incident(uuid, uuid, text, text, bigint, text)
  from public, anon;

-- ============================================================
-- Lecture locataire (jamais de policy large — fonction dédiée)
-- ============================================================

-- Ses incidents : ceux qu'il a déclarés, plus ceux du lot de son bail actif
-- (colocataires tous informés — module 7).
create function public.mes_incidents_locataire(p_org uuid)
returns table (
  id uuid, numero text, categorie text, piece text, description text,
  anciennete text, urgence public.incident_urgence, etat public.incident_etat,
  imputation public.incident_imputation, imputation_justification text,
  imputation_contestee_le timestamptz, cloture_motif public.incident_cloture,
  clos_le timestamptz, declare_le timestamptz, lot_nom text, nb_photos bigint
)
language sql
security definer
set search_path = ''
stable
as $$
  with mes_fiches as (
    select p.id from public.persons p
    where p.organization_id = p_org and p.account_id = (select auth.uid())
  )
  select i.id, i.numero, i.categorie, i.piece, i.description, i.anciennete,
         i.urgence, i.etat, i.imputation, i.imputation_justification,
         i.imputation_contestee_le, i.cloture_motif, i.clos_le, i.created_at,
         l.nom,
         (select count(*) from public.document_liens dl
            join public.documents d on d.id = dl.document_id and d.purged_at is null
          where dl.entite = 'incident' and dl.entite_id = i.id)
  from public.incidents i
  join public.lots l on l.id = i.lot_id
  where i.organization_id = p_org
    and p_org in (select public.org_ids_avec_roles(array['locataire']::public.membership_role[]))
    and (i.declarant_person_id in (select id from mes_fiches)
         or i.lot_id in (
           select b.lot_id from public.baux b
           where b.organization_id = p_org and b.etat in ('actif', 'preavis')
             and (b.locataire_principal in (select id from mes_fiches)
                  or exists (select 1 from public.bail_personnes bp
                             where bp.bail_id = b.id and bp.role = 'colocataire'
                               and bp.person_id in (select id from mes_fiches)))))
  order by (i.etat = 'clos'), i.created_at desc;
$$;
revoke execute on function public.mes_incidents_locataire(uuid) from public, anon;

-- ============================================================
-- RLS — lecture gérants ; AUCUNE policy d'écriture : tout passe par les
-- fonctions ci-dessus (les transitions non listées sont interdites, RM-A5.1)
-- ============================================================
alter table public.incidents enable row level security;
alter table public.incident_evenements enable row level security;

create policy incidents_select on public.incidents
  for select to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy incident_evenements_select on public.incident_evenements
  for select to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );

-- Archivage plutôt que suppression ; l'historique est append-only
revoke insert, update, delete on public.incidents from authenticated;
revoke insert, update, delete on public.incident_evenements from authenticated;
revoke all on public.incidents, public.incident_evenements from anon;
