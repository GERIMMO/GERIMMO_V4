---
type: synthesis
tags: [charte, visuel, ux, espace-agent, design-system]
status: stable
created: 2026-08-03
updated: 2026-08-03
sources: ["raw/Gerimmo-V3/docs/03-design-system.md"]
---

# Charte visuelle de l'espace agent

> [!warning] Supplantée le 2026-08-08
> La maquette cliquable ([[2026-08-08-maquette-prototype-cliquable]]) devient la
> référence graphique (« charte v2 ») : palette encre bleue/laiton/crème,
> Instrument Sans à la place de Jost, bandeau encre, puces à fond doux. Les
> principes d'usage ci-dessous (concevoir pour un agent débutant, français
> intégral, marque blanche par jetons) restent valables ; les valeurs de
> couleurs/polices de cette page ne le sont plus.

**En une phrase :** complète le squelette `03-design-system.md` de V3 (sections
« à compléter ») avec les conventions **validées en recette** le 2026-08-02 — pour
qu'un écran futur (S7 incidents…) naisse conforme au lieu d'être harmonisé après coup.

**Principe directeur (décision humain, 2026-08-02) :** concevoir pour un **agent
immobilier débutant** — dynamique, simple à utiliser, agréable à voir. L'écran
enseigne le métier en même temps qu'il le fait faire. Périmètre actuel : **espace
agent uniquement**.

## Base (reprise du fichier V3, inchangée)

- Next.js App Router · Tailwind CSS v4 · shadcn/ui ; composants de base dans
  `src/components/ui` à conserver.
- **Interface entièrement en français.** Corollaire durci en recette : **aucun code
  interne à l'écran** — les références `RM-x.y.z` vivent en commentaire de code,
  jamais dans un libellé ; les sigles s'écrivent en clair la première fois
  (« état des lieux », « lettre recommandée avec accusé de réception (LRAR) »,
  « mise en demeure » ; « GED » → « documents »).
- Couleurs uniquement via variables CSS (`globals.css`) — jamais en dur : prérequis
  de la [[Marque blanche]] (logo + 2 couleurs par agence, module 17).

## Les six patterns de l'espace agent

| Pattern | Règle | Référence |
|---|---|---|
| **« À faire maintenant »** | Un bandeau en tête de page de travail, 3 étapes numérotées maximum, déduites des données, chacune ancrée vers sa carte ; il se met à jour à chaque action et disparaît quand tout est fait | `baux/[bailId]/page.tsx` |
| **Section repliée + pastille** | Toute section longue est repliée sur un résumé d'une ligne ; l'incomplet se signale par une pastille `⚠ …` courte (« 2 manquants », « À valider »), jamais en s'ouvrant de force ; une ancre `#id` ouvre et défile | `section-lot.tsx` |
| **Ligne actionnable** | Ce qui est attendu a sa ligne, présent ou absent ; l'action est un bouton au bout de la ligne (« Déposer », « Voir », « Corriger → ») pré-rempli du contexte | `lignes-diagnostics.tsx` |
| **Questionnaire progressif** | Un choix commande la suite du formulaire ; changer le choix réinitialise la suite ; le bouton final reflète ce qui va se passer (« Créer le bien et ses 3 lots ») | `formulaire-bien.tsx` |
| **Proposé, validé en un clic** | Ce qui peut être calculé est affiché prêt à valider (clé par surface, expiration d'un diagnostic) ; « Modifier » ouvre l'ajustement ; le clic humain reste sur ce qui engage | `formulaire-cle.tsx` |
| **Alerte = obligation non tenue** | Une alerte signale un manquement réel, pas un état vide ; les bonnes nouvelles restent neutres (« Aucun écart ») — une alarme partout ne signale plus rien | recette du 2026-08-02 |

## États d'interface (sections « à compléter » du fichier V3)

### Vide

Un état vide **guide vers l'action** : phrase d'accroche courte + bouton primaire
dans la carte (« Créer mon premier bien »). Distinguer « rien pour l'instant »
(→ bouton de création) de « aucun résultat avec ces filtres » (→ « Réinitialiser
les filtres »). Jamais de cul-de-sac passif.

### Erreur

Toute action a un retour visible : formulaires via `useActionState`, erreur en
`text-destructive` **à côté du bouton qui a échoué**, succès en
`text-success-soft-foreground`. Interdit : `form action={async () => …}` qui avale
l'erreur (deux bugs réels trouvés ainsi en recette). Une action interdite au rôle
courant est **désactivée avec l'explication**, pas refusée après le clic.

### Chargement

Boutons : libellé remplacé par `…` + `disabled` pendant l'action (convention
`enCours` existante). Pas de spinner global.

## Formats

- **Dates : `02/08/2026`** partout (`formaterDate`) — jamais de date ISO brute.
- **Montants : `1 213,49 €`** (`toLocaleString("fr-FR")` + `minimumFractionDigits: 2`)
  — jamais de point décimal.
- **Échéances : le retard se voit** — dépassée : `text-destructive`
  « ⚠ en retard de N j » ; sous 7 jours : ton warning ; sinon neutre.
- Tons sémantiques : `-soft` (`success-soft`, `warning-soft`, `destructive-soft`)
  pour les fonds ; jamais de couleur en dur.

## Accessibilité (section « à compléter » du fichier V3)

- Un vrai `<button>` pour toute action (pas de `div` cliquable ; `nativeButton`
  corrigé le 2026-08-02) ; les boutons-icônes (`✕`) portent un `aria-label` et un
  libellé explicite (« Retirer »).
- Jamais de `<form>` imbriqué (hydratation cassée — bug réel corrigé).
- Une action destructive se confirme en rappelant l'objet exact
  (« Retirer cet encaissement de 850 € du 05/07 ? »).

## Relations

Complète `raw/Gerimmo-V3/docs/03-design-system.md` (immuable) · contrainte
[[Marque blanche]] (couleurs en variables) · appliquée par la recette du 2026-08-02
(`app/docs/propositions-visuelles-2026-08-02.md`) · vaudra pour les écrans S7
([[Cycle de vie d'un incident]]).
