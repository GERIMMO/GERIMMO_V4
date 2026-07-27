@AGENTS.md

# Gerimmo — Application (app/)

Ce dossier contient le **code de l'application de gérance immobilière**. Les
conventions ci-dessous s'appliquent à tout travail dans `app/` et complètent le
`CLAUDE.md` racine (qui régit le wiki métier).

## Lien avec le wiki métier

La base de connaissance métier vit dans `../wiki/`. Avant d'implémenter une
fonctionnalité métier (quittancement, baux, états des lieux…) :
1. Consulter `../index.md` pour repérer les pages pertinentes ;
2. Lire les pages `concepts/` et `regles-metier/` concernées ;
3. En cas de contradiction entre le code demandé et une règle métier documentée,
   le signaler avant de coder.

Si le développement révèle une lacune dans le wiki (règle non documentée, concept
flou), le mentionner à l'humain pour déclencher une recherche de source.

## Stack

- **Next.js** (App Router, `src/`), **TypeScript**, **Tailwind CSS**
- **shadcn/ui** pour les composants
- **Supabase** : base Postgres, auth, stockage — projet « Gerimmo V4 »
  (`rddlxunppddzpsaatdaz`, région eu-west-3)
- **Vercel** pour le déploiement (racine du projet : `app/`)

## Conventions

- Langue de l'UI : **français**. Code (identifiants, commits) : anglais.
- Composants dans `src/components/`, logique Supabase dans `src/lib/supabase/`.
- Variables d'environnement : `.env.local` (jamais commité) ; documenter toute
  nouvelle variable dans `.env.example`.
- Schéma de base : migrations via l'outil MCP Supabase (`apply_migration`),
  jamais de DDL sauvage en production.

## Commandes

```bash
npm run dev      # serveur de développement (Turbopack)
npm run build    # build de production
npm run lint     # ESLint
```
