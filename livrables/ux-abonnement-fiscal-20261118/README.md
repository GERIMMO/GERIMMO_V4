# UX 11B — Abonnement et aide fiscale

18 novembre 2026. Branche locale `codex/ux-accueil-proprietaire-20261118`, base `235b5ed71b270d591f2f56d3606af97078847016`.
Périmètre : recommandations 14 et 19 de `livrables/audit-ux-ui/recommandations.md` sur `origin/claude/audit-final-pr335`. Un seul agent ; aucun push, fusion ou déploiement.

## Corrections

- Vente indisponible : prix mensuel et annuel purement informatifs, issus des mêmes fonctions tarifaires. Ni récapitulatif de commande, ni date de débit fictive, ni formulaire de paiement. Motif exact de fermeture et lien d’assistance conservés.
- Situation réelle : échéance de l’essai lue en base, aucune prolongation inventée. L’accès offert continue de nécessiter sa preuve existante. Un abonnement suivi dont la formule manque n’est plus intitulé « essai » ; ses valeurs absentes restent « À confirmer ».
- Services inclus remontés avant les détails contractuels, conditions accessibles ; description longue de la signature repliable. Rétractation, impayés et actions de gestion toujours visibles. Formulaire Stripe et consentements inchangés lorsque les gardes autorisent la souscription. Présentation agence conservée.
- Fiscalité : « Revenus N — déclaration en N+1 », filtres et exports toujours sur l’année des revenus. Justification fiscale formulée simplement ; références et limites accessibles dans les détails. Recettes confirmées, informations à vérifier et absence de calcul/estimation d’impôt distinguées.
- Mobile : textes d’essai et de fermeture sur une largeur lisible ; détails et contact placés au-dessous.

## Vérifications exécutées

- 193 tests distincts réussis, 0 échec, 0 ignoré, 10 suites (voir `tests-finaux.log`). Essai actif/expiré, abonnement fictif mensuel/annuel, montant contractuel réduit ou manquant, absence de fausse prolongation, accès offert justifié, fermeture commerciale malgré Stripe disponible, conservation du vrai formulaire et des consentements lorsqu’autorisé.
- Fiscalité particulier, SCI IR/IS, consultation seule, absence de profil et erreurs de lecture ; revenus 2025/2026/2027 ; séparation des recettes locatives et charges (exemple : 840 € encaissés, 780 € de loyer hors charges), exports et périodes inchangés.
- 37 tests de la suite d’essai inclus dans les 193, dont les 9 scénarios PostgreSQL initialement ignorés sans connexion : rejoués avec succès sur la base fictive locale, en transactions annulées. Deux mois calendaires permanents, sans conversion automatique. Ne pas additionner cette preuve aux 193.
- TypeScript et ESLint ciblé : codes de sortie 0. `git diff --check` : succès.
- Navigateur Chromium, comptes fictifs locaux particulier et SCI, 390/1440 px : quatre passages interactifs réussis. Détails signature, lien des conditions dans un nouvel onglet, assistance, changement d’année fiscale par formulaire et lien d’export contrôlés. Aucun débordement ni erreur JavaScript dans ces passages. Aucun POST métier ni appel externe autorisé.
- 24 captures avant/après ; les montants présents restent identiques. Les dossiers fiscaux capturés sont incomplets : les résultats chiffrés et profils SCI confirmés sont couverts par les tests de rendu/calcul, pas présentés comme une déclaration réelle.

## Limites et conservation

L’essai expiré et les variantes d’abonnement sont vérifiés en rendus serveur sur données simulées ; le navigateur utilise un abonnement fictif partiel et un essai SCI actif. Mobile simulé, aucun appareil physique. Aucun paiement ni appel Stripe réel effectué. Les scénarios financiers ne sont pas une validation juridique de la déclaration.
Les six reproductions ajoutées échouaient avant correction (voir `reproduction-avant.txt`). Trois anciennes assertions de présentation ont été actualisées pour retirer le faux récapitulatif de paiement. Une première relance avec le lanceur Web en `development` a fermé les formulaires simulés : relance finale en `NODE_ENV=test`, sans modification des gardes applicatives.
Aucun prix, fonction de calcul, action serveur, règle fiscale, droit, fichier contractuel ou migration modifié. Aucune donnée métier de recette existante modifiée par les parcours navigateur. Les sessions locales ne sont pas incluses dans Git.

## Reproduction locale

Dans `app`, exécuter Vitest sur les dix fichiers de `tests-finaux.log`, avec `NODE_ENV=test` et `SUPABASE_DB_URL` visant exclusivement le PostgreSQL fictif. Le banc local existant fournit l’émulateur et les données ; les scripts `captures.cjs` / `gestes.cjs` attendent deux sessions fictives locales dans leur dossier (ne jamais commiter ces sessions), `fixtures.json`, et l’application sur `localhost:3100`. Les scripts bloquent toute écriture HTTP et toute destination externe.

## Captures

| Profil | Écran | Largeur | Avant | Après |
|---|---|---|---|---|
| particulier | abonnement | 390 px | [Avant](captures/avant-particulier-abonnement-390.png) | [Après](captures/apres-particulier-abonnement-390.png) |
| particulier | abonnement | 1440 px | [Avant](captures/avant-particulier-abonnement-1440.png) | [Après](captures/apres-particulier-abonnement-1440.png) |
| particulier | fiscal-2025 | 390 px | [Avant](captures/avant-particulier-fiscal-2025-390.png) | [Après](captures/apres-particulier-fiscal-2025-390.png) |
| particulier | fiscal-2025 | 1440 px | [Avant](captures/avant-particulier-fiscal-2025-1440.png) | [Après](captures/apres-particulier-fiscal-2025-1440.png) |
| particulier | fiscal-2026 | 390 px | [Avant](captures/avant-particulier-fiscal-2026-390.png) | [Après](captures/apres-particulier-fiscal-2026-390.png) |
| particulier | fiscal-2026 | 1440 px | [Avant](captures/avant-particulier-fiscal-2026-1440.png) | [Après](captures/apres-particulier-fiscal-2026-1440.png) |
| sci | abonnement | 390 px | [Avant](captures/avant-sci-abonnement-390.png) | [Après](captures/apres-sci-abonnement-390.png) |
| sci | abonnement | 1440 px | [Avant](captures/avant-sci-abonnement-1440.png) | [Après](captures/apres-sci-abonnement-1440.png) |
| sci | fiscal-2025 | 390 px | [Avant](captures/avant-sci-fiscal-2025-390.png) | [Après](captures/apres-sci-fiscal-2025-390.png) |
| sci | fiscal-2025 | 1440 px | [Avant](captures/avant-sci-fiscal-2025-1440.png) | [Après](captures/apres-sci-fiscal-2025-1440.png) |
| sci | fiscal-2026 | 390 px | [Avant](captures/avant-sci-fiscal-2026-390.png) | [Après](captures/apres-sci-fiscal-2026-390.png) |
| sci | fiscal-2026 | 1440 px | [Avant](captures/avant-sci-fiscal-2026-1440.png) | [Après](captures/apres-sci-fiscal-2026-1440.png) |
