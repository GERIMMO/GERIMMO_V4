# Variables d'environnement du projet Vercel

Mis à jour le 25/09. Ce document dit **quoi** poser sur Vercel, **où** trouver
chaque valeur et **comment** vérifier sans ouvrir les variables une par une.
Les noms et leur rôle détaillé sont dans `.env.example` ; rien ici n'est une
valeur.

## Deux façons de vérifier

1. **L'écran Santé** (`/admin/sante`, super administrateur) : la production
   dit elle-même ce qui est posé et ce qui manque parmi les onze variables
   qu'elle compte comme bloquantes. Il ne voit que l'environnement où il tourne.
2. **Le script** `scripts/vercel/verifier.mjs` : interroge l'API Vercel avec
   un jeton et compare production et preview au catalogue complet, y compris
   les variables facultatives et celles qui n'ont rien à faire là.

```bash
# Jeton (Vercel > Account Settings > Tokens, portée : l'équipe du projet),
# identifiant du projet (Project Settings > General) et équipe (Team Settings).
export VERCEL_TOKEN=…  VERCEL_PROJECT_ID=prj_…  VERCEL_TEAM_ID=team_…
node scripts/vercel/verifier.mjs                      # état, code de sortie 1 s'il manque quelque chose
node scripts/vercel/verifier.mjs --poser .env.local   # pose EN PRODUCTION ce qui manque, depuis le fichier
```

Le script ne montre jamais une valeur, n'écrase rien (seules les variables
absentes sont créées, sur les cibles où elles manquent) et refuse une valeur
mal formée avant tout appel : clé secrète sous un nom `NEXT_PUBLIC_`, clé
publiable sous `SUPABASE_SERVICE_ROLE_KEY`, adresse locale pour le site,
secret de tâches trop court. `CRON_SECRET` est généré s'il manque du fichier :
personne n'a besoin de le connaître. Après une pose, redéployer pour que la
production lise les nouvelles valeurs.

## Ce que la production doit porter

**Socle** — sans elles, le site ne se construit pas ou les tâches planifiées
répondent 503 avant tout journal.

| Variable | Où trouver la valeur |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > API (projet « Gerimmo V4 ») |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase > Project Settings > API Keys, clé publiable `sb_publishable_…` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Project Settings > API Keys, clé `service_role` (ou `sb_secret_…`) — jamais `NEXT_PUBLIC_` |
| `CRON_SECRET` | Aléatoire, 32 caractères au moins ; le script la génère |
| `NEXT_PUBLIC_SITE_URL` | L'adresse publique définitive, en https, sans barre oblique finale ; **production seulement** |

**Prestataires** — l'écran Santé les compte comme points bloquants.

| Variable | Où trouver la valeur |
| --- | --- |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRIX_BIEN`, `STRIPE_PRIX_LOT_AGENCE` | Stripe, **même mode** (test ou réel) pour les quatre ; le webhook vise `https://<site>/api/stripe/webhook` |
| `RESEND_API_KEY`, `RESEND_EXPEDITEUR` | Resend ; l'expéditeur doit être sur un domaine vérifié (SPF, DKIM) |
| `YOUTRUST_API_KEY`, `YOUTRUST_WEBHOOK_SECRET` | Yousign ; le webhook vise `https://<site>/api/youtrust/webhook` |

**Facultatives** — activent une fonction ; rien ne casse sans elles :
`YOUTRUST_ENV`, `RESEND_DOMAIN_READ_KEY`, `OPENAI_API_KEY` et les quatre
`OPENAI_*_MODEL`, les cinq `META_*`, `GITHUB_AGENT_TOKEN`, `GERIMMO_CODEX_ENABLED`.

## Ce qui n'a rien à faire sur Vercel

`SUPABASE_DB_URL` (tests du socle seulement), `OPEN_AI_KEY` (ancien nom),
`VERCEL_TOKEN` (GitHub Actions), `GERIMMO_BACKUP_*` (sauvegarde hors Vercel),
`TEST_*`, `E2E_*`, `SUPALOCAL_*`, `GERIMMO_AUTORISER_PROD`, `GERIMMO_CHARGE_DB`.
Le script signale leur présence sous « À retirer ».

## Pourquoi `NEXT_PUBLIC_SITE_URL` sur la production seule

Posée sur toutes les cibles, elle ferait imprimer l'adresse de production au
pied des documents d'une préproduction et pointer ses e-mails vers la
production. Sur preview, le code se replie sur l'adresse que Vercel donne au
déploiement, ce qui est exactement ce qu'on veut pour une recette.
