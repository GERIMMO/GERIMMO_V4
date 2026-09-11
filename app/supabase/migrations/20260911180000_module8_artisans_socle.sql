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
-- `authenticated` aussi : ces quatre-là sont des AUXILIAIRES, pas des RPC.
-- Ils prennent un artisan en paramètre et ne contrôlent aucune appartenance —
-- exposés, n'importe quel compte connecté lirait la note et les indicateurs de
-- fiabilité de n'importe quel artisan, alors que RM-11.3 les réserve à
-- l'artisan lui-même (« locataire et propriétaire, jamais »). Ils restent
-- appelables depuis les RPC de ce fichier, qui s'exécutent sous leur
-- propriétaire. Défaut trouvé par tests/rpc-etancheite-inter-agences le
-- 2026-09-11, avant toute mise en service.
revoke execute on function public.artisan_decennale_valide(uuid) from public, anon, authenticated;

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
revoke execute on function public.artisan_affectable(uuid, uuid, public.artisan_metier, public.nature_travaux, text) from public, anon, authenticated;
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
revoke execute on function public.artisan_note(uuid) from public, anon, authenticated;

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
revoke execute on function public.artisan_indicateurs_fiabilite(uuid) from public, anon, authenticated;

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

-- `insert or update` : constat du 2026-09-11 en essayant de contourner la
-- garde — un déclencheur posé sur le seul UPDATE laisse passer un INSERT qui
-- naît déjà « terminee ». Sur INSERT, `old` est nul, donc la garde s'applique :
-- une intervention ne peut pas naître terminée, ce qui est exact (son compte
-- rendu et ses photos la référencent, ils ne peuvent pas exister avant elle).
create trigger incident_interventions_cloture
  before insert or update on public.incident_interventions
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

-- ══════════════════════════════════════════════════════════════════════════
-- 8. RPC DE L'ÉCRAN AGENCE
--    Garde commune : `p_org in (select org_ids_avec_roles(...))` — le motif du
--    projet, mot pour mot celui de qualifier_incident. Le locataire et
--    l'artisan n'y figurent pas : la sélection d'un devis n'est NI au locataire
--    NI à Gerimmo, et l'affectation appartient à l'agence.
-- ══════════════════════════════════════════════════════════════════════════

-- RM-8.1.5 : un artisan public existant est RATTACHÉ, jamais dupliqué. C'est
-- le SIRET qui le dit (RM-8.1.1) — d'où l'unicité globale de la colonne.
create function public.artisan_creer_ou_rattacher(
  p_org uuid, p_raison_sociale text, p_siret text, p_telephone text,
  p_email text, p_metiers public.artisan_metier[], p_codes_postaux text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_artisan uuid;
  v record;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if coalesce(array_length(p_metiers, 1), 0) = 0 then
    raise exception 'Choisissez au moins un métier — un artisan n''est proposé que dans son métier';
  end if;

  select * into v from public.artisans a where a.siret = trim(p_siret);
  if found then
    -- RM-A1.9 : un SIRET non vérifié n'est utilisable que par l'agence qui l'a
    -- créé. Une autre agence ne se rattache qu'à un profil public.
    if not (v.visibilite = 'publique' or v.cree_par_organization_id = p_org
            or exists (select 1 from public.artisan_agences aa
                       where aa.artisan_id = v.id and aa.organization_id = p_org)) then
      raise exception 'Ce SIRET est déjà enregistré par une autre agence et son profil n''est pas public — demandez à l''artisan de se rendre visible';
    end if;
    v_artisan := v.id;
  else
    insert into public.artisans
      (raison_sociale, siret, telephone, email, cree_par_organization_id)
    values (trim(p_raison_sociale), trim(p_siret), trim(p_telephone),
            nullif(trim(coalesce(p_email, '')), ''), p_org)
    returning id into v_artisan;

    insert into public.artisan_metiers (artisan_id, metier)
    select v_artisan, unnest(p_metiers) on conflict do nothing;
    insert into public.artisan_zones (artisan_id, code_postal)
    select v_artisan, trim(unnest(coalesce(p_codes_postaux, array[]::text[])))
    on conflict do nothing;
  end if;

  insert into public.artisan_agences (organization_id, artisan_id, created_by)
  values (p_org, v_artisan, (select auth.uid()))
  on conflict (organization_id, artisan_id) do nothing;

  return v_artisan;
end;
$$;
revoke execute on function public.artisan_creer_ou_rattacher(uuid, text, text, text, text, public.artisan_metier[], text[]) from public, anon;

-- Métiers et zone : posés par l'agence à la création (module 8, 8.1), tenus
-- ensuite par l'artisan lui-même — les deux passent par la même porte.
create function public.artisan_definir_metiers_zones(
  p_artisan uuid, p_metiers public.artisan_metier[], p_codes_postaux text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (
    exists (select 1 from public.artisans a
            where a.id = p_artisan and a.account_id = (select auth.uid()))
    or public.is_super_admin()
    or exists (select 1 from public.artisan_agences aa
               join public.memberships m on m.organization_id = aa.organization_id
               where aa.artisan_id = p_artisan and m.account_id = (select auth.uid())
                 and m.status = 'active'
                 and m.role in ('admin_agence','agent','proprietaire_direct'))
  ) then
    raise exception 'Accès refusé';
  end if;
  if coalesce(array_length(p_metiers, 1), 0) = 0 then
    raise exception 'Choisissez au moins un métier';
  end if;

  delete from public.artisan_metiers where artisan_id = p_artisan
    and metier <> all (p_metiers);
  insert into public.artisan_metiers (artisan_id, metier)
  select p_artisan, unnest(p_metiers) on conflict do nothing;

  delete from public.artisan_zones where artisan_id = p_artisan
    and code_postal <> all (coalesce(p_codes_postaux, array[]::text[]));
  insert into public.artisan_zones (artisan_id, code_postal)
  select p_artisan, trim(unnest(coalesce(p_codes_postaux, array[]::text[])))
  on conflict do nothing;
end;
$$;
revoke execute on function public.artisan_definir_metiers_zones(uuid, public.artisan_metier[], text[]) from public, anon;

-- RM-8.5.1 : la désactivation est NEUTRE et sans motif. Elle n'engage que
-- l'agence qui la pose.
create function public.artisan_statut_local(p_org uuid, p_artisan uuid, p_actif boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé — la désactivation d''un artisan est du ressort du responsable de l''agence';
  end if;
  update public.artisan_agences
  set statut = case when p_actif then 'actif' else 'desactive' end::public.artisan_relation_statut
  where organization_id = p_org and artisan_id = p_artisan;
  if not found then raise exception 'Cet artisan n''est pas rattaché à votre agence'; end if;
end;
$$;
revoke execute on function public.artisan_statut_local(uuid, uuid, boolean) from public, anon;

-- RM-8.5.2 : la blacklist LOCALE est motivée, réservée à l'admin d'agence, et
-- n'engage que son agence (RM-A1.8 : l'agence B continue de le voir).
-- RM-8.5.7 : jamais avec une intervention en cours ; les devis en attente sont
-- annulés. A2 : le motif se purge à 3 ans (locale), 5 ans (globale) — « au-delà,
-- un artisan doit pouvoir repartir sans que son passé le suive ».
create function public.artisan_blacklist_locale(p_org uuid, p_artisan uuid, p_motif text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_en_cours integer;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé — la mise en liste noire est du ressort du responsable de l''agence';
  end if;
  if length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Le motif est obligatoire — une liste noire se motive, une désactivation non (RM-8.5.2)';
  end if;

  select count(*) into v_en_cours from public.incident_interventions i
  where i.organization_id = p_org and i.artisan_id = p_artisan
    and i.statut in ('acceptee', 'planifiee', 'en_cours');
  if v_en_cours > 0 then
    raise exception 'Cet artisan a % intervention(s) en cours — une intervention en cours n''est jamais interrompue (RM-8.2.7/8.5.7)', v_en_cours;
  end if;

  insert into public.artisan_agences
    (organization_id, artisan_id, statut, blacklist_le, blacklist_motif,
     blacklist_par, purge_motif_le, created_by)
  values (p_org, p_artisan, 'desactive', now(), trim(p_motif),
          (select auth.uid()), (current_date + interval '3 years')::date,
          (select auth.uid()))
  on conflict (organization_id, artisan_id) do update
  set statut = 'desactive', blacklist_le = now(), blacklist_motif = trim(p_motif),
      blacklist_par = (select auth.uid()),
      purge_motif_le = (current_date + interval '3 years')::date;

  -- Les devis en attente tombent avec la liste noire (RM-8.5.7).
  update public.incident_devis set statut = 'annule'
  where organization_id = p_org and artisan_id = p_artisan and statut = 'depose';
  update public.incident_sollicitations set statut = 'annulee', repondue_le = now()
  where organization_id = p_org and artisan_id = p_artisan
    and statut in ('envoyee', 'devis_depose');
end;
$$;
revoke execute on function public.artisan_blacklist_locale(uuid, uuid, text) from public, anon;

create function public.artisan_lever_blacklist_locale(p_org uuid, p_artisan uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  update public.artisan_agences
  set statut = 'actif', blacklist_le = null, blacklist_motif = null,
      blacklist_par = null, purge_motif_le = null
  where organization_id = p_org and artisan_id = p_artisan;
  if not found then raise exception 'Cet artisan n''est pas rattaché à votre agence'; end if;
end;
$$;
revoke execute on function public.artisan_lever_blacklist_locale(uuid, uuid) from public, anon;

-- RM-8.3 : métier + zone + décennale (filtre non désactivable) + exclusion des
-- blacklistés, TRIÉE PAR SCORE DÉCROISSANT. Le tri se fait sur la part
-- spécifiée de la note (voir artisan_note) ; l'artisan sans note passe après
-- les notés mais reste proposé (RM-11.4.1 : une note isolée ne doit pas
-- condamner, un débutant non plus).
create function public.artisans_affectables(
  p_org uuid, p_metier public.artisan_metier, p_nature public.nature_travaux,
  p_code_postal text default null)
returns table (
  artisan_id uuid, raison_sociale text, telephone text, email text,
  rattache boolean, note_publiee numeric, nb_evaluations integer,
  publiable boolean, decennale_valide boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  return query
    select a.id, a.raison_sociale, a.telephone, a.email,
           exists (select 1 from public.artisan_agences aa
                   where aa.artisan_id = a.id and aa.organization_id = p_org),
           n.note_publiee, n.nb_evaluations, n.publiable,
           public.artisan_decennale_valide(a.id)
    from public.artisans a
    cross join lateral public.artisan_note(a.id) n
    where public.artisan_affectable(a.id, p_org, p_metier, p_nature, p_code_postal)
    order by n.note_publiee desc nulls last, a.raison_sociale;
end;
$$;
revoke execute on function public.artisans_affectables(uuid, public.artisan_metier, public.nature_travaux, text) from public, anon;

-- RM-7.2.7 : aucune affectation d'artisan sans imputation. La mise en
-- concurrence part donc d'un incident QUALIFIÉ — c'est la base qui le tient,
-- pas l'écran.
create function public.ouvrir_consultation(
  p_org uuid, p_incident uuid, p_metier public.artisan_metier,
  p_nature public.nature_travaux, p_devis_unique_assume boolean default false,
  p_validite_jours integer default 30)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v record; v_consultation uuid;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into v from public.incidents
  where id = p_incident and organization_id = p_org for update;
  if not found then raise exception 'Incident introuvable'; end if;
  if v.etat <> 'qualifie' then
    if v.etat in ('declare', 'rouvert') then
      raise exception 'Qualifiez l''incident avant de consulter un artisan — aucune affectation sans imputation (RM-7.2.7)';
    end if;
    raise exception 'Cet incident ne se consulte plus (état actuel : %)', v.etat;
  end if;

  insert into public.incident_consultations
    (organization_id, incident_id, metier, nature_travaux,
     devis_unique_assume, validite_jours, created_by)
  values (p_org, p_incident, p_metier, p_nature,
          coalesce(p_devis_unique_assume, false), coalesce(p_validite_jours, 30),
          (select auth.uid()))
  returning id into v_consultation;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'consultation', (select auth.uid()),
          jsonb_build_object('consultation_id', v_consultation, 'metier', p_metier,
                             'nature_travaux', p_nature,
                             'decennale_requise', public.decennale_requise(p_nature),
                             'devis_unique_assume', coalesce(p_devis_unique_assume, false)));
  return v_consultation;
exception when unique_violation then
  raise exception 'Une mise en concurrence est déjà ouverte sur cet incident';
end;
$$;
revoke execute on function public.ouvrir_consultation(uuid, uuid, public.artisan_metier, public.nature_travaux, boolean, integer) from public, anon;

-- RM-9.1.1 : deux artisans au maximum en parallèle. Le verrou sur la
-- consultation rend le plafond vrai même sous deux appels simultanés — un
-- compte lu sans verrou se contourne en cliquant deux fois.
create function public.solliciter_artisan(p_org uuid, p_consultation uuid, p_artisan uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c record; v_code_postal text; v_nb integer; v_sollicitation uuid; v_account uuid;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into c from public.incident_consultations
  where id = p_consultation and organization_id = p_org for update;
  if not found then raise exception 'Mise en concurrence introuvable'; end if;
  if c.statut <> 'ouverte' then
    raise exception 'Cette mise en concurrence est close';
  end if;

  select b.postal_code into v_code_postal
  from public.incidents i join public.lots l on l.id = i.lot_id
  join public.biens b on b.id = l.bien_id
  where i.id = c.incident_id and i.organization_id = p_org;

  if not public.artisan_affectable(p_artisan, p_org, c.metier, c.nature_travaux, v_code_postal) then
    -- Le message nomme la raison : sans elle, l'agent ne sait pas quoi corriger.
    if public.decennale_requise(c.nature_travaux)
       and not public.artisan_decennale_valide(p_artisan) then
      raise exception 'Artisan écarté : ces travaux exigent une décennale valide (RM-8.2.9), la sienne ne l''est pas';
    end if;
    if not exists (select 1 from public.artisan_metiers am
                   where am.artisan_id = p_artisan and am.metier = c.metier) then
      raise exception 'Artisan écarté : ce n''est pas son métier (RM-8.3)';
    end if;
    raise exception 'Artisan écarté : profil non validé par la plateforme, en liste noire, hors zone, ou non rattaché à votre agence';
  end if;

  select count(*) into v_nb from public.incident_sollicitations s
  where s.consultation_id = p_consultation
    and s.statut in ('envoyee', 'devis_depose', 'retenue');
  if v_nb >= 2 then
    raise exception 'Deux artisans au maximum sollicités en parallèle (RM-9.1.1)';
  end if;

  insert into public.incident_sollicitations
    (organization_id, consultation_id, incident_id, artisan_id, created_by)
  values (p_org, p_consultation, c.incident_id, p_artisan, (select auth.uid()))
  returning id into v_sollicitation;

  -- L'adhésion ne donne AUCUN droit sur les données de l'agence (voir règle 3
  -- du préambule) : elle sert uniquement à faire apparaître l'agence dans
  -- /espaces. `do nothing` parce qu'un compte n'a qu'une adhésion par agence —
  -- si l'artisan y est déjà connu autrement, on ne l'écrase pas.
  select a.account_id into v_account from public.artisans a where a.id = p_artisan;
  if v_account is not null then
    insert into public.memberships (account_id, organization_id, role)
    values (v_account, p_org, 'artisan') on conflict do nothing;
  end if;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, c.incident_id, 'sollicitation', (select auth.uid()),
          jsonb_build_object('sollicitation_id', v_sollicitation, 'artisan_id', p_artisan));
  return v_sollicitation;
exception when unique_violation then
  raise exception 'Cet artisan est déjà sollicité sur cette mise en concurrence';
end;
$$;
revoke execute on function public.solliciter_artisan(uuid, uuid, uuid) from public, anon;

-- LA SECONDE APPROBATION — la sélection du devis. Choix OPÉRATIONNEL, par
-- l'agence ou le propriétaire, jamais par le locataire, jamais par Gerimmo.
-- À ne pas confondre avec la validation plateforme (artisan_decision_plateforme,
-- super admin, au niveau de la personne) : celle-ci porte sur UNE intervention.
-- Elle crée la mission et fait passer l'incident qualifié → affecté.
create function public.retenir_devis(p_org uuid, p_devis uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare d record; i record; v_intervention uuid;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé — la sélection d''un devis appartient à l''agence ou au propriétaire';
  end if;
  select * into d from public.incident_devis
  where id = p_devis and organization_id = p_org for update;
  if not found then raise exception 'Devis introuvable'; end if;
  if d.statut <> 'depose' then
    raise exception 'Ce devis n''est plus sélectionnable (état : %)', d.statut;
  end if;
  if d.valide_jusqu_au < current_date then
    raise exception 'Ce devis a expiré le % — il est caduc (RM-9.2.3)', to_char(d.valide_jusqu_au, 'DD/MM/YYYY');
  end if;

  select * into i from public.incidents
  where id = d.incident_id and organization_id = p_org for update;
  if i.etat <> 'qualifie' then
    raise exception 'Cet incident n''est pas en attente d''affectation (état actuel : %)', i.etat;
  end if;
  -- La décennale est revérifiée À LA SÉLECTION : elle a pu expirer entre la
  -- sollicitation et le choix (seuils J-60/J-30/J-7/J+0, RM-8.2.5).
  if not public.artisan_affectable(
       d.artisan_id, p_org,
       (select c.metier from public.incident_consultations c
        join public.incident_sollicitations s on s.consultation_id = c.id
        where s.id = d.sollicitation_id),
       (select c.nature_travaux from public.incident_consultations c
        join public.incident_sollicitations s on s.consultation_id = c.id
        where s.id = d.sollicitation_id)) then
    raise exception 'Cet artisan n''est plus affectable aujourd''hui (décennale, liste noire ou validation plateforme) — choisissez l''autre devis ou relancez une consultation';
  end if;

  update public.incident_devis
  set statut = 'retenu', retenu_le = now(), retenu_par = (select auth.uid())
  where id = p_devis;
  update public.incident_sollicitations set statut = 'retenue' where id = d.sollicitation_id;

  -- Les non-retenus sont notifiés automatiquement (module 9) : ici, leur
  -- statut bascule — c'est ce que leur écran lit.
  update public.incident_devis set statut = 'non_retenu'
  where sollicitation_id in (select s.id from public.incident_sollicitations s
                             where s.consultation_id = (select s2.consultation_id
                               from public.incident_sollicitations s2 where s2.id = d.sollicitation_id))
    and id <> p_devis and statut = 'depose';
  update public.incident_sollicitations set statut = 'non_retenue'
  where consultation_id = (select s2.consultation_id from public.incident_sollicitations s2
                           where s2.id = d.sollicitation_id)
    and id <> d.sollicitation_id and statut in ('envoyee', 'devis_depose');
  update public.incident_consultations set statut = 'close', closed_at = now()
  where id = (select s2.consultation_id from public.incident_sollicitations s2
              where s2.id = d.sollicitation_id);

  insert into public.incident_interventions
    (organization_id, incident_id, artisan_id, devis_id, nature_travaux, created_by)
  values (p_org, d.incident_id, d.artisan_id, p_devis,
          (select c.nature_travaux from public.incident_consultations c
           join public.incident_sollicitations s on s.consultation_id = c.id
           where s.id = d.sollicitation_id),
          (select auth.uid()))
  returning id into v_intervention;

  update public.incidents set etat = 'affecte' where id = d.incident_id;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, d.incident_id, 'selection_devis', (select auth.uid()),
          jsonb_build_object('devis_id', p_devis, 'artisan_id', d.artisan_id,
                             'montant_ttc_cents', d.montant_ttc_cents,
                             'intervention_id', v_intervention)),
         (p_org, d.incident_id, 'mission_confiee', (select auth.uid()),
          jsonb_build_object('intervention_id', v_intervention, 'artisan_id', d.artisan_id));
  return v_intervention;
end;
$$;
revoke execute on function public.retenir_devis(uuid, uuid) from public, anon;

-- RM-10.4.1 : après six créneaux refusés, « le problème n'est plus logistique
-- mais relationnel » — le gérant règle au téléphone et SAISIT le RDV. Les
-- créneaux refusés restent (RM-10.4.4 : le refus persistant est opposable).
create function public.fixer_creneau_arbitrage(
  p_org uuid, p_intervention uuid, p_debut timestamptz, p_fin timestamptz, p_motif text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v record; v_creneau uuid; v_tour integer;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into v from public.incident_interventions
  where id = p_intervention and organization_id = p_org for update;
  if not found then raise exception 'Intervention introuvable'; end if;
  if v.statut not in ('acceptee', 'planifiee') then
    raise exception 'Un rendez-vous ne se fixe que sur une mission acceptée (état : %)', v.statut;
  end if;
  if p_fin <= p_debut then raise exception 'La fin du créneau doit suivre son début'; end if;

  select coalesce(max(tour), 0) + 1 into v_tour
  from public.intervention_creneaux where intervention_id = p_intervention;
  update public.intervention_creneaux
  set statut = 'caduc' where intervention_id = p_intervention and statut = 'propose';

  insert into public.intervention_creneaux
    (organization_id, intervention_id, propose_par, tour, debut, fin, statut, created_by)
  values (p_org, p_intervention, 'agence', v_tour, p_debut, p_fin, 'retenu', (select auth.uid()))
  returning id into v_creneau;

  update public.incident_interventions
  set statut = 'planifiee', debut_prevu = p_debut, fin_prevue = p_fin
  where id = p_intervention;

  update public.alerts
  set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
      closed_action = 'Rendez-vous fixé par arbitrage'
  where organization_id = p_org and statut = 'ouverte' and type = 'creneaux_arbitrage'
    and details->>'intervention_id' = p_intervention::text;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v.incident_id, 'arbitrage_creneau', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'debut', p_debut,
                             'fin', p_fin, 'motif', nullif(trim(coalesce(p_motif, '')), '')));
  return v_creneau;
end;
$$;
revoke execute on function public.fixer_creneau_arbitrage(uuid, uuid, timestamptz, timestamptz, text) from public, anon;

-- RM-7.5.3 — LA CONTRADICTION DU WIKI, TRANCHÉE DANS LE SENS QU'IL PROPOSE.
-- Constat du 2026-09-10 (page [[Incident]]) : depuis la revue du 23/08,
-- qualifier_incident refuse tout état au-delà de `qualifie`, si bien que
-- RM-7.5.3 (« l'imputation est révisable après diagnostic ») n'était PAS
-- applicable — le diagnostic a lieu après l'affectation. Le wiki laissait deux
-- issues : reculer la borne de la qualification, ou « un autre geste : une
-- demande de requalification par l'artisan, tracée, que l'agent arbitre ».
-- C'est la SECONDE qui est retenue, parce que la première rouvrirait la
-- qualification pendant l'intervention et re-casserait la règle du 23/08.
-- Ici : l'artisan SIGNALE (compte rendu, cause_reelle + imputation_suggeree),
-- l'agent RÉVISE par cette fonction — et seulement après un signalement, aux
-- états `en_cours` et `termine`, donc avant facturation.
create function public.reviser_imputation_apres_diagnostic(
  p_org uuid, p_incident uuid, p_imputation public.incident_imputation, p_justification text)
returns void language plpgsql security definer set search_path = '' as $$
declare v record; v_signalement record;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if length(trim(coalesce(p_justification, ''))) = 0 then
    raise exception 'La justification de l''imputation est obligatoire — elle est opposable (RM-7.2.3)';
  end if;
  select * into v from public.incidents
  where id = p_incident and organization_id = p_org for update;
  if not found then raise exception 'Incident introuvable'; end if;
  if v.etat not in ('en_cours', 'termine') then
    raise exception 'La révision après diagnostic vaut pendant ou après l''intervention (état actuel : %) — avant, c''est la qualification', v.etat;
  end if;

  select cr.* into v_signalement
  from public.intervention_comptes_rendus cr
  join public.incident_interventions i on i.id = cr.intervention_id
  where i.incident_id = p_incident and i.organization_id = p_org
    and cr.cause_reelle is not null
  order by cr.created_at desc limit 1;
  if not found then
    raise exception 'Aucun artisan n''a signalé de cause différente sur cet incident — la révision après diagnostic suppose ce signalement (RM-7.5.3)';
  end if;

  update public.incidents
  set imputation = p_imputation, imputation_justification = trim(p_justification),
      imputation_contestee_le = null, imputation_contestation = null
  where id = p_incident;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'revision_imputation', (select auth.uid()),
          jsonb_build_object('imputation', p_imputation,
                             'imputation_precedente', v.imputation,
                             'justification', trim(p_justification),
                             'cause_reelle', v_signalement.cause_reelle));

  update public.alerts
  set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
      closed_action = 'Imputation révisée après diagnostic — ' || v.numero
  where organization_id = p_org and statut = 'ouverte'
    and type in ('incident_imputation_a_reviser', 'incident_conteste')
    and details->>'incident_id' = p_incident::text;
end;
$$;
revoke execute on function public.reviser_imputation_apres_diagnostic(uuid, uuid, public.incident_imputation, text) from public, anon;

create function public.annuler_mission(p_org uuid, p_intervention uuid, p_motif text)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Le motif d''annulation est obligatoire (RM-10.5)';
  end if;
  select * into v from public.incident_interventions
  where id = p_intervention and organization_id = p_org for update;
  if not found then raise exception 'Intervention introuvable'; end if;
  if v.statut in ('terminee', 'annulee', 'refusee') then
    raise exception 'Cette mission est déjà close (état : %)', v.statut;
  end if;

  update public.incident_interventions
  set statut = 'annulee', annulee_le = now(), annulation_motif = trim(p_motif)
  where id = p_intervention;
  update public.intervention_creneaux set statut = 'caduc'
  where intervention_id = p_intervention and statut in ('propose', 'retenu');
  update public.incidents set etat = 'qualifie'
  where id = v.incident_id and etat in ('affecte', 'en_cours');
end;
$$;
revoke execute on function public.annuler_mission(uuid, uuid, text) from public, anon;

-- Module 11 : le gérant note à la validation de la facture — trois critères,
-- « le seul à voir l'ensemble ». Son commentaire reste PRIVÉ à son agence
-- (RM-11.2.2) : il n'est jamais renvoyé à l'artisan (voir ma_note_artisan).
create function public.evaluer_artisan_gerant(
  p_org uuid, p_intervention uuid, p_qualite smallint, p_delai smallint,
  p_prix smallint, p_commentaire text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v record; v_eval uuid;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into v from public.incident_interventions
  where id = p_intervention and organization_id = p_org;
  if not found then raise exception 'Intervention introuvable'; end if;
  if v.statut <> 'terminee' then
    raise exception 'On évalue une intervention terminée (état : %)', v.statut;
  end if;

  insert into public.artisan_evaluations
    (organization_id, intervention_id, artisan_id, source, note_globale,
     note_qualite, note_delai, note_prix, commentaire, evaluateur_account_id)
  values (p_org, p_intervention, v.artisan_id, 'gerant',
          round((p_qualite + p_delai + p_prix) / 3.0)::smallint,
          p_qualite, p_delai, p_prix,
          nullif(trim(coalesce(p_commentaire, '')), ''), (select auth.uid()))
  returning id into v_eval;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v.incident_id, 'evaluation', (select auth.uid()),
          jsonb_build_object('source', 'gerant', 'intervention_id', p_intervention));
  return v_eval;
exception when unique_violation then
  raise exception 'Cette intervention a déjà été évaluée par l''agence — une évaluation par acteur et par intervention (RM-11.2)';
end;
$$;
revoke execute on function public.evaluer_artisan_gerant(uuid, uuid, smallint, smallint, smallint, text) from public, anon;

-- RM-7.6.2 : la clôture « déclenche la notation ». Faute d'alerte (celle-ci
-- serait refermée dans la foulée par cloturer_incident, qui solde toutes les
-- alertes de l'incident), le déclenchement est ici un ÉTAT INTERROGEABLE :
-- l'écran d'agence lit sa file d'interventions terminées non notées.
create function public.interventions_a_evaluer(p_org uuid)
returns table (
  intervention_id uuid, incident_id uuid, incident_numero text,
  artisan_id uuid, raison_sociale text, terminee_le timestamptz, lot_nom text)
language sql stable security definer set search_path = '' as $$
  select i.id, i.incident_id, inc.numero, i.artisan_id, a.raison_sociale,
         i.terminee_le, l.nom
  from public.incident_interventions i
  join public.incidents inc on inc.id = i.incident_id
  join public.lots l on l.id = inc.lot_id
  join public.artisans a on a.id = i.artisan_id
  where i.organization_id = p_org
    and p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and i.statut = 'terminee'
    and not exists (select 1 from public.artisan_evaluations e
                    where e.intervention_id = i.id and e.source = 'gerant'
                      and e.retiree_le is null)
  order by i.terminee_le;
$$;
revoke execute on function public.interventions_a_evaluer(uuid) from public, anon;

-- ══════════════════════════════════════════════════════════════════════════
-- 9. RPC DE L'ÉCRAN ARTISAN — LE MODÈLE D'ACCÈS NEUF
--    Garde commune : `mon_artisan_id()`, déduite de auth.uid(). Aucune de ces
--    fonctions ne prend d'identité d'artisan ni, pour les lectures
--    inter-agences, d'organisation en paramètre : il n'existe donc pas
--    d'argument permettant de demander les données d'un autre.
-- ══════════════════════════════════════════════════════════════════════════

create function public.mon_artisan()
returns table (
  artisan_id uuid, raison_sociale text, siret text, siret_etat public.artisan_siret_etat,
  telephone text, email text, visibilite public.artisan_visibilite,
  statut_plateforme public.artisan_statut_plateforme, statut_motif text,
  metiers public.artisan_metier[], codes_postaux text[],
  decennale_valide boolean, decennale_expire_le date)
language sql stable security definer set search_path = '' as $$
  select a.id, a.raison_sociale, a.siret, a.siret_etat, a.telephone, a.email,
         a.visibilite, a.statut_plateforme, a.statut_motif,
         (select array_agg(am.metier order by am.metier) from public.artisan_metiers am
          where am.artisan_id = a.id),
         (select array_agg(az.code_postal order by az.code_postal) from public.artisan_zones az
          where az.artisan_id = a.id),
         public.artisan_decennale_valide(a.id),
         (select max(p.expire_le) from public.artisan_pieces p
          where p.artisan_id = a.id and p.type = 'decennale' and p.retiree_le is null)
  from public.artisans a
  where a.id = public.mon_artisan_id();
$$;
revoke execute on function public.mon_artisan() from public, anon;

create function public.mes_pieces_artisan()
returns table (
  piece_id uuid, type public.artisan_piece_type, storage_path text,
  emise_le date, expire_le date, jours_avant_echeance integer, expiree boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.type, p.storage_path, p.emise_le, p.expire_le,
         (p.expire_le - current_date)::integer,
         p.expire_le is not null and p.expire_le < current_date
  from public.artisan_pieces p
  where p.artisan_id = public.mon_artisan_id() and p.retiree_le is null
  order by p.type, p.expire_le desc;
$$;
revoke execute on function public.mes_pieces_artisan() from public, anon;

-- RM-8.2.1 : c'est l'ARTISAN qui dépose ses pièces, pas l'agence. Le chemin de
-- stockage est contraint à `artisans/<son id>/` par la table : même une RPC
-- mal appelée ne peut pas écrire dans le dossier d'un autre.
create function public.deposer_ma_piece(
  p_type public.artisan_piece_type, p_storage_path text, p_mime text,
  p_taille bigint, p_empreinte text, p_emise_le date, p_expire_le date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_artisan uuid; v_piece uuid;
begin
  v_artisan := public.mon_artisan_id();
  if v_artisan is null then raise exception 'Accès refusé'; end if;
  if p_mime not in ('image/jpeg', 'image/png', 'application/pdf') then
    raise exception 'Déposez une image (JPEG, PNG) ou un PDF';
  end if;
  if p_storage_path not like 'artisans/' || v_artisan::text || '/%' then
    raise exception 'Chemin de stockage invalide';
  end if;
  if p_type <> 'certification' and p_expire_le is null then
    raise exception 'Indiquez la date de fin de validité — c''est elle qui fait foi';
  end if;

  -- Une nouvelle attestation remplace la précédente du même type : RM-8.2.2,
  -- « dépôt à jour → rétablissement immédiat » — il ne doit pas rester une
  -- vieille pièce qui traîne à côté de la neuve.
  update public.artisan_pieces set retiree_le = now()
  where artisan_id = v_artisan and type = p_type and retiree_le is null;

  insert into public.artisan_pieces
    (artisan_id, type, storage_path, mime_type, taille_octets, empreinte,
     emise_le, expire_le, deposee_par)
  values (v_artisan, p_type, p_storage_path, p_mime, p_taille, p_empreinte,
          p_emise_le, p_expire_le, (select auth.uid()))
  returning id into v_piece;

  -- La purge des candidatures sans document (6 mois, décision 2026-09-04)
  -- n'a plus lieu d'être dès qu'une pièce arrive.
  update public.artisans set purge_prevue_le = null where id = v_artisan;
  return v_piece;
end;
$$;
revoke execute on function public.deposer_ma_piece(public.artisan_piece_type, text, text, bigint, text, date, date) from public, anon;

-- RM-8.4.2 : « il décide seul de sa visibilité ». Ni l'agence ni le super
-- admin ne passent par ici.
create function public.definir_ma_visibilite(p_visibilite public.artisan_visibilite)
returns void language plpgsql security definer set search_path = '' as $$
declare v_artisan uuid;
begin
  v_artisan := public.mon_artisan_id();
  if v_artisan is null then raise exception 'Accès refusé'; end if;
  update public.artisans set visibilite = p_visibilite where id = v_artisan;
exception when check_violation then
  raise exception 'Un profil ne se publie qu''avec un SIRET vérifié (RM-A1.9)';
end;
$$;
revoke execute on function public.definir_ma_visibilite(public.artisan_visibilite) from public, anon;

-- RM-11.4 : l'artisan voit sa moyenne, son nombre d'avis et le détail de sa
-- fiabilité (« le cacher serait déloyal ») — JAMAIS le détail par intervention,
-- jamais qui a noté quoi, jamais les commentaires (RM-11.2.2 : privés à
-- l'agence). La projection de cette fonction EST cette règle.
create function public.ma_note_artisan()
returns table (
  note_publiee numeric, nb_evaluations integer, publiable boolean,
  delai_acceptation_heures numeric, delai_intervention_jours numeric,
  taux_refus numeric, rdv_manques integer, pieces_expirees integer)
language sql stable security definer set search_path = '' as $$
  select n.note_publiee, n.nb_evaluations, n.publiable,
         f.delai_acceptation_heures, f.delai_intervention_jours,
         f.taux_refus, f.rdv_manques, f.pieces_expirees
  from public.artisan_note(public.mon_artisan_id()) n
  cross join public.artisan_indicateurs_fiabilite(public.mon_artisan_id()) f
  where public.mon_artisan_id() is not null;
$$;
revoke execute on function public.ma_note_artisan() from public, anon;

-- Sa boîte de réception de demandes de devis, TOUTES AGENCES CONFONDUES.
-- Projection : de quoi chiffrer (nature, catégorie, description, commune) —
-- pas l'adresse exacte tant qu'il n'a rien accepté, pas l'occupant, jamais le
-- devis du concurrent.
create function public.mes_sollicitations()
returns table (
  sollicitation_id uuid, organization_id uuid, agence_nom text,
  incident_numero text, categorie text, description text,
  urgence public.incident_urgence, metier public.artisan_metier,
  nature_travaux public.nature_travaux, decennale_requise boolean,
  code_postal text, ville text, envoyee_le timestamptz,
  statut public.sollicitation_statut, valide_jusqu_au date, montant_ttc_cents bigint)
language sql stable security definer set search_path = '' as $$
  select s.id, s.organization_id, o.name, i.numero, i.categorie, i.description,
         i.urgence, c.metier, c.nature_travaux, c.decennale_requise,
         b.postal_code, b.city, s.envoyee_le, s.statut,
         d.valide_jusqu_au, d.montant_ttc_cents
  from public.incident_sollicitations s
  join public.incident_consultations c on c.id = s.consultation_id
  join public.incidents i on i.id = s.incident_id
  join public.lots l on l.id = i.lot_id
  join public.biens b on b.id = l.bien_id
  join public.organizations o on o.id = s.organization_id
  left join public.incident_devis d on d.sollicitation_id = s.id
  where s.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  order by (s.statut = 'envoyee') desc, s.envoyee_le desc;
$$;
revoke execute on function public.mes_sollicitations() from public, anon;

create function public.decliner_sollicitation(p_sollicitation uuid, p_motif text)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  select s.* into v from public.incident_sollicitations s
  where s.id = p_sollicitation and s.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update;
  if not found then raise exception 'Accès refusé'; end if;
  if v.statut <> 'envoyee' then
    raise exception 'Cette demande n''est plus en attente (état : %)', v.statut;
  end if;
  update public.incident_sollicitations
  set statut = 'declinee', repondue_le = now(),
      refus_motif = nullif(trim(coalesce(p_motif, '')), '')
  where id = p_sollicitation;
  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'sollicitation', (select auth.uid()),
          jsonb_build_object('sollicitation_id', p_sollicitation, 'decision', 'declinee',
                             'motif', nullif(trim(coalesce(p_motif, '')), '')));
end;
$$;
revoke execute on function public.decliner_sollicitation(uuid, text) from public, anon;

-- Le devis (module 9). Validité par défaut prise sur la consultation
-- (30 jours, modifiable par l'agence) ; au-delà, il est caduc (RM-9.2.3).
create function public.deposer_devis(
  p_sollicitation uuid, p_montant_ttc_cents bigint, p_description text,
  p_valide_jusqu_au date default null, p_storage_path text default null,
  p_mime text default null, p_taille bigint default null, p_empreinte text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v record; c record; v_devis uuid; v_doc uuid; v_echeance date;
begin
  select s.* into v from public.incident_sollicitations s
  where s.id = p_sollicitation and s.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update;
  if not found then raise exception 'Accès refusé'; end if;
  if v.statut <> 'envoyee' then
    raise exception 'Cette demande n''attend plus de devis (état : %)', v.statut;
  end if;
  if coalesce(p_montant_ttc_cents, 0) <= 0 then
    raise exception 'Indiquez le montant TTC du devis';
  end if;
  if length(trim(coalesce(p_description, ''))) = 0 then
    raise exception 'Décrivez ce que couvre le devis';
  end if;
  select * into c from public.incident_consultations where id = v.consultation_id;
  v_echeance := coalesce(p_valide_jusqu_au, (current_date + c.validite_jours)::date);
  if v_echeance <= current_date then
    raise exception 'La date de validité du devis doit être à venir';
  end if;

  if p_storage_path is not null then
    if p_storage_path not like v.organization_id::text || '/%' then
      raise exception 'Chemin de stockage invalide';
    end if;
    begin
      insert into public.documents
        (organization_id, type, titre, storage_path, mime_type, taille_octets,
         empreinte, deposited_by)
      values (v.organization_id, 'devis',
              'Devis — incident ' || (select i.numero from public.incidents i where i.id = v.incident_id),
              p_storage_path, p_mime, p_taille, p_empreinte, (select auth.uid()))
      returning id into v_doc;
    exception when unique_violation then
      raise exception 'Ce fichier a déjà été déposé';
    end;
    insert into public.document_liens (document_id, organization_id, entite, entite_id)
    values (v_doc, v.organization_id, 'organisation', v.organization_id),
           (v_doc, v.organization_id, 'incident', v.incident_id);
  end if;

  insert into public.incident_devis
    (organization_id, sollicitation_id, incident_id, artisan_id,
     montant_ttc_cents, description, valide_jusqu_au, document_id)
  values (v.organization_id, p_sollicitation, v.incident_id, v.artisan_id,
          p_montant_ttc_cents, trim(p_description), v_echeance, v_doc)
  returning id into v_devis;

  update public.incident_sollicitations
  set statut = 'devis_depose', repondue_le = now() where id = p_sollicitation;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'devis', (select auth.uid()),
          jsonb_build_object('devis_id', v_devis, 'artisan_id', v.artisan_id,
                             'montant_ttc_cents', p_montant_ttc_cents,
                             'valide_jusqu_au', v_echeance));
  return v_devis;
exception when unique_violation then
  raise exception 'Un devis a déjà été déposé pour cette demande';
end;
$$;
revoke execute on function public.deposer_devis(uuid, bigint, text, date, text, text, bigint, text) from public, anon;

-- ──────────────────────────────────────────────────────────────────────────
-- L'AGENDA INTER-AGENCES (RM-19.3.3, RM-10.7.3, RM-17.3.2)
-- La requête la plus délicate du lot : elle traverse les organisations, ce
-- qu'aucune autre requête du produit ne fait. Ce qui la rend sûre :
--   · elle ne prend PAS d'organisation en paramètre et n'en accepterait pas :
--     son seul filtre d'appartenance est `artisan_id = mon_artisan_id()` ;
--   · la liste de colonnes est fixe et minimale. Où aller (adresse, lot,
--     étage), quand (créneau), pour quoi (catégorie, description, urgence),
--     et pour le compte de qui (nom de l'agence — le logo viendra avec la
--     charte du module 17, table non construite au 2026-09-11) ;
--   · l'OCCUPANT n'apparaît qu'une fois la mission ACCEPTÉE. Tant que
--     l'artisan n'a rien accepté, il juge la mission sur l'adresse et la
--     nature du désordre ; il n'a aucune raison de connaître le nom et le
--     téléphone de quelqu'un chez qui il n'ira peut-être jamais.
--   · rien du bail, du loyer, du dépôt, du mandat, des autres lots, des
--     autres locataires, ni des autres artisans ne franchit cette projection.
-- ──────────────────────────────────────────────────────────────────────────
create function public.mon_agenda_artisan(
  p_du timestamptz default null, p_au timestamptz default null)
returns table (
  intervention_id uuid, organization_id uuid, agence_nom text,
  incident_numero text, statut public.intervention_statut,
  debut_prevu timestamptz, fin_prevue timestamptz,
  categorie text, description text, urgence public.incident_urgence, piece text,
  nature_travaux public.nature_travaux,
  adresse text, code_postal text, ville text, lot_nom text, etage text,
  occupant_nom text, occupant_prenom text, occupant_telephone text,
  montant_ttc_cents bigint, compte_rendu_depose boolean, photo_apres_deposee boolean)
language sql stable security definer set search_path = '' as $$
  select
    i.id, i.organization_id, o.name, inc.numero, i.statut,
    i.debut_prevu, i.fin_prevue,
    inc.categorie, inc.description, inc.urgence, inc.piece, i.nature_travaux,
    b.address_line1, b.postal_code, b.city, l.nom, l.etage,
    -- Ni avant l'acceptation, ni après la fin : le contact de l'occupant n'est
    -- lisible que pendant la mission vivante. Une fois le travail terminé,
    -- l'artisan garde sa ligne d'agenda (son historique) mais plus le
    -- téléphone de quelqu'un chez qui il n'a plus à se rendre.
    case when i.statut in ('acceptee','planifiee','en_cours') then pe.nom end,
    case when i.statut in ('acceptee','planifiee','en_cours') then pe.prenom end,
    case when i.statut in ('acceptee','planifiee','en_cours') then pe.telephone end,
    d.montant_ttc_cents,
    exists (select 1 from public.intervention_comptes_rendus cr where cr.intervention_id = i.id),
    exists (select 1 from public.intervention_photos ip
            where ip.intervention_id = i.id and ip.moment = 'apres')
  from public.incident_interventions i
  join public.incidents inc on inc.id = i.incident_id
  join public.lots l on l.id = inc.lot_id
  join public.biens b on b.id = l.bien_id
  join public.organizations o on o.id = i.organization_id
  left join public.incident_devis d on d.id = i.devis_id
  left join public.baux ba on ba.id = inc.bail_id
  left join public.persons pe on pe.id = ba.locataire_principal
  where i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
    and i.statut in ('proposee', 'acceptee', 'planifiee', 'en_cours', 'terminee')
    and (p_du is null or i.debut_prevu is null or i.debut_prevu >= p_du)
    and (p_au is null or i.debut_prevu is null or i.debut_prevu < p_au)
  order by i.debut_prevu nulls first, i.confiee_le;
$$;
revoke execute on function public.mon_agenda_artisan(timestamptz, timestamptz) from public, anon;
comment on function public.mon_agenda_artisan(timestamptz, timestamptz) is
  'Agenda toutes agences confondues de l''artisan connecté (RM-19.3.3). Traverse les organisations ; son seul filtre d''appartenance est mon_artisan_id(), déduit de auth.uid() et non passé en paramètre.';

-- A5 module 7 : affecté → en cours (acceptation de l'artisan) ou retour à
-- qualifié (refus). Le refus entraîne la RÉAFFECTATION : l'incident revient
-- dans la file de l'agence, avec une alerte qui le dit.
create function public.accepter_mission(p_intervention uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  select i.* into v from public.incident_interventions i
  where i.id = p_intervention and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update;
  if not found then raise exception 'Accès refusé'; end if;
  if v.statut <> 'proposee' then
    raise exception 'Cette mission n''est plus à accepter (état : %)', v.statut;
  end if;

  update public.incident_interventions
  set statut = 'acceptee', acceptee_le = now() where id = p_intervention;
  update public.incidents set etat = 'en_cours'
  where id = v.incident_id and etat = 'affecte';

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'mission_acceptee', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'artisan_id', v.artisan_id));
end;
$$;
revoke execute on function public.accepter_mission(uuid) from public, anon;

create function public.refuser_mission(p_intervention uuid, p_motif text)
returns void language plpgsql security definer set search_path = '' as $$
declare v record; v_numero text;
begin
  if length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Dites pourquoi vous refusez — l''agence doit réaffecter en connaissance de cause';
  end if;
  select i.* into v from public.incident_interventions i
  where i.id = p_intervention and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update;
  if not found then raise exception 'Accès refusé'; end if;
  if v.statut not in ('proposee', 'acceptee') then
    raise exception 'Cette mission ne se refuse plus (état : %) — prévenez l''agence', v.statut;
  end if;

  update public.incident_interventions
  set statut = 'refusee', refusee_le = now(), refus_motif = trim(p_motif)
  where id = p_intervention;
  -- Le devis retenu tombe avec la mission refusée : il ne désigne plus personne.
  update public.incident_devis set statut = 'annule'
  where id = v.devis_id and statut = 'retenu';
  update public.intervention_creneaux set statut = 'caduc'
  where intervention_id = p_intervention and statut in ('propose', 'retenu');
  -- Retour à `qualifie` : l'imputation reste, l'affectation est à refaire.
  select numero into v_numero from public.incidents where id = v.incident_id;
  update public.incidents set etat = 'qualifie'
  where id = v.incident_id and etat in ('affecte', 'en_cours');

  -- `lot_id` n'est pas décoratif : c'est par lui que la politique restrictive
  -- alerts_agent_portefeuille borne l'alerte au portefeuille de l'agent
  -- (alerte_dans_portefeuille ne sait scoper que par bail_id/lot_id/person_id,
  -- et retombe sinon sur « visible de tous »). Constat du 2026-09-11.
  insert into public.alerts (organization_id, type, criticite, titre, details,
                             origine_type, origine_id)
  values (v.organization_id, 'artisan_a_reaffecter', 'critique',
          'Artisan à réaffecter — incident ' || coalesce(v_numero, ''),
          jsonb_build_object('incident_id', v.incident_id,
                             'lot_id', (select i2.lot_id from public.incidents i2
                                        where i2.id = v.incident_id),
                             'intervention_id', p_intervention,
                             'libelle', 'Mission refusée : ' || trim(p_motif)),
          'intervention', p_intervention);

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'mission_refusee', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'motif', trim(p_motif)));
end;
$$;
revoke execute on function public.refuser_mission(uuid, text) from public, anon;

-- RM-10.1.1 : l'artisan propose EN PREMIER, trois créneaux au minimum —
-- bloquant. Le minimum n'est tenable que si les trois arrivent ensemble :
-- d'où le paramètre tableau, et non trois appels qu'on pourrait interrompre.
-- RM-10.4.1 : au-delà de six créneaux refusés, on n'échange plus de créneaux,
-- le gérant arbitre au téléphone.
create function public.proposer_creneaux(p_intervention uuid, p_creneaux jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v record; v_nb integer; v_refuses integer; v_tour integer; c jsonb;
begin
  select i.* into v from public.incident_interventions i
  where i.id = p_intervention and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update;
  if not found then raise exception 'Accès refusé'; end if;
  if v.statut not in ('acceptee', 'planifiee') then
    raise exception 'Acceptez la mission avant de proposer des créneaux (état : %)', v.statut;
  end if;
  v_nb := jsonb_array_length(coalesce(p_creneaux, '[]'::jsonb));
  if v_nb < 3 then
    raise exception 'Proposez au moins trois créneaux (RM-10.1.1) — vous en avez proposé %', v_nb;
  end if;

  select count(*) into v_refuses from public.intervention_creneaux
  where intervention_id = p_intervention and statut = 'refuse';
  if v_refuses >= 6 then
    raise exception 'Six créneaux ont déjà été refusés : le rendez-vous se règle désormais avec le gérant (RM-10.4.1)';
  end if;

  select coalesce(max(tour), 0) + 1 into v_tour
  from public.intervention_creneaux where intervention_id = p_intervention;
  update public.intervention_creneaux set statut = 'caduc'
  where intervention_id = p_intervention and statut = 'propose';

  for c in select jsonb_array_elements(p_creneaux) loop
    insert into public.intervention_creneaux
      (organization_id, intervention_id, propose_par, tour, debut, fin, created_by)
    values (v.organization_id, p_intervention, 'artisan', v_tour,
            (c->>'debut')::timestamptz, (c->>'fin')::timestamptz, (select auth.uid()));
  end loop;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'creneaux_proposes', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'par', 'artisan',
                             'tour', v_tour, 'nombre', v_nb));
  return v_nb;
end;
$$;
revoke execute on function public.proposer_creneaux(uuid, jsonb) from public, anon;

create function public.demarrer_intervention(p_intervention uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  select i.* into v from public.incident_interventions i
  where i.id = p_intervention and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update;
  if not found then raise exception 'Accès refusé'; end if;
  if v.statut not in ('acceptee', 'planifiee') then
    raise exception 'Cette mission ne démarre pas depuis l''état « % »', v.statut;
  end if;
  update public.incident_interventions
  set statut = 'en_cours', demarree_le = now() where id = p_intervention;
  update public.incidents set etat = 'en_cours'
  where id = v.incident_id and etat = 'affecte';
  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'intervention_demarree', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention));
end;
$$;
revoke execute on function public.demarrer_intervention(uuid) from public, anon;

-- La photo du chantier. Elle entre dans la GED de l'agence et se rattache à
-- l'incident : le locataire consulte la photo du travail réalisé AVANT de
-- noter (RM-11.1). Le plafond de dix photos de joindre_photo_incident n'est
-- PAS repris ici : il vise les photos de déclaration, et il ne doit jamais
-- pouvoir empêcher la photo obligatoire de RM-7.5.2 — sans elle, pas de fin
-- d'intervention, donc pas de facture. Le plafond est ici par intervention.
create function public.deposer_photo_intervention(
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
            'Chantier (' || p_moment || ') — ' || v_numero,
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

-- LE COMPTE RENDU — et RM-7.5.2 tenue par la base.
-- Le déclencheur incident_interventions_cloture refuserait de toute façon le
-- passage à `terminee` sans photo d'après ; la RPC le dit en clair AVANT,
-- pour que l'artisan lise une phrase utile plutôt qu'une erreur de base.
-- RM-7.5.3 : s'il signale une cause différente de celle supposée, l'alerte de
-- révision d'imputation s'ouvre pour l'agent — AVANT facturation.
create function public.deposer_compte_rendu(
  p_intervention uuid, p_travaux text, p_cause_reelle text default null,
  p_imputation_suggeree public.incident_imputation default null,
  p_montant_final_cents bigint default null,
  p_nouvelle_intervention boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v record; v_cr uuid; v_numero text; v_imputation public.incident_imputation;
begin
  select i.* into v from public.incident_interventions i
  where i.id = p_intervention and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update;
  if not found then raise exception 'Accès refusé'; end if;
  if v.statut <> 'en_cours' then
    raise exception 'Démarrez l''intervention avant d''en rendre compte (état : %)', v.statut;
  end if;
  if length(trim(coalesce(p_travaux, ''))) = 0 then
    raise exception 'Dites ce que vous avez fait — le compte rendu conditionne la facturation';
  end if;
  if not exists (select 1 from public.intervention_photos ip
                 where ip.intervention_id = p_intervention and ip.moment = 'apres') then
    raise exception 'Ajoutez la photo du travail réalisé : sans elle, l''intervention ne peut pas être terminée (RM-7.5.2)';
  end if;

  insert into public.intervention_comptes_rendus
    (organization_id, intervention_id, artisan_id, travaux_realises,
     cause_reelle, imputation_suggeree, montant_final_cents,
     nouvelle_intervention_necessaire)
  values (v.organization_id, p_intervention, v.artisan_id, trim(p_travaux),
          nullif(trim(coalesce(p_cause_reelle, '')), ''), p_imputation_suggeree,
          p_montant_final_cents, coalesce(p_nouvelle_intervention, false))
  returning id into v_cr;

  update public.incident_interventions
  set statut = 'terminee', terminee_le = now() where id = p_intervention;

  select numero, imputation into v_numero, v_imputation
  from public.incidents where id = v.incident_id;
  update public.incidents set etat = 'termine'
  where id = v.incident_id and etat = 'en_cours';

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'compte_rendu', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention,
                             'cause_reelle', nullif(trim(coalesce(p_cause_reelle, '')), ''),
                             'imputation_suggeree', p_imputation_suggeree,
                             'montant_final_cents', p_montant_final_cents));

  -- RM-7.5.3 : « l'artisan est le seul à voir la cause réelle ». Une cause
  -- suggérée qui diffère de l'imputation posée ouvre l'alerte de révision.
  if p_imputation_suggeree is not null and p_imputation_suggeree is distinct from v_imputation then
    insert into public.alerts (organization_id, type, criticite, titre, details,
                               origine_type, origine_id)
    values (v.organization_id, 'incident_imputation_a_reviser', 'critique',
            'Imputation à réviser avant facturation — ' || v_numero,
            jsonb_build_object('incident_id', v.incident_id,
                               'lot_id', (select i2.lot_id from public.incidents i2
                                          where i2.id = v.incident_id),
                               'intervention_id', p_intervention,
                               'imputation_suggeree', p_imputation_suggeree,
                               'libelle', 'L''artisan signale une cause différente : '
                                          || trim(coalesce(p_cause_reelle, ''))),
            'intervention', p_intervention);
  end if;
  return v_cr;
exception when unique_violation then
  raise exception 'Le compte rendu de cette intervention a déjà été déposé';
end;
$$;
revoke execute on function public.deposer_compte_rendu(uuid, text, text, public.incident_imputation, bigint, boolean) from public, anon;

-- ══════════════════════════════════════════════════════════════════════════
-- 10. RPC DE L'ÉCRAN LOCATAIRE
--     Le locataire choisit son créneau et note l'intervention. Il ne
--     sélectionne AUCUN devis (module 8 : « ni le locataire ni Gerimmo
--     n'approuvent l'intervention ») et ne voit aucun montant.
-- ══════════════════════════════════════════════════════════════════════════

create function public.mes_creneaux_locataire(p_org uuid)
returns table (
  creneau_id uuid, intervention_id uuid, incident_numero text,
  categorie text, debut timestamptz, fin timestamptz, tour integer,
  propose_par public.creneau_auteur, artisan_raison_sociale text)
language sql stable security definer set search_path = '' as $$
  select cr.id, cr.intervention_id, i.numero, i.categorie, cr.debut, cr.fin,
         cr.tour, cr.propose_par, a.raison_sociale
  from public.intervention_creneaux cr
  join public.incident_interventions iv on iv.id = cr.intervention_id
  join public.incidents i on i.id = iv.incident_id
  join public.artisans a on a.id = iv.artisan_id
  where cr.organization_id = p_org and cr.statut = 'propose'
    and cr.propose_par = 'artisan'
    and i.bail_id in (
      select b.id from public.baux b
      where b.organization_id = p_org and b.etat in ('actif', 'preavis')
        and (b.locataire_principal = public.ma_personne_locataire(p_org)
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.role = 'colocataire'
                          and bp.person_id = public.ma_personne_locataire(p_org))))
    and public.ma_personne_locataire(p_org) is not null
  order by cr.debut;
$$;
revoke execute on function public.mes_creneaux_locataire(uuid) from public, anon;

create function public.choisir_creneau(p_org uuid, p_creneau uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v record; v_autorise boolean;
begin
  if public.ma_personne_locataire(p_org) is null then
    raise exception 'Accès refusé';
  end if;
  select cr.*, iv.incident_id, iv.statut as statut_intervention
  into v from public.intervention_creneaux cr
  join public.incident_interventions iv on iv.id = cr.intervention_id
  where cr.id = p_creneau and cr.organization_id = p_org for update of cr;
  if not found then raise exception 'Créneau introuvable'; end if;
  if v.statut <> 'propose' then
    raise exception 'Ce créneau n''est plus proposé';
  end if;

  -- Le créneau doit porter sur SON incident : la garde d'appartenance.
  select exists (
    select 1 from public.incidents i
    join public.baux b on b.id = i.bail_id
    where i.id = v.incident_id and i.organization_id = p_org
      and (b.locataire_principal = public.ma_personne_locataire(p_org)
           or exists (select 1 from public.bail_personnes bp
                      where bp.bail_id = b.id and bp.role = 'colocataire'
                        and bp.person_id = public.ma_personne_locataire(p_org)))
  ) into v_autorise;
  if not v_autorise then raise exception 'Accès refusé'; end if;

  update public.intervention_creneaux set statut = 'retenu' where id = p_creneau;
  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
  where intervention_id = v.intervention_id and id <> p_creneau and statut = 'propose';
  update public.incident_interventions
  set statut = 'planifiee', debut_prevu = v.debut, fin_prevue = v.fin
  where id = v.intervention_id;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v.incident_id, 'creneau_retenu', (select auth.uid()),
          jsonb_build_object('intervention_id', v.intervention_id,
                             'creneau_id', p_creneau, 'debut', v.debut, 'par', 'locataire'));
end;
$$;
revoke execute on function public.choisir_creneau(uuid, uuid) from public, anon;

-- RM-10.2.2 : « il refuse tout, mais doit alors proposer trois créneaux » —
-- c'est la contrainte qui fait converger en deux tours. Un refus sec, sans
-- contre-proposition, n'existe donc pas : la RPC exige les trois.
create function public.contre_proposer_creneaux(
  p_org uuid, p_intervention uuid, p_creneaux jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v record; v_nb integer; v_refuses integer; v_tour integer; c jsonb; v_autorise boolean;
begin
  if public.ma_personne_locataire(p_org) is null then
    raise exception 'Accès refusé';
  end if;
  select iv.* into v from public.incident_interventions iv
  where iv.id = p_intervention and iv.organization_id = p_org for update;
  if not found then raise exception 'Intervention introuvable'; end if;

  select exists (
    select 1 from public.incidents i
    join public.baux b on b.id = i.bail_id
    where i.id = v.incident_id and i.organization_id = p_org
      and (b.locataire_principal = public.ma_personne_locataire(p_org)
           or exists (select 1 from public.bail_personnes bp
                      where bp.bail_id = b.id and bp.role = 'colocataire'
                        and bp.person_id = public.ma_personne_locataire(p_org)))
  ) into v_autorise;
  if not v_autorise then raise exception 'Accès refusé'; end if;

  v_nb := jsonb_array_length(coalesce(p_creneaux, '[]'::jsonb));
  if v_nb < 3 then
    raise exception 'Si aucun créneau ne convient, proposez-en trois à votre tour (RM-10.2.2) — vous en avez proposé %', v_nb;
  end if;

  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
  where intervention_id = p_intervention and statut = 'propose';

  select count(*) into v_refuses from public.intervention_creneaux
  where intervention_id = p_intervention and statut = 'refuse';
  select coalesce(max(tour), 0) + 1 into v_tour
  from public.intervention_creneaux where intervention_id = p_intervention;

  for c in select jsonb_array_elements(p_creneaux) loop
    insert into public.intervention_creneaux
      (organization_id, intervention_id, propose_par, tour, debut, fin, created_by)
    values (p_org, p_intervention, 'locataire', v_tour,
            (c->>'debut')::timestamptz, (c->>'fin')::timestamptz, (select auth.uid()));
  end loop;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v.incident_id, 'creneaux_proposes', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'par', 'locataire',
                             'tour', v_tour, 'nombre', v_nb, 'refuses_cumules', v_refuses));

  -- RM-10.4.1 : au sixième refus, le gérant reprend la main. Les créneaux
  -- refusés restent en base — RM-10.4.4, le refus persistant est opposable.
  if v_refuses >= 6 then
    insert into public.alerts (organization_id, type, criticite, titre, details,
                               origine_type, origine_id)
    values (p_org, 'creneaux_arbitrage', 'critique',
            'Rendez-vous à arbitrer — ' ||
              (select numero from public.incidents where id = v.incident_id),
            jsonb_build_object('incident_id', v.incident_id,
                               'lot_id', (select i2.lot_id from public.incidents i2
                                          where i2.id = v.incident_id),
                               'intervention_id', p_intervention,
                               'libelle', v_refuses || ' créneaux refusés : réglez le rendez-vous par téléphone (RM-10.4.1)'),
            'intervention', p_intervention);
  end if;
  return v_nb;
end;
$$;
revoke execute on function public.contre_proposer_creneaux(uuid, uuid, jsonb) from public, anon;

-- RM-11.1 : le locataire note ce qu'il a vu sur place — jamais le prix, jamais
-- la technique. « Obligatoire ne veut pas dire bloquant » : rien ici ne bloque
-- son espace, et sans réponse la note reste simplement absente du calcul.
create function public.noter_artisan_locataire(
  p_org uuid, p_intervention uuid, p_note smallint, p_commentaire text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v record; v_eval uuid; v_autorise boolean;
begin
  if public.ma_personne_locataire(p_org) is null then
    raise exception 'Accès refusé';
  end if;
  select iv.* into v from public.incident_interventions iv
  where iv.id = p_intervention and iv.organization_id = p_org;
  if not found then raise exception 'Intervention introuvable'; end if;
  if v.statut <> 'terminee' then
    raise exception 'On note une intervention terminée';
  end if;
  if p_note is null or p_note < 1 or p_note > 5 then
    raise exception 'Donnez une note de 1 à 5';
  end if;

  select exists (
    select 1 from public.incidents i
    join public.baux b on b.id = i.bail_id
    where i.id = v.incident_id and i.organization_id = p_org
      and (b.locataire_principal = public.ma_personne_locataire(p_org)
           or exists (select 1 from public.bail_personnes bp
                      where bp.bail_id = b.id and bp.role = 'colocataire'
                        and bp.person_id = public.ma_personne_locataire(p_org)))
  ) into v_autorise;
  if not v_autorise then raise exception 'Accès refusé'; end if;

  insert into public.artisan_evaluations
    (organization_id, intervention_id, artisan_id, source, note_globale,
     commentaire, evaluateur_account_id)
  values (p_org, p_intervention, v.artisan_id, 'locataire', p_note,
          nullif(trim(coalesce(p_commentaire, '')), ''), (select auth.uid()))
  returning id into v_eval;
  return v_eval;
exception when unique_violation then
  raise exception 'Vous avez déjà noté cette intervention';
end;
$$;
revoke execute on function public.noter_artisan_locataire(uuid, uuid, smallint, text) from public, anon;

-- ══════════════════════════════════════════════════════════════════════════
-- 11. LA PREMIÈRE DES DEUX APPROBATIONS — LE DROIT D'EXISTER
--     Validation PLATEFORME : au niveau de la PERSONNE, par le SUPER ADMIN
--     seul (jamais par une agence, jamais par intervention). À ne pas
--     confondre avec retenir_devis, qui est l'autre approbation.
--     Décision du 2026-09-04 : le réseau artisan devient un service de la
--     plateforme, l'artisan s'auto-inscrit, et le super admin valide avant
--     toute première affectation.
-- ══════════════════════════════════════════════════════════════════════════

create function public.inscrire_mon_entreprise_artisan(
  p_raison_sociale text, p_siret text, p_telephone text, p_email text,
  p_metiers public.artisan_metier[], p_codes_postaux text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_artisan uuid;
begin
  if (select auth.uid()) is null then raise exception 'Accès refusé'; end if;
  if public.mon_artisan_id() is not null then
    raise exception 'Votre compte porte déjà une fiche artisan';
  end if;
  if coalesce(array_length(p_metiers, 1), 0) = 0 then
    raise exception 'Choisissez au moins un métier';
  end if;
  if length(trim(coalesce(p_telephone, ''))) = 0 then
    raise exception 'Votre mobile est obligatoire — c''est par lui qu''on vous joint sur le chantier';
  end if;

  -- RM-8.1.5 : le SIRET est unique. Si la fiche existe déjà (créée par une
  -- agence qui l'a invité), l'inscription la RÉCLAME au lieu d'en créer une
  -- seconde — c'est le « rattaché, jamais dupliqué » vu du côté de l'artisan.
  update public.artisans
  set account_id = (select auth.uid()),
      telephone = trim(p_telephone),
      email = coalesce(nullif(trim(coalesce(p_email, '')), ''), email),
      purge_prevue_le = (current_date + interval '6 months')::date
  where siret = trim(p_siret) and account_id is null
  returning id into v_artisan;

  if v_artisan is null then
    insert into public.artisans
      (account_id, raison_sociale, siret, telephone, email, purge_prevue_le)
    values ((select auth.uid()), trim(p_raison_sociale), trim(p_siret),
            trim(p_telephone), nullif(trim(coalesce(p_email, '')), ''),
            (current_date + interval '6 months')::date)
    returning id into v_artisan;
  end if;

  insert into public.artisan_metiers (artisan_id, metier)
  select v_artisan, unnest(p_metiers) on conflict do nothing;
  insert into public.artisan_zones (artisan_id, code_postal)
  select v_artisan, trim(unnest(coalesce(p_codes_postaux, array[]::text[])))
  on conflict do nothing;
  return v_artisan;
exception when unique_violation then
  raise exception 'Ce SIRET est déjà inscrit sur la plateforme';
end;
$$;
revoke execute on function public.inscrire_mon_entreprise_artisan(text, text, text, text, public.artisan_metier[], text[]) from public, anon;

create function public.artisans_a_valider()
returns table (
  artisan_id uuid, raison_sociale text, siret text,
  siret_etat public.artisan_siret_etat, telephone text, email text,
  statut_plateforme public.artisan_statut_plateforme,
  metiers public.artisan_metier[], nb_pieces integer,
  decennale_valide boolean, rc_pro_deposee boolean,
  inscrit_le timestamptz, purge_prevue_le date)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'Accès refusé'; end if;
  return query
    select a.id, a.raison_sociale, a.siret, a.siret_etat, a.telephone, a.email,
           a.statut_plateforme,
           (select array_agg(am.metier order by am.metier) from public.artisan_metiers am
            where am.artisan_id = a.id),
           (select count(*)::integer from public.artisan_pieces p
            where p.artisan_id = a.id and p.retiree_le is null),
           public.artisan_decennale_valide(a.id),
           exists (select 1 from public.artisan_pieces p
                   where p.artisan_id = a.id and p.type = 'rc_pro'
                     and p.retiree_le is null
                     and (p.expire_le is null or p.expire_le >= current_date)),
           a.created_at, a.purge_prevue_le
    from public.artisans a
    where a.statut_plateforme = 'en_attente'
    order by a.created_at;
end;
$$;
revoke execute on function public.artisans_a_valider() from public, anon;

create function public.artisan_decider_plateforme(
  p_artisan uuid, p_decision public.artisan_decision_plateforme, p_motif text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_en_cours integer;
begin
  if not public.is_super_admin() then
    raise exception 'Accès refusé — la validation plateforme appartient au super admin seul (RM-8.5.3)';
  end if;
  if p_decision in ('refus', 'blacklist_globale')
     and length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Un refus et une liste noire globale se motivent sur des faits objectifs';
  end if;
  -- « Vérifié » est le seul état de SIRET affectable (RM-A1.9, corrigée le
  -- 2026-09-04). Valider un artisan dont le SIRET ne l'est pas le rendrait
  -- « valide » et pourtant proposable nulle part, sans que rien ne le dise :
  -- une impasse silencieuse. On la refuse avec le geste qui manque.
  if p_decision = 'validation'
     and (select a.siret_etat from public.artisans a where a.id = p_artisan) <> 'verifie' then
    raise exception 'Vérifiez d''abord le SIRET : un artisan validé dont le SIRET ne l''est pas ne serait proposé à aucune agence (RM-A1.9)';
  end if;

  if p_decision = 'blacklist_globale' then
    select count(*) into v_en_cours from public.incident_interventions i
    where i.artisan_id = p_artisan and i.statut in ('acceptee', 'planifiee', 'en_cours');
    if v_en_cours > 0 then
      raise exception 'Cet artisan a % intervention(s) en cours — une intervention en cours n''est jamais interrompue (RM-8.2.7)', v_en_cours;
    end if;
  end if;

  update public.artisans a set
    statut_plateforme = case p_decision
      when 'validation' then 'valide'
      when 'refus' then 'refuse'
      when 'remise_en_attente' then 'en_attente'
      else a.statut_plateforme end::public.artisan_statut_plateforme,
    statut_motif = case when p_decision in ('validation','refus','remise_en_attente')
      then nullif(trim(coalesce(p_motif, '')), '') else a.statut_motif end,
    statut_decide_le = case when p_decision in ('validation','refus','remise_en_attente')
      then now() else a.statut_decide_le end,
    statut_decide_par = case when p_decision in ('validation','refus','remise_en_attente')
      then (select auth.uid()) else a.statut_decide_par end,
    blacklist_globale_le = case p_decision
      when 'blacklist_globale' then now()
      when 'levee_blacklist' then null else a.blacklist_globale_le end,
    blacklist_globale_motif = case p_decision
      when 'blacklist_globale' then trim(p_motif)
      when 'levee_blacklist' then null else a.blacklist_globale_motif end,
    blacklist_globale_par = case p_decision
      when 'blacklist_globale' then (select auth.uid())
      when 'levee_blacklist' then null else a.blacklist_globale_par end,
    -- A2 corrige RM-8.5.6 : le motif d'une blacklist globale se conserve
    -- 5 ans, « la sanction la plus lourde justifiant la trace la plus
    -- longue » — pas indéfiniment.
    purge_motif_le = case p_decision
      when 'blacklist_globale' then (current_date + interval '5 years')::date
      when 'levee_blacklist' then null else a.purge_motif_le end,
    -- Une validation solde la purge des inscriptions sans suite.
    purge_prevue_le = case when p_decision = 'validation' then null else a.purge_prevue_le end
  where a.id = p_artisan;
  if not found then raise exception 'Artisan introuvable'; end if;

  if p_decision = 'blacklist_globale' then
    update public.incident_devis set statut = 'annule'
    where artisan_id = p_artisan and statut = 'depose';
    update public.incident_sollicitations set statut = 'annulee', repondue_le = now()
    where artisan_id = p_artisan and statut in ('envoyee', 'devis_depose');
  end if;

  insert into public.artisan_validations (artisan_id, decision, motif, decide_par)
  values (p_artisan, p_decision, nullif(trim(coalesce(p_motif, '')), ''), (select auth.uid()));
end;
$$;
revoke execute on function public.artisan_decider_plateforme(uuid, public.artisan_decision_plateforme, text) from public, anon;

-- RM-A1.9 : l'état du SIRET est un constat de vérification, pas un choix
-- d'agence. Seul le super admin le pose — « vérifié » est le seul état
-- affectable (décision du 2026-09-04).
create function public.artisan_definir_siret_etat(
  p_artisan uuid, p_etat public.artisan_siret_etat)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'Accès refusé'; end if;
  update public.artisans set siret_etat = p_etat where id = p_artisan;
  if not found then raise exception 'Artisan introuvable'; end if;
exception when check_violation then
  raise exception 'Cet artisan est publié : retirez sa publication avant de dévalider son SIRET';
end;
$$;
revoke execute on function public.artisan_definir_siret_etat(uuid, public.artisan_siret_etat) from public, anon;

-- RM-11.4.4 : la contestation de note se règle auprès du super admin —
-- « l'agence est juge et partie ». Le retrait d'une note entraîne le recalcul
-- (il est automatique : artisan_note ignore les évaluations retirées).
create function public.retirer_evaluation(p_evaluation uuid, p_motif text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then
    raise exception 'Accès refusé — le retrait d''une note appartient au super admin (RM-11.4.4)';
  end if;
  if length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Le motif du retrait est obligatoire';
  end if;
  update public.artisan_evaluations
  set retiree_le = now(), retrait_motif = trim(p_motif), retiree_par = (select auth.uid())
  where id = p_evaluation and retiree_le is null;
  if not found then raise exception 'Évaluation introuvable ou déjà retirée'; end if;
end;
$$;
revoke execute on function public.retirer_evaluation(uuid, text) from public, anon;

-- Entretien : caducité des devis (RM-9.2.3) et purge des motifs de liste noire
-- (A2 : 3 ans en local, 5 ans en global). Réservé au super admin — c'est une
-- tâche de plateforme, appelée par une planification, pas par un écran.
create function public.maintenance_artisans()
returns table (devis_expires integer, motifs_purges integer)
language plpgsql security definer set search_path = '' as $$
declare v_devis integer; v_motifs integer; v_n integer;
begin
  if not public.is_super_admin() then raise exception 'Accès refusé'; end if;

  update public.incident_devis set statut = 'expire'
  where statut = 'depose' and valide_jusqu_au < current_date;
  get diagnostics v_devis = row_count;

  update public.incident_sollicitations s set statut = 'expiree'
  where s.statut in ('envoyee', 'devis_depose')
    and exists (select 1 from public.incident_devis d
                where d.sollicitation_id = s.id and d.statut = 'expire');

  -- A2 : « au-delà, un artisan doit pouvoir repartir sans que son passé le
  -- suive ». Purger le seul motif laisserait une liste noire sans motif — ce
  -- que la contrainte interdit, et à juste titre : une sanction sans motif
  -- n'est plus opposable. La purge LÈVE donc la mesure. Localement, la
  -- relation retombe sur « désactivée » (neutre, sans motif) : l'agence
  -- décide de la réactiver ou non, mais elle ne le sanctionne plus.
  update public.artisan_agences
  set blacklist_le = null, blacklist_motif = null, blacklist_par = null,
      purge_motif_le = null
  where purge_motif_le is not null and purge_motif_le <= current_date;
  get diagnostics v_motifs = row_count;

  update public.artisans
  set blacklist_globale_le = null, blacklist_globale_motif = null,
      blacklist_globale_par = null, purge_motif_le = null
  where purge_motif_le is not null and purge_motif_le <= current_date
    and blacklist_globale_le is not null;
  get diagnostics v_n = row_count;

  return query select v_devis, v_motifs + v_n;
end;
$$;
revoke execute on function public.maintenance_artisans() from public, anon;

-- ══════════════════════════════════════════════════════════════════════════
-- 11 bis. LE STOCKAGE — sans quoi rien de tout cela ne se dépose
--   Constat du 2026-09-11 : le bucket `documents` porte six politiques
--   (ged_*), toutes écrites pour les gestionnaires ou le locataire. Aucune ne
--   connaît l'artisan : sans les trois qui suivent, ses RPC écriraient bien la
--   fiche en base mais l'envoi du FICHIER serait refusé — la photo obligatoire
--   de RM-7.5.2 ne pourrait jamais arriver, et le compte rendu non plus.
--
--   Deux espaces, deux logiques, et c'est voulu :
--     · `<organization_id>/…` — les photos de chantier et les devis : ce sont
--       des pièces d'AGENCE, elles vivent dans son dossier, sous sa rétention.
--       L'artisan n'y écrit que pendant une mission vivante, et n'y relit que
--       les fichiers que ses propres missions réclament.
--     · `artisans/<artisan_id>/…` — ses PIÈCES JUSTIFICATIVES, globales
--       (RM-8.2.8) : hors de tout dossier d'agence, puisqu'elles valent pour
--       toutes. Le premier segment n'étant pas un UUID d'organisation,
--       purger_fichier_sans_fiche ne peut pas les atteindre (il exige un UUID
--       d'agence gérée) — vérifié le 2026-09-11.
-- ══════════════════════════════════════════════════════════════════════════

-- Les agences où l'artisan a une mission VIVANTE. Le droit d'écrire un fichier
-- suit la mission, comme le droit de lire les données la suit (règle 3).
create function public.orgs_de_mes_missions()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct i.organization_id
  from public.incident_interventions i
  where i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
    and i.statut in ('acceptee', 'planifiee', 'en_cours');
$$;
revoke execute on function public.orgs_de_mes_missions() from public, anon;

-- Les chemins que l'artisan a le droit de RELIRE : les photos et devis de ses
-- propres missions (jamais ceux d'un confrère sur le même incident), et ses
-- pièces à lui. Même forme que chemins_pieces_locataire.
create function public.chemins_fichiers_artisan()
returns setof text language sql stable security definer set search_path = '' as $$
  select d.storage_path
  from public.intervention_photos ip
  join public.incident_interventions i on i.id = ip.intervention_id
  join public.documents d on d.id = ip.document_id
  where i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
    and d.purged_at is null and d.storage_path is not null
  union
  select d.storage_path
  from public.incident_devis dv
  join public.documents d on d.id = dv.document_id
  where dv.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
    and d.purged_at is null and d.storage_path is not null
  union
  select p.storage_path
  from public.artisan_pieces p
  where p.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null;
$$;
revoke execute on function public.chemins_fichiers_artisan() from public, anon;

-- Écriture : le dossier d'une agence où il a une mission vivante, ou son
-- propre dossier de pièces. Rien d'autre.
create policy ged_insert_artisan on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] in (
        select o::text from public.orgs_de_mes_missions() o)
      or (public.mon_artisan_id() is not null
          and name like 'artisans/' || public.mon_artisan_id()::text || '/%')
    )
  );

create policy ged_select_artisan on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      name in (select public.chemins_fichiers_artisan())
      or (public.mon_artisan_id() is not null
          and name like 'artisans/' || public.mon_artisan_id()::text || '/%')
    )
  );

-- Le super admin relit les pièces d'un artisan : c'est lui qui les contrôle
-- avant de valider (RM-8.2, pivot du 2026-09-04). ged_select ne le couvre pas,
-- car ces fichiers n'ont volontairement aucune fiche dans public.documents.
create policy ged_select_artisan_sa on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and name like 'artisans/%'
    and (select public.is_super_admin())
  );

-- ══════════════════════════════════════════════════════════════════════════
-- 12. CONTRÔLES DE LA MIGRATION ELLE-MÊME
--     Trois vérifications qui échouent la migration plutôt que de laisser
--     passer un défaut silencieux. Elles rejouent en petit ce que le test de
--     socle vérifie à chaque livraison.
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare v_tables text[] := array[
  'artisans', 'artisan_metiers', 'artisan_zones', 'artisan_pieces',
  'artisan_validations', 'artisan_agences', 'incident_consultations',
  'incident_sollicitations', 'incident_devis', 'incident_interventions',
  'intervention_creneaux', 'intervention_comptes_rendus',
  'intervention_photos', 'artisan_evaluations'];
  restes text;
begin
  -- 1. RLS active et au moins une politique partout.
  select string_agg(t, ', ') into restes from unnest(v_tables) t
  where not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t and c.relrowsecurity)
     or not exists (
    select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t);
  if restes is not null then
    raise exception 'Tables sans RLS ou sans politique : %', restes;
  end if;

  -- 2. anon n'écrit nulle part (les privilèges par défaut de Supabase les
  --    accordent tout seuls à chaque nouvelle table — constat du 2026-09-10).
  select string_agg(format('%s/%s', t, p), ', ') into restes
  from unnest(v_tables) t
  cross join lateral (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
                             ('REFERENCES'), ('TRIGGER'), ('SELECT')) as x(p)
  where has_table_privilege('anon', ('public.' || quote_ident(t))::regclass, p);
  if restes is not null then
    raise exception 'anon conserve des privilèges sur les tables artisans : %', restes;
  end if;

  -- 3. `authenticated` ne reçoit QUE select : toutes les écritures passent par
  --    les RPC, qui portent chacune leur garde.
  select string_agg(format('%s/%s', t, p), ', ') into restes
  from unnest(v_tables) t
  cross join lateral (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as x(p)
  where has_table_privilege('authenticated', ('public.' || quote_ident(t))::regclass, p);
  if restes is not null then
    raise exception 'authenticated peut écrire en direct : %', restes;
  end if;
end $$;

-- 4. Aucune politique de ce produit ne nomme le rôle `artisan` : c'est la
--    règle 1 du préambule, et elle se vérifie.
do $$
declare restes text;
begin
  select string_agg(format('%s.%s', schemaname, policyname), ', ') into restes
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%''artisan''%';
  if restes is not null then
    raise exception 'Une politique RLS nomme le rôle artisan — son accès doit passer par les RPC : %', restes;
  end if;
end $$;

-- 4 bis. Les auxiliaires qui prennent un artisan en paramètre sans contrôler
--        d'appartenance ne sont exposés à personne (le test d'étanchéité des
--        RPC vérifie la même chose à chaque livraison).
do $$
declare restes text;
begin
  select string_agg(p.proname, ', ') into restes
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('artisan_affectable', 'artisan_decennale_valide',
                      'artisan_note', 'artisan_indicateurs_fiabilite')
    and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if restes is not null then
    raise exception 'Auxiliaires exposés à authenticated sans contrôle d''appartenance : %', restes;
  end if;
end $$;

-- 5. Toute fonction de ce lot a bien perdu son execute pour public et anon.
do $$
declare restes text;
begin
  select string_agg(p.proname, ', ') into restes
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'mon_artisan_id', 'artisan_lisible', 'decennale_requise',
      'artisan_decennale_valide', 'artisan_affectable', 'artisan_note',
      'artisan_indicateurs_fiabilite', 'controler_cloture_intervention',
      'artisan_creer_ou_rattacher', 'artisan_definir_metiers_zones',
      'artisan_statut_local', 'artisan_blacklist_locale',
      'artisan_lever_blacklist_locale', 'artisans_affectables',
      'ouvrir_consultation', 'solliciter_artisan', 'retenir_devis',
      'fixer_creneau_arbitrage', 'reviser_imputation_apres_diagnostic',
      'annuler_mission', 'evaluer_artisan_gerant', 'interventions_a_evaluer',
      'mon_artisan', 'mes_pieces_artisan', 'deposer_ma_piece',
      'definir_ma_visibilite', 'ma_note_artisan', 'mes_sollicitations',
      'decliner_sollicitation', 'deposer_devis', 'mon_agenda_artisan',
      'accepter_mission', 'refuser_mission', 'proposer_creneaux',
      'demarrer_intervention', 'deposer_photo_intervention',
      'deposer_compte_rendu', 'mes_creneaux_locataire', 'choisir_creneau',
      'contre_proposer_creneaux', 'noter_artisan_locataire',
      'inscrire_mon_entreprise_artisan', 'artisans_a_valider',
      'artisan_decider_plateforme', 'artisan_definir_siret_etat',
      'retirer_evaluation', 'maintenance_artisans')
    -- proacl nul = privilèges par défaut = EXECUTE pour PUBLIC : c'est
    -- justement le défaut qu'on traque. Sinon on lit l'ACL : PUBLIC est le
    -- bénéficiaire 0, anon son propre rôle.
    and (p.proacl is null
         or exists (select 1 from aclexplode(p.proacl) a
                    where a.privilege_type = 'EXECUTE'
                      and (a.grantee = 0 or a.grantee = 'anon'::regrole)));
  if restes is not null then
    raise exception 'Fonctions encore exécutables par anon/public : %', restes;
  end if;
end $$;
