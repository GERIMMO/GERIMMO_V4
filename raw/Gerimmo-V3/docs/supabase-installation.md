# Installation Supabase GERIMMO V3

Ce document explique comment connecter Supabase a GERIMMO V3 lorsque le projet Supabase officiel sera pret. Cette mission prepare uniquement la fondation technique : aucune table, aucune migration SQL, aucune policy RLS et aucune logique Auth metier ne sont creees ici.

## Installation

Dependances officielles a installer :

```bash
npm install @supabase/supabase-js @supabase/ssr
```

Packages utilises :

- `@supabase/supabase-js`
- `@supabase/ssr`

## Variables d'environnement

Creer un fichier `.env.local` localement a partir de `.env.example` :

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### Regles de securite

- `NEXT_PUBLIC_SUPABASE_URL` peut etre expose cote navigateur.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` peut etre expose cote navigateur et doit rester compatible avec les policies RLS.
- `SUPABASE_SERVICE_ROLE_KEY` ne doit jamais etre utilisee cote navigateur.
- `SUPABASE_SERVICE_ROLE_KEY` est reservee aux traitements serveur strictement controles, jobs internes ou fonctions securisees.

## Structure projet

```txt
src/lib/supabase/
  client.ts
  server.ts
  middleware.ts
  types.ts

src/proxy.ts

supabase/
  migrations/
  seed/
  functions/
```

## Clients Supabase

### Client navigateur

`src/lib/supabase/client.ts` expose un client navigateur base sur `createBrowserClient`.

Utilisation future uniquement dans les Client Components ou hooks client.

### Client serveur

`src/lib/supabase/server.ts` expose un client serveur base sur `createServerClient` et les cookies Next.js.

Utilisation future dans les Server Components, Server Actions et Route Handlers.

### Middleware / Proxy

`src/lib/supabase/middleware.ts` prepare la synchronisation des cookies Supabase.

`src/proxy.ts` appelle `updateSession` pour permettre a Supabase de rafraichir les sessions cote serveur selon les recommandations Next.js App Router recentes.

## Connexion Vercel

Dans Vercel :

1. Ouvrir le projet GERIMMO V3.
2. Aller dans `Settings` puis `Environment Variables`.
3. Ajouter :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Definir les valeurs pour les environnements necessaires : Preview, Production et Development si utilise.
5. Redeployer l'application apres ajout ou modification des variables.

## Connexion Supabase

Dans Supabase :

1. Creer ou ouvrir le projet Supabase GERIMMO V3.
2. Recuperer l'URL du projet.
3. Recuperer la cle anon/public.
4. Recuperer la cle service role uniquement pour les usages serveur securises.
5. Ne pas creer de table tant que l'architecture SQL officielle n'est pas validee.
6. Ne pas creer de policy RLS tant que les roles et permissions ne sont pas valides.

## Generation des types

Quand les tables seront creees plus tard, generer les types depuis Supabase :

```bash
npx supabase gen types typescript --project-id <project-id> --schema public > src/lib/supabase/types.ts
```

Le fichier `src/lib/supabase/types.ts` contient actuellement un type `Database` vide de preparation. Il devra etre remplace par les types generes officiellement.

## Verification

Commandes a lancer apres installation :

```bash
npm run lint
npm run build
```

## Etat actuel

- Supabase est prepare dans le code.
- Les variables sont documentees dans `.env.example`.
- Aucune table n'est creee.
- Aucune migration SQL n'est creee.
- Aucune policy RLS n'est creee.
- Aucune logique Auth metier n'est creee.
