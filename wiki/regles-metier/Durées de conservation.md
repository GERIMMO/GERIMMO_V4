---
type: business-rule
tags: [rgpd, conservation, retention, purge, litige, alertes, conformite]
status: draft
created: 2026-10-24
updated: 2026-10-24
sources: ["[[RGPD]]", "[[Registre des traitements]]", "[[Conservation et exploitation — 22 octobre 2026]]", "app/supabase/migrations/20261024140000_conservation_et_prospection.sql", "app/supabase/migrations/20261024130000_fermeture_comptes.sql", "log.md — entrées « decision » des 23 et 24/10/2026, « deploy » du 24/10/2026 (PR #246)"]
---

# Durées de conservation

**Énoncé :** chaque catégorie de données a une durée écrite dans le catalogue
`retention_rules` (durée en mois, déclencheur, sort final, actif ou non). La purge de nuit
(`appliquer_retention`, tâche `retention-quotidienne`) n'applique **que les règles
actives**. Depuis le 24/10/2026 (PR #246, migration `20261024140000`), le catalogue compte
**58 règles** : celles du lot 2 du plan de conformité du 23/10 et celles qui existaient
déjà.

> [!info] Ce que cette page décrit
> L'état du catalogue après la migration du 24/10, relu sur une copie de test de la
> production du 23/10 à laquelle les six migrations du 24/10 ont été appliquées (58 règles,
> même nombre que le relevé du déploiement). Une règle activée à la main en production
> après le 24/10 n'apparaîtrait pas ici. Les durées sont une **politique de service**
> proposée par le plan, pas une certification ; aucune source juridique n'a pu être ouverte
> le 23/10.

## Principes retenus le 23/10 (plan juriste/DPO, valeurs acceptées par le dirigeant)
- **Gestion directe : 36 mois** après la fin du bail et la clôture de ses comptes pour les
  pièces, baux, états des lieux, quittances et preuves de signature (repère : référentiel
  CNIL de la gestion locative, point 53, et loi du 6 juillet 1989, art. 7-1). Les mandats
  d'agence gardent 60 mois.
- **Éditeur non commerçant** (décision du 23/10) : les factures de Gerimmo suivent la règle
  fiscale de **six ans** (livre des procédures fiscales, art. L. 102 B), et non les dix ans
  du code de commerce ; la **preuve du contrat** conclu en ligne reste **dix ans** (code de
  la consommation, L. 213-1).
- **Comptes : 24 mois** sans connexion ni abonnement, deux avertissements (J-60, J-15).
- **Journal d'audit : 12 mois** en général ; 36 mois pour le contrôle interne ; dix ans pour
  les preuves du contrat.
- Une durée réglée à la main avant la migration n'est jamais écrasée (la migration le
  signale).
- Activation **une règle à la fois** : sauvegarde récente relue, bilan sans suppression sur
  `/admin/donnees` (super-administrateur avec second facteur), vérification qu'aucune
  donnée échue n'est visée par une demande en cours, activation, lecture du bilan le
  lendemain, entrée au journal.

## Le catalogue au 24/10/2026

### Documents de la location (gestion directe)

| Règle | Durée | À partir de | Sort | Active |
|---|---|---|---|---|
| `document:bail`, `document:etat_des_lieux` | 36 mois | Fin du bail | Retrait du fichier (anonymisation) | Oui |
| `document:courrier`, `document:attestation_assurance`, `document:reglement_copropriete` | 36 mois | Fin du bail | Suppression | Oui |
| `document:piece_identite`, `document:justificatif` | 36 mois | Fin du dernier bail | Suppression | Oui |
| `document:quittance` | 36 mois ; **120 mois après l'émission** si aucun bail n'est rattaché | Fin du bail | Retrait du fichier | Oui |
| `document:autre` | 60 mois ; **36 mois après la fin du bail** s'il est rattaché à un bail | Dépôt | Suppression | Oui |
| `document:diagnostic` | 60 mois | Fin de gestion du bien | Suppression | Oui |
| `document:photo_incident` | 24 mois | Clôture de l'incident | Suppression | Oui |
| `preuve:signature` (circuits, PDF signés, certificats ; avec `bail_signature_circuits` et `demandes_signature`) | 36 mois | Fin du bail | Suppression | Oui |
| `dossier:sans_bail` (pièces d'une personne rattachée à aucun bail) | 3 mois | Dernier dépôt de pièce | Suppression | Non |
| `document:mandat`, `document:rapport_gestion` (agences) | 60 mois ; 120 mois | Fin du mandat ; émission | Retrait du fichier | Oui |

**Ce que compte « fin du bail »** (`fin_conservation_bail`) : la plus tardive des dates
entre la fin du bail, la sortie réelle, l'état des lieux de sortie et l'émission de la
restitution finalisée ; une restitution « en cours » retient le compteur douze mois au plus.
Une pièce d'un type « fin du bail » rattachée à aucun bail suit la durée des autres
documents (60 mois depuis le dépôt). Un bail en brouillon vaut bail pour la règle
« dossier sans bail » (choix du 24/10 : aucune règle d'abandon inventée).

### Données de la gestion locative au-delà des documents (lot 5, inactives)

| Règle | Durée | À partir de | Sort |
|---|---|---|---|
| `personne:fiche` | 36 mois | Fin du dernier bail et clôture des comptes | Retrait des informations nominatives |
| `comptable:loyers` | 36 mois | idem | Retrait des informations nominatives |
| `message:locatif` | 24 mois | idem | Suppression |
| `incident:dossier` | 24 mois | Clôture de l'incident | Retrait des informations nominatives |

Ces quatre règles attendent le code qui retire les informations nominatives sans casser
les écritures (lot 5) ; le premier terme possible tombe en **novembre 2028**.

### Comptes, contrat et archives

| Règle | Durée | À partir de | Active |
|---|---|---|---|
| `compte:inactif` | 24 mois | Dernière connexion d'un membre ou fin du dernier abonnement payé | Non (avec `VERSION_MIN_INACTIVITE`, à la V1) |
| `compte:inscription_non_confirmee` | 1 mois | Création de l'inscription | Non |
| `compte:invitation_jamais_utilisee` | 3 mois | Expiration, refus ou annulation de la dernière invitation | Non |
| `archive:preuve_contrat` | 120 mois | Fin du dernier abonnement payé | Oui |
| `archive:facture` | 72 mois | Fin de l'exercice de la facture, à défaut fin du dernier abonnement payé | Oui |
| `contrat:retractation` | 120 mois | Date de la rétractation | Oui |
| `contrat:intention_conge` | 24 mois | Traitement | Oui |
| `journal:effacements_a_reappliquer` | 4 mois | Exécution de la fermeture | Oui |
| `invitation:locataire`, `invitation:artisan` | 3 mois | Expiration, refus ou annulation | Non |

### Journaux

| Règle | Durée | Active |
|---|---|---|
| `journal:tech_log` | 6 mois | Oui |
| `journal:audit_log` | **12 mois** (36 avant le 24/10) | Oui |
| `journal:audit_controle_interne` (accès et exports de la supervision, support, maintenance, purges, fermetures, effacements) | 36 mois | Oui |
| `journal:audit_preuve_contrat` (commande, confirmation, résiliation notifiée et accusée, mise en demeure, résiliation pour impayé, non-reconduction, rétractation et accusé, confirmation du mobile d'une caution ou d'un garant, confirmation sur place d'un état des lieux) | 120 mois | Oui |
| `journal:acces_pieces` | 12 mois | Oui |
| `journal:abonnement_evenements` (événements Stripe traités) | 6 mois | Oui |
| `journal:auth_audit` (journal d'authentification Supabase) | 6 mois | Non (0 ligne aux relevés des 23 et 24/10) |
| Registres d'exécution, relais, compteur IA, planificateur (`journal:agent_passages`, `journal:relais_*`, `journal:ia_appels_jour`, `journal:points_du_matin`…) | 6 mois | Oui |

### Contacts, prospection, support, artisans

| Règle | Durée | À partir de | Active |
|---|---|---|---|
| `contact:devis` | 24 mois | Dernier traitement ou dépôt | Oui |
| `contact:prospect` | 36 mois | Dernier contact émanant du prospect | Oui |
| `prospect:opposition` (empreinte de l'adresse) | 36 mois | Opposition | Oui |
| `contact:attente` (propriétaires), `contact:attente_agences` | 36 mois | Inscription | Non |
| `support:bug` | 6 mois | Date du signalement | Oui |
| `support:question_idee` | 24 mois | Dernier échange | Non |
| `support:demande_droits` | 36 mois | Clôture de la demande | Non |
| `support:contestation` | 36 mois | Clôture de la contestation | Non |
| `artisan:evaluation` | 36 mois | Dépôt de l'évaluation | Non |
| `alerte:traitee` | 12 mois | Fermeture de l'alerte | Oui |

## Gel en cas de litige (depuis le 24/10)
- Sur la fiche du bail, carte « Conservation » : le propriétaire **suspend la suppression**
  des pièces du bail pour un litige, **douze mois au plus, renouvelable**, avec un motif
  écrit (`baux.conservation_gelee_jusqu_au`, `conservation_gelee_motif`). Le geste passe
  par `geler_conservation_bail`, jamais par une écriture directe, et il est inscrit au
  journal d'audit (`conservation_gel_pose`, `conservation_gel_leve`).
- Poser un gel ferme l'alerte qu'il couvre. **Lever un gel ne supprime jamais en moins de
  30 jours** : si l'échéance tombe dans les 30 jours, la base pose un préavis jusqu'à J+29,
  l'alerte J-30 part, puis la suppression a lieu à J+30. L'écran annonce la date qui
  résulte de la levée.
- Le principe historique « tout contentieux gèle le passage au sort final » (RM-A2.7,
  [[RGPD]]) est ainsi outillé pour les pièces d'un bail ; une fermeture de compte se gèle
  aussi (litige ou créance, motif écrit, [[Fermeture de compte]]).

## Alertes avant suppression (depuis le 24/10)
Dans l'espace du propriétaire (table `alerts`) et par courriel aux gérants actifs de
l'espace (mission « rappels », 06 h 00 UTC), sans donnée personnelle dans le sujet :
- **J-30** — « Les pièces suivantes du bail {bail} seront supprimées le {date}… » (sujet :
  « Des pièces d'un bail seront supprimées le … ») ; une alerte par bail et par date ;
- **J-15** — « Les pièces de {personne}, qui n'est rattachée à aucun bail, seront supprimées
  le {date}… » ;
- **J-30** — documents rattachés à aucun bail (« Des documents seront supprimés le … »),
  texte calqué sur celui des pièces d'un bail.
Le lien mène à la fiche du bail (`#conservation`), aux pièces de la personne ou aux
documents de l'espace. Chaque nuit, les alertes qui ne sont plus dues se ferment ; la file
d'envoi revérifie la date, le gel et l'échéance avant de partir. Les alertes ne visent que
des pièces dont la règle est active.

## Purges particulières
- **Retours d'aide** : purge dans l'ordre `groupe_id`, soutiens, historique, retours.
- **Inscriptions d'agence** : « retirée » supprimée dès que son empreinte d'opposition est
  posée ; « convertie » supprimée trois mois après la conversion.
- **Fiches prospect d'un particulier** : supprimées avec leur demande de contact, registre
  compris.
- **Comptes jamais utilisés** : un compte d'invité est ciblé dès qu'il ne s'est jamais
  connecté ; un repère « invité » est posé avant la purge des invitations ; un compte
  bloqué par une référence n'est retenté qu'après sept jours.
- **Circuits de signature** restés ouverts sur un bail échu : marqués « expiré » puis
  supprimés avec leurs pièces ; un circuit ouvert non expiré reste.
- **La purge passe outre la lecture seule** d'un abonnement fermé (une pièce échue d'un
  compte suspendu faisait échouer toute la purge).

## Relations
[[RGPD]] · [[Registre des traitements]] · [[Archivage plutôt que suppression]] ·
[[Fermeture de compte]] · [[Prospection commerciale]] · [[Dossier locataire]] ·
[[Document]] · [[Restitution du dépôt de garantie]]

> [!warning] Points à trancher / contradictions
> - **Toutes les durées** : à confirmer sur Légifrance (source non ouverte le 23/10/2026) —
>   loi 89-462 art. 7-1, C. conso L. 213-1 et D. 213-1, LPF L. 102 B, délibérations CNIL
>   2021-057 (repère) et 2021-122. Les 36 mois reposent sur un référentiel visant les
>   professionnels ; ils ne sont pas confirmés pour le bailleur particulier.
> - **Règles annoncées mais inactives** : la page confidentialité V1 (non publiée) annonce
>   des durées dont la règle reste inactive au déploiement ; chaque activation attend son
>   bilan. `compte:inactif` doit être activée **avec** `VERSION_MIN_INACTIVITE` à la
>   publication de la V1.
> - **Réclamations, parrainage, devis et factures d'artisans** : aucune durée au catalogue.
> - **Motif d'exclusion d'un artisan** : 3 ans (espace) ou 5 ans (réseau), purge non
>   planifiée.
> - **Sauvegardes** : « 90 jours » annoncé ; la durée réelle chez Supabase n'est pas relevée
>   (la copie Scaleway est à 90 jours).
> - **Formulaire de la vitrine** : il annonce « 24 mois » pour la demande, alors que la fiche
>   prospect d'un professionnel vit 36 mois après son dernier contact ; texte à préciser
>   (« 24 mois pour votre demande ; 3 ans après le dernier contact pour le suivi commercial
>   des professionnels »).
> - **Bail en brouillon** : vaut bail pour « dossier sans bail » ; une règle d'abandon
>   (brouillon inactif depuis N mois) reste à décider par le dirigeant.
