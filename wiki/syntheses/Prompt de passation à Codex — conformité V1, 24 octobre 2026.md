---
type: synthesis
tags: [passation, codex, conformite, conditions-v1, production]
status: in-progress
created: 2026-10-24
updated: 2026-10-24
sources: ["[[Prompt de passation à Codex — état du 16 octobre 2026]]", "[[Informations manquantes — 23 octobre 2026]]"]
---

# Prompt de passation à Codex — conformité V1, 24 octobre 2026

Claude s'arrête le 24/10 vers 08 h UTC (fin de crédit). Ce document dit à Codex ce qui est **en production**, ce qui est **prêt sur une branche** et **ce qui reste à faire pour publier** les textes de la conformité V1. Les règles permanentes de `app/CLAUDE.md` et de la passation du 16/10 (§ 6) s'appliquent sans changement.

## 1. En production (rien à refaire)

- `main` = `31377f5`. Code de conformité V1 en ligne : PR #246 (`f79674c`) et correctif Stripe #247 (`31377f5`) ; détail dans `log.md`, entrées du 24/10.
- Migrations appliquées jusqu'à `20261024140000` (plus `20261023164629` de la PR #242, appliquée **après** `20261023184512`).
- Contrôles verts sur `31377f5` : recette de production 40070545849, Stripe en clés de test 40070544249. Production : 1 compte, 0 organisation.
- Les conditions **en ligne restent celles du 30/09/2026** (`CONDITIONS_VERSION` 2026-09-30) tant que la publication ci-dessous n'est pas faite.

## 2. Prêt sur la branche `claude/compassionate-euler-qpqjp6` (tête `b3ef106`, partie de `31377f5`)

Douze commits, non relus en dernière passe :
1. Conditions clients V1 et conditions de l'espace artisan (`app/src/app/conditions/page.tsx`, `app/src/app/conditions/artisans/page.tsx`), avec leurs relectures adverses du 23-24/10.
2. Confidentialité V1, mentions et pages publiques (lot 4), avec leurs relectures.
3. `46b0328` : textes alignés sur le code livré (chaque phrase qui promet un comportement).
4. `a58184c` : migration **`20261024150000_activation_inactivite_v1.sql`** (règle `compte:inactif` active) et `VERSION_MIN_INACTIVITE`.
5. `f16f063`, `36ef05d` : versions définitives au **24/10/2026** (`CONDITIONS_VERSION`, `CONDITIONS_ARTISANS_VERSION`, `conditions-versions.json`, pages relevées sur `next start`).
6. `41f4270` : **modification en cours, non vérifiée**, de `app/e2e/conditions-flux.spec.ts` (l'agent a été interrompu dessus).
7. `b3ef106` : wiki du lot 6 (9 pages créées, 17 modifiées, `index.md`), non relu.

## 3. Ce que Codex fait pour publier

1. **Vérifier la branche** : batterie complète (base de test = production + migrations jusqu'à `20261024150000`, vitest complet, `tsc`, lint, build, e2e). Trancher `41f4270` (garder s'il est juste, sinon corriger).
2. **Relecture adverse** (elle n'a pas pu tourner) :
   - textes contre code : chaque article des conditions, de la confidentialité, de `/tarifs` et de « Mon abonnement » décrit ce que fait le code en production (rétractation, confirmation, résiliation, impayé J+15/J+30, conservation = `retention_rules`, fermeture, export, signature de la caution, du garant et de l'état des lieux) ;
   - lecture juridique : aucune clause abusive, renvois d'articles justes, décisions du dirigeant du 23/10 respectées (médiateur non bloquant, factures 6 ans, preuve 10 ans, cautionnement et état des lieux signés dans Gerimmo), aucun fait inventé ;
   - non-régression : écran « Nos conditions générales évoluent » pour les comptes existants, acceptation des artisans désormais active, migration `150000` sûre, `e2e/recette-production/preparer-comptes.sql` à la version 2026-10-24 ;
   - wiki du lot 6.
3. **Date** : si la publication a lieu après le 24/10, remplacer partout `2026-10-24` / « 24 octobre 2026 » (constantes de `app/src/lib/editeur.ts`, `VERSION_MIN_INACTIVITE`, `conditions-versions.json` et empreintes, `preparer-comptes.sql`, pages relevées) par la date réelle.
4. **Mise en ligne, protocole habituel** : PR ; CI verte sur le SHA exact ; « Sauvegarde quotidienne » (**jamais en même temps qu'une simulation** : interblocage constaté le 24/10) ; simulation puis application de `20261024150000_activation_inactivite_v1.sql` ; fusion squash au SHA exact ; Vercel READY ; recette de production et Stripe en clés de test sur `main` ; entrée `deploy` dans `log.md`.

## 4. Pièges connus du 24/10

- Les retours arrière doivent retirer leur version sous ses deux formes (`left(version, 14) = '…'`) : la CI inscrit le nom du fichier, la production 14 chiffres.
- Le manifeste `e2e/local/ordre-migrations.txt` suit l'ordre **réel** de la production, pas l'horodatage.
- Stripe refuse `submit_type: "pay"` en mode abonnement : ne pas le remettre ; aucun texte ne doit promettre un bouton « Payer ».

## 5. Gestes du dirigeant (rappel)

- **Avant** la publication : archiver la version 2026-09-30 depuis `/admin/sante` (« Archiver la version en vigueur des conditions », compte de supervision permanent, second facteur) ; **après** : archiver de la même façon la version 2026-10-24.
- Stripe Billing : « marquer l'abonnement comme impayé », sans annulation automatique avant J+30.
- Médiateur de la consommation, accords de sous-traitance (DPA), assurance RC professionnelle.
- Le 25/10 : vérifier la première exécution de la tâche « fermetures-comptes » (3 h 20 UTC).

> [!warning] Points à trancher / contradictions
> - Branche non relue en dernière passe : ne rien publier sans la relecture du § 3.2.
> - Textes de loi reproduits (annexe L. 215, encadré de garantie, formulaire de rétractation) : à recomparer mot pour mot sur Légifrance (source non ouverte le 23/10/2026).


## Suite de la passation — 24 octobre, publication par Codex

Relecture achevée et corrections livrées par [#248](https://github.com/GERIMMO/GERIMMO_V4/pull/248), main `a519f3a`. CI verte, sauvegarde entièrement terminée avant simulation, migration 150000 simulée puis appliquée, Vercel READY. Archives du 30 septembre et des deux conditions V1 enregistrées. Recette de production 40081401588 : 67 réussis, 1 ignoré, nettoyage vérifié ; Stripe 40081459350 : 14 réussis, aucun argent réel. Détail des corrections, sources, limites et identifiants : [[Relecture adverse et publication conformité V1 — 24 octobre 2026]] et entrées `deploy`/`audit` de `log.md` du 24 octobre. Les gestes externes du § 5 et le contrôle nocturne du 25/10 restent à confirmer.
