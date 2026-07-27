---
type: concept
tags: [document, ged]
status: in-progress
created: 2026-07-21
updated: 2026-07-25
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a3-documents-canaux-preuve]]", "[[2026-07-24-gerimmo-v3-architecture-lot-0]]", "[[2026-07-24-gerimmo-v3-module-0b-dossier-locataire]]", "[[2026-07-24-gerimmo-v3-module-12-documents-et-ged]]", "[[2026-07-24-gerimmo-v3-a2-conservation-rgpd]]", "[[2026-07-24-gerimmo-v3-a4-socle-securite]]"]
---

# Document

**Définition :** fichier métier centralisé, rattachable à un [[Patrimoine et résidences|patrimoine/résidence]],
un [[Bien]], un [[Propriétaire bailleur|propriétaire]] ou un [[Locataire]]. Table `documents`.

## Attributs métier notables
- `document_type` : `quittance`, `rapport_incident`, `bon_intervention`, `contrat`, `attestation`, `courrier`…
- `status` : `brouillon` / `actif` / `envoye` / `expire` / `archive`.
- **`visibility`** : `organisation` / `agence` / `proprietaire` / `locataire` / `artisan` / `prive`.
- Stockage : `storage_bucket`, `storage_path`, `checksum` ; `expires_at` + `expiration_alert_days` ; `official_document`.

## Objets liés
- `document_categories` (dont `is_official`), `document_templates` (gabarits : quittance, bon
  d'intervention… avec `merge_fields`), `document_versions` (versioning), `document_access_rules`
  (droits fins), `document_events` (journal), `document_alerts` (expiration), `document_email_outbox` (envoi email).

## Rôle dans le métier
- Support des pièces officielles (quittances, rapports, courriers de relance) et de leur diffusion
  contrôlée par visibilité + règles d'accès.
- Cas d'usage exigeant du versioning : les pièces du [[Dossier locataire]] (module 0b) —
  **toutes les versions conservées, aucune écrasée** (RM-0b.4.1), seule la courante
  affichée, chaque version datée et attribuée ; consultation **tracée** dans un journal
  d'accès (RM-0b.7.5).

## Portée de la trace GED (Livrable A3, 2026-07-24)
**Aucune trace GED ne constitue une preuve juridique** (RM-A3.2) — voir
[[Notification et valeur probante]]. La trace d'envoi (date, canal, destinataire —
RM-12.4.1) garde une utilité **réelle mais opérationnelle** : savoir ce qui est parti,
repérer ce qui reste à envoyer, contrôler qu'un agent a traité. Elle ne prouve **ni un
délai ni une réception** ; pour les actes à effet juridique, seule la **notification par
canal légal** (LRAR, acte) compte, et l'agent saisit la date de première présentation.
La formulation du module 12 (« la trace d'envoi fonde les délais ») est **à supprimer**
du référentiel.

## Relations
- Produit par [[Quittancement des loyers]], [[Intervention et clôture]], [[Relances et mise en demeure]].
- Rappels d'échéance automatiques (assurances, diagnostics) via `document_reminder-service`.
- Voir [[Canaux de communication]], [[Modèle de données]].

## Cible V3 : rattachement multiple, le type pilote tout (lot 0)
Le [[2026-07-24-gerimmo-v3-architecture-lot-0|socle V3]] retient un modèle sans
arborescence : **pas de dossiers ni de chemins** — `document_liens` rattache un même
document à toutes les fiches qu'il concerne (lot, bail, personne, mandat, incident), et
c'est le **type** du document qui pilote les droits **et la conservation**
([[RGPD|retention_rules]]). Stockage Supabase Storage : **jamais d'URL directe** — lien
signé à expiration courte (RM-A4.10) ; chiffrement au repos (RM-A4.6) ; **antivirus à
l'upload avant disponibilité** (RM-A4.8, champ `analyse_av`, service à choisir —
échec = refus et alerte) ; formats PDF/JPG/PNG avec **vérification du type réel, pas
de l'extension** (RM-A4.9 — « attestation.pdf » peut être un exécutable renommé) ;
`empreinte` pour la détection de doublon. Ces règles, esquissées par le lot 0, sont
formalisées par le [[2026-07-24-gerimmo-v3-a4-socle-securite|livrable A4]] —
voir [[Socle de sécurité]]. Voir [[Architecture du socle V3]].

## La GED complète (module 12, 2026-07-24)
- **Modèles figés, générés par le [[Super Admin]]** (RM-12.1.1/4) : pas d'éditeur
  libre ; 14 modèles Gerimmo par défaut ; modèle propre d'agence soumis au SA
  (validation des mentions, variables de fusion) ; mise à jour réglementaire centrale ;
  modèles **datés**, chaque document conserve **la version du modèle utilisée**.
- **Mise à disposition** (espace personnel — date de 1ʳᵉ consultation) **≠ envoi**
  (email/WhatsApp — date + canal) ; le mandant **ne reçoit que par envoi** ; envoi
  groupé possible ; recommandé tracé manuellement ; à signer → module 13.
- **Matrice de consultation par type** (RM-12.5.3) : locataire = ses documents ;
  artisan = les siens ; mandant = « envoyé »/« sur demande », **jamais les pièces du
  dossier locataire** (RM-12.5.5).
- **Conservation par type** (RM-12.5.6, **corrigée par A2**) : la version du
  module 12 (« baux, EDL, mandats : sans limite ») est abrogée — **toute durée est
  rattachée à une finalité écrite** ([[2026-07-24-gerimmo-v3-a2-conservation-rgpd|A2]],
  RM-A2.1/2). Matrice : pièces du dossier bail + 5 ans (suppression) · comptable /
  quittances / rapports **+ 10 ans (anonymisation)** · **baux, EDL, mandats :
  contrat + 5 ans puis anonymisation** (prescription des actions nées du bail) ·
  incidents et photos + 2 ans. Mention « purgé le … » pour ce qui a été purgé
  (RM-12.5.7). Voir [[RGPD]].
- **Navigation par filtres, jamais par dossiers** (RM-12.5.1) — depuis chaque fiche
  (lot, bail, personne, mandat, incident) + recherche globale (type, période, entité,
  texte). Toute consultation tracée (RM-12.5.8).

## Vue scindée du bien (décision humaine, 2026-07-25 — remplace la « vue 360 » v0)
Spécification UX actée : **à la sélection d'un [[Bien]], l'écran se scinde en deux** —
la liste reste visible d'un côté, un **panneau de détail du bien** s'ouvre de l'autre
(informations, documents, échanges), et **les éléments non concernés s'assombrissent**
pour garder le focus. Remplace la navigation « Bâtiment > Bien » de la note v0
([[2026-07-21-fonctionnalites-par-persona-v0]]) ; clôt le point 12 des décisions
ouvertes.
