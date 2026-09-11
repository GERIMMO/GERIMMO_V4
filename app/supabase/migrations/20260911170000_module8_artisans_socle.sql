-- Module 8 — SOCLE ARTISANS : fiche, pièces, sollicitations, devis,
-- interventions, créneaux, comptes rendus, évaluations.
--
-- Constat du 2026-09-11 (vérifié en base locale, 65 tables publiques) : le
-- module incident vit côté agence (incidents, incident_evenements, 7 états du
-- registre A5), mais l'artisan n'existe nulle part. Le rôle `artisan` figure
-- dans membership_role et porte un libellé dans src/app/espaces/page.tsx ; il
-- ne mène à rien. Aucune table devis / intervention / créneau / évaluation.
-- `artisan_candidatures` a été créée le 03/09 puis fermée le 10/09 (RLS sans
-- politique, aucun privilège) : l'application ne l'a jamais lue.
-- Cette migration ajoute l'artisan au cycle existant — elle n'en réécrit rien.
--
-- ══════════════════════════════════════════════════════════════════════════
-- LE POINT DÉLICAT : L'ARTISAN EST INTER-AGENCES. POURQUOI CE MODÈLE EST SÛR.
-- ══════════════════════════════════════════════════════════════════════════
-- Tous les autres rôles du produit vivent DANS une organisation : leur RLS
-- dit `organization_id in (select org_ids_avec_roles(...))` et ils ne voient
-- rien au-delà. L'artisan est l'exception du modèle (RM-A1.8, « le cas le plus
-- complexe du modèle d'identité ») : il travaille pour plusieurs agences et son
-- agenda les mélange (RM-19.3.3 / RM-10.7.3 — « agenda toutes agences
-- confondues, avec le logo de l'agence sur chaque intervention »). Il ne doit
-- pour autant voir QUE ce qui lui est partagé : la mission qu'on lui a confiée,
-- pas le bail, pas le parc, pas le locataire au-delà du nécessaire.
--
-- Le modèle tient en cinq règles, et c'est leur CONJONCTION qui le rend sûr :
--
--  1. AUCUNE POLITIQUE RLS DE CE PRODUIT NE NOMME LE RÔLE `artisan`.
--     Ni celles d'ici, ni celles d'avant. Conséquence : une session d'artisan
--     qui interroge `incidents`, `lots`, `baux`, `persons`, `documents` ou
--     n'importe laquelle des tables opérationnelles créées ci-dessous via
--     PostgREST reçoit ZÉRO LIGNE — pas une ligne filtrée, zéro. Il n'y a pas
--     de porte à mal fermer : il n'y a pas de porte.
--
--  2. SA SEULE PORTE, CE SONT LES RPC `SECURITY DEFINER` DE CE FICHIER.
--     Une fonction qui contourne la RLS est un risque ; ce qui la rend sûre
--     ici, c'est qu'elle ne prend JAMAIS son identité d'artisan en paramètre.
--     `mon_artisan_id()` la déduit de `auth.uid()`. Aucun paramètre forgeable
--     ne désigne « de quel artisan » on parle : l'appelant ne peut pas
--     demander l'agenda d'un autre, il n'existe pas d'argument pour le dire.
--
--  3. LE DROIT DE LIRE UNE MISSION EST LA LIGNE DE MISSION ELLE-MÊME.
--     `incident_sollicitations.artisan_id` et `incident_interventions.artisan_id`
--     sont posés par l'AGENCE, par une RPC réservée à ses gestionnaires. Confier
--     la mission EST l'acte de partage. Rien d'autre n'ouvre l'accès : ni
--     l'adhésion (elle ne sert qu'à faire apparaître l'agence dans /espaces),
--     ni le métier, ni la zone.
--
--  4. LA PROJECTION EST LE CONTRAT. Les RPC de lecture de l'artisan renvoient
--     une LISTE DE COLONNES FIXE, jamais `select *` ni une table entière :
--     l'adresse du bien et l'étage (il doit s'y rendre), le prénom et le
--     téléphone de l'occupant (il doit sonner), la catégorie et la description
--     du désordre (il doit apporter le bon outil), le nom de l'agence (RM-17.3.2,
--     il identifie son mandant). Jamais le loyer, jamais le bail, jamais le
--     dépôt, jamais le nom des autres locataires, jamais le parc, jamais le
--     montant du devis d'un concurrent, jamais le commentaire d'évaluation
--     (RM-11.2.2 : privé à l'agence).
--
--  5. LE PROFIL GLOBAL EST UNE TABLE SANS `organization_id`, ET C'EST VOULU.
--     RM-A1.6 impose `organization_id` sur toute table de DONNÉES D'AGENCE ;
--     le modèle A1 distingue explicitement trois niveaux, dont les « données
--     partagées » (profil artisan public) et les « données globales ». SIRET,
--     raison sociale, métiers, zone, pièces, note agrégée, blacklist globale et
--     visibilité sont, par RM-A1.8, du PROFIL GLOBAL : leur coller un
--     organization_id dupliquerait l'artisan à chaque agence — exactement ce
--     que RM-8.1.5 interdit (« rattaché, jamais dupliqué »). Ces tables sont
--     donc globales, et leur cloisonnement ne passe pas par l'organisation mais
--     par `artisan_lisible()` : le propriétaire du profil, le super admin, une
--     agence rattachée, ou une agence quelconque si et seulement si l'artisan
--     s'est rendu public (RM-8.4.2 : il décide seul de sa visibilité).
--     Tout ce qui est RELATION D'AGENCE — rattachement, blacklist locale,
--     sollicitations, devis, interventions, créneaux, comptes rendus,
--     évaluations — porte au contraire `organization_id`, sa RLS et son index.
--
-- Ce qui reste hors de portée de l'artisan par construction : il n'a aucun
-- privilège d'écriture sur aucune table (`revoke all ... from anon, authenticated`
-- puis `grant select` aux seuls gestionnaires via RLS), donc même une politique
-- mal écrite ne lui donnerait pas la plume.

-- ══════════════════════════════════════════════════════════════════════════
-- 1. TYPES
-- ══════════════════════════════════════════════════════════════════════════

-- Le devis est une pièce de la GED de l'agence (rétention, purge, empreinte)
-- et non un fichier à part : il lui faut donc son type documentaire.
-- `add value if not exists` est additif et rejouable ; le littéral n'est
-- utilisé qu'à l'intérieur de corps plpgsql (évalués à l'exécution), jamais
-- dans une contrainte — pour rester applicable dans une transaction unique.
alter type public.document_type add value if not exists 'devis';

-- Métiers en liste fermée (RM-8.1.1). LE WIKI NE DONNE PAS LA LISTE : elle est
-- ici DÉDUITE des catégories d'incident déjà présentes en base (contrainte
-- incidents_categorie_connue, constatée le 2026-09-11), plus `autre` qui
-- recueille ce qu'aucune catégorie ne nomme (humidité/infiltration).
-- À confirmer par l'humain — signalé au rapport.
create type public.artisan_metier as enum (
  'plomberie', 'chauffage', 'electricite', 'menuiserie', 'serrurerie',
  'nuisibles', 'autre'
);

-- RM-A1.9 : le SIRET a trois états, et « vérifié » est le seul état affectable
-- (décision du 2026-09-04, qui corrige RM-8.1.1).
create type public.artisan_siret_etat as enum ('verifie', 'non_verifie', 'invalide');

-- La PREMIÈRE des deux approbations : le droit d'exister sur la plateforme,
-- au niveau de la personne, par le super admin seul (jamais par une agence).
-- À ne pas confondre avec la sélection d'un devis, qui est l'autre.
create type public.artisan_statut_plateforme as enum ('en_attente', 'valide', 'refuse');

-- RM-8.4.2 : l'artisan décide seul de sa visibilité, privé par défaut.
-- « privée » = visible des seules agences rattachées (c'est-à-dire « privé à
-- des agences choisies », le rattachement faisant le choix) ; « publique » =
-- proposable à toute agence.
create type public.artisan_visibilite as enum ('privee', 'publique');

create type public.artisan_piece_type as enum (
  'decennale', 'rc_pro', 'urssaf', 'kbis', 'certification'
);

create type public.artisan_decision_plateforme as enum (
  'validation', 'refus', 'remise_en_attente', 'blacklist_globale', 'levee_blacklist'
);

-- RM-8.5.1/8.5.2 : la désactivation est neutre, la blacklist est motivée.
-- Deux gestes distincts, donc deux colonnes distinctes (voir artisan_agences).
create type public.artisan_relation_statut as enum ('actif', 'desactive');

-- RM-8.2.9 (décision révisée) : la décennale est exigée selon la NATURE DES
-- TRAVAUX, pas selon le métier.
create type public.nature_travaux as enum (
  'entretien_courant', 'remplacement_equipement', 'clos_et_couvert',
  'reseaux_encastres', 'gros_oeuvre'
);

create type public.consultation_statut as enum ('ouverte', 'close', 'annulee');

create type public.sollicitation_statut as enum (
  'envoyee', 'declinee', 'devis_depose', 'retenue', 'non_retenue', 'expiree', 'annulee'
);

create type public.devis_statut as enum ('depose', 'retenu', 'non_retenu', 'expire', 'annule');

create type public.intervention_statut as enum (
  'proposee', 'acceptee', 'planifiee', 'en_cours', 'terminee', 'refusee', 'annulee'
);

create type public.creneau_auteur as enum ('artisan', 'locataire', 'agence');
create type public.creneau_statut as enum ('propose', 'retenu', 'refuse', 'caduc');
create type public.intervention_photo_moment as enum ('avant', 'pendant', 'apres');

-- Module 11 : trois sources de note (gérant 50 %, locataire 25 %, plateforme
-- 25 %). La part plateforme est CALCULÉE (5 indicateurs), elle n'est donc pas
-- une ligne d'évaluation : seules les deux sources humaines le sont.
create type public.evaluation_source as enum ('gerant', 'locataire');

-- ══════════════════════════════════════════════════════════════════════════
-- 2. LE PROFIL GLOBAL DE L'ARTISAN (données partagées, RM-A1.8)
--    Pas d'organization_id : voir la règle 5 du préambule.
-- ══════════════════════════════════════════════════════════════════════════

create table public.artisans (
  id uuid primary key default gen_random_uuid(),
  -- Le compte global (accounts) porte l'identité ; `persons` est par agence et
  -- ne convient donc pas à un profil qui circule entre agences. Nullable :
  -- l'agence crée la fiche AVANT d'inviter l'artisan (module 8, parcours 8.1).
  account_id uuid unique references public.accounts(id),
  raison_sociale text not null,
  siret text not null,
  siret_etat public.artisan_siret_etat not null default 'non_verifie',
  email text,
  -- Mobile obligatoire : l'artisan travaille depuis le chantier (module 19).
  telephone text not null,
  visibilite public.artisan_visibilite not null default 'privee',
  statut_plateforme public.artisan_statut_plateforme not null default 'en_attente',
  statut_motif text,
  statut_decide_le timestamptz,
  statut_decide_par uuid references public.accounts(id),
  -- RM-8.5.3 : blacklist globale, super admin seul, faits objectifs, motif
  -- obligatoire. RM-A2 corrige RM-8.5.6 : le motif se conserve 5 ans, pas
  -- indéfiniment — `purge_motif_le` porte cette échéance.
  blacklist_globale_le timestamptz,
  blacklist_globale_motif text,
  blacklist_globale_par uuid references public.accounts(id),
  purge_motif_le date,
  -- L'agence qui a créé la fiche : RM-A1.9 réserve l'usage d'un SIRET non
  -- vérifié à cette seule agence, et interdit sa publication.
  cree_par_organization_id uuid references public.organizations(id),
  -- Purge à 6 mois sans document (décision du 2026-09-04).
  purge_prevue_le date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artisans_raison_sociale_non_vide check (length(trim(raison_sociale)) > 0),
  constraint artisans_telephone_non_vide check (length(trim(telephone)) > 0),
  -- 14 chiffres : la forme du SIRET. La vérification en ligne est hors
  -- périmètre (module 8) ; la base contrôle la forme, pas l'existence.
  constraint artisans_siret_forme check (siret ~ '^[0-9]{14}$'),
  -- Un refus et une blacklist se motivent ; une validation n'a rien à motiver.
  constraint artisans_refus_motive
    check (statut_plateforme <> 'refuse' or length(trim(coalesce(statut_motif, ''))) > 0),
  constraint artisans_blacklist_motivee
    check ((blacklist_globale_le is null)
           = (blacklist_globale_motif is null or length(trim(blacklist_globale_motif)) = 0)),
  -- RM-A1.9 : un SIRET non vérifié ou invalide n'est pas publiable.
  constraint artisans_publication_exige_siret_verifie
    check (visibilite = 'privee' or siret_etat = 'verifie')
);
-- RM-8.1.1 / RM-8.1.5 : le SIRET est la clé d'unicité — un artisan public est
-- RATTACHÉ par la seconde agence, jamais dupliqué. L'unicité est globale,
-- c'est ce qui rend le rattachement possible.
create unique index artisans_siret_unique on public.artisans (siret);
create index artisans_statut_idx on public.artisans (statut_plateforme, visibilite);
create unique index artisans_id_account_unique on public.artisans (id, account_id)
  where account_id is not null;
comment on table public.artisans is
  'Profil GLOBAL de l''artisan (RM-A1.8) : circule entre agences, donc sans organization_id. La relation d''agence est dans artisan_agences.';

create table public.artisan_metiers (
  artisan_id uuid not null references public.artisans(id) on delete cascade,
  metier public.artisan_metier not null,
  created_at timestamptz not null default now(),
  primary key (artisan_id, metier)
);
comment on table public.artisan_metiers is
  'Métiers en liste fermée. RM-8.3 : un artisan n''est proposé que dans SON métier.';

create table public.artisan_zones (
  artisan_id uuid not null references public.artisans(id) on delete cascade,
  code_postal text not null,
  created_at timestamptz not null default now(),
  primary key (artisan_id, code_postal),
  constraint artisan_zones_code_postal_forme check (code_postal ~ '^[0-9]{5}$')
);
comment on table public.artisan_zones is
  'Zone d''intervention par codes postaux (module 8, parcours 8.1), comparée au code postal du bien.';

-- Les pièces sont GLOBALES (RM-8.2.8 : « ses pièces valent pour toutes les
-- agences ») — c'est pourquoi elles ne peuvent PAS vivre dans `documents`, qui
-- est la GED d'une agence et dont RM-A1.10 interdit qu'elle franchisse une
-- frontière d'agence. Elles portent donc leur propre fichier, dans un espace
-- de stockage préfixé `artisans/<id>/`, hors de tout périmètre d'agence.
create table public.artisan_pieces (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.artisans(id) on delete cascade,
  type public.artisan_piece_type not null,
  storage_path text not null,
  mime_type text not null,
  taille_octets bigint not null,
  empreinte text not null,
  emise_le date,
  expire_le date,
  retiree_le timestamptz,
  deposee_par uuid references public.accounts(id),
  created_at timestamptz not null default now(),
  -- La validité EST l'objet de la pièce : une attestation sans date de fin ne
  -- prouve rien dans le temps. Seule la certification peut être sans terme.
  constraint artisan_pieces_validite
    check (type = 'certification' or expire_le is not null),
  constraint artisan_pieces_taille check (taille_octets between 1 and 10485760),
  constraint artisan_pieces_chemin_cloisonne
    check (storage_path like 'artisans/' || artisan_id::text || '/%')
);
create index artisan_pieces_artisan_idx on public.artisan_pieces (artisan_id, type, expire_le desc);
create unique index artisan_pieces_empreinte_unique on public.artisan_pieces (artisan_id, empreinte)
  where retiree_le is null;
comment on table public.artisan_pieces is
  'Pièces justificatives GLOBALES de l''artisan (RM-8.2.8). Hors GED d''agence : RM-A1.10 interdit qu''une pièce d''agence franchisse une frontière d''agence, et celles-ci doivent justement la franchir.';

-- Journal append-only des décisions de PLATEFORME (super admin seul).
-- Séparé des colonnes de `artisans` parce qu'une décision se relit : un artisan
-- refusé puis validé, une blacklist puis sa levée — RM-8.5.5 (réversible par
-- le super admin seul) n'a de sens que si la suite des gestes est conservée.
create table public.artisan_validations (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.artisans(id) on delete cascade,
  decision public.artisan_decision_plateforme not null,
  motif text,
  decide_par uuid references public.accounts(id),
  created_at timestamptz not null default now()
);
create index artisan_validations_artisan_idx on public.artisan_validations (artisan_id, created_at desc);
comment on table public.artisan_validations is
  'Journal des décisions du super admin sur le droit d''exister de l''artisan (validation plateforme, blacklist globale). Append-only.';

-- ══════════════════════════════════════════════════════════════════════════
-- 3. LA RELATION D'AGENCE (RM-A1.8) — org-scopée, RLS, index par organisation
-- ══════════════════════════════════════════════════════════════════════════

-- RM-A1.8 : « un artisan blacklisté par l'agence A reste visible pour l'agence
-- B ». La blacklist LOCALE est donc une donnée de relation, ici ; la blacklist
-- GLOBALE est sur le profil. Les deux ne se confondent pas plus que les deux
-- approbations.
create table public.artisan_agences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  artisan_id uuid not null references public.artisans(id) on delete cascade,
  statut public.artisan_relation_statut not null default 'actif',
  blacklist_le timestamptz,
  blacklist_motif text,
  blacklist_par uuid references public.accounts(id),
  purge_motif_le date,
  created_by uuid references public.accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artisan_agences_unique unique (organization_id, artisan_id),
  constraint artisan_agences_id_org_unique unique (id, organization_id),
  -- RM-8.5.2 : la blacklist est MOTIVÉE, la désactivation ne l'est pas.
  constraint artisan_agences_blacklist_motivee
    check ((blacklist_le is null)
           = (blacklist_motif is null or length(trim(blacklist_motif)) = 0))
);
create index artisan_agences_org_idx on public.artisan_agences (organization_id, statut);
create index artisan_agences_artisan_idx on public.artisan_agences (artisan_id);
comment on table public.artisan_agences is
  'Rattachement d''un artisan à une agence + blacklist LOCALE (RM-8.5.2, n''engage que son agence).';

-- ══════════════════════════════════════════════════════════════════════════
-- 4. LE CYCLE OPÉRATIONNEL — accroché à l'incident existant
-- ══════════════════════════════════════════════════════════════════════════

-- La mise en concurrence (module 9). C'est ELLE qui porte la nature des
-- travaux : la décennale s'exige selon la nature, pas selon le métier
-- (RM-8.2.9), et la nature ne se connaît qu'au moment où l'on décide quoi
-- faire — pas à la déclaration.
create table public.incident_consultations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  incident_id uuid not null,
  metier public.artisan_metier not null,
  nature_travaux public.nature_travaux not null,
  -- Colonne calculée plutôt que booléen saisi : la règle ne doit pas pouvoir
  -- être « décochée » à la saisie (RM-8.3.1, filtre non désactivable).
  decennale_requise boolean not null
    generated always as (nature_travaux <> 'entretien_courant') stored,
  -- Tranché le 2026-07-25 : le devis unique EST autorisé, mais il porte un
  -- drapeau visible disant qu'il n'y a pas eu de mise en concurrence.
  devis_unique_assume boolean not null default false,
  validite_jours integer not null default 30,
  statut public.consultation_statut not null default 'ouverte',
  created_by uuid references public.accounts(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint incident_consultations_id_org_unique unique (id, organization_id),
  constraint incident_consultations_incident_meme_org_fk
    foreign key (incident_id, organization_id)
    references public.incidents(id, organization_id),
  constraint incident_consultations_validite check (validite_jours between 1 and 365)
);
create index incident_consultations_org_idx
  on public.incident_consultations (organization_id, incident_id);
-- Une seule mise en concurrence ouverte à la fois sur un incident : sinon
-- « deux artisans au maximum » (RM-9.1.1) se contourne en ouvrant deux tours.
create unique index incident_consultations_une_ouverte
  on public.incident_consultations (organization_id, incident_id)
  where statut = 'ouverte';

-- L'artisan sollicité. RM-9.1.1 : deux au maximum en parallèle.
create table public.incident_sollicitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  consultation_id uuid not null,
  incident_id uuid not null,
  artisan_id uuid not null references public.artisans(id),
  statut public.sollicitation_statut not null default 'envoyee',
  envoyee_le timestamptz not null default now(),
  repondue_le timestamptz,
  refus_motif text,
  created_by uuid references public.accounts(id),
  constraint incident_sollicitations_id_org_unique unique (id, organization_id),
  constraint incident_sollicitations_unique unique (consultation_id, artisan_id),
  constraint incident_sollicitations_consultation_meme_org_fk
    foreign key (consultation_id, organization_id)
    references public.incident_consultations(id, organization_id),
  constraint incident_sollicitations_incident_meme_org_fk
    foreign key (incident_id, organization_id)
    references public.incidents(id, organization_id)
);
create index incident_sollicitations_org_idx
  on public.incident_sollicitations (organization_id, consultation_id);
-- L'index de la BOÎTE DE RÉCEPTION de l'artisan : toutes agences confondues.
-- Il ne commence pas par organization_id, et c'est exactement le point — il
-- sert la requête inter-agences. L'index par organisation est ci-dessus.
create index incident_sollicitations_artisan_idx
  on public.incident_sollicitations (artisan_id, statut, envoyee_le desc);

create table public.incident_devis (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  sollicitation_id uuid not null,
  incident_id uuid not null,
  artisan_id uuid not null references public.artisans(id),
  montant_ttc_cents bigint not null,
  description text not null,
  valide_jusqu_au date not null,
  -- Le PDF, s'il y en a un, va dans la GED de l'agence (rétention, purge,
  -- empreinte) : c'est une pièce d'agence, elle ne franchit pas de frontière.
  document_id uuid,
  statut public.devis_statut not null default 'depose',
  depose_le timestamptz not null default now(),
  retenu_le timestamptz,
  retenu_par uuid references public.accounts(id),
  constraint incident_devis_id_org_unique unique (id, organization_id),
  constraint incident_devis_sollicitation_unique unique (sollicitation_id),
  constraint incident_devis_sollicitation_meme_org_fk
    foreign key (sollicitation_id, organization_id)
    references public.incident_sollicitations(id, organization_id),
  constraint incident_devis_incident_meme_org_fk
    foreign key (incident_id, organization_id)
    references public.incidents(id, organization_id),
  constraint incident_devis_document_meme_org_fk
    foreign key (document_id, organization_id)
    references public.documents(id, organization_id),
  constraint incident_devis_montant check (montant_ttc_cents > 0),
  constraint incident_devis_description_non_vide check (length(trim(description)) > 0)
);
create index incident_devis_org_idx on public.incident_devis (organization_id, incident_id);
create index incident_devis_artisan_idx on public.incident_devis (artisan_id, depose_le desc);
-- Un seul devis retenu par incident : la sélection désigne L'artisan.
create unique index incident_devis_un_retenu
  on public.incident_devis (organization_id, incident_id)
  where statut = 'retenu';

-- La mission confiée, puis réalisée.
create table public.incident_interventions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  incident_id uuid not null,
  artisan_id uuid not null references public.artisans(id),
  devis_id uuid,
  -- Recopiée de la consultation : c'est elle qui dit si la décennale était
  -- exigée, et RM-8.2.7 veut qu'une intervention EN COURS ne soit jamais
  -- interrompue par une attestation qui expire entre-temps. Figer la nature
  -- au moment de confier la mission, c'est ce qui rend cette règle tenable.
  nature_travaux public.nature_travaux not null,
  statut public.intervention_statut not null default 'proposee',
  confiee_le timestamptz not null default now(),
  acceptee_le timestamptz,
  refusee_le timestamptz,
  refus_motif text,
  debut_prevu timestamptz,
  fin_prevue timestamptz,
  demarree_le timestamptz,
  terminee_le timestamptz,
  annulee_le timestamptz,
  annulation_motif text,
  created_by uuid references public.accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint incident_interventions_id_org_unique unique (id, organization_id),
  constraint incident_interventions_incident_meme_org_fk
    foreign key (incident_id, organization_id)
    references public.incidents(id, organization_id),
  constraint incident_interventions_devis_meme_org_fk
    foreign key (devis_id, organization_id)
    references public.incident_devis(id, organization_id),
  constraint incident_interventions_creneau_coherent
    check (fin_prevue is null or debut_prevu is null or fin_prevue > debut_prevu),
  constraint incident_interventions_refus_motive
    check (statut <> 'refusee' or length(trim(coalesce(refus_motif, ''))) > 0)
);
create index incident_interventions_org_idx
  on public.incident_interventions (organization_id, incident_id);
-- L'AGENDA INTER-AGENCES (RM-19.3.3 / RM-10.7.3) : la requête la plus délicate
-- du lot. Elle balaie par artisan et par date, sans organisation — cet index
-- est le sien. Partiel sur les missions vivantes : un agenda ne montre pas les
-- missions refusées ni annulées.
create index incident_interventions_agenda_artisan_idx
  on public.incident_interventions (artisan_id, debut_prevu)
  where statut in ('proposee', 'acceptee', 'planifiee', 'en_cours', 'terminee');
-- Une seule mission vivante par incident : deux artisans sur le même désordre,
-- c'est une réaffectation ratée.
create unique index incident_interventions_une_vivante
  on public.incident_interventions (organization_id, incident_id)
  where statut in ('proposee', 'acceptee', 'planifiee', 'en_cours');

-- Créneaux proposés et choisi (module 10). Pas de moteur de disponibilités
-- (parti pris du module) : des créneaux à la mission, en tours de trois.
create table public.intervention_creneaux (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  intervention_id uuid not null,
  propose_par public.creneau_auteur not null,
  tour integer not null default 1,
  debut timestamptz not null,
  fin timestamptz not null,
  statut public.creneau_statut not null default 'propose',
  refuse_le timestamptz,
  created_by uuid references public.accounts(id),
  created_at timestamptz not null default now(),
  constraint intervention_creneaux_id_org_unique unique (id, organization_id),
  constraint intervention_creneaux_intervention_meme_org_fk
    foreign key (intervention_id, organization_id)
    references public.incident_interventions(id, organization_id),
  constraint intervention_creneaux_borne check (fin > debut),
  constraint intervention_creneaux_tour check (tour between 1 and 20)
);
create index intervention_creneaux_org_idx
  on public.intervention_creneaux (organization_id, intervention_id, debut);
-- Un seul créneau retenu par intervention : le RDV est unique.
create unique index intervention_creneaux_un_retenu
  on public.intervention_creneaux (organization_id, intervention_id)
  where statut = 'retenu';

-- Le compte rendu (module 7, parcours 7.5 ; module 19 : deux écrans, photo au
-- centre). C'est la pièce qui conditionne la facturation.
create table public.intervention_comptes_rendus (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  intervention_id uuid not null,
  artisan_id uuid not null references public.artisans(id),
  travaux_realises text not null,
  -- RM-7.5.3 : l'artisan est le SEUL à voir la cause réelle. Il la signale ;
  -- il ne requalifie pas (ce n'est pas son rôle) — l'agent révise l'imputation.
  cause_reelle text,
  imputation_suggeree public.incident_imputation,
  montant_final_cents bigint,
  nouvelle_intervention_necessaire boolean not null default false,
  created_at timestamptz not null default now(),
  constraint intervention_comptes_rendus_id_org_unique unique (id, organization_id),
  constraint intervention_comptes_rendus_un_par_intervention unique (intervention_id),
  constraint intervention_comptes_rendus_intervention_meme_org_fk
    foreign key (intervention_id, organization_id)
    references public.incident_interventions(id, organization_id),
  constraint intervention_comptes_rendus_travaux_non_vide
    check (length(trim(travaux_realises)) > 0),
  constraint intervention_comptes_rendus_montant
    check (montant_final_cents is null or montant_final_cents >= 0),
  -- Signaler une cause différente engage : on dit laquelle.
  constraint intervention_comptes_rendus_cause_motivee
    check (imputation_suggeree is null or length(trim(coalesce(cause_reelle, ''))) > 0)
);
create index intervention_comptes_rendus_org_idx
  on public.intervention_comptes_rendus (organization_id, intervention_id);

-- Les photos du chantier. La photo d'APRÈS est la garde de RM-7.5.2.
-- Elles vont dans la GED de l'agence (type photo_incident, déjà existant) et
-- sont liées à l'incident : le locataire les consulte avant de noter (RM-11.1).
create table public.intervention_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  intervention_id uuid not null,
  document_id uuid not null,
  moment public.intervention_photo_moment not null,
  created_by uuid references public.accounts(id),
  created_at timestamptz not null default now(),
  constraint intervention_photos_document_unique unique (document_id),
  constraint intervention_photos_intervention_meme_org_fk
    foreign key (intervention_id, organization_id)
    references public.incident_interventions(id, organization_id),
  constraint intervention_photos_document_meme_org_fk
    foreign key (document_id, organization_id)
    references public.documents(id, organization_id)
);
create index intervention_photos_org_idx
  on public.intervention_photos (organization_id, intervention_id, moment);

-- Les évaluations (module 11). Le commentaire du gérant reste PRIVÉ à son
-- agence (RM-11.2.2) : c'est pourquoi la table est org-scopée alors que la
-- note agrégée, elle, est du profil global.
create table public.artisan_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  intervention_id uuid not null,
  artisan_id uuid not null references public.artisans(id),
  source public.evaluation_source not null,
  note_globale smallint not null,
  -- Le gérant note trois critères (qualité, délai, prix) — « le seul à voir
  -- l'ensemble ». Le locataire ne juge ni le prix ni la technique (RM-11.1) :
  -- ces trois colonnes restent nulles pour lui.
  note_qualite smallint,
  note_delai smallint,
  note_prix smallint,
  commentaire text,
  evaluateur_account_id uuid references public.accounts(id),
  -- Retrait après contestation auprès du super admin (RM-11.4.4) → recalcul.
  retiree_le timestamptz,
  retrait_motif text,
  retiree_par uuid references public.accounts(id),
  created_at timestamptz not null default now(),
  constraint artisan_evaluations_id_org_unique unique (id, organization_id),
  -- « Une évaluation par acteur et par intervention » (RM-11.2).
  constraint artisan_evaluations_une_par_source unique (intervention_id, source),
  constraint artisan_evaluations_intervention_meme_org_fk
    foreign key (intervention_id, organization_id)
    references public.incident_interventions(id, organization_id),
  constraint artisan_evaluations_notes check (
    note_globale between 1 and 5
    and (note_qualite is null or note_qualite between 1 and 5)
    and (note_delai is null or note_delai between 1 and 5)
    and (note_prix is null or note_prix between 1 and 5)
  ),
  constraint artisan_evaluations_criteres_du_gerant check (
    (source = 'gerant'
     and note_qualite is not null and note_delai is not null and note_prix is not null)
    or (source = 'locataire'
        and note_qualite is null and note_delai is null and note_prix is null)
  ),
  constraint artisan_evaluations_retrait_motive
    check ((retiree_le is null) = (retrait_motif is null))
);
create index artisan_evaluations_org_idx
  on public.artisan_evaluations (organization_id, intervention_id);
create index artisan_evaluations_artisan_idx
  on public.artisan_evaluations (artisan_id) where retiree_le is null;

-- Le fil d'événements de l'incident accueille les gestes de l'artisan. La
-- contrainte de 08/2026 ne connaissait que les gestes de l'agence et du
-- locataire : on l'étend, on ne la remplace pas.
alter table public.incident_evenements drop constraint incident_evenements_type_check;
alter table public.incident_evenements add constraint incident_evenements_type_check
  check (type in (
    'declaration', 'qualification', 'contestation', 'cloture', 'reouverture',
    'attribution', 'photo',
    'consultation', 'sollicitation', 'devis', 'selection_devis',
    'mission_confiee', 'mission_acceptee', 'mission_refusee',
    'creneaux_proposes', 'creneau_retenu', 'arbitrage_creneau',
    'intervention_demarree', 'compte_rendu', 'revision_imputation', 'evaluation'
  ));

-- Constat du 2026-09-11 : `artisan_candidatures` (03/09) préfigurait
-- l'inscription artisan ; elle n'a jamais été lue et reste sans politique.
-- `public.artisans` la remplace (statut_plateforme = en_attente EST la
-- candidature). On la laisse fermée plutôt que de la supprimer — c'est la
-- règle « archiver plutôt que supprimer » — mais on dit qu'elle est morte.
comment on table public.artisan_candidatures is
  'SUPERSÉDÉE le 2026-09-11 par public.artisans (statut_plateforme). Table jamais câblée, laissée fermée : aucune politique, aucun privilège.';

-- ══════════════════════════════════════════════════════════════════════════
-- 5. LES FONCTIONS D'AUTORISATION ET DE RÈGLE
--    Une règle, un seul endroit : la recherche d'affectation et la
--    sollicitation appellent LA MÊME fonction, sinon elles divergeraient.
-- ══════════════════════════════════════════════════════════════════════════

-- L'identité d'artisan de l'appelant. Elle ne se PASSE pas, elle se DÉDUIT :
-- c'est la pièce maîtresse du modèle d'accès (règle 2 du préambule).
create function public.mon_artisan_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select a.id from public.artisans a where a.account_id = (select auth.uid());
$$;
revoke execute on function public.mon_artisan_id() from public, anon;
comment on function public.mon_artisan_id() is
  'Artisan du compte connecté, déduit de auth.uid(). Aucun paramètre : on ne peut pas demander l''identité d''un autre.';

-- Qui a le droit de LIRE un profil global d'artisan. Le cloisonnement d'une
-- table sans organization_id passe par ici (règle 5 du préambule).
create function public.artisan_lisible(p_artisan uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.artisans a
    where a.id = p_artisan
      and (
        a.account_id = (select auth.uid())
        or public.is_super_admin()
        or exists (
          select 1 from public.artisan_agences aa
          join public.memberships m on m.organization_id = aa.organization_id
          where aa.artisan_id = a.id
            and m.account_id = (select auth.uid()) and m.status = 'active'
            and m.role in ('admin_agence', 'agent', 'proprietaire_direct'))
        or (
          a.visibilite = 'publique'
          and a.statut_plateforme = 'valide'
          and a.blacklist_globale_le is null
          and exists (
            select 1 from public.memberships m
            where m.account_id = (select auth.uid()) and m.status = 'active'
              and m.role in ('admin_agence', 'agent', 'proprietaire_direct')))
      ));
$$;
revoke execute on function public.artisan_lisible(uuid) from public, anon;

-- RM-8.2.9 : la décennale s'exige selon la NATURE des travaux.
create function public.decennale_requise(p_nature public.nature_travaux)
returns boolean language sql immutable set search_path = '' as $$
  select p_nature <> 'entretien_courant';
$$;
revoke execute on function public.decennale_requise(public.nature_travaux) from public, anon;

-- RM-8.2.2 : expirée → retrait automatique des listes ; dépôt à jour →
-- rétablissement immédiat. Il n'y a donc PAS de colonne « décennale ok » à
-- tenir à jour : la validité se lit de la pièce, à l'instant de la question.
create function public.artisan_decennale_valide(p_artisan uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.artisan_pieces p
    where p.artisan_id = p_artisan and p.type = 'decennale'
      and p.retiree_le is null and p.expire_le >= current_date);
$$;
revoke execute on function public.artisan_decennale_valide(uuid) from public, anon;

-- LA porte d'affectation. Un seul endroit pour : le droit d'exister
-- (validation plateforme), les deux blacklists, le rattachement ou la
-- visibilité, le métier, la zone et la décennale selon la nature.
-- `p_code_postal` nul = on ne contrôle pas la zone (arbitrage de l'agence sur
-- un cas hors zone) ; la décennale, elle, n'a pas d'échappatoire (RM-8.3.1).
create function public.artisan_affectable(
  p_artisan uuid, p_org uuid, p_metier public.artisan_metier,
  p_nature public.nature_travaux, p_code_postal text default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.artisans a
    where a.id = p_artisan
      -- 1. Le droit d'exister : validation plateforme par le super admin.
      and a.statut_plateforme = 'valide'
      and a.blacklist_globale_le is null
      -- RM-A1.9 : seul un SIRET vérifié est affectable.
      and a.siret_etat = 'verifie'
      -- 2. La relation d'agence : rattaché non blacklisté, ou public.
      and (
        exists (select 1 from public.artisan_agences aa
                where aa.artisan_id = a.id and aa.organization_id = p_org
                  and aa.statut = 'actif' and aa.blacklist_le is null)
        or (a.visibilite = 'publique'
            and not exists (select 1 from public.artisan_agences aa
                            where aa.artisan_id = a.id and aa.organization_id = p_org
                              and (aa.blacklist_le is not null or aa.statut = 'desactive')))
      )
      -- 3. Son métier (RM-8.3) — jamais proposé hors de son métier.
      and exists (select 1 from public.artisan_metiers am
                  where am.artisan_id = a.id and am.metier = p_metier)
      -- 4. Sa zone, quand on la contrôle.
      and (p_code_postal is null
           or exists (select 1 from public.artisan_zones az
                      where az.artisan_id = a.id and az.code_postal = p_code_postal))
      -- 5. La décennale selon la nature des travaux — sans interrupteur.
      and (not public.decennale_requise(p_nature)
           or public.artisan_decennale_valide(a.id))
  );
$$;
revoke execute on function public.artisan_affectable(uuid, uuid, public.artisan_metier, public.nature_travaux, text) from public, anon;
comment on function public.artisan_affectable(uuid, uuid, public.artisan_metier, public.nature_travaux, text) is
  'La porte d''affectation (RM-8.3). Aucun paramètre ne désactive le filtre décennale : RM-8.3.1 le veut non désactivable, donc il n''existe pas d''argument pour le lever.';

-- La note publiée (module 11). Le wiki fixe les poids (gérant 50 %, locataire
-- 25 %, plateforme 25 %) et le seuil de publication (3 évaluations), mais il
-- ne donne AUCUNE formule pour convertir les cinq indicateurs de fiabilité en
-- note sur 5. On ne l'invente pas : la fonction rend la part SPÉCIFIÉE
-- (gérant + locataire, renormalisée 2/3–1/3) et dit que la part plateforme
-- manque. Signalé au rapport comme arbitrage ouvert.
create function public.artisan_note(p_artisan uuid)
returns table (
  note_gerant numeric, note_locataire numeric, note_publiee numeric,
  nb_evaluations integer, publiable boolean, fiabilite_disponible boolean)
language sql stable security definer set search_path = '' as $$
  with e as (
    select source, note_globale from public.artisan_evaluations
    where artisan_id = p_artisan and retiree_le is null
  ),
  g as (select avg(note_globale) v from e where source = 'gerant'),
  l as (select avg(note_globale) v from e where source = 'locataire')
  select
    round((select v from g), 2),
    round((select v from l), 2),
    round(case
      when (select v from g) is not null and (select v from l) is not null
        then (select v from g) * (50.0 / 75.0) + (select v from l) * (25.0 / 75.0)
      else coalesce((select v from g), (select v from l))
    end, 2),
    (select count(*)::integer from e),
    (select count(*) from e) >= 3,
    false;
$$;
revoke execute on function public.artisan_note(uuid) from public, anon;

-- Les cinq indicateurs de fiabilité (RM-11.3), MESURÉS, sans opinion et sans
-- conversion inventée. L'artisan y accède en détail (« le cacher serait
-- déloyal ») ; le locataire et le propriétaire, jamais.
create function public.artisan_indicateurs_fiabilite(p_artisan uuid)
returns table (
  delai_acceptation_heures numeric, delai_intervention_jours numeric,
  taux_refus numeric, rdv_manques integer, pieces_expirees integer)
language sql stable security definer set search_path = '' as $$
  select
    round((select avg(extract(epoch from (i.acceptee_le - i.confiee_le)) / 3600.0)
           from public.incident_interventions i
           where i.artisan_id = p_artisan and i.acceptee_le is not null), 1),
    round((select avg(extract(epoch from (i.demarree_le - i.acceptee_le)) / 86400.0)
           from public.incident_interventions i
           where i.artisan_id = p_artisan and i.demarree_le is not null
             and i.acceptee_le is not null), 1),
    round((select coalesce(
             count(*) filter (where i.statut = 'refusee')::numeric
             / nullif(count(*), 0), 0)
           from public.incident_interventions i where i.artisan_id = p_artisan), 3),
    -- « RDV manqué » n'est pas encore un geste du produit (module 10, non
    -- câblé) : l'indicateur existe, sa source viendra avec l'écran d'agenda.
    0,
    (select count(*)::integer from public.artisan_pieces p
     where p.artisan_id = p_artisan and p.retiree_le is null
       and p.expire_le is not null and p.expire_le < current_date);
$$;
revoke execute on function public.artisan_indicateurs_fiabilite(uuid) from public, anon;

-- ══════════════════════════════════════════════════════════════════════════
-- 6. RM-7.5.2 — LA PHOTO EST UNE GARDE, PAS UNE CONSIGNE D'INTERFACE
--    « Sans photo du travail réalisé, une intervention ne peut pas être
--    terminée. » Un contrôle dans la RPC ne tient que si l'on passe par elle ;
--    le déclencheur tient AUSSI contre un UPDATE direct. C'est la même
--    exigence que la contrainte incidents_clos_motive posée en août.
-- ══════════════════════════════════════════════════════════════════════════
create function public.controler_cloture_intervention()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.statut = 'terminee' and old.statut is distinct from 'terminee' then
    if not exists (select 1 from public.intervention_comptes_rendus cr
                   where cr.intervention_id = new.id) then
      raise exception 'Le compte rendu est obligatoire pour terminer une intervention (RM-7.5.1)';
    end if;
    if not exists (select 1 from public.intervention_photos ip
                   where ip.intervention_id = new.id and ip.moment = 'apres') then
      raise exception 'Une photo du travail réalisé est obligatoire pour terminer une intervention (RM-7.5.2)';
    end if;
    if new.terminee_le is null then
      raise exception 'Une intervention terminée porte sa date de fin';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.controler_cloture_intervention() from public, anon, authenticated;

create trigger incident_interventions_cloture
  before update on public.incident_interventions
  for each row execute function public.controler_cloture_intervention();

create trigger artisans_updated_at before update on public.artisans
  for each row execute function public.set_updated_at();
create trigger artisan_agences_updated_at before update on public.artisan_agences
  for each row execute function public.set_updated_at();
create trigger incident_interventions_updated_at before update on public.incident_interventions
  for each row execute function public.set_updated_at();

-- ══════════════════════════════════════════════════════════════════════════
-- 7. RLS ET PRIVILÈGES
--    Principe : PERSONNE n'écrit en direct. Toutes les écritures passent par
--    les RPC SECURITY DEFINER ci-dessous, qui portent chacune leur garde.
--    `authenticated` ne reçoit que SELECT, et seulement là où un écran
--    gestionnaire lit par PostgREST. L'artisan et le locataire ne lisent, eux,
--    que par RPC : aucune politique ne les nomme.
--    Rappel du 2026-09-10 : les privilèges par défaut de Supabase accordent
--    tout à anon sur chaque table nouvellement créée — il faut révoquer
--    explicitement, sinon le test de socle rougit (et il a raison).
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'artisans', 'artisan_metiers', 'artisan_zones', 'artisan_pieces',
    'artisan_validations', 'artisan_agences', 'incident_consultations',
    'incident_sollicitations', 'incident_devis', 'incident_interventions',
    'intervention_creneaux', 'intervention_comptes_rendus',
    'intervention_photos', 'artisan_evaluations'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- 7.1 Le profil global : cloisonné par artisan_lisible(), pas par organisation.
create policy artisans_select on public.artisans for select to authenticated
  using (public.artisan_lisible(id));
create policy artisan_metiers_select on public.artisan_metiers for select to authenticated
  using (public.artisan_lisible(artisan_id));
create policy artisan_zones_select on public.artisan_zones for select to authenticated
  using (public.artisan_lisible(artisan_id));

-- Les PIÈCES ne suivent pas la même règle que le reste du profil, et c'est
-- volontaire (pivot du 2026-09-04) : la conformité sort de l'agence. Elle
-- n'a pas à lire l'attestation, seulement à se voir proposer des artisans à
-- jour. Seuls l'artisan lui-même et le super admin (qui valide) y accèdent.
create policy artisan_pieces_select on public.artisan_pieces for select to authenticated
  using (
    exists (select 1 from public.artisans a
            where a.id = artisan_id and a.account_id = (select auth.uid()))
    or (select public.is_super_admin())
  );
create policy artisan_validations_select on public.artisan_validations for select to authenticated
  using (
    exists (select 1 from public.artisans a
            where a.id = artisan_id and a.account_id = (select auth.uid()))
    or (select public.is_super_admin())
  );

-- 7.2 La relation d'agence et tout l'opérationnel : la politique habituelle du
--     produit, mot pour mot. Aucun rôle nouveau n'y entre — voir règle 1.
do $$
declare t text;
begin
  foreach t in array array[
    'artisan_agences', 'incident_consultations', 'incident_sollicitations',
    'incident_devis', 'incident_interventions', 'intervention_creneaux',
    'intervention_comptes_rendus', 'intervention_photos', 'artisan_evaluations'
  ] loop
    execute format($p$
      create policy %1$I on public.%2$I for select to authenticated
      using (organization_id in (select public.org_ids_avec_roles(
               array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
    $p$, t || '_select', t);
  end loop;
end $$;
