/**
 * Garde-fous du schéma avant montée en charge.
 *
 * Nécessite SUPABASE_DB_URL. La CI reconstruit une base vierge avec toutes les
 * migrations avant d'exécuter ces contrôles.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Schéma — performance et sécurité", () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
  });

  it("chaque clé étrangère publique dispose d'un index couvrant", async () => {
    const { rows } = await db.query<{ table_name: string; constraint_name: string }>(`
      select t.relname as table_name, c.conname as constraint_name
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = t.relnamespace
      where c.contype = 'f'
        and n.nspname = 'public'
        and not exists (
          select 1
          from pg_catalog.pg_index i
          where i.indrelid = c.conrelid
            and i.indisvalid
            and i.indisready
            and c.conkey::smallint[]
                <@ string_to_array(i.indkey::text, ' ')::smallint[]
        )
      order by t.relname, c.conname
    `);

    expect(rows, JSON.stringify(rows, null, 2)).toEqual([]);
  });

  it("les fonctions SECURITY DEFINER ne sont jamais exécutables par anon", async () => {
    const { rows } = await db.query<{ signature: string }>(`
      select p.oid::regprocedure::text as signature
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and has_function_privilege('anon', p.oid, 'execute')
      order by 1
    `);

    expect(rows, JSON.stringify(rows, null, 2)).toEqual([]);
  });

  it("toute fonction SECURITY DEFINER d'écriture exposée possède une garde de périmètre", async () => {
    const { rows } = await db.query<{ signature: string }>(String.raw`
      with fonctions_ecriture as (
        select
          p.oid,
          p.oid::regprocedure::text as signature,
          lower(pg_get_functiondef(p.oid)) as definition
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prosecdef
          and has_function_privilege('authenticated', p.oid, 'execute')
          and pg_get_functiondef(p.oid) ~* '\m(insert|update|delete|truncate|merge)\M'
      )
      select signature
      from fonctions_ecriture
      where definition !~ (
        'auth\.uid\s*\('
        || '|is_super_admin\s*\('
        || '|has_org_role\s*\('
        || '|is_org_member\s*\('
        || '|is_org_admin\s*\('
        || '|org_ids_avec_roles\s*\('
        || '|mon_artisan_id\s*\('
        || '|ma_personne_espace\s*\('
        || '|ma_personne_locataire\s*\('
        || '|controler_mise_en_location\s*\('
        || '|service_role'
        || '|current_setting\s*\('
      )
      order by signature
    `);

    expect(rows, JSON.stringify(rows, null, 2)).toEqual([]);
  });

  it("les préfigurations sont supprimées sans retirer la reprise comptable native", async () => {
    const { rows: obsoletes } = await db.query<{ table_name: string }>(`
      select nom as table_name
      from unnest(array[
        'demandes_pieces',
        'invitations',
        'artisan_candidatures',
        'signature_circuits',
        'signature_signataires',
        'controles_solvabilite'
      ]) as nom
      where to_regclass('public.' || nom) is not null
    `);
    expect(obsoletes).toEqual([]);

    const { rows: actives } = await db.query<{ table_name: string }>(`
      select nom as table_name
      from unnest(array[
        'reprises_portefeuille',
        'reprise_soldes',
        'mouvements_mandants'
      ]) as nom
      where to_regclass('public.' || nom) is not null
      order by nom
    `);
    expect(actives.map(({ table_name }) => table_name)).toEqual([
      'mouvements_mandants',
      'reprise_soldes',
      'reprises_portefeuille',
    ]);
  });
});
