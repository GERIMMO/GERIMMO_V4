---
type: concept
tags: [devis, incident, artisan]
status: in-progress
created: 2026-07-21
updated: 2026-07-24
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a5-etats-et-evenements]]", "[[2026-07-24-gerimmo-v3-module-9-devis-et-facturation]]"]
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