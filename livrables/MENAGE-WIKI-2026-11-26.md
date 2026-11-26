# Plan de ménage du wiki — à valider (26/11/2026)

- **Pourquoi** : vous avez parlé de Gerimmo dans beaucoup de conversations et le wiki a tout gardé. Il compte 217 pages,
  mais **seules 6 synthèses sur 82 décrivent encore l'état actuel**. Les autres sont des audits, des points d'étape ou
  des pages dépassées.
- **Rien n'est encore touché.** Le ménage se fera en une seule fois, après validation et quand l'ancienne session aura
  fini, puisqu'elle écrit encore dans le wiki.
- **Base** : un inventaire en lecture seule de toutes les pages (frontmatter, liens entrants, comparaison avec le code).
  Le détail page par page est disponible sur demande.

## 1. L'état du wiki en chiffres

| | Pages |
|---|---|
| À jour, à garder | 121 |
| Historique daté (audits, passations, points d'étape) | 48 |
| Remplacées par une page plus récente | 18 |
| En double | 4 |
| Sans aucun lien vers elles | 8 |
| Probablement périmées par rapport au code | 18 |
| **Total** | **217** |

Le reste du dépôt :
- **les livrables** : environ 141 Mo de preuves d'audits et de captures ;
- **le catalogue `index.md`** : devenu un journal, avec des annonces datées en tête et des entrées de plus de 1 000
  caractères ;
- **la page d'accueil** : elle décrit encore « l'état au lancement (30/09) ».

## 2. Ce que je propose, en 7 décisions

### Décision 1 — Ranger l'historique sans rien perdre

- Créer un dossier `wiki/archives/`, avec un sous-dossier par période : juillet (V3), septembre, octobre, novembre.
- Y déplacer environ **63 synthèses et 3 sources** : les 24 audits, la dizaine de points d'étape d'octobre, les relevés
  de la mission du 13/10, les anciennes chartes visuelles, les anciens prompts de passation.
- Marquer chaque page archivée d'un statut « archivé » et d'un renvoi vers la page qui la remplace.
- Créer une page vivante « **Historique des audits** » : une ligne par audit, avec sa date, sa version, son verdict et
  son lien.

**Rien n'est supprimé.** Déplacer une page ne casse aucun lien du wiki, puisque les liens passent par le titre et non
par le dossier : je l'ai vérifié. Quelques chemins écrits en clair sont à corriger en même temps (`app/CLAUDE.md`,
`GUIDE-DE-REPRISE.md`, deux notes d'audit), et une page dont le titre contient « # » est à renommer.

### Décision 2 — Un seul registre des décisions

Aujourd'hui, les décisions sont réparties entre six endroits :
- « État du projet et décisions ouvertes » ;
- « Décisions groupées » ;
- « Informations manquantes » ;
- la Passation ;
- `QUESTIONS.md` ;
- `DECISIONS-2026-11-24.md`.

Proposition :
- **`QUESTIONS.md`** devient le registre unique des questions et décisions ;
- **le recueil de vos réponses mot pour mot** devient une source officielle du wiki (dans `raw/`, avec sa page
  résumé), sous un nom sans date trompeuse ;
- « État du projet » devient une simple page de renvoi, car 56 pages pointent vers elle.

### Décision 3 — Réécrire les pages d'entrée

- **Accueil** : ce qu'est Gerimmo, l'état actuel en 5 lignes, et quoi lire d'abord : la
  [[Vision de l'écosystème Gerimmo]], le [[Référentiel du palier 1]] et la Passation.
- **Catalogue `index.md`** : un en-tête de 3 lignes, une ligne courte par page. Les nouvelles datées vont au journal.
- **Design system** : le réécrire à partir de la direction « A — Maison » ; il garde aujourd'hui l'ancien bleu.

### Décision 4 — Mettre à jour les pages qui décrivent l'ancien code

Elles décrivent la version V3, remplacée depuis : Modèle de données, Modèle de rôles et permissions, Patrimoine et
résidences, Période de loyer, Organisation, Incident, Bien, Occupation d'un bien, Isolation multi-organisation, Cycle
de vie d'un incident, Recette de production, Canaux de communication.

Elles seront réécrites d'après le code actuel ; pour celles qui n'ont plus d'objet, une page de renvoi suffit.

### Décision 5 — Fusionner les doublons

| À fusionner | Dans |
|---|---|
| Onboarding et abonnement | Souscription de l'abonnement |
| Demandes sur les données et fermeture de compte | Fermeture de compte |
| Intervention (concept) | Intervention et clôture |
| Occupation d'un bien | Bail |
| Grille tarifaire agence — proposition | Grille tarifaire |
| Complément « Décisions groupées » | Décisions groupées |
| Les deux registres d'exécution du 13/10 | Un seul registre |
| Les trois « Prompt de passation à Codex » | La Passation du 26/11 (le protocole de migration passe dans une page à part) |

### Décision 6 — Les documents de la mission « palier 1 » à la racine

- `AUDIT.md`, `JOURNAL.md`, le dossier `audit-palier-1/` et `ETAT-AUTONOMIE-GERIMMO.md` : les ranger dans les
  archives une fois la mission close.
- `REPONSES-JURISTE.md` : l'indiquer clairement comme une note rédigée par Claude, **pas une consultation signée par
  un juriste**.
- **Les 141 Mo de preuves** dans `livrables/` : trois options.
  - (A) Les laisser où elles sont. Je le recommande pour l'instant : elles ne gênent pas la lecture.
  - (B) Les ranger dans `livrables/archives/`.
  - (C) Les retirer du dépôt. Elles restent dans l'historique Git, donc le dépôt ne s'allège pas.

### Décision 7 — Vos artefacts claude.ai

| Artefact | Proposition |
|---|---|
| Vision Gerimmo (16/10) | Remplacé par la page [[Vision de l'écosystème Gerimmo]] du wiki : le garder comme trace |
| Catalogue exhaustif des besoins (16/10) | À garder : c'est la cible fonctionnelle complète |
| Logo officiel (29/09), Directions visuelles (20/11) | À garder : ce sont les références de la marque |
| Gerimmo avant vente (16/11) | À garder : c'est l'état le plus récent avant la vente |
| Charges d'immeuble, taxe foncière, plan d'apurement (02/11) | À garder : c'est la référence de ce module |
| Audit d'acquisition, Registre des anomalies, Audit final du 19/10, Dossiers de test, Ajouter une location, Le registre, pense-bête juridique | Historique : à garder sans y revenir |
| Page d'attente (29/09) | Dépassée : vous pouvez la supprimer si vous le souhaitez |

Je ne supprime aucun artefact sans votre demande expresse. Vos artefacts sans rapport avec Gerimmo ne sont pas concernés.

## 3. Ce qu'il me faut de vous

Répondez simplement, par exemple « 1 oui, 2 oui, 3 oui, 4 oui, 5 oui, 6 A, 7 oui » ou « tout oui, 6 A ».

Une fois validé :
1. je fais le ménage en un seul commit sur ma branche ;
2. je vérifie qu'aucun lien n'est cassé ;
3. je vous propose une PR « documentation seule », que vous acceptez ou non.
