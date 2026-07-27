# Instantané Gerimmo-V3 (trace source)

Copie **partielle et immuable** du dépôt <https://github.com/GERIMMO/Gerimmo-V3>
(branche `main`), prise le **2026-07-21**.

## Contenu de l'instantané
Seuls les fichiers porteurs de **connaissance métier** ont été conservés :
- `docs/` — documents fonctionnels/architecture (⚠️ en partie « A completer »).
- `supabase/migrations/*.sql` — ~60 migrations = **source de vérité du modèle métier**.
- `supabase/seed.sql` — rôles système.
- `README.md`, `AGENTS.md`, `package.json` — contexte projet et stack.

Le code applicatif (`src/`, composants, tests, config) n'est **pas** inclus : trop
volumineux et peu porteur de métier. Pour l'analyse détaillée des services, se référer
au dépôt d'origine.

## Où est la connaissance extraite
Voir la page-résumé [[Dépôt Gerimmo-V3]] et l'ensemble du wiki (personas, concepts,
processus, règles) qui en découle. Ne pas modifier ce dossier (source immuable).
