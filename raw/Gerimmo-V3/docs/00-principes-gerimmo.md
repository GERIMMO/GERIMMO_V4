# 00 - Principes GERIMMO V3

## Objectif du document

Ce document pose les principes techniques et organisationnels de GERIMMO V3. Il sert de reference avant toute implementation metier.

## Principes fondamentaux

### Architecture multi-organisations

GERIMMO V3 doit etre concu pour supporter plusieurs organisations distinctes des le depart.

### Isolation des donnees

Les donnees d'une organisation ne doivent jamais etre visibles ou accessibles par une autre organisation.

### Archivage plutot que suppression

Les donnees metier importantes doivent etre archivees ou desactivees plutot que supprimees definitivement.

### Journal d'audit

Les actions sensibles devront etre journalisees afin de conserver une trace exploitable.

### Composants reutilisables

Les composants generiques doivent rester reutilisables et independants de la logique metier.

### Logique metier hors des composants React

La logique metier doit etre placee dans des services, features, hooks ou modules dedies, pas directement dans les composants d'interface.

### Workflows n8n independants

Les automatisations n8n devront etre decouplees de l'interface et documentees comme processus externes.

### Interface entierement en francais

L'interface utilisateur finale doit etre en francais.

### Developpement modulaire

Chaque module doit pouvoir evoluer sans casser le reste de l'application.

## Etat technique actuel

### Framework

Next.js avec App Router.

### Version Next.js

Version declaree dans `package.json` : `^16.2.10`.

### TypeScript

TypeScript est actif avec `strict: true`.

### Tailwind CSS

Tailwind CSS v4 est configure via `@tailwindcss/postcss` et `src/app/globals.css`.

### shadcn/ui

shadcn/ui est configure via `components.json`, avec composants UI dans `src/components/ui`.

### Dependances Supabase

Aucune dependance Supabase n'est installee actuellement.

### Variables d'environnement necessaires

Aucune variable d'environnement applicative obligatoire n'est detectee a ce stade. Seule la variable standard `NODE_ENV` est utilisee par la configuration Next.js.

### Etat general

Le projet est un socle GERIMMO V3 propre base sur une ancienne template admin. Les modules metier sont prepares dans la navigation, mais aucune logique metier, aucune table, aucun workflow et aucune connexion Supabase ne sont encore implementes.

## Decisions a completer

- Strategie exacte de multi-organisation.
- Modele de permissions.
- Strategie d'audit.
- Strategie d'archivage.
- Conventions de nommage.
