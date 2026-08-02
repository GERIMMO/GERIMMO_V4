# Reprise de session — où on en est (3 août 2026)

> Fichier de relais : à lire en premier quand on reprend le projet depuis un autre
> appareil (Claude Code web sur téléphone, autre poste…).

## Le projet en une phrase

Gerimmo, SaaS de gérance immobilière (Next.js 16 + Supabase + Vercel). Le dépôt est
aussi un coffre Obsidian : le **référentiel métier** vit dans `wiki/`, l'application
dans `app/`. Toute règle métier se vérifie dans `wiki/` avant d'être codée.

## Où on en est

**Sprints livrés** : S0–S6 et S8 complets (parc, dossier/mandat, bail/EDL, loyers &
quittances, comptabilité, garanties + copropriété). **S7 (incidents/artisans) non
commencé.** 96 tests verts.

**Ce qui vient d'être fait (2 août)** : la recette complète de l'espace agent a été
rejouée écran par écran dans un navigateur, blocs 1 à 9, tous validés. Elle a produit
9 correctifs, dont deux vrais bugs de base :

- `activer_bail` ne posait jamais `date_debut` → un bail actif ne pouvait pas générer
  son échéancier
- un reçu de paiement partiel bloquait définitivement la quittance du mois → il est
  maintenant promu en quittance quand l'appel est soldé

## La décision en cours

**Périmètre : espace agent immobilier uniquement** (décidé le 2 août).

Le document **`app/docs/propositions-visuelles-2026-08-02.md`** contient 16 propositions
d'amélioration visuelle + 7 constats du parcours réel, priorisées. Elles viennent d'un
audit de chaque écran croisé avec la recette. **C'est le sujet à arbitrer.**

Découpage proposé :

- **Tranche 1** (rapide, sans risque) : supprimer le jargon visible (codes `RM-x.y.z`,
  sigles GED/EDL/LRAR), échéances dépassées en rouge, formats de dates et montants
  unifiés, états vides qui guident, dates pré-remplies.
- **Tranche 2** (chantiers de fond) : généraliser le bandeau « À faire maintenant »,
  replier les sections longues, rendre chaque ligne actionnable, confirmer les
  suppressions, rattacher une écriture comptable à un lot.
- **La charte visuelle** reste à écrire : `raw/Gerimmo-V3/docs/03-design-system.md`
  n'est qu'un squelette (« à compléter » partout).

## Directive produit permanente

Concevoir pour un **agent immobilier débutant** : simple, progressif (« le site se
déroule au fur et à mesure des clics »), une prochaine étape évidente par écran, aucun
jargon à l'écran, le manquement signalé là où on regarde avec le bouton qui y mène.

Patterns déjà établis, à réutiliser plutôt qu'à réinventer :

| Pattern | Où le voir |
|---|---|
| Bandeau « À faire maintenant » | `app/src/app/agence/[orgId]/baux/[bailId]/page.tsx` |
| Section repliée + pastille ⚠ | `.../parc/[bienId]/lots/[lotId]/section-lot.tsx` |
| Ligne actionnable (bouton au bout) | `.../parc/[bienId]/lignes-diagnostics.tsx` |
| Questionnaire progressif | `.../parc/formulaire-bien.tsx` |

## Ce qui ne marchera PAS depuis un environnement cloud

À savoir avant de promettre quoi que ce soit :

- **Pas d'accès à la base** : les identifiants sont dans `app/.env.local`, jamais
  commité. Donc pas de vérification en base, et `npm test` ignore les tests
  d'intégration (`describe.skipIf(!DB_URL)`).
- **Pas de serveur local** : `localhost:3000` tourne sur le Mac. Pour voir
  l'application, utiliser le déploiement : <https://gerimmo-v4.vercel.app>
- **Pas d'envoi d'e-mail** : `RESEND_API_KEY` est également dans `.env.local`.

Conséquence pratique : depuis le téléphone, privilégier **décider, rédiger, relire** —
et garder l'exécution vérifiée pour le Mac.

## Comptes de démo

`agent.alpha@` · `admin.alpha@` (clôture comptable) · `locataire.alpha@` · `multi@`
(deux agences) — tous en `@gerimmo-demo.fr`. Mot de passe commun dans
`app/supabase/seed.sql`.

## À lire aussi

- `app/docs/recette-2026-08-02.md` — le plan de recette complet, 9 blocs
- `app/docs/propositions-visuelles-2026-08-02.md` — les 16 propositions à arbitrer
- `CLAUDE.md` (racine) — les règles d'entretien du wiki métier
