# Gerimmo — Audit exhaustif et refonte visuelle

**Date : 20 novembre 2026.** Version auditée : `be3bf5b0` (branche `main`, identique à la production). Version modifiée : branche `claude/refonte-design-gerimmo`, pull request [#350](https://github.com/GERIMMO/GERIMMO_V4/pull/350) — **fusionnée et en production depuis le 20/11 à 11 h 51 UTC** (version `d315257d`).

> La version communiquée dans la demande (`8c0449c6`) n'était plus la dernière : la PR #348 a été publiée le 19/11 à 23 h 12 UTC. L'audit porte sur la version réellement en ligne.

## 1. Ce que couvre cet audit

| | |
|---|---|
| Pages auditées | **133 pages** (toutes les `page.tsx` du dépôt), lues une à une dans le code |
| Sessions | propriétaire (particulier et SCI), gestionnaire d'agence, administrateur d'agence, locataire, artisan, super-administrateur, relais et veille, pages publiques, pages transversales |
| Parcours navigateur « avant » | 180 écrans (page × profil), à 375, 768, 1024 et 1440 px : 786 passages, capture pleine page à chaque fois |
| Constats relevés dans le code | **559** (154 agence et propriétaire, 152 supervision, 60 locataire, 89 artisan, 104 pages publiques et transversales) |
| Environnement | banc isolé sur la machine de travail, base PostgreSQL locale, **données fictives uniquement** |

**Ce qui n'a pas été fait, dit clairement :**

- **Aucun test sur un appareil physique.** Tous les essais « téléphone » et « tablette » sont faits dans Chromium, à la largeur et avec le toucher simulés. Safari sur iPhone et un Android réel restent à essayer à la main.
- **Aucune action en production pendant l'audit et le développement** : pas de donnée lue ni écrite, pas de paiement, pas d'envoi, pas de migration. La mise en ligne et la recette de production sont venues ensuite, sur votre demande (voir le rapport de non-régression, § 8).
- **Pas de compte SCI sur le banc.** L'espace SCI utilise les mêmes pages que le propriétaire particulier ; ses écrans propres (fiche de la société, quittance au nom de la SCI) sont couverts par les tests automatiques existants, pas par une relecture visuelle dédiée dans cette mission.
- **Vingt-deux lignes de la matrice n'ont pas de mesure « avant »** : ces pages n'étaient pas atteignables dans le premier parcours, faute de donnée fictive (une version archivée des conditions, la facture d'un artisan, l'état des lieux d'un propriétaire…). Elles ont toutes été ouvertes dans le parcours « après » : treize par des adresses ajoutées au parcours, neuf grâce aux données fictives laissées par la suite de tests et à cinq lignes fictives créées sur le banc isolé (un état des lieux, un diagnostic, une invitation, une facture d'artisan, une version archivée).
- **Pas de mesure de performance** (Lighthouse) et **pas d'essai avec un lecteur d'écran réel**.
- **Safari** : pas d'iPhone. À défaut, les 180 écrans ont été ouverts dans un moteur WebKit (celui de Safari, version Linux) à 390 et 360 px, et la suite WebKit du dépôt a tourné sur le banc : ce sont de vrais moteurs WebKit, pas un iPhone.

## 2. Méthode

1. **Cartographie** : lecture de toutes les routes, des cinq gabarits (`layout.tsx`), des menus, des gardes d'accès. Résultat : l'annexe A, une fiche par page.
2. **Audit de chaque page**, sur quatre plans : fonctionnement, compréhension, qualité visuelle, téléphone et accessibilité (référence WCAG 2.2 AA).
3. **Parcours automatique** de tous les écrans atteignables, aux quatre largeurs, avec mesure : code HTTP, débordement horizontal, erreurs de la console, titre, polices, cibles tactiles, analyse axe.
4. **Trois directions visuelles** maquettées, une retenue, formalisée en Design System.
5. **Fondations communes** d'abord, puis **harmonisation page par page**, un lot par espace.
6. **Tests** : contrôle de style du code, types, tests unitaires, parcours navigateur complets, second parcours de tous les écrans (208 écrans par largeur, 932 passages).

## 3. Ce que l'audit a trouvé

### 3.1 Le logiciel fonctionne

Sur les 786 passages du parcours « avant » : **0 erreur HTTP, 0 débordement horizontal, 0 erreur de console.** Gerimmo n'était pas cassé ; il était inégal.

### 3.2 Les constats qui reviennent partout

| Constat | Mesure avant |
|---|---|
| Titres dans une police qui n'existe pas partout | Les titres étaient en Georgia : absente d'Android et de Linux, donc un dessin différent selon l'appareil |
| Pas de taille de titre commune | 14 tailles de titre d'écran différentes, de 25 à 42 px |
| Couleurs écrites en dur | 1 748 couleurs en dur dans 63 feuilles de page et de composant (jusqu'à 143 dans une seule) ; gris froids d'un côté, ivoire de l'autre |
| Bouton principal de deux couleurs | or dans l'espace locataire, bleu nuit ailleurs (546 boutons sur 653 étaient déjà bleu nuit) |
| Rupture de navigation | Conditions, confidentialité, aide, compte, quittance : la page s'ouvrait avec la vitrine publique (« Se connecter », « Créer mon compte ») devant une personne déjà connectée, sans retour vers son espace |
| Erreur ou page introuvable | Un seul écran, à la racine : le menu, l'en-tête et la marque de l'agence disparaissaient |
| Accessibilité | 2 familles de défauts graves (axe) : nom accessible différent du libellé visible (22 éléments, 11 pages) ; contraste insuffisant (14 éléments, 5 pages). Un bouton de moins de 44 px (la recherche, 42-43 px) sur 197 des 360 passages à 375 et 768 px |
| Vocabulaire | Noms instables entre le menu, le titre et l'onglet ; jargon de gestion (« imputation », « quittancement ») et jargon technique dans la supervision (variables d'environnement, noms de tables) |

### 3.3 Par espace

**Propriétaire et agence (36 pages, 154 constats).** Deux accueils sans parenté sur la même adresse ; écrans propres au propriétaire bâtis sur des feuilles à couleurs en dur ; pages très longues (bail : 1 296 lignes, fiche d'un lot : 942, fiche d'une personne : 982) ; action principale parfois repliée.

**Locataire (13 pages, 60 constats).** Accueil chargé de dégradés et de bords colorés sans signification ; page des relevés sans en-tête ; la quittance s'ouvrait en fenêtre depuis les documents mais en page nue depuis les paiements ; défaut de nom accessible dans la coquille, donc sur toutes les pages.

**Artisan (22 pages, 89 constats).** Un espace à part : ses propres composants, 264 couleurs en dur dans six feuilles, un module « clients » nu. Un défaut de code : la page d'un devis renvoyait du contenu d'écran à la place de ses métadonnées en cas d'échec.

**Supervision (35 pages, 152 constats).** Trois familles visuelles côte à côte, du texte de 10 à 11 px, des identifiants techniques présentés comme des consignes, des noms de page différents entre le menu et le titre.

**Pages publiques et transversales (27 pages, 104 constats).** Vitrine dans sa propre palette (98 couleurs en dur), titres de carte démesurés sur la page des outils, en-têtes recopiés trois fois, marque blanche non respectée sur plusieurs écrans hors espace.

Le détail, page par page, est dans l'**annexe A** ([inventaire-pages.md](annexes/inventaire-pages.md)).

### 3.4 Sécurité

Aucune faille de sécurité trouvée pendant la refonte. Un point levé puis vérifié : un commentaire du code de la supervision annonçait qu'une session ouverte sur le compte d'un artisan permettait d'écrire. **C'est faux depuis le 12/10** : la base impose la lecture seule (migration SA005, déclencheurs sur les tables et barrière sur le stockage). Seul le commentaire était périmé ; il est corrigé.

La refonte ne touche à aucune garde d'accès, aucune requête, aucune action serveur, aucun calcul. Les protections SEC-1 (cloisonnement entre organisations), le second facteur et les règles SCI sont couvertes par les suites de tests : voir le rapport de non-régression.

## 4. Ce qui a été fait

### 4.1 Direction retenue : « Maison »

Trois directions ont été maquettées sur plusieurs écrans et plusieurs sessions — [canevas « Gerimmo — directions visuelles »](https://claude.ai/artifact/22UMhhxGxRdEV2Hxj1fbNz) (privé : visible avec votre compte) :

| Direction | Idée | Verdict |
|---|---|---|
| **A — Maison** | La marque existante, mieux tenue : papier chaud, bleu nuit, trait de champagne, titres à empattements | **Retenue** |
| B — Clarté | Interface très blanche, sans empattements, accent bleu vif | Écartée : efface ce qui distingue Gerimmo |
| C — Nuit et or | Fonds sombres, or dominant | Écartée : fatigante pour un outil de gestion quotidien, contrastes difficiles |

« Maison » améliore l'identité actuelle sans la remplacer : le logo, le bleu nuit et le champagne restent ; ce qui change, c'est la discipline.

### 4.2 Fondations (toutes les pages en héritent)

- **Police de titre embarquée** (Fraunces, licence libre, deux fichiers préchargés) : les titres ont le même dessin sur tous les appareils.
- **Une seule taille de titre d'écran**, dans les espaces comme hors des espaces, y compris au téléphone.
- **Jetons** de couleur, de rayon, d'ombre et de mouvement, dans une feuille commune chargée en dernier.
- **Action principale bleu nuit partout** ; le champagne devient un accent. La couleur d'une agence en marque blanche reste respectée.
- **Menus** : bleu nuit uni, entrée active marquée d'un liseré champagne, photo de saison ramenée à une vignette en bas.
- **Champs** : contour lisible (3:1), halo au focus. **Anneau de focus** visible partout.
- **Fin des dégradés et des bords colorés décoratifs** : un bord de couleur dit désormais un état (retard, attention), jamais un décor.
- **Texte : plus rien sous 12 px.** Cibles tactiles de 44 px.

### 4.3 Ruptures de navigation supprimées

- **Bandeau « Revenir à mon espace… »** sur toute page ouverte depuis un espace mais servie hors de lui (conditions, confidentialité, aide, compte, quittance, outils, journal). Il ramène à la page exacte d'où l'on vient. Les appels « Se connecter » et « Créer mon compte » s'effacent pour qui est déjà connecté. Le bandeau ne nomme pas la marque, pour respecter la marque blanche.
- **Erreur et page introuvable dans la coquille de l'espace** : le menu reste, un bouton ramène à l'accueil de l'espace.
- L'historique du navigateur, les adresses directes et les droits d'accès ne changent pas : rien n'a été transformé en fenêtre.

### 4.4 Mouvement

Enfoncement des boutons, élévation des cartes cliquables, transition de l'entrée active du menu, halo des champs, et **halo sur un chiffre qui change réellement** (`ValeurVivante`) — aucun compteur ne défile au chargement, un montant est exact dès la première image. Tout s'éteint si l'utilisateur a demandé moins de mouvement.

**Deux leçons de la nuit.** D'abord une animation retirée. Un fondu d'arrivée des écrans avait été posé. Pendant son quart de seconde le texte était semi-transparent, donc sous le contraste requis : les contrôles d'accessibilité de la suite navigateur échouaient, à juste titre. Il est retiré ; aucun écran ne s'anime à l'arrivée. Ensuite un défaut que seul le moteur de Safari montrait : deux fichiers de police déclarés « à charger si besoin » retardaient tout l'affichage d'une page tant que ses scripts n'étaient pas arrivés. C'est le parcours WebKit du dépôt qui l'a attrapé ; il est corrigé et gardé par un test (détail : rapport de non-régression, § 2 ter).

### 4.5 Harmonisation page par page

| Lot | Pages | Changements | L'essentiel |
|---|---:|---:|---|
| Propriétaire et agence — accueil, biens, lots, baux, personnes | 13 | 49 | 24 feuilles passées aux jetons (l'accueil du propriétaire avait trois couches de règles empilées), contrastes et noms accessibles corrigés, en-têtes des parcours de création unifiés, chiffres clés en `ValeurVivante` |
| Propriétaire et agence — loyers, comptabilité, documents, incidents, réglages | 24 | 60 | feuille des incidents (143 couleurs en dur) et des documents passées aux jetons, retours « ← Finances » au-dessus du titre, vocabulaire expliqué (« terme de loyer — le loyer demandé pour ce mois »), montants en chiffres alignés |
| Locataire, quittance, attestation, invitation, signature | 13 | 44 | accueil sans dégradé ni bord décoratif, relevés avec la structure commune, habillage de la quittance et de l'attestation, défaut de nom accessible de la coquille corrigé (0 défaut grave après) |
| Artisan | 22 | 68 | l'espace rejoint le Design System : mêmes cartes, boutons, titres ; en-tête blanc au téléphone ; clients externes structurés ; défaut de métadonnées du devis corrigé ; cibles de terrain conservées (56 px au téléphone) |
| Supervision, relais, veille | 35 | 107 | une seule famille visuelle, plus de texte sous 12 px, phrases en clair devant les identifiants techniques, boutons principaux réservés à la création |
| Pages publiques | 22 | 89 | feuille de la vitrine passée aux jetons (98 couleurs en dur), titres à la taille commune (le héros de l'accueil garde une taille d'affiche), en-tête à la hauteur de celui des espaces, menu mobile à cibles de 48 px, outils et journal au même gabarit |
| Pages transversales et composants partagés | 5 + composants | 56 | écrans d'erreur et « introuvable » dans la coquille, bandeau de retour, page « Mes données » au gabarit commun, feuilles des composants partagés passées aux jetons |

**Ce que les lots n'ont volontairement pas touché** : les requêtes, les actions serveur, les gardes d'accès, les calculs, les noms de champs, les textes juridiques, les prix, et tout libellé vérifié par un test automatique.

Chaque lot a aussi noté ce qu'il a vu et choisi de ne pas faire : **338 remarques**, page par page, dans l'**annexe C** ([remarques-restantes.md](annexes/remarques-restantes.md)).

## 5. Avancement

| Session | Pages trouvées | Auditées (code) | Auditées (navigateur) | Améliorées | Testées (4 largeurs) | Relues à l’œil | Terminées |
|---|---:|---:|---:|---:|---:|---:|---:|
| Propriétaire (particulier et SCI) | 34 | 34 (100 %) | 25 (74 %) | 32 (94 %) | 34 (100 %) | 34 (100 %) | 34 (100 %) |
| Gestionnaire d’agence | 27 | 27 (100 %) | 26 (96 %) | 25 (93 %) | 27 (100 %) | 27 (100 %) | 27 (100 %) |
| Administrateur d’agence | 34 | 34 (100 %) | 28 (82 %) | 32 (94 %) | 34 (100 %) | 34 (100 %) | 34 (100 %) |
| Locataire | 13 | 13 (100 %) | 12 (92 %) | 13 (100 %) | 13 (100 %) | 13 (100 %) | 13 (100 %) |
| Artisan | 22 | 22 (100 %) | 18 (82 %) | 22 (100 %) | 22 (100 %) | 22 (100 %) | 22 (100 %) |
| Super-administrateur (supervision) | 33 | 33 (100 %) | 33 (100 %) | 33 (100 %) | 33 (100 %) | 33 (100 %) | 33 (100 %) |
| Relais et veille | 2 | 2 (100 %) | 2 (100 %) | 2 (100 %) | 2 (100 %) | 2 (100 %) | 2 (100 %) |
| Pages publiques | 22 | 22 (100 %) | 21 (95 %) | 22 (100 %) | 22 (100 %) | 22 (100 %) | 22 (100 %) |
| Pages transversales | 5 | 5 (100 %) | 5 (100 %) | 5 (100 %) | 5 (100 %) | 5 (100 %) | 5 (100 %) |
| **Total (page × session)** | **192** | 192 (100 %) | 170 (89 %) | 186 (97 %) | 192 (100 %) | 192 (100 %) | **192 (100 %)** |

**Comment lire ce tableau.** Une ligne compte les pages d'une session ; une page vue par plusieurs profils est comptée dans chacun (133 pages, 192 lignes page × session).

- *Auditée (code)* : lue et décrite dans l'annexe A.
- *Auditée (navigateur)* : ouverte dans le parcours « avant » (les autres n'ont pas de mesure « avant », voir § 1).
- *Améliorée* : au moins un changement propre à la page, en plus des fondations. Les six lignes non comptées sont deux pages sans écran (elles renvoient aussitôt vers la fiche du lot), vues par trois profils.
- *Testée* : ouverte dans le parcours « après » aux quatre largeurs, sans erreur, sans débordement, sans défaut grave d'accessibilité.
- *Relue à l'œil* : capture après modification réellement regardée à 375 et 1440 px. La relecture se fait par page : quand une page est servie à plusieurs profils, elle a été regardée chez l'un d'eux au moins ; le parcours automatique, lui, passe chez chacun.
- ***Terminée* : améliorée, testée et relue** (ou, pour une page sans écran, renvoi vérifié). « Terminée » ne veut dire ni essayée sur un vrai téléphone, ni fusionnée, ni en production.

| Étape | État |
|---|---|
| Inventaire | terminé (133 pages) |
| Audit du code | terminé (133 pages) |
| Audit dans le navigateur | terminé — 180 écrans au premier parcours (786 passages) ; 22 lignes de la matrice sans mesure « avant », toutes ouvertes au second parcours |
| Développement | terminé pour les 133 pages — 19 commits sur la branche, 307 fichiers |
| Tests | banc : 0 erreur de style, 0 erreur de type, construction réussie, 12 952 tests unitaires réussis, 282 parcours Chromium réussis, 72 parcours WebKit réussis, 932 passages du second parcours sans défaut ; intégration continue verte |
| Pull request | **fusionnée** le 20/11 à 10:28 UTC — [#350](https://github.com/GERIMMO/GERIMMO_V4/pull/350) ; `main` = `d315257d` ; intégration continue de `main` verte ([run 44719461252](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/44719461252)) |
| Mise en production | **faite le 20/11 à 11 h 51 UTC**, sur votre demande et avec votre approbation dans GitHub — publication contrôlée ([run 44724507715](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/44724507715)), puis recette de production n° 54 réussie ([run 44731759495](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/44731759495)) |

La matrice complète, page par page, est dans l'**annexe B** ([matrice-pages.md](annexes/matrice-pages.md)).

## 6. Ce qui reste

**À faire maintenant que c'est en ligne**

1. **Essayer sur de vrais appareils** : un iPhone (Safari) et un téléphone Android. Tous les essais « téléphone » de cette mission sont simulés.
2. **Votre relecture** à l'usage, écran par écran, dans vos propres espaces.

**Ce qui n'est pas terminé, et pourquoi**

| Sujet | État | Raison |
|---|---|---|
| « Les règles à connaître » (agence, locataire) : la page s'ouvrait hors de l'espace, sans le menu | **signalé par vous après la mise en ligne** ; correction prête, **pull request [#351](https://github.com/GERIMMO/GERIMMO_V4/pull/351) non fusionnée, non publiée** | défaut antérieur à la refonte, qu'elle n'avait pas corrigé : une page unique partagée par tous les profils. La correction la place dans chaque espace, comme chez l'artisan ; même contenu, aucune lecture nouvelle |
| Écrans propres à la SCI | non relus à l'œil | pas de compte SCI sur le banc ; couverts par les tests automatiques |
| Pages très longues (bail, fiche d'un lot, fiche d'une personne) | hiérarchie améliorée, pas découpées | les découper change la structure que les tests vérifient : c'est un chantier à part |
| Blocs repliés empilés côté propriétaire (accueil, finances) | inchangés | même raison |
| Libellés jugés peu clairs mais vérifiés par des tests (« À faire », « à qualifier », « appelés ») | inchangés | à décider avec vous, puis changer le texte et le test ensemble |
| Supervision : nom du menu différent du titre (« Vue d'ensemble » / « Aujourd'hui ») | inchangé | les tests figent les deux côtés |
| Marque blanche : l'assistant de l'espace locataire dit « Demander à Gerimmo » | inchangé | un test navigateur exige ce libellé pour une agence sans marque propre ; le rendre neutre demande de lire la marque de l'agence dans le composant |
| Marque blanche : logo Gerimmo sur l'invitation du locataire et la signature du garant | inchangé | ces deux écrans utilisent le gabarit commun de connexion, qui ne connaît pas l'agence |
| Feuilles communes historiques (`globals.css`, `prestige.css`) | encore 228 couleurs en dur | ce sont surtout les définitions des jetons et les palettes de saison ; les blocs « vitrine » et « outils » de `globals.css` sont à déplacer |
| Libellés de la barre basse du téléphone (10 à 10,5 px) | exception assumée | cinq entrées doivent tenir sur 375 px |
| Les 338 remarques des lots (annexe C) | à trier | pistes d'amélioration relevées en chemin, hors d'un chantier de présentation |
| Accueil public : la seconde ligne du grand titre (« l'esprit tranquille. ») n'est plus en italique | changé, **à valider par vous** | le fichier italique était l'une des deux polices qui figeaient Safari ; la ligne reste en champagne. La remettre en italique est possible, au prix de 81 Ko préchargés sur chaque page |
| Polices préchargées : 126 Ko de plus par première visite (police de titre) ; la police des documents (42 Ko) est aussi préchargée sur les pages de connexion | à mesurer puis alléger | pas de mesure de performance dans cette mission |
| Performance (Lighthouse) et lecteur d'écran réel | non mesurés | hors de ce que le banc permet de prouver |

## 7. Livrables

| | |
|---|---|
| Ce rapport | `livrables/refonte-design-20261120/RAPPORT-AUDIT.md` |
| Synthèse dirigeant | [SYNTHESE-DIRIGEANT.md](SYNTHESE-DIRIGEANT.md) |
| Rapport de non-régression | [NON-REGRESSION.md](NON-REGRESSION.md) |
| Design System | `app/docs/design-system.md` (dans la pull request) ; résumé : [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) |
| Prototypes des trois directions | [canevas « Gerimmo — directions visuelles »](https://claude.ai/artifact/22UMhhxGxRdEV2Hxj1fbNz) (privé : visible avec votre compte) |
| Captures avant / après | dossier [captures/](captures/) |
| Annexe A — inventaire des 133 pages | [annexes/inventaire-pages.md](annexes/inventaire-pages.md) |
| Annexe B — matrice de suivi | [annexes/matrice-pages.md](annexes/matrice-pages.md) |
| Code | pull request [#350](https://github.com/GERIMMO/GERIMMO_V4/pull/350) |
