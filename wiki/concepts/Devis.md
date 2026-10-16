---
type: concept
tags: [devis, incident, artisan]
status: in-progress
created: 2026-07-21
updated: 2026-10-16
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a5-etats-et-evenements]]", "[[2026-07-24-gerimmo-v3-module-9-devis-et-facturation]]", "[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Propositions de fonctions majeures — version candidate du 13 octobre 2026]]"]
---

# Devis

**Définition :** une proposition chiffrée d'un [[Artisan]] pour traiter un [[Incident]].
Plusieurs tables autour du processus de mise en concurrence.

## Objets liés
- **Demande de devis** (`incident_quote_requests`) : `status` `demande`/`recu`/`refuse`/`expire`/`retenu` ;
  option `allow_single_private_artisan` (défaut `false`).
- **Destinataire sollicité** (`incident_quote_recipients`) : `artisan_scope` `prive` / `gerimmo_valide`.
- **Devis reçu** (`incident_quotes`) : `amount_cents` (TTC), `valid_until`, fichier joint.
- **Comparaison** (`incident_quote_comparisons` + items) avec **score de recommandation**.

## Score de recommandation
`(1 000 000 / prix) × 0,45 + note_gerimmo × 20 × 0,35 + (documents_admin_validés ? 20 : 0)`
→ pondère prix (45 %), réputation de l'artisan (35 %) et complétude des justificatifs.

## Rôle dans le métier
- Mettre les artisans en concurrence et **choisir** le devis retenu, qui désigne l'[[Artisan]] pour la suite.

## Relations
- Rattaché à un [[Incident]] ; sollicite des [[Artisan|artisans]] ; débouche sur une [[Intervention]].
- Voir [[Demande et sélection de devis]], [[Modèle de données]].

## Spécification V3 (module 9, 2026-07-24)
- **Deux artisans au maximum** sollicités en parallèle (RM-9.1.1) ; décennale valide
  requise ; **validité 30 jours** par défaut (modifiable), **alerte J-7**, expiré =
  caduc ; non-retenus **notifiés automatiquement**.
- Comparaison : montants côte à côte, **note de l'[[Artisan]] affichée à côté du
  prix** (score composite du module 11) + historique.
- **Au-delà du seuil de délégation du [[Mandat de gestion]]** : validation bloquée
  sans **accord du propriétaire tracé** (RM-9.4.2) — sollicitation **hors
  application**, date/canal/sens obligatoires, relance à 5 jours, **urgence absolue**
  possible avec motif (visible au [[Rapport de gestion]]).
- **Facture** : pré-remplie du devis, **écart alerté sans blocage** (justifié par
  l'artisan, tranché par l'agent) ; exige intervention terminée + photo ; la
  validation **crée l'écriture comptable selon l'imputation** (propriétaire → rapport ;
  locataire → créance sur le bail, module 3).
- **Incident imputé au locataire** : il choisit — son artisan en direct (preuve de
  résolution exigée, sinon l'agence reprend la main) ou l'agence avec refacturation.

## Ce que fait le code aujourd'hui : refus motivé et révision en versions (relevé du 16/10/2026)
Décision D18 du dirigeant (14/10/2026, option A en deux livraisons, fiches ART-13 et
PRO2-12), **en production depuis le 15/10/2026** (PR #187, fusion `8a168dd`, migrations
`20261014600000` à `20261014602000`). Les objets du code actuel sont `incident_devis` et
`incident_sollicitations`, non les tables du code hérité décrites plus haut.
- **Trois gestes sur un devis reçu** : le **retenir** (il confie la mission ; le second
  artisan est écarté automatiquement), le **refuser**, ou **demander une révision**.
- **Refus motivé** : motif de dix caractères au moins, **transmis tel quel à l'artisan**
  (il le lit dans son espace). Le devis passe « refusé », la sollicitation « refusée » ; le
  refus est définitif et **libère la place** dans le plafond de deux artisans sollicités
  (RM-9.1.1) pour en solliciter un autre.
- **Révision** : « Ce que vous demandez » (dix caractères au moins, transmis à l'artisan).
  L'artisan a **sept jours** (jour de Paris) pour déposer la version suivante, en disant
  « ce qui change », ou renoncer. **Trois versions au plus** : au-delà, seuls « retenir » et
  « refuser » restent. Une version renvoyée en révision ne peut plus être retenue ; elle
  reste consultable dans l'historique des versions. Un seul devis « vivant » (déposé ou
  retenu) par demande.
- **Échéance** : sans réponse, la tâche quotidienne `maintenance-artisans` (04 h 30 UTC)
  clôt la demande (« expirée »), le devis reste « révisé » et le gérant reçoit une alerte.
- Chaque geste est rejouable sans doublon (clé d'envoi) et laisse un événement au fil de
  l'incident (`devis_refuse`, `devis_revision_demandee`, `devis_revise`,
  `devis_revision_expiree`).

> [!warning] Ce qui n'est pas livré ou pas vérifié (D18)
> - **Non vérifié** : le parcours complet dans un navigateur (refus motivé par le
>   gestionnaire, nouvelle version par l'artisan) n'a pas été joué ; la recette de
>   production ne le couvre pas (journal `log.md`, entrées du 15/10).
> - **Partiel** (constat du tour final de vérification) : le PDF du devis est celui de la
>   dernière version (les précédentes ne se relisent qu'à l'écran) ; aucune alerte dédiée au
>   gérant si l'artisan devient non affectable pendant la révision. À livrer, ou à faire
>   sortir de D18 par le dirigeant.

## Machine à états cible (référentiel V3, Livrable A5 — module 9)
**demandé** → déposé ou expiré · **déposé** → validé, refusé ou expiré · **validé** →
facturé (facture déposée) · **refusé** / **expiré** (RM-9.2.3) / **facturé** = terminaux.
Chaîne critique « facture validée » : écriture selon imputation, solde ou rapport
(RM-9.8.2–9.8.4). Voir [[Machines à états et événements]].

> [!warning] Points à trancher / contradictions
> - ~~`allow_single_private_artisan`~~ → **tranché (humain, 2026-07-25)** : le
>   **devis unique est autorisé**, avec un **drapeau/alerte visible** signalant que
>   c'est le seul devis sollicité (pas de mise en concurrence). Réconcilie la
>   variante V1 du module 9 et le drapeau du code — celui-ci passe d'interrupteur
>   caché à **signal affiché** dans la comparaison et au [[Rapport de gestion]].
> - **Score de recommandation du code** (formule prix 45 % / note 35 % / documents
>   20 %) **absent du référentiel V3** : la comparaison affiche la note composite
>   (module 11) sans formule de recommandation chiffrée. À réconcilier.
> - **États du code ≠ registre V3** : `demande/recu/refuse/expire/retenu` vs
>   demandé/déposé/validé/refusé/expiré/**facturé** — « retenu » vs « validé → facturé »
>   à réconcilier ([[Machines à états et événements]]).
>