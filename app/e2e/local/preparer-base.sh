#!/usr/bin/env bash
# Monte la base locale « façon Supabase » pour l'E2E hors ligne :
# initdb (si besoin), démarrage, bootstrap, migrations dans l'ordre, seed.
# Variables : PGDATA_LOCAL (défaut /tmp/gerimmo-pgdata), PORT (défaut 55432),
#             DB (défaut gerimmo_local).
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PGDATA_LOCAL="${PGDATA_LOCAL:-/tmp/gerimmo-pgdata}"
PORT="${PORT:-55432}"
DB="${DB:-gerimmo_local}"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -n "$PGBIN" ] || { echo "PostgreSQL introuvable" >&2; exit 1; }

run_as_pg() {
  if [ "$(id -u)" = "0" ]; then su postgres -c "$*"; else bash -c "$*"; fi
}

if [ ! -d "$PGDATA_LOCAL/base" ]; then
  mkdir -p "$PGDATA_LOCAL"
  [ "$(id -u)" = "0" ] && chown postgres:postgres "$PGDATA_LOCAL"
  run_as_pg "$PGBIN/initdb -D '$PGDATA_LOCAL' --auth-local=trust --auth-host=trust -E UTF8 --locale=C.UTF-8" >/dev/null
fi

if ! run_as_pg "$PGBIN/pg_ctl -D '$PGDATA_LOCAL' status" >/dev/null 2>&1; then
  run_as_pg "$PGBIN/pg_ctl -D '$PGDATA_LOCAL' -o '-p $PORT -c listen_addresses=127.0.0.1' -l '$PGDATA_LOCAL/log' start" >/dev/null
fi

export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres

if ! psql -lqt | cut -d'|' -f1 | grep -qw "$DB"; then
  createdb "$DB"
fi

echo "— bootstrap (rôles, auth, storage, extensions)"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$APP_DIR/e2e/local/bootstrap-supabase-local.sql"

# L'ordre d'application N'EST PAS l'ordre lexicographique des fichiers : il est
# reconstruit depuis l'historique de la production (supabase_migrations) dans
# ordre-migrations.txt — l'ordre est celui de la PRODUCTION (table
# supabase_migrations), pas l'ordre des noms de fichiers. Les deux divergent :
# `module8_artisans_socle` appelle `poser_gardes_abonnement()`, définie par
# `gardes_abonnement_rejouables`, dont le fichier porte un horodatage PLUS
# GRAND alors que la production l'a appliquée AVANT. Rejouer par ordre de nom
# casse donc la reconstruction. Régénérer depuis `mcp Supabase list_migrations`
# en associant chaque `name` au fichier qui finit par `_<name>.sql`.
MANIFESTE="$APP_DIR/e2e/local/ordre-migrations.txt"

# LE MANIFESTE DOIT COUVRIR TOUTES LES MIGRATIONS, et se taire coûtait cher :
# le 12/09, huit fichiers y manquaient — le banc se montait sans broncher sur
# un schéma vieux de deux jours, et les tests mesuraient autre chose que le
# produit. Un banc qui ment est pire qu'un banc qui refuse de démarrer.
oublies="$(comm -13 <(sort "$MANIFESTE") \
  <(ls "$APP_DIR/supabase/migrations"/*.sql | xargs -n1 basename | sort))"
if [ -n "$oublies" ]; then
  echo "Migrations absentes du manifeste — le banc serait incomplet :" >&2
  echo "$oublies" | sed 's/^/  · /' >&2
  echo "Ajoutez-les dans l'ordre de la production (voir le commentaire ci-dessus)." >&2
  exit 1
fi

echo "— migrations ($(wc -l < "$MANIFESTE") fichiers, ordre de la production)"
deja="$(psql -qtA -d "$DB" -c "select coalesce(json_agg(name), '[]') from e2e_local.migrations" 2>/dev/null || echo '[]')"
psql -q -d "$DB" -c "create schema if not exists e2e_local; create table if not exists e2e_local.migrations (name text primary key, applied_at timestamptz default now())"
while read -r n; do
  f="$APP_DIR/supabase/migrations/$n"
  if echo "$deja" | grep -q "\"$n\""; then continue; fi
  echo "   · $n"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
  psql -q -d "$DB" -c "insert into e2e_local.migrations (name) values ('$n')"
done < "$MANIFESTE"

echo "— seed de démo"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$APP_DIR/supabase/seed.sql"

echo "Base locale prête : postgres://postgres@127.0.0.1:$PORT/$DB"
