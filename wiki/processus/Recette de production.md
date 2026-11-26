---
type: process
tags: [recette, production, publication, qualite, personas]
status: stable
created: 2026-09-20
updated: 2026-11-26
sources: [".github/workflows/recette-production-autonome.yml", "app/scripts/recette-production-comptes.mjs", "app/scripts/recette-production-sessions.mjs", "app/e2e/recette-production/ (playwright.config.ts, preparer-comptes.sql, purger.sql, *.spec.ts)", "GUIDE-DE-REPRISE.md (§ 5 et § 8)", "[[Passation — état du 26 novembre 2026]] (sections a, d.2, e et f)", "log.md — entrées du 21/10/2026, du 21/11/2026, du 25/11/2026 et du 26/11/2026", "JOURNAL.md — entrées des 25 et 26/11/2026", "livrables/PARCOURS-15-MINUTES.md", "[[Contrôle des livraisons de Codex — 22 octobre 2026]]"]
---

# Recette de production

**En une phrase :** après chaque publication, le workflow GitHub « Recette de production avec nettoyage » parcourt le
site en ligne (`https://www.gerimmo.app`) au gabarit d'un téléphone. Il utilise cinq comptes fictifs créés pour ce
seul passage, puis les supprime avec tous leurs dossiers.

Le banc local et la CI prouvent la logique. La recette vérifie ce qu'eux ne peuvent pas voir : le vrai service,
sa base, ses réglages et le vrai service de connexion, avec un second facteur réel pour l'artisan et la supervision.

## La règle actuelle : cinq comptes éphémères par passage (depuis le 21/10/2026)

**La décision.** Le dirigeant l'a prise le 21/10 (`log.md`, entrée « decision | Retirer tous les comptes et dossiers
sauf le superadmin »). Elle remplace celle du 17/10, qui conservait cinq comptes fixes entre deux passages. Ces
comptes ont été effacés ; la preuve est dans [[Contrôle des livraisons de Codex — 22 octobre 2026]].

**Les cinq personas.** Chaque passage porte un suffixe propre : `r<numéro d'exécution>-<tentative>`. Pour ce suffixe,
`app/e2e/recette-production/preparer-comptes.sql` crée :
- une agence en essai et son administrateur ;
- un propriétaire en gestion directe et son parc, avec un bien déjà saisi ;
- un locataire de l'agence, sans bail ;
- un artisan privé validé, rattaché à cette seule agence ;
- une supervision sans organisation, à expiration automatique (61 minutes au plus), avec un second facteur réel.

**Les adresses.** Elles ont toutes la forme `delivered+recette-<rôle>-<suffixe>@resend.dev`. Ce sont des boîtes de
test de Resend : un courrier parti par erreur est accepté puis jeté, jamais remis à une personne.

**Le mot de passe** est tiré au hasard pour le passage et masqué dans les journaux. Il n'est écrit ni dans le dépôt
ni dans le rapport (`app/scripts/recette-production-comptes.mjs`).

**L'ancien mode.** Le script garde un mode « comptes fixes » pour d'anciens bancs locaux. Aucun chantier ne le
sélectionne (commentaire d'en-tête du script).

## Le circuit

Source : `.github/workflows/recette-production-autonome.yml`.

**Déclenchement.**
- **À la main seulement** (`workflow_dispatch`) et **sur `main` seulement**. Il n'y a ni planification ni départ
  automatique après une fusion. L'ancien workflow `recette-production.yml` n'existe plus (GUIDE-DE-REPRISE.md, § 9).
- Un seul passage à la fois (groupe `recette-production`, sans annuler un passage en cours). Durée maximale :
  45 minutes.
- Option `reserves_335` : ne contrôler que « Mon abonnement » (ventes fermées), D37 et D38.

**Les étapes du workflow.**
1. **Installation** : Node 22, dépendances, Chromium de Playwright, client PostgreSQL.
2. **Vérifier que le nettoyage des fichiers sera possible.** Sans la clé de service, le passage s'arrête avant de rien
   créer.
3. **Préparer les cinq comptes** (`node scripts/recette-production-comptes.mjs preparer`). Le script refuse toute
   autre cible que la production atteinte par ce workflow sur `main`, ou un poste local.
4. **Ouvrir les sessions de l'artisan et de la supervision** avec un vrai second facteur
   (`scripts/recette-production-sessions.mjs`). L'ouverture se fait hors de Playwright : la connexion et le code ne
   laissent ni rapport, ni trace, ni capture.
5. **Parcourir les espaces sur téléphone** (`npx playwright test --config
   e2e/recette-production/playwright.config.ts`).
6. **Supprimer comptes, dossiers et supervision** (`… purger`). Cette étape tourne **toujours**, même après un échec
   (`if: always()`). Dans l'ordre, la purge :
   - retire d'abord le privilège de supervision ;
   - efface les fichiers par l'API Storage ;
   - efface les données par `purger.sql`.

   Elle refuse d'agir si une relation sort du groupe fictif. Elle exige un bilan nul : organisations, comptes, fiches
   personnes, artisans, expiration de la supervision, biens.
7. **Conserver le rapport** HTML et les captures d'échec, trois jours. Aucune trace ni vidéo n'est gardée : le dépôt
   est public, et une trace enregistrerait les cookies de session.

**Les secrets.** Le workflow lit deux secrets du dépôt GitHub : le mot de passe de la base et la clé de service. Leurs
noms figurent dans la [[Passation — état du 26 novembre 2026]], section f. Aucune valeur n'est écrite dans le dépôt,
les journaux ou les artefacts.

## Ce que la recette parcourt (fichiers de `app/e2e/recette-production/`, relus le 26/11/2026)

| Fichier | Ce qui est joué |
|---|---|
| `public.spec.ts` | Pages publiques et outils gratuits : réponse, titre, aucune erreur ni débordement. Page introuvable ; écran privé qui mène à la connexion |
| `inscription-recuperation.spec.ts` | Inscription, confirmation et récupération d'un compte fictif, par les liens fabriqués par Gerimmo |
| `admin-agence.spec.ts` | Connexion, chaque écran du menu, création d'un bien et de son lot, fiche d'un locataire, Loyers & charges, Alertes, profil, déconnexion |
| `proprietaire.spec.ts` | Parcours de démarrage, menu, création d'un bien, redirection des anciens liens `/agence/…`, « Mon abonnement » sans paiement |
| `locataire.spec.ts` | Espace lisible sans bail, menu, déconnexion |
| `artisan.spec.ts` | Quatre écrans en lecture : `/artisan`, devis, agenda, facturation |
| `depot-document.spec.ts` | Dépôt privé d'un PDF fictif de 6 Mio et consultation au téléphone |
| `devis-rendez-vous.spec.ts` | D18 : révision d'un devis, version 2, PDF des deux versions. D22 : report accepté, annulation, accusé de l'artisan |
| `reglement-facture.spec.ts` | D23 : règlement déclaré par le gérant, dépense unique, date et moyen lus par l'artisan |
| `montants-p1.spec.ts` | Les quatre contrôles « montant faux » : D04, D05, D37, D38 |
| `supervision.spec.ts` | Chaque rubrique de la console après le second facteur ; recherche de son propre espace de recette |

**Réglages** (`playwright.config.ts`) :
- gabarit 390 × 844, tactile, français, heure de Paris ;
- un seul processus, un second essai permis (`retries: 1`) ;
- cinq projets, `recette-montants` en dernier (activer un bail referme le parcours de démarrage du propriétaire).

**Les données des parcours métier.** D18, D22 et D23 partent de données insérées par la connexion à la base, dans les
deux seules organisations du passage (`fixtures-metier.ts`).

## Place dans la publication

La recette est l'étape qui suit la mise en ligne (GUIDE-DE-REPRISE.md, § 5, point 12 ; Passation, section e,
points 6 et 7) :
1. accord écrit du dirigeant pour cette publication-là ;
2. PR, relectures, CI verte sans reprise, fusion en squash, CI de `main` verte ;
3. migrations s'il y en a (simulation, sauvegarde de moins de 90 minutes, application) ;
4. publication contrôlée, jusqu'à `publiee_verifiee` ;
5. contrôles : `/api/sante` (version servie, base), pages publiques, erreurs d'exécution Vercel ;
6. **recette de production et sa purge** ;
7. une entrée `deploy` dans `log.md` et une entrée dans `JOURNAL.md`, avec les numéros d'exécution et ce qui n'a pas été
   vérifié.

**Règle de lecture des résultats** (GUIDE-DE-REPRISE.md, § 8, et leçon du 16/10). Une recette « réussie » peut cacher
un parcours passé au second essai seulement. Le journal doit nommer ce parcours. Il n'est pas compté comme propre tant
que sa cause n'est pas trouvée.

**Règle de couverture** (leçon des 18 et 19/10 : dix fusions restées sans recette). Toute mise en production est
suivie d'une recette.

## Les dernières recettes

| N° | Exécution | Version en ligne | Résultat | Source |
|---|---|---|---|---|
| 57 | 44933397659 | `81740dec` (21/11) | Réussie | `log.md`, 21/11 |
| 58 | 45720418609 | `8f9dd9c` (palier 1, 25/11) | Réussie : 67 parcours, dont 1 au second essai (inscription, à l'origine de Q125) ; purge vérifiée | `JOURNAL.md`, 25/11 ; Passation, a |
| 59, 60, 61 | 45795700074, 45798190513, 45798196475 | `1dca28b` (26/11) | Réussies : 68 parcours chacune au premier essai ; purge vérifiée | `log.md` et `JOURNAL.md`, 26/11 |
| **62** | 45882154250 | `f9e874b` (26/11) | **Réussie**, de 19:14Z à 19:26:49Z, purge comprise | Passation, a ; `JOURNAL.md`, 26/11 (soir) |

L'historique des recettes n° 4 à 25 (14 au 19/10) est dans `log.md`, aux mêmes dates. Le diagnostic des échecs au
premier essai (16/10) est dans [[Registre des anomalies — audit du 13 octobre 2026]].

## Ce que la recette ne joue pas

D'après la liste des fichiers ci-dessus (26/11/2026) :
- **aucun paiement** : « Mon abonnement » est lu, jamais cliqué ;
- **aucune signature électronique** ([[Signature électronique]]) ;
- **pas l'invitation d'un artisan par un propriétaire**. Son parcours (`app/e2e/invitation-artisan.spec.ts`) tourne
  dans la CI (`ci.yml`), pas en production ;
- **pas la remise réelle des courriers** : les boîtes resend.dev sont des puits de test. Les envois automatiques sont
  fermés (Passation, a, geste R5), et les e-mails du [[Relais du dirigeant]] ne sont pas joués ;
- **pas le PDF 2044**, ni le chemin confirmé de D38 ;
- **pas le parcours complet d'un incident**, de la déclaration à la clôture : seuls D18, D22 et D23 en jouent des
  morceaux ([[Cycle de vie d'un incident]]).

**Le contrôle humain.** Le parcours de vérification du dirigeant (`livrables/PARCOURS-15-MINUTES.md`) est fait à la
main, avec des comptes « TEST ». Il **ne remplace pas** la recette automatique. Sa partie A a été jouée par l'agent le
26/11 (sauf A7, A9, A14 et A15). Sa partie B n'est pas faite (Passation, a).

> [!warning] Points à trancher / contradictions
> - **Secrets sans environnement protégé** (réserve N10, Passation, d.2). La recette est limitée à `main`, mais tourne
>   sans environnement GitHub protégé. Elle lit deux secrets du dépôt. Isoler ces secrets dans un environnement dédié
>   et faire tourner le mot de passe sont des décisions en attente du dirigeant.
> - **Ancien tour manuel du 20/09** (persona par persona, avec une vraie carte bancaire chez Stripe) : supplanté. Les
>   ventes sont fermées, et aucun paiement réel n'est permis sans autorisation (Passation, e). Le premier paiement
>   réel remboursé reste une décision du dirigeant avant l'ouverture des ventes (gestes R7 et R8, Passation, a et d).
> - **Commentaires périmés dans le code.** `app/e2e/recette-production/depot-document.spec.ts` parle encore d'un
>   « compte permanent de recette » et de « cinq identités » gardées. Le workflow, lui, purge tout à chaque passage.
>   Commentaire à corriger ; le comportement est celui du workflow.
> - **Aperçu local du superadmin** (demande du 17/10 : base locale `gerimmo_ci_apercu_permanent`, lanceur dans
>   `outputs/`). Il est hors du dépôt et n'a pas été relu : à vérifier s'il existe encore. Il n'a jamais concerné la
>   production.
