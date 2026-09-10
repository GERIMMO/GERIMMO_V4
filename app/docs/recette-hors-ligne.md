# Recette hors ligne — base locale, émulateur, E2E mobile

*Mis en place le 10 septembre 2026. Tout tourne sans réseau : plus besoin du
cloud Supabase ni de Vercel pour développer, recetter et auditer.*

## Ce que c'est

Trois pièces, dans `e2e/` :

1. **La base locale** (`e2e/local/preparer-base.sh`) — un Postgres local qui
   porte les **128 migrations dans l'ordre réel de la production** (manifeste
   `ordre-migrations.txt`, reconstruit depuis `supabase_migrations` — l'ordre
   alphabétique des fichiers est FAUX) + le seed de démo. Schémas `auth`,
   `storage`, `extensions` et `pg_cron` recréés en local (bootstrap SQL).
2. **L'émulateur Supabase** (`e2e/local/serveur-supabase-local.mjs`) — parle
   le sous-ensemble de l'API Supabase que l'app utilise : auth par mot de
   passe/signUp/getUser, REST PostgREST-lite (filtres, embeds imbriqués,
   `!fk`, `!inner`, count, single/maybeSingle), RPC (les **vraies** fonctions
   SQL), storage sur disque. Chaque requête s'exécute sous
   `set_config('request.jwt.claims', …)` + `SET ROLE` : **le RLS réel
   s'applique exactement comme en production.** Batterie de non-régression :
   `node e2e/local/valider-emulateur.mjs` (17 vérifications).
3. **La suite Playwright mobile** (`e2e/*.spec.ts`) — gabarit 390×844
   tactile : sessions par persona via le vrai formulaire de connexion
   (`auth.setup.ts`), audit de débordement + soft-404 des 44 écrans
   (`audit-ecrans.spec.ts`), parcours agence/locataire, brouillon local
   d'EDL (module 19), balayage axe-core (`a11y.spec.ts`).

## Démarrage

```bash
npm run e2e:base            # monte/complète la base locale (idempotent)
npm run e2e:emulateur &     # l'API Supabase locale sur :54321
node e2e/local/seed-parcours.mjs   # dossier complet : bail actif, EDL, appel,
                                   # reçu partiel, incident + photo (idempotent)
# .env.local → NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 (clé quelconque)
npm run build && npm start &       # l'app (le serveur dev Turbopack peut servir
                                   # du CSS corrompu sous forte charge parallèle
                                   # — préférer le build pour les passes E2E)
npm run e2e:matrice        # matrice d'écrans depuis les données locales
npm run test:e2e           # setup sessions + tous les specs
```

Environnements à Chromium pré-installé (Claude Code web) :
`PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium` avant `test:e2e`.

Les tests d'intégration SQL profitent aussi de la base locale :
`SUPABASE_DB_URL=postgres://postgres@127.0.0.1:55432/gerimmo_local npm test`
(y compris `api-isolation` — RM-A1.7 — via l'émulateur).

## Comptes

Ceux du seed de démo (`supabase/seed.sql`) : `admin.alpha@`, `agent.alpha@`,
`locataire.alpha@`, `proprietaire@`, `superadmin@` … `@gerimmo-demo.fr`,
mot de passe commun du seed. Le dossier E2E (préfixe « E2E ») porte un mandat
dont **agent.alpha est titulaire** — sans cela, le périmètre « mon
portefeuille » (migration du 09/09) rend ses écrans invisibles à l'agent.

## Limites assumées

- **Pas d'email** : les points d'auth qui en envoient (récupération, OTP)
  répondent OK sans rien envoyer ; Resend n'est pas branché.
- **Storage** : fichiers sous `/tmp/gerimmo-storage`, politiques GED réelles
  (télécharger un objet sans fiche `documents` est refusé — comme en prod).
- **Upsert storage** : émulé insert-puis-update (l'app n'utilise jamais
  `upsert: true` à l'upload).
- L'émulateur couvre l'API **relevée dans le code au 10/09** — un nouvel
  opérateur PostgREST exotique demandera un ajout (fichier unique, commenté).
- Le brouillon local (module 19) vit en localStorage : il ne survit ni au
  vidage du cache ni au changement d'appareil (RM-19.1.8, assumé).
