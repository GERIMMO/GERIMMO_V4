# Rapport de non-régression — refonte « Maison »

**Date : 20 novembre 2026.** Branche `claude/refonte-design-gerimmo`, commit `656fe141`, pull request [#350](https://github.com/GERIMMO/GERIMMO_V4/pull/350). Base : `main` = `be3bf5b0` (la production au moment des essais).

**Sur quel commit portent les chiffres.** Les suites complètes du banc (style, types, tests unitaires, parcours Chromium, suite WebKit) ont tourné sur le commit final `656fe141`, après avoir déjà tourné sur `752fcad7` et `9a656950`. Le second parcours des écrans (932 passages, 4 largeurs) a été fait sur `752fcad7`, et refait pour les pages publiques sur le commit final ; les trois commits suivants ne touchent que la feuille du Design System, le chargement des polices et la seconde ligne du héros de l'accueil.

Tous les essais sont faits sur un **banc isolé**, base PostgreSQL locale, **données fictives**. Rien n'a été lancé contre la production.

## 1. Résultat en une ligne

**Aucune régression constatée : tous les contrôles sont verts, sur le banc, dans l'intégration continue et après la mise en ligne.**

## 2. Ce qui a été lancé

| Contrôle | Résultat | Détail |
|---|---|---|
| Contrôle de style du code (`npm run lint`) | **0 erreur** | tout le projet |
| Types (`tsc --noEmit`) | **0 erreur** | tout le projet |
| Construction de production (`npm run build`) | **réussie** | Next.js 16.4.6 |
| Tests unitaires et d'intégration (`vitest`) | **12 952 réussis, 0 échec**, 37 ignorés — sur le commit final ; 2 fichiers « navigateur » rejoués avec un alias de Chromium (6 tests réussis) ; 2 fichiers ne peuvent pas démarrer sur le banc (voir § 6) | sur un banc neuf |
| Parcours navigateur complets (`playwright`, Chromium) | **282 réussis, 0 échec**, 3 ignorés (285 tests, 73 fichiers) — sur le commit final ; mêmes suites déjà vertes sur `752fcad7` et `9a656950` | suite du dépôt, serveur de production local |
| Parcours WebKit de la suite (`playwright`, moteur 27.2) | **72 réussis sur 75** sur le banc, dont les 4 cas de `bouton-envoi-hydratation` ; 3 échecs propres au banc, vus aussi sur `main` (voir § 6) ; étape WebKit **verte dans l'intégration continue** | sur le banc, depuis l'autorisation réseau |
| Second parcours des écrans (« après ») | **932 passages, 0 erreur HTTP, 0 débordement, 0 erreur de console** | 4 largeurs : 375, 768, 1024, 1440 px |
| Pages restées hors du premier parcours | **9 pages ouvertes aux 4 largeurs, 0 défaut** | ouvertes avec des données fictives du banc |
| Accessibilité automatique (axe, WCAG 2.2 A et AA) | **0 défaut grave** sur 416 analyses | à 375 et 1440 px |
| Intégration continue de la pull request | **réussie** sur `656fe141` ([run 44706525726](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/44706525726)) : style, types, construction, tests unitaires et PDF, parcours Chromium, envois fictifs, parcours WebKit mobile, PostgREST réel, invitation d'artisan. Trois runs précédents ont échoué, pour deux causes trouvées et corrigées : (1) sur `a51d5106`, les contrôles d'accessibilité des parcours Chromium, à cause d'un fondu d'arrivée (retiré dans `752fcad7`) ; (2) sur `752fcad7` et `9a656950`, le parcours WebKit `bouton-envoi-hydratation`, à cause de deux fichiers de police déclarés sans être préchargés (corrigé dans `843cc3c1` et `656fe141`, voir § 2 ter). | sur GitHub |

## 2 bis. Parcours dans un vrai moteur WebKit

**a) Le moteur WebKit du système, sur tous les écrans.** Avant d'avoir accès au WebKit de Playwright, j'ai installé le moteur WebKit du système (WebKitGTK 2.52.6, la famille de moteur de Safari) et je l'ai piloté pour ouvrir, avec les comptes fictifs, **les 180 écrans de la matrice du dépôt**, à **390 px** puis à **360 px**. Sur chaque écran : débordement horizontal, et analyse axe complète (bonnes pratiques comprises).

| Largeur | Écrans | Débordements | Défauts graves (axe) | Remarques modérées |
|---|---:|---:|---:|---|
| 390 px (avant correctif) | 180 | **1** : `/admin/territoire`, 12 px | 0 | 3, antérieures à la refonte (voir § 6) |
| 360 px (après correctif) | 180 | **0** | 0 | les 3 mêmes |

Le défaut trouvé : une mention en capitales, passée de 11 à 12 px par la refonte, ne revenait pas à la ligne et dépassait l'écran dans WebKit, pas dans Chromium. Corrigé (`9a656950`), revérifié à 390 et 320 px.

**b) Le WebKit de Playwright, celui de l'intégration continue.** Vous avez autorisé l'hôte `cdn.playwright.dev` dans l'environnement : j'ai pu installer ce moteur (version 27.2) et lancer sur le banc la suite WebKit du dépôt (`npm run test:e2e:webkit`, 75 tests). Résultat sur le commit final : **72 réussis sur 75.** Les quatre cas de `bouton-envoi-hydratation` réussissent, dont « script retardé », qui échouait avant le correctif. Les 3 échecs sont propres au banc : les mêmes tests échouent ou sont instables ici sur `main` (voir § 6). Juge de paix : étape WebKit **verte dans l'intégration continue**.

**Ce que cela ne prouve pas** : ce n'est ni Safari sur iPhone, ni un essai au doigt.

## 2 ter. Pourquoi l'intégration continue échouait, et ce qui a été corrigé

L'intégration continue échouait sur le parcours WebKit `e2e/bouton-envoi-hydratation`, cas « script retardé : inerte pendant le chargement, actif dès que la page est prête ». Ce test ralentit volontairement les scripts de 3 secondes et vérifie que le bouton « Envoyer ma demande » s'affiche **désactivé**, puis s'active.

- **Ce qui se passait** : sur la branche, dans WebKit, le contenu de la page restait caché derrière « Chargement de la page… » jusqu'à l'arrivée des scripts. Le bouton n'apparaissait donc qu'une fois déjà actif, et le test échouait. Sur `main`, le contenu s'affichait tout de suite.
- **La cause** : pour alléger le chargement, j'avais déclaré deux fichiers de la police de titre « à charger seulement si besoin » (`preload: false` : latin étendu et italique). Or WebKit considère qu'une police déclarée mais pas encore chargée annonce « du contenu qui arrive encore » ; tant que l'écran ne montre presque rien, il **ne dessine rien avant la fin du chargement**. Mesuré : sur la branche, le premier dessin attendait la fin du chargement (6,1 s dans l'essai) ; sur `main`, 0,13 s.
- **La preuve** : sur la page figée, forcer le chargement de ces deux polices débloque aussitôt l'affichage.
- **Ce que cela aurait donné en production** : sur un réseau lent, un utilisateur de Safari (iPhone, Mac) serait resté devant un écran figé au lieu de voir la page s'afficher progressivement. Chromium et Firefox n'ont pas ce comportement : mes essais sous Chromium ne pouvaient pas le voir. **C'est le test WebKit du dépôt qui l'a attrapé.**
- **Le correctif** (`843cc3c1`, `656fe141`) : le fichier latin étendu est préchargé comme les autres ; le fichier italique, qui ne servait qu'à une ligne de l'accueil et pesait 81 Ko, est retiré (cette ligne reste mise en valeur par la couleur champagne). Vérifié sur les 180 écrans : **aucune police déclarée sans être préchargée**. Un test de garde (`tests/polices-prechargees.test.ts`) interdit de recommencer.
- **Une fausse piste, pour être complet** : avant d'avoir le bon moteur, j'avais soupçonné le test du simulateur de prix de la vitrine (instable une fois sur le banc sous Chromium). Ce n'était pas la cause : il réussit dans WebKit.

**Poids des polices préchargées**, mesuré sur les 180 écrans : 6 fichiers dans les espaces (≈ 197 Ko, contre 4 fichiers et ≈ 70 Ko sur `main`), 8 sur les pages publiques (≈ 239 Ko, contre 4 à 6 fichiers et 70 à 112 Ko). Le surcoût est la police de titre (deux fichiers, 126 Ko), téléchargée une fois puis gardée par le navigateur. Les pages de connexion préchargent aussi, désormais, la police des documents (42 Ko) parce qu'elles partagent la feuille de la vitrine : à alléger dans un second temps, avec une mesure de performance.

## 3. Avant / après, mesuré

| Mesure | Avant (`be3bf5b0`) | Après |
|---|---|---|
| Passages du parcours | 786 | 932 (208 écrans par largeur, plus les sous-rubriques) |
| Erreurs HTTP | 0 | 0 |
| Pages qui débordent en largeur | 0 | 0 |
| Erreurs de console | 0 | 0 |
| Défauts graves d'accessibilité (axe) | 36 éléments sur 16 écrans | **0** |
| Dégradés dans les feuilles de page et de composant | 45 | 3 |
| Passages à 375 et 768 px avec un bouton de moins de 44 px | 197 sur 360 (le bouton de recherche) | **0** sur 416 |
| Polices de titre | Georgia (absente d'Android et de Linux) | Fraunces, embarquée : 832 titres mesurés sur 832 |
| Tailles de titre d'écran différentes | 14 | **1** (26 px au téléphone, 31,68 px à 1440 px) ; seul le héros de l'accueil public garde une taille d'affiche |
| Couleurs en dur dans les feuilles de page et de composant | 1 748 dans 63 feuilles | **4** (un test les lit) dans 64 feuilles |

## 4. Protections vérifiées

| Protection | Comment | Résultat |
|---|---|---|
| Cloisonnement entre organisations (SEC-1) | tests de la base et de l'API (`api-isolation`, `sec1-documents-base`, gardes du proxy, 300 lots fictifs en CI) ; parcours navigateur `alias-espace` (un profil ne voit pas l'espace d'un autre) ; comparaison des fichiers avec `main` | **préservé** — tests réussis ; aucune garde, requête, politique ni migration modifiée |
| Second facteur (MFA) | tests `mfa`, `mfa-api`, `mfa-base`, `mfa-proxy` ; parcours navigateur `compte-securite` et connexion du super-administrateur avec code à six chiffres (banc) | **préservé** — tests réussis ; le fichier `proxy.ts` est identique à `main` |
| Règles SCI | tests `inscription-societe-base`, `fiche-societe-coordonnees`, `identite-siren-societe`, `quittance-representant-societe` ; parcours navigateur `artisan-fin-mission` (variante SCI) | **préservé** — tests réussis. Limite : pas de relecture visuelle avec un compte SCI |
| Calculs financiers | tests de cohérence des loyers, des quittances, des charges, de l'IRL et de la comptabilité ; parcours `comptabilite-vues`, `lot3-loyer-facture`, `reception-loyer-proprietaire` | **inchangés** — aucun fichier de calcul modifié ; tests réussis |
| Documents (quittance, bail, PDF) | étape « produire les documents PDF » de la suite ; tests `quittance-conforme`, `quittance-document-route` ; parcours de la quittance et de l'attestation | **inchangés sur le fond** — seul l'habillage de la page d'aperçu change ; tests réussis |
| Tarifs et ouverture des ventes | comparaison des fichiers avec `main` | **identiques** — `tarifs/page.tsx` identique à `main` ; aucune modification de l'ouverture des ventes |

**Ce que la refonte ne touche pas**, vérifié par comparaison avec `main` : `app/supabase/**` (migrations, politiques) : 0 fichier · `src/app/actions/**` et tout fichier « use server » : 0 · routes d'API (`route.ts`) : 0 · `src/proxy.ts` : 0 · `package.json` et verrou des dépendances : 0 · `app/e2e/**` (parcours navigateur) : 0 · `.github/**` : 0 · `src/lib/**` : un seul fichier, nouveau (`continuite-espace.ts`, la mémoire de l'espace d'où l'on vient). Sur 307 fichiers modifiés : 229 composants d'écran, 67 feuilles de style, 2 fichiers de police, 6 modules (dont 4 tests).

## 5. Tests modifiés (aucun supprimé, aucun ignoré)

| Fichier | Changement | Pourquoi |
|---|---|---|
| `tests/continuite-espace.test.ts` | **nouveau**, 7 tests | vérifie le bandeau de retour : quel espace est mémorisé, quelles adresses sont refusées |
| `tests/feuilles-espaces-navigateur.test.ts` | liste des feuilles : ajout de `systeme` ; couleur attendue du bouton par défaut du locataire : bleu nuit au lieu d'or | le test charge les mêmes feuilles que l'application ; le bouton principal devient bleu nuit partout (décision de la refonte) |
| `tests/titres-hierarchie-espaces.test.ts` | nombre de titres attendu : 39 → 42 | trois titres de carte ajoutés sur « Mes données » |
| `tests/polices-prechargees.test.ts` | **nouveau**, 3 tests | interdit de déclarer une police sans la précharger (cause de l'affichage figé dans Safari, § 2 ter) |

Aucun test supprimé, aucun test ignoré, aucune assertion retirée. Quand un test protégeait un libellé, le libellé est resté.

## 6. Ce qui échoue ou n'a pas pu être lancé

**Aucun échec n'est attribuable à la refonte** : l'intégration continue est verte sur le commit final, et ce qui échoue sur le banc échoue aussi sur `main`. Ce qui n'a pas pu être lancé, ou échoue pour une raison propre au banc :

- `tests/lot2-auth-reel.test.ts` et `tests/lot3-notifications-base.test.ts` : ils exigent un service d'authentification et une base « Lot 3 » que le banc ne fournit pas (« Service fictif local exigé », « Base Lot3 fictive obligatoire »). L'intégration continue les lance.
- `tests/ux-accueil-dirigeant-navigateur.test.ts` et `tests/ux-console-direction-navigateur.test.ts` : ils demandent une version de Chromium que le banc n'a pas. Rejoués avec un alias vers la version présente : **6 tests réussis**.
- 3 parcours navigateur sont ignorés par leurs propres conditions.
- **Suite WebKit, sur le banc seulement (3 tests sur 75)** :
  - `protection-saisie` (« profil : avertissement avant sortie », à 390 et 1440 px) échoue **sur `main` comme sur la branche** : le test annule un rechargement de page, et ce banc signale l'annulation plus tôt que le test ne l'attend.
  - `recommandes-consentements` est instable sur ce banc, **sur `main` comme sur la branche, avec le même message** : une requête interrompue par un rechargement de page, que WebKit signale comme une erreur, et le test n'en tolère aucune (le test lui-même décrit ce piège dans ses commentaires). Je l'ai rejoué à conditions égales, base neuve et serveur démarré à froid, 3 passes de chaque côté : sur `main`, instable aux 3 passes, dont 1 échec reprise comprise ; sur le commit final de la branche, instable à 2 passes sur 3, dont 2 échecs reprise comprise. L'écart n'est pas significatif sur si peu d'essais. Vérifié dans le diff : la refonte n'ajoute **aucun appel réseau**, aucune navigation ni aucun minuteur qui en déclenche.
  - Dans l'intégration continue, ces trois tests réussissent, sur `main` comme sur la branche (étape WebKit verte sur `843cc3c1` et sur `656fe141`).
- **Un parcours instable sous Chromium, une fois**, sur `9a656950` : le simulateur de prix de la vitrine (échec, puis réussite à la reprise). Le test appuie sur le curseur juste après le chargement, alors que le curseur reste désactivé tant que la page n'est pas active : course entre le test et l'activation, présente aussi sur `main` (mêmes délais mesurés).
- **Trois remarques de bonnes pratiques d'accessibilité, antérieures à la refonte** (niveau « modéré », hors WCAG AA), vues grâce au parcours WebKit qui lance axe sans filtre : le titre de la fenêtre « alertes à traiter » saute un niveau (`modale.tsx`, inchangé) ; la page publique du journal a deux en-têtes de niveau page ; le lien « Aller au contenu » de l'inscription d'un artisan est hors repère. Non corrigées ici : à traiter dans un lot d'accessibilité.

## 7. Ce qui n'a pas été testé

- **Aucun appareil physique** : téléphone et tablette sont simulés dans Chromium. Safari sur iPhone et un Android réel restent à essayer.
- **Safari sur un vrai iPhone** : non essayé. Les parcours WebKit du banc utilisent le même moteur que l'intégration continue, pas un appareil.
- **Firefox** : non essayé.
- **Pas de compte SCI sur le banc** : les écrans propres à la SCI ne sont pas relus à l'œil ; ils sont couverts par les tests automatiques.
- **Performance** : pas de mesure Lighthouse. Constat mesuré : 6 fichiers de police préchargés dans les espaces (≈ 197 Ko, contre 4 fichiers et ≈ 70 Ko sur `main`), 8 sur les pages publiques (≈ 239 Ko, contre 4 à 6 fichiers et 70 à 112 Ko). Le surcoût est la police de titre : deux fichiers, 126 Ko, téléchargés une fois puis gardés par le navigateur.
- **Lecteur d'écran réel** : non essayé. L'analyse automatique (axe) ne remplace pas un essai avec VoiceOver ou NVDA.

## 8. Publication

Publication demandée par le dirigeant le 20/11 (« Publie. »), faite par le circuit habituel. **Aucune migration** : la base est restée telle quelle, compatible avec la version précédente.

| Étape | Résultat |
|---|---|
| Intégration continue de la pull request | verte sur `656fe141` ([run 44706525726](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/44706525726)) |
| Fusion (squash, au SHA exact) | 20/11 à 10:28 UTC ; `main` = `d315257d` |
| Intégration continue de `main` | verte ([run 44719461252](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/44719461252)), 11 h 01 UTC |
| Version construite par Vercel, sans domaine public | `dpl_2xcydxZaMfWiAFvToPDaS3hepXuJ`, prête |
| Publication contrôlée, approuvée par le dirigeant dans GitHub | réussie à 11 h 51 UTC ([run 44724507715](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/44724507715)) |
| Production après mise en ligne (lecture seule) | `/api/sante` sert `d315257d`, base joignable ; 10 pages publiques en 200 ; une adresse inconnue répond 404 ; 8 polices préchargées sur l'accueil, aucune italique |
| Erreurs d'exécution Vercel | **0** entre 11 h 50 et 12 h 40 UTC, recette comprise |
| Recette de production avec nettoyage n° 54 | réussie à 12 h 09 UTC ([run 44731759495](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/44731759495)) : cinq comptes fictifs créés, parcours des espaces au format téléphone, puis suppression |
| Nettoyage vérifié en base (lecture seule) | 0 compte de recette, 0 espace de recette restant |
| Ventes payantes | toujours fermées (non modifié par cette publication, vérifié en lecture) |

**Retour arrière** : la version précédente (`be3bf5b0`) reste disponible dans Vercel ; aucune migration à défaire.

**Ce que la publication ne prouve pas** : la recette tourne sous Chromium au format téléphone, pas sur un appareil. Safari sur un vrai iPhone reste à essayer.
