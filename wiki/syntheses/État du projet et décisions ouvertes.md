---
type: synthesis
tags: [etat-projet, decisions, contradictions]
status: in-progress
created: 2026-07-21
updated: 2026-07-25
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-21-fonctionnalites-par-persona-v0]]", "[[Analyse concurrentielle]]", "[[2026-07-24-gerimmo-v3-a1-modele-identite]]", "[[2026-07-24-gerimmo-v3-a3-documents-canaux-preuve]]", "[[2026-07-24-gerimmo-v3-matrice-tracabilite]]", "[[2026-07-24-gerimmo-v3-architecture-lot-0]]"]
---

# État du projet et décisions ouvertes

**Uniquement ce qui attend une décision.** L'historique des ingests est dans `log.md`
et dans les pages `wiki/sources/` ; les écarts entre le code actuel et le référentiel
V3 sont dans [[Divergences code et référentiel V3]].

État des sources (2026-07-25) : **toutes les sources sont ingérées**. Le référentiel
est complet : 22 modules de parcours + 6 livrables transverses A1–A6 — **les six
points bloquants P0 de l'audit ont chacun leur livrable**. (Le « Plan de livraison »
de `raw/assets/` est **écarté** par décision humaine du 2026-07-25 — ne pas l'ingérer.)

## A. Arbitrages attendus de l'humain

> [!note] Séance d'arbitrage du 2026-07-25 — 9 points clos
> Yousign phasé **V0 sans intégration / V1 Yousign** ([[Signature électronique]]) ·
> **identité A1 validée** (sous vigilances — [[Compte, personne et adhésion]]) ·
> **Telegram abandonné** ([[Canaux de communication]]) · fiscalité **2044 en V1,
> autres régimes V2** ([[Fiscalité]]) · diagnostic expiré non bloquant sur lot loué
> **confirmé** ([[Diagnostic]]) · **devis unique autorisé avec drapeau visible**
> ([[Devis]]) · propriétaire client d'agence **maintenu désactivé** · **vue scindée
> du bien** actée ([[Document]]) · résidus de conservation **fixés** (diagnostics
> gestion + 5 ans, rapport d'import 3 ans, quittances locataire 10 ans). Détail dans
> `log.md`.

> [!note] Suite et fin de la séance — les 4 derniers points clos le 2026-07-25
> **Tarification** : structure actée — PD **par bien**, agences **par paliers de
> lots** ([[Grille tarifaire]]) · **Décompte de restitution** : deux vitesses —
> intégrale = email + espace ; avec retenues = **alerte LRAR au gérant**, justificatif
> déposé en GED avec date de première présentation
> ([[Restitution du dépôt de garantie]]) · **Machine du lot** : le module 0 fait foi,
> registre A5 à amender ([[Lot]]) · **P1.2 : NON** — le mandant reste en réception
> pure, **l'audit est intégralement soldé** ([[Propriétaire bailleur]]).

**Plus aucun arbitrage en attente** (2026-07-25). Dernier point clos : grille PD
validée (1ᵉʳ bien gratuit, 2,50 €/bien/mois, sans mise en place) et grille agences
actuelle conservée → [[Grille tarifaire]]. **Feu vert au développement.**

## B. Choix techniques et produits restant à faire (référentiel)

> [!note] Décision 2026-07-25 — infrastructure : « après les devs »
> Les sujets antivirus, configuration d'hébergement (Vercel + Supabase : région UE,
> plan Pro, network restrictions) et jalons sécurité restent **ouverts
> volontairement, à revoir après les développements**. Les validations externes
> (expert-comptable, conseil juridique, audit sécurité) sont **écartées** — revue
> interne par l'agent ; les documents juridiques ont été **rédigés par l'agent**
> (dossier `livrables/`).

- **Service antivirus** — avant l'étape 3 du lot 0 et **avant développement** (A4) ;
  sa localisation entre au tableau des sous-traitants. → [[Architecture du socle V3]]
- **Jalons sécurité A4** : configuration d'hébergement (avant développement),
  procédure de notification d'incident + **premier test de restauration** (avant
  production) ; test de restauration **trimestriel (code) vs annuel (RM-A4.12)** à
  harmoniser. *(Audit externe : écarté le 2026-07-25 — revue interne par l'agent,
  limite documentée.)* → [[Socle de sécurité]], [[Plan de reprise d'activité]]
- ~~Validation expert-comptable de la doctrine A6~~ → **écartée (2026-07-25)** :
  « Gerimmo ne gère pas la comptabilité », l'export des écritures déclarées suffit —
  chaque agence le transmet à son propre expert-comptable ([[Comptabilité]]).
  **L'article des CGU est rédigé** (`livrables/`) ; reste l'écran d'information au
  paramétrage (lot 1).
- **Format d'export définitif du journal** (séparateur, encodage — les colonnes sont
  fixées par A6, RM-A6.11) — lot 1.
- **Lien sécurisé ponctuel pour le devis** (réutiliser le mécanisme Yousign ?) — lot 3.
- **Calendrier du lot 0** : quand démarrer l'architecture.
  → [[2026-07-24-gerimmo-v3-matrice-tracabilite]]
- ~~Validation juridique de la matrice canaux/preuve (A3)~~ → **assurée en interne**
  (décision 2026-07-25) ; la piste du **recommandé électronique qualifié** reste à
  instruire. → [[Notification et valeur probante]]
- ~~Livrables juridiques A2~~ → **rédigés par l'agent le 2026-07-25** (dossier
  `livrables/`) : contrat de sous-traitance type, politique de confidentialité,
  **AIPD score artisan**. Restent à produire en interne avant production : **registre
  des traitements plateforme**, **procédure de notification de violation**. → [[RGPD]]
- ~~Résidus « indéfini / sans limite »~~ → **fixés le 2026-07-25** : diagnostics
  = gestion du bien + 5 ans ; rapport d'import = 3 ans ; quittances côté locataire
  = la durée de conservation (10 ans). Pages mises à jour.
- **Surface Carrez datée** (mesureur + date) : réserve V2 — sans elle, indéfendable en
  contestation > 5 %. → [[Lot]]
- **RM-1.7.2 à simplifier** à la reprise du module 1 (double PDF sans objet avec
  Yousign). → [[Signature électronique]]

## C. Connaissance métier manquante (hors référentiel)

- **Proposition de valeur / cible / problème résolu** : jamais formulés — l'angle
  « gérer les problèmes, pas seulement les papiers » ([[Analyse concurrentielle]])
  reste à valider.
- **Points de douleur des personas** (surtout [[Locataire]]) : entretiens à mener.

## D. Prochaines sources

Entretiens
utilisateurs ; rafraîchissement périodique de l'[[Analyse concurrentielle]].
Les `docs/` du dépôt (vides ou obsolètes) seraient à réécrire depuis le wiki.
