/**
 * Les deux tests non négociables du socle, exécutés à chaque livraison :
 *  1. « RLS actif partout » — toute table publique a RLS + au moins une politique.
 *  2. Test d'isolation par table (RM-A1.7) — une agence ne lit jamais les
 *     données d'une autre.
 *
 * Nécessite SUPABASE_DB_URL (chaîne de connexion Postgres) dans .env.local ou
 * l'environnement. Sans elle, les tests sont ignorés (skip) avec un avertissement.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });

const DB_URL = process.env.SUPABASE_DB_URL;

describe.skipIf(!DB_URL)("Socle — isolation et RLS", () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
  });

  it("RLS est actif, avec au moins une politique, sur toute table publique", async () => {
    const { rows } = await db.query(`
      select c.relname as table_en_defaut
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and (
          not c.relrowsecurity
          or not exists (
            select 1 from pg_policies p
            where p.schemaname = 'public' and p.tablename = c.relname
          )
        )
    `);
    expect(
      rows,
      `Tables sans RLS ou sans politique : ${rows.map((r) => r.table_en_defaut).join(", ")}`
    ).toHaveLength(0);
  });

  it("une agence ne voit jamais les données d'une autre (RM-A1.7)", async () => {
    await db.query("begin");
    try {
      // Deux agences, un compte membre de la première, une personne chacune
      const {
        rows: [{ org_a, org_b, compte_a }],
      } = await db.query(`
        with orgs as (
          insert into public.organizations (name, status)
          values ('Test Isolation A', 'active'), ('Test Isolation B', 'active')
          returning id, name
        ),
        u as (
          insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at, confirmation_token, recovery_token,
            email_change, email_change_token_new, email_change_token_current
          ) values (
            '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
            'authenticated', 'authenticated',
            'test-isolation-' || gen_random_uuid() || '@test.local',
            'x', now(), '{"provider":"email","providers":["email"]}'::jsonb,
            '{}'::jsonb, now(), now(), '', '', '', '', ''
          ) returning id
        )
        select
          (select id from orgs where name = 'Test Isolation A') as org_a,
          (select id from orgs where name = 'Test Isolation B') as org_b,
          (select id from u) as compte_a
      `);

      await db.query(
        `insert into public.memberships (account_id, organization_id, role)
         values ($1, $2, 'admin_agence')`,
        [compte_a, org_a]
      );
      await db.query(
        `insert into public.persons (organization_id, nom) values ($1, 'PersonneA'), ($2, 'PersonneB')`,
        [org_a, org_b]
      );

      // Simulation du compte connecté (membre de A uniquement)
      await db.query(
        `select set_config('request.jwt.claims',
           json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
        [compte_a]
      );
      await db.query("set local role authenticated");

      const isolation = await db.query(
        `select
           (select count(*) from public.organizations where id in ($1, $2)) as orgs_visibles,
           (select count(*) from public.persons where organization_id = $1) as personnes_a,
           (select count(*) from public.persons where organization_id = $2) as personnes_b`,
        [org_a, org_b]
      );
      expect(Number(isolation.rows[0].orgs_visibles)).toBe(1);
      expect(Number(isolation.rows[0].personnes_a)).toBe(1);
      expect(Number(isolation.rows[0].personnes_b)).toBe(0);

      // Un anonyme ne voit rien du tout
      await db.query("reset role");
      await db.query("set local role anon");
      const anonyme = await db.query(
        `select
           (select count(*) from public.organizations where id in ($1, $2)) as orgs,
           (select count(*) from public.persons where organization_id in ($1, $2)) as personnes`,
        [org_a, org_b]
      );
      expect(Number(anonyme.rows[0].orgs)).toBe(0);
      expect(Number(anonyme.rows[0].personnes)).toBe(0);
    } finally {
      await db.query("rollback");
    }
  });
});

if (!DB_URL) {
  console.warn(
    "⚠ SUPABASE_DB_URL absente : tests du socle ignorés. " +
      "Renseignez-la dans app/.env.local pour les exécuter."
  );
}
