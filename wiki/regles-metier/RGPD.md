---
type: business-rule
tags: [rgpd, conformite, donnees-personnelles]
status: in-progress
created: 2026-07-21
updated: 2026-07-25
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-architecture-lot-0]]", "[[2026-07-24-gerimmo-v3-module-0b-dossier-locataire]]", "[[2026-07-24-gerimmo-v3-a2-conservation-rgpd]]"]
---

# RGPD

**Énoncé :** GERIMMO traite les droits des personnes (accès, effacement, conservation) avec
des garde-fous stricts et une traçabilité immuable.

## Fondement
- `docs/rgpd-production.md` ; tables `privacy_requests` / `privacy_audit_logs`.

## Règles
- **Droits traités** : export des données perso ; **anonymisation** quand la suppression heurte
  l'intégrité métier ; suppression après vérification des obligations légales ; révision des durées de conservation.
- **Contrôles obligatoires** : chaque demande = une **référence**, **échéance de 30 jours**, journal
  immuable ; vérification de l'identité du demandeur, de son périmètre organisationnel et des
  obligations de conservation **avant** traitement.
- **Garde-fous** : l'export ne contient que les données autorisées ; suppression/anonymisation
  exigent l'**approbation d'un [[Super Admin]] ET une sauvegarde préalable**.

## Durées de conservation : la matrice A2 fait foi (tranché 2026-07-25)
Les durées historiques du code (`docs/rgpd-production.md` : télémétrie 90 jours,
audit « à définir avec le DPO »…) sont **supplantées par la matrice A2** ci-dessous
(journaux : technique 6 mois, audit 3 ans, accès 1 an) — décision humaine du
2026-07-25 : **en cas de conflit, la cible V3 prime**, et le code devra migrer vers
`retention_rules` (voir [[Divergences code et référentiel V3]]).

## Le cadre A2 : finalités, sorts finaux, qualification (2026-07-24)

Le [[2026-07-24-gerimmo-v3-a2-conservation-rgpd|livrable A2]] (issu de l'audit, point
P0.3) fixe la doctrine transverse — **réserve : à faire valider par un conseil
spécialisé**.

**Trois principes** (bloquants) :
1. **Toute durée découle d'une finalité écrite** — aucune conservation « indéfinie »
   sans base légale (RM-A2.1/2).
2. **Trois sorts finaux** (RM-A2.3) : **suppression** (plus aucune utilité — pièces
   d'identité, messages), **anonymisation** (une contrepartie comptable subsiste —
   écritures, historiques de bail ; **irréversible** obligatoirement, RM-A2.5 : « Loyer
   Martin Dupont » → « Loyer lot 47 », pas de pseudonymisation), **conservation
   justifiée** (obligation légale explicite).
3. **Un journal a sa propre durée, plus courte que la donnée** (RM-A2.6) : technique
   **6 mois** · audit **3 ans** · accès aux pièces **1 an**.

**Cycle de vie en trois étapes** (RM-A2.4 — corrige
[[Archivage plutôt que suppression]]) : base active → **archivage intermédiaire**
(consultation sur justification, aucune modification, admin agence + SA) → sort
final. L'archivage est une étape, **jamais** un sort final. **Tout contentieux gèle
le passage au sort final** jusqu'à sa clôture (RM-A2.7, généralise RM-0b.8.3).

**Qualification** (RM-A2.8/9, opérationnalisée par la chaîne d'incident A4 —
qualification 2 h, confinement 4 h, **CNIL sous 72 h** par le responsable du
traitement, [[Socle de sécurité]]) : Gerimmo est **sous-traitant** pour les données
d'agence (gestion locative, dossiers, comptabilité, incidents, messagerie — l'agence
répond aux demandes, décide de l'effacement, **contrat de sous-traitance
obligatoire**) et **responsable de traitement** pour la plateforme (annuaire artisan
public, **score artisan** — « l'agence fournit des évaluations ; Gerimmo décide de ce
qu'il en fait » —, blacklist globale, comptes, facturation). **Toute violation est
notifiée à l'agence sans délai** (RM-A2.10) ; Gerimmo notifie la CNIL pour ses
traitements. La **contestation de note artisan = droit à l'intervention humaine**
(RM-A2.11 — [[Artisan]]).

## La matrice de conservation (A2)

Chaque ligne : finalité, base légale, durée active, déclencheur, archive, sort.
Grandes lignes (détail dans la [[2026-07-24-gerimmo-v3-a2-conservation-rgpd|source]]) :

| Famille | Actif | Archive | Sort |
|---|---|---|---|
| Pièces du [[Dossier locataire]] | Durée du bail | 5 ans | Suppression |
| Identité, coordonnées, [[Bail]], [[État des lieux|EDL]], congés, [[Mandat de gestion|mandats]] | Durée du contrat | 5 ans | **Anonymisation** |
| [[Comptabilité|Comptable]] (écritures, quittances, factures, rapports) | Exercice/bail | **10 ans** | Anonymisation |
| [[Incident|Incidents]] + photos | Durée du bail | 2 ans | Suppression |
| Devis non retenus, RDV, alertes traitées | 1 an | — | Suppression |
| [[Artisan]] plateforme : profil, évaluations (3 ans), blacklist locale 3 ans / **globale 5 ans** | variable | — | Suppression |
| Conversations (2 ans), consentement WhatsApp (+3 ans), traces d'envoi (+5 ans, anonymisées) | Durée du bail | variable | mixte |

Les 5 ans = **prescription des actions nées du bail d'habitation** ; au-delà, la
conservation de l'identité perd sa justification.

**Limites au droit à l'effacement** : refusé si bail en cours, impayé non soldé,
contentieux, écriture comptable (anonymisable au terme) ; **accordé** après
prescription (bail terminé sans dette) et **sur demande, même avant terme, pour les
pièces du dossier**.

**Corrections apportées au référentiel** : RM-0b.8.7 (personne → anonymisation au
terme), RM-8.5.6 (blacklist 3/5 ans), RM-12.5.6 (plus de « sans limite »), RM-18.5.2
(journal d'audit **3 ans**, plus « jamais purgé »), RM-18.4.4 (agence archivée
10 ans puis anonymisée).

**Reste à produire** : contrat de sous-traitance type, politique de confidentialité
(conseil juridique), registre des traitements plateforme, **AIPD sur le score
artisan** (profilage), procédure de notification de violation.

## La purge du dossier locataire (module 0b, 2026-07-24)
Premier cas de purge entièrement spécifié ([[Dossier locataire]], parcours 0b.8 — V2
mais modèle de données conçu dès la V1 : identifiant de conservation + état
« en corbeille ») :
- **5 ans après la fin du dernier bail** dans l'agence ; nouveau bail = compteur à zéro.
- **Suspension automatique** si procédure en cours (impayé, contentieux — RM-0b.8.3,
  bloquant) ; blocage si la personne est encore garante ; refus si bail actif.
- Alerte agence **J-30** (prolongation possible, motif tracé) → **corbeille 3 mois**
  restaurable → **suppression définitive** ; le tout au journal d'audit (**3 ans** —
  RM-A2.6, corrige la mention « indéfini » du module 0b).
- **Purgées** : pièces (identité, revenus, imposition, attestations). **Conservées**
  au-delà : l'historique des baux, les quittances, les écritures (obligation 10 ans).
  **Correction A2 de RM-0b.8.7** : la personne n'est plus « jamais supprimée » —
  **anonymisation au terme de l'archivage**.
- Déclenchable **manuellement** sur demande RGPD du locataire (RM-0b.8.9), qui rejoint
  le workflow de demandes existant (référence, 30 j, double validation).

## Cible V3 : la conservation en table (lot 0, 2026-07-24)
Le [[2026-07-24-gerimmo-v3-architecture-lot-0|socle V3]] traduit le livrable A2 en
infrastructure :
- **`retention_rules`** — les **32 types de données** de la matrice de conservation A2,
  avec durée et **sort final** (suppression ou anonymisation), en table pour évoluer
  sans déploiement ;
- **`audit_log`** (actions sensibles, **3 ans**) et **`tech_log`** (connexions et
  erreurs, **6 mois**) ;
- tâches pg_cron quotidiennes : purge des journaux selon `retention_rules` et
  **application des sorts RGPD** — à mettre en place **avant le pilote**.
Voir [[Architecture du socle V3]].

## Implications pour l'application
- Workflow de demande RGPD avec référence, échéance 30 j, double validation, sauvegarde.
- Cohérent avec [[Archivage plutôt que suppression]] et [[Plan de reprise d'activité]].
