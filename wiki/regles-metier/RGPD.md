---
type: business-rule
tags: [rgpd, conformite, donnees-personnelles]
status: in-progress
created: 2026-07-21
updated: 2026-10-22
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-architecture-lot-0]]", "[[2026-07-24-gerimmo-v3-module-0b-dossier-locataire]]", "[[2026-07-24-gerimmo-v3-a2-conservation-rgpd]]", "[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Complément à la page « Décisions groupées » — fiches de la vague 6]]"]
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

## Durées de conservation : décision A2 historique, revue du 22 octobre
Les durées historiques du code (`docs/rgpd-production.md` : télémétrie 90 jours,
audit « à définir avec le DPO »…) sont **supplantées par la matrice A2** ci-dessous
(journaux : technique 6 mois, audit 3 ans, accès 1 an) — décision humaine du
2026-07-25 : **en cas de conflit, la cible V3 prime**, et le code devra migrer vers
`retention_rules` (voir [[Divergences code et référentiel V3]]).

> [!warning] Qualification à reprendre avant toute nouvelle purge
> La décision de juillet décrit la cible historique ; elle ne valide pas chaque
> durée pour les usages actuels. La revue du 22 octobre relève 29 règles dans la
> base isolée et distingue configuration observée et qualification juridique.
> Voir [[Conservation et exploitation — 22 octobre 2026]] et sa matrice détaillée.
> Aucune durée ni purge de production n'a été modifiée par cette revue.

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

**Correction du 22 octobre :** les cinq ans ne sont pas la prescription générale
du bail d'habitation. Le référentiel CNIL distingue notamment gestion directe
(trois ans d'archive intermédiaire) et déléguée (cinq ans), après clôture des
comptes ; la gestion semi-déléguée dépend des tâches.
Les lignes A2 ci-dessus restent historiques, pas une durée universelle à appliquer.
[CNIL, § 53–54](https://www.cnil.fr/sites/cnil/files/atoms/files/referentiel_relatif_aux_traitements_de_donnees_personnelles_mis_en_oeuvre_dans_le_cadre_de_la_gestion_locative.pdf).

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
*(État au 16/10/2026 : le registre existe en brouillon depuis le 20/09 —
[[Registre des traitements]] — et attend sa validation ; voir aussi la section
« Registre des traitements de la plateforme (amorce) » plus bas.)*

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

## Compléments (2026-09-09)

- `demandes_signature` : purgées avec le document demandé, et au plus 24 mois
  après le retour du signé (`appliquer_retention`) — la demande est un journal
  de circuit, pas une archive.
- Image de signature de l'organisation : remplacée ou retirée, l'ancien
  fichier est mis en file de purge (sans ligne `documents`, la rétention
  documentaire ne la voyait pas). Voir [[Organisation]].

## Durées décidées en octobre 2026 (D13, D14, D48)

Réponses du dirigeant du 14/10/2026 aux décisions groupées (« pour le reste, faire en
fonction des recommandations » ; journal `log.md`, entrée « decision » du 14/10) ; mises en
production avec la vague 2 le 15/10/2026 (PR #182, fusion `8c4aed6`). Détail des options :
[[Décisions groupées — version candidate du 13 octobre 2026]] (D13, D14) et
[[Complément à la page « Décisions groupées » — fiches de la vague 6]] (D48).

| Décision | Données | Durée | Sort et déclencheur | Dans le code |
|---|---|---|---|---|
| **D14** (A, « à consigner au registre des traitements ») | Copies locales de saisie gardées sur l'appareil : brouillons de fiche personne (avec pièces), d'incident, de lot, de devis (IndexedDB et stockage du navigateur) | **7 jours** | Effacées passé ce délai ; effacées aussi à la déconnexion réussie, et à l'arrivée d'un autre compte sur l'appareil | `DUREE_COPIES_LOCALES_MS`, `app/src/lib/copies-locales.ts` (la durée de 7 jours existait déjà ; la décision la confirme) |
| **D13** (A, « 6 mois sauf avis contraire ») | « Faits de direction » de la supervision (instantanés `brief_direction_snapshots`) | **6 mois** | **Sans noms** : une alerte n'y figure que par son identifiant, un libellé générique tiré de son type et un lien ; chaque préparation et chaque lecture de l'écran est tracée par organisation citée ; purge par la rétention ; les anciens instantanés (avec noms) ont été effacés (étape irréversible, après sauvegarde) | Migrations `20261014230000`, `20261014231000`, `20261014232000` |
| **D48** (A, « avec la durée de D13 ») | Registres d'exécution des automatismes et du pilotage : `agent_passages`, `supervision_operations`, `points_du_matin`, `decisions_du_matin`, `brief_direction_snapshots` | **6 mois** (durée du journal technique, RM-A2.6) | Suppression ; une ligne de `retention_rules` par registre, appliquée par `appliquer_retention` (tâche `pg_cron` `retention-quotidienne`, 03 h 00 UTC, et bouton « Nettoyer » de la supervision) | Migration `20261014231000` |

**Registres nés depuis (15-16/10/2026)** — déclarés au catalogue le 16/10 (PR #195, fusion
`db0a95f`, migration `20261014850000`, vérifiée en lecture seule en production : quatre
règles de six mois actives, purge branchée une fois dans `appliquer_retention`) :

| Registre (`retention_rules`) | Âge compté depuis | Durée | Purge |
|---|---|---|---|
| `relais_alertes_envois` (`journal:relais_alertes_envois`), passages de l'e-mail de 5 h du [[Relais du dirigeant]] | jour du passage (jour de Paris) | **6 mois** | `appliquer_retention` ; et déjà, en dur, `reserver_alerte_relais` à chaque passage |
| `relais_urgences` (`journal:relais_urgences`), file des urgences du relais | traitement de l'urgence | **6 mois** | `appliquer_retention` (jamais une urgence encore à envoyer ou en cours d'envoi) ; et déjà, en dur, `prendre_urgences_relais` |
| `relais_urgences_envois` (`journal:relais_urgences_envois`), e-mails immédiats des urgences | début de l'envoi | **6 mois** | `appliquer_retention` (jamais un envoi en cours, à reprendre ou encore cité par une urgence) ; et déjà, en dur, `prendre_urgences_relais` |
| `ia_appels_jour` (`journal:ia_appels_jour`), compteur des appels payants à l'IA (X19 : nombres par jour de Paris) | jour des appels (jour de Paris) | **6 mois** | `appliquer_retention` seulement (**première purge** : aucune avant le 16/10) |

`appliquer_retention` tourne au nettoyage de nuit (tâche `pg_cron` `retention-quotidienne`,
03 h 00 UTC) et par le bouton « Nettoyer » de la supervision ; chaque registre n'est purgé
que si **sa** règle est active, et le journal technique ne garde que des nombres. Effet
immédiat nul au 16/10 (registres du relais et compteur IA vides au relevé). **Ce que la
migration ne couvre pas** : les purges propres au relais (`reserver_alerte_relais`,
`prendre_urgences_relais`) restent **codées en dur** à six mois — désactiver ou allonger une
règle du relais au catalogue n'arrête pas leur purge, faite à chaque passage du relais
(limite assumée par la migration) ; le compteur IA, lui, n'est purgé **que** par le
nettoyage de nuit (ou le bouton « Nettoyer »). Durée : la recommandation de la CNIL sur la
journalisation (6 mois à 1 an) est citée par la migration sans que la source officielle ait
été consultée ; validation DPO recommandée.

Autres registres nés depuis :
- relances d'invitation (`relances_invitations_locataires`, X16) : aucune durée propre, la
  ligne suit l'invitation (suppression en cascade).

**Mise à jour du 22 octobre :** la limite du relais décrite ci-dessus a été corrigée
par `20261016180000_relais_retention_sentinelle.sql`. La lecture des fonctions
reconstruites confirme que `reserver_alerte_relais` et `prendre_urgences_relais`
respectent maintenant la durée, l'activation et le sort du catalogue.
Les anciens constats du 16 octobre sont conservés comme historique.
En revanche, d'autres suppressions à 24 mois restent hors catalogue dans
`appliquer_retention` (demandes de devis, intentions de congé traitées et demandes
de signature signées). Aucun nettoyage n'a été lancé.

La source CNIL a maintenant été consultée : la recommandation générale est de
six à douze mois pour les journaux, avec exceptions justifiées. Le libellé du
catalogue attribuant trois ans à une recommandation générale CNIL est à corriger
lors de la validation des règles ; aucune baisse automatique n'est décidée ici.
[CNIL — Tracer les opérations](https://www.cnil.fr/fr/securite-tracer-les-operations).

## Registre des traitements de la plateforme (amorce)

> [!note] Brouillon — validation par un DPO ou un conseil spécialisé recommandée
> Amorce établie par l'agent à partir du code au 16/10/2026, pour compléter le volet 1
> (Gerimmo responsable de traitement) du [[Registre des traitements]], brouillon du
> 20/09/2026. Ce n'est pas un avis juridique : **aucune base légale n'est qualifiée ici**.
> Les décisions D13, D14 et D48 recommandent elles-mêmes une validation spécialisée.

| Traitement (code au 16/10/2026) | Finalité | Personnes et données | Destinataires | Durée |
|---|---|---|---|---|
| **Relais du dirigeant** (D46-B, PR #192) | Alerter le responsable de la supervision (tâches en échec, arrêts actifs, urgences du mode vacances) | Le dirigeant : deux adresses électroniques fournies par lui, gardées hors du dépôt (variable du serveur) ; le message ne porte que des compteurs, sans nom ni montant | Resend (envoi) | Registres du relais : 6 mois (au catalogue `retention_rules` depuis le 16/10, PR #195 ; purges propres du relais codées en dur) |
| **Registres d'exécution et faits de direction** (D13, D48) | Piloter et contrôler les automatismes et la supervision | Comptes de supervision (auteurs des gestes), organisations citées (identifiants, libellés génériques, sans nom de locataire depuis D13) | Supervision | 6 mois |
| **Recherche par référence de la console** (X18, PR #190) | Retrouver un bien, un lot ou un incident pour le support | Superviseur (auteur) ; la trace garde la forme de la saisie, le nombre et les identifiants trouvés, jamais un nom | Supervision (journal d'audit) | Celle du journal d'audit (3 ans selon RM-A2.6) |
| **Plafond des appels payants à l'IA** (X19, PR #190) | Borner les appels à un modèle payant | Compteur quotidien sans donnée personnelle ; le réglage est journalisé avec son auteur | Supervision | Compteur : 6 mois (règle `journal:ia_appels_jour`, depuis le 16/10, PR #195) ; journal des opérations : 6 mois (D48) |

À rattacher au volet 2 (Gerimmo sous-traitant, pour le compte des organisations) :
- **Copies locales de saisie** (D14) : données de fiche personne, d'incident, de lot ou de
  devis, sur l'appareil de l'utilisateur, 7 jours au plus ;
- **Relances d'invitation des locataires** (X16, PR #190) : adresse électronique de la
  personne invitée, dates des relances ; envoi par Resend.

> [!warning] Points à trancher / contradictions
> - ~~**D48 partiellement appliquée** : les registres du relais se purgaient à six mois sans
>   figurer au catalogue `retention_rules`, et `ia_appels_jour` n'avait aucune purge~~ →
>   **corrigé le 16/10** (PR #195, `20261014850000`) : les quatre registres ont leur règle
>   de six mois. Restent : les purges propres au relais codées en dur (le catalogue ne
>   peut pas les arrêter ni les allonger) ; `invitations_artisans` (16/10) sans règle au
>   catalogue ([[Invitation d'un artisan par un propriétaire]]) ; la consignation de D48 au
>   [[Registre des traitements]].
> - **Durées non alignées entre sources** : la fiche SUP-05 proposait 90 jours, la fiche
>   IA-11 12 mois ; le wiki (RM-A2.6) retient 6 mois pour le journal technique, et la
>   recommandation de la CNIL sur la journalisation (non consultée directement) parle de 6
>   mois à 1 an, jusqu'à 3 ans sous conditions. **Validation DPO recommandée.**
> - **D14** : la décision demande de consigner la durée au registre des traitements ; c'est
>   l'objet de l'amorce ci-dessus, à reporter dans [[Registre des traitements]] après
>   validation.
