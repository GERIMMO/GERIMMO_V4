# Gerimmo — Wiki métier (schéma)

Ce fichier définit **comment** ce wiki est structuré et **comment** l'agent LLM doit
l'entretenir. C'est le fichier de configuration central : il fait de l'agent un
mainteneur de wiki discipliné, pas un chatbot générique. On le fait évoluer ensemble
au fil du temps.

> **Langue : tout le contenu du wiki est rédigé en français.**

---

## 1. Objectif

Gerimmo est un projet de **développement d'une application de gérance immobilière**.
Ce wiki n'est pas la documentation technique du logiciel — c'est la **base de
connaissance métier** qui garantit le succès du projet : processus, personas, concepts
du domaine, règles métier et réglementations, synthèses.

Le wiki est un **artefact persistant et cumulatif**. Chaque source ajoutée et chaque
question posée l'enrichit. On ne re-découvre pas la connaissance à chaque question :
elle est compilée une fois, puis maintenue à jour.

**Répartition des rôles**
- **L'humain** : trouve les sources, oriente l'analyse, pose les bonnes questions,
  décide de ce qui compte.
- **L'agent LLM** : lit, résume, relie, classe, et tient le registre. Écrit et
  entretient **tout** le wiki. L'humain n'écrit (presque) jamais les pages.

---

## 2. Architecture — trois couches

1. **Sources brutes** — `raw/`
   Documents sources, **immuables**. L'agent lit dedans, ne modifie **jamais** rien.
   Source de vérité. Images dans `raw/assets/`.

2. **Le wiki** — `wiki/`
   Pages markdown générées par l'agent. L'agent est **seul propriétaire** de cette
   couche : il crée les pages, les met à jour à l'arrivée de nouvelles sources,
   maintient les liens croisés et la cohérence.

3. **Le schéma** — ce fichier (`CLAUDE.md`)
   Les conventions et workflows. Co-évolue avec l'usage.

Fichiers spéciaux à la racine : `index.md` (catalogue) et `log.md` (journal).

---

## 3. Arborescence

```
Gerimmo/
├── CLAUDE.md              ← ce schéma
├── index.md              ← catalogue de tout le wiki (orienté contenu)
├── log.md                ← journal chronologique (append-only)
├── raw/                  ← sources brutes immuables
│   ├── assets/           ← images / pièces jointes
│   └── LISEZ-MOI.md
├── wiki/
│   ├── Accueil.md        ← vue d'ensemble, point d'entrée
│   ├── personas/         ← qui : gérant, propriétaire-bailleur, locataire, syndic…
│   ├── processus/        ← comment ça se passe : mise en location, quittancement…
│   ├── concepts/         ← objets/notions du domaine : bail, lot, quittance, EDL…
│   ├── regles-metier/    ← règles et réglementation : loi ALUR, plafonds, délais…
│   ├── sources/          ← une page-résumé par source ingérée
│   └── syntheses/        ← analyses transverses, comparatifs, réponses filées
└── _modeles/            ← gabarits de pages (ne pas indexer comme contenu)
```

**Types de page** (champ `type` en frontmatter, valeur en anglais) :
`persona` · `process` · `concept` · `business-rule` · `source` · `synthesis`
(dossiers respectifs : `personas/` · `processus/` · `concepts/` · `regles-metier/` · `sources/` · `syntheses/`)

---

## 4. Conventions de page

**Nommage des fichiers** : titre lisible en français (ex. `Bail de location.md`,
`Quittance de loyer.md`). Dossiers en ASCII pour la robustesse CLI ; titres et
contenus en français avec accents.

**Liens** : liens Obsidian `[[Titre de la page]]`. Lier généreusement — un `[[lien]]`
vers une page qui n'existe pas encore est acceptable : il signale une page à créer.

**Frontmatter YAML** (compatible Dataview) en tête de chaque page du wiki :

> **Clés de frontmatter en anglais** (alignées sur les commandes `.claude/commands/`).

```yaml
---
type: concept              # persona | process | concept | business-rule | source | synthesis
tags: [bail, location]
status: draft              # draft | in-progress | stable
created: 2026-07-20
updated: 2026-07-20
sources: []                # liens [[…]] vers les pages sources justifiant le contenu
---
```

Pages de type `source` : ajouter `source-file`, `source-type`, `source-date`.

**Structure du corps** : un H1 = le titre, puis des sections claires. Toute
affirmation issue d'une source doit être traçable via `sources` et, si utile, une
citation en ligne `([[Source X]])`. Les contradictions entre sources sont **signalées
explicitement** via un **callout Obsidian** en fin de page :

```markdown
> [!warning] Points à trancher / contradictions
> - …
```

Voir les gabarits dans `_modeles/`.

---

## 5. Opérations

### Ingest — ajouter une source
Déclencheur : l'humain dépose un document dans `raw/` et demande de le traiter.
1. Lire la source dans `raw/`.
2. Discuter les points clés avec l'humain (takeaways, ce qu'il faut mettre en avant).
3. Créer une page-résumé dans `wiki/sources/` (gabarit `modele-source`).
4. Mettre à jour les pages concernées (personas, processus, concepts, règles) :
   intégrer les nouvelles infos, renforcer/contredire les affirmations existantes,
   ajouter les liens croisés. Une source touche typiquement 5–15 pages.
5. Mettre à jour `index.md`.
6. Ajouter une entrée dans `log.md`.
Par défaut : **une source à la fois**, en restant impliqué avec l'humain.

### Query — répondre à une question
1. Lire `index.md` pour repérer les pages pertinentes, puis les ouvrir.
2. Synthétiser une réponse **avec citations** (`[[pages]]` utilisées).
3. Proposer de **filer la réponse** dans `wiki/syntheses/` si elle a une valeur
   durable (comparatif, analyse, connexion découverte) — pour qu'elle ne disparaisse
   pas dans le chat.
4. Journaliser la requête dans `log.md`.

### Lint — contrôle de santé
Sur demande, passer le wiki en revue et signaler :
- contradictions entre pages ;
- affirmations périmées qu'une source récente a supplantées ;
- pages orphelines (aucun lien entrant) ;
- notions importantes citées mais sans page dédiée ;
- liens croisés manquants ;
- lacunes de données comblables par une recherche web.
Proposer de nouvelles questions à creuser et de nouvelles sources à chercher.

---

## 6. index.md et log.md

**`index.md`** — orienté **contenu**. Catalogue de tout le wiki, par catégorie
(personas, processus, concepts, règles, sources, synthèses). Chaque page : lien +
résumé en une ligne. Mis à jour à chaque ingest. Lu en premier pour toute requête.

**`log.md`** — **chronologique**, append-only. Chaque entrée commence par un préfixe
constant pour rester grep-able :

```
## [2026-07-20] ingest | Titre de la source
## [2026-07-20] query  | Question posée
## [2026-07-20] lint   | Contrôle de santé
```

`grep "^## \[" log.md | tail -5` → les 5 dernières entrées (en PowerShell :
`Select-String "^## \[" log.md | Select-Object -Last 5`).

---

## 7. Règles pour l'agent

- Ne jamais modifier `raw/`.
- Ne jamais inventer de fait métier : si l'info n'est pas dans une source, le dire et
  proposer de chercher.
- Toujours tenir `index.md` et `log.md` à jour après une opération.
- Rédiger en français, ton clair et factuel.
- Lier généreusement ; signaler les contradictions plutôt que les lisser.
- Rester impliqué avec l'humain : proposer, montrer, demander quoi mettre en avant.
