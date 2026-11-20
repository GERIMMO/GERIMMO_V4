# Rapport de non-régression — refonte « Maison »

**Date : 20 novembre 2026.** Branche `claude/refonte-design-gerimmo`, commit `9a656950`, pull request [#350](https://github.com/GERIMMO/GERIMMO_V4/pull/350). Base : `main` = `be3bf5b0` (production).

**Sur quel commit portent les chiffres.** Les suites complètes du banc (style, types, tests unitaires, parcours Chromium) ont tourné deux fois : sur `752fcad7`, puis sur le commit final `9a656950` (qui n'ajoute que quatre lignes de style). Le second parcours des écrans (932 passages) a été fait sur `752fcad7` ; le parcours WebKit du § 2 bis sur les deux.

Tous les essais sont faits sur un **banc isolé**, base PostgreSQL locale, **données fictives**. Rien n'a été lancé contre la production.

## 1. Résultat en une ligne

**Aucune régression constatée sur le banc ; l'intégration continue reste rouge sur une étape, les parcours WebKit mobile.** Je ne peux pas lire quel test échoue depuis cet environnement (accès réseau refusé). La pull request n'est donc **pas prête à fusionner** tant que ce point n'est pas levé.

## 2. Ce qui a été lancé

| Contrôle | Résultat | Détail |
|---|---|---|
| Contrôle de style du code (`npm run lint`) | **0 erreur** | tout le projet |
| Types (`tsc --noEmit`) | **0 erreur** | tout le projet |
| Construction de production (`npm run build`) | **réussie** | Next.js 16.4.6 |
| Tests unitaires et d'intégration (`vitest`) | **12 949 réussis, 0 échec**, 37 ignorés (932 fichiers), sur `752fcad7` puis sur le commit final ; 2 fichiers « navigateur » rejoués avec un alias de Chromium (6 tests réussis) ; 2 fichiers ne peuvent pas démarrer sur le banc (voir § 6) | sur un banc neuf |
| Parcours navigateur complets (`playwright`) | **0 échec** : 282 réussis sur `752fcad7` ; sur le commit final, 281 réussis et 1 instable (échec puis réussite à la reprise : le simulateur de prix de la vitrine, voir § 6), 3 ignorés (285 tests, 73 fichiers) | suite du dépôt, serveur de production local |
| Second parcours des écrans (« après ») | **932 passages, 0 erreur HTTP, 0 débordement, 0 erreur de console** | 4 largeurs : 375, 768, 1024, 1440 px |
| Pages restées hors du premier parcours | **9 pages ouvertes aux 4 largeurs, 0 défaut** | ouvertes avec des données fictives du banc |
| Accessibilité automatique (axe, WCAG 2.2 A et AA) | **0 défaut grave** sur 416 analyses | à 375 et 1440 px |
| Intégration continue de la pull request | **en échec** sur `9a656950` ([run 44692530438](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/44692530438)), à la seule étape « parcours essentiels sur WebKit mobile » ; les autres étapes lancées sont vertes (style, types, construction, tests unitaires et PDF, parcours Chromium, envois fictifs). Échec reproductible, cause non confirmée : voir § 6. | sur GitHub |

## 2 bis. Parcours dans un vrai moteur WebKit

Le banc n'a qu'un Chromium, et la suite WebKit du dépôt ne peut pas y tourner. J'ai donc installé le **moteur WebKit du système** (WebKitGTK 2.52.6, la famille de moteur de Safari) et je l'ai piloté pour ouvrir, avec les comptes fictifs, **les 180 écrans de la matrice du dépôt**, à **390 px** puis à **360 px**. Sur chaque écran : débordement horizontal, et analyse axe complète (bonnes pratiques comprises, comme le font les tests du dépôt).

| Largeur | Écrans | Débordements | Défauts graves (axe) | Remarques modérées |
|---|---:|---:|---:|---|
| 390 px (avant correctif) | 180 | **1** : `/admin/territoire`, 12 px | 0 | 3, antérieures à la refonte (voir § 6) |
| 360 px (après correctif) | 180 | **0** | 0 | les 3 mêmes |

- **Le défaut trouvé** : une mention en capitales, passée de 11 à 12 px par la refonte, ne revenait pas à la ligne et dépassait l'écran dans WebKit, pas dans Chromium. Corrigé (`9a656950`), revérifié à 390 et 320 px : 0 débordement.
- **Trois parcours rejoués à la main dans ce moteur**, sans défaut : la page des utilisateurs de la supervision à 320, 390 et 1440 px ; le menu, les questions fréquentes et le simulateur de la vitrine ; l'assistant de l'espace propriétaire (ouverture, envoi, message d'indisponibilité).

**Ce que cela ne prouve pas** : ce n'est ni Safari sur iPhone, ni le WebKit de Playwright que lance l'intégration continue (version différente), ni un essai au doigt.

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

**Ce que la refonte ne touche pas**, vérifié par comparaison avec `main` : `app/supabase/**` (migrations, politiques) : 0 fichier · `src/app/actions/**` et tout fichier « use server » : 0 · routes d'API (`route.ts`) : 0 · `src/proxy.ts` : 0 · `package.json` et verrou des dépendances : 0 · `app/e2e/**` (parcours navigateur) : 0 · `.github/**` : 0 · `src/lib/**` : un seul fichier, nouveau (`continuite-espace.ts`, la mémoire de l'espace d'où l'on vient). Sur 307 fichiers modifiés : 229 composants d'écran, 67 feuilles de style, 3 polices, 5 modules (dont 3 tests).

## 5. Tests modifiés (aucun supprimé, aucun ignoré)

| Fichier | Changement | Pourquoi |
|---|---|---|
| `tests/continuite-espace.test.ts` | **nouveau**, 7 tests | vérifie le bandeau de retour : quel espace est mémorisé, quelles adresses sont refusées |
| `tests/feuilles-espaces-navigateur.test.ts` | liste des feuilles : ajout de `systeme` ; couleur attendue du bouton par défaut du locataire : bleu nuit au lieu d'or | le test charge les mêmes feuilles que l'application ; le bouton principal devient bleu nuit partout (décision de la refonte) |
| `tests/titres-hierarchie-espaces.test.ts` | nombre de titres attendu : 39 → 42 | trois titres de carte ajoutés sur « Mes données » |

Aucun test supprimé, aucun test ignoré, aucune assertion retirée. Quand un test protégeait un libellé, le libellé est resté.

## 6. Ce qui échoue ou n'a pas pu être lancé

**Aucun test n'échoue sur le banc.** Ce qui n'a pas pu être lancé ou reste ouvert :

- `tests/lot2-auth-reel.test.ts` et `tests/lot3-notifications-base.test.ts` : ils exigent un service d'authentification et une base « Lot 3 » que le banc ne fournit pas (« Service fictif local exigé », « Base Lot3 fictive obligatoire »). L'intégration continue les lance : son étape de tests unitaires est verte.
- `tests/ux-accueil-dirigeant-navigateur.test.ts` et `tests/ux-console-direction-navigateur.test.ts` : ils demandent une version de Chromium que le banc n'a pas. Rejoués avec un alias vers la version présente : **6 tests réussis**.
- 3 parcours navigateur sont ignorés par leurs propres conditions (aucun fichier de parcours n'est modifié par la refonte).
- **1 parcours instable** sous Chromium sur le commit final : le simulateur de prix de la vitrine (échec, puis réussite à la reprise). Voir la piste ci-dessous.
- Les parcours **WebKit** de la suite (moteur de Safari, version Playwright) ne peuvent pas tourner sur le banc : le téléchargement de ce moteur est refusé par la politique réseau. À la place : parcours des 180 écrans dans le WebKit du système (voir § 2 bis).
- **Intégration continue : étape « parcours essentiels sur WebKit mobile » en échec** sur `9a656950`. Elle réussit sur `main`. Le journal de cette étape n'est pas lisible depuis le banc (l'outil ne rend que la fin du journal, occupée par la base de test ; le téléchargement du journal complet et celui du moteur WebKit de Playwright sont refusés par la politique réseau de l'environnement). J'ai donc installé le moteur WebKit du système (WebKitGTK 2.52.6) et parcouru les 180 écrans dedans : un seul défaut propre à WebKit est apparu (un libellé qui dépassait de 12 px sur `/admin/territoire`), corrigé dans `9a656950`. **Piste la plus sérieuse, non confirmée** : le test « vitrine : les tarifs changent sans ambiguïté entre mois et année ». Sur le banc, sous Chromium, il a échoué une fois puis réussi à la reprise, sur le commit final : il appuie sur les touches du curseur du simulateur juste après le chargement, alors que le curseur reste volontairement désactivé tant que la page n'est pas active (décision D30 B). Les premiers appuis sont alors perdus (« 17,93 € » obtenu au lieu de « 19,90 € »). Mesuré dans WebKit : le curseur est encore désactivé à la fin du chargement dans 10 cas sur 10, sur `main` comme sur la branche, et devient actif environ 0,1 s plus tard. Ce test fait partie de la suite WebKit. Je n'ai pas pu vérifier que c'est bien lui qui échoue dans l'intégration continue. **Ce qui bloque** : lire le journal de l'étape (hôtes `productionresultssa*.blob.core.windows.net` et `results-receiver.actions.githubusercontent.com` refusés) ou installer le WebKit de Playwright (`cdn.playwright.dev` refusé).

- **Trois remarques de bonnes pratiques d'accessibilité, antérieures à la refonte** (niveau « modéré », hors WCAG AA), vues grâce au parcours WebKit qui lance axe sans filtre : le titre de la fenêtre « alertes à traiter » saute un niveau (`modale.tsx`, inchangé) ; la page publique du journal a deux en-têtes de niveau page ; le lien « Aller au contenu » de l'inscription d'un artisan est hors repère. Non corrigées ici : à traiter dans un lot d'accessibilité.

## 7. Ce qui n'a pas été testé

- **Aucun appareil physique** : téléphone et tablette sont simulés dans Chromium. Safari sur iPhone et un Android réel restent à essayer.
- **Les parcours WebKit de la suite du dépôt** (moteur de Safari fourni par Playwright) n'ont pas pu tourner sur le banc ; seule l'intégration continue les lance. Le parcours du § 2 bis utilise le WebKit du système : même famille de moteur, mais ni la même version, ni Safari sur iPhone.
- **Firefox** : non essayé.
- **Pas de compte SCI sur le banc** : les écrans propres à la SCI ne sont pas relus à l'œil ; ils sont couverts par les tests automatiques.
- **Performance** : pas de mesure Lighthouse. Constat de construction : la police de titre ajoutée pèse trois fichiers de 67, 59 et 81 Ko (un seul fichier préchargé, les deux autres à la demande).
- **Lecteur d'écran réel** : non essayé. L'analyse automatique (axe) ne remplace pas un essai avec VoiceOver ou NVDA.
