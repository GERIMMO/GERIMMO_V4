/**
 * Le faux client Supabase des tests d'écrans (`faux-postgrest.ts`) ne vaut que si les colonnes qu'il connaît existent
 * vraiment. Ce test les recoupe avec la base réelle, puis fait exécuter par un gérant (rôle `authenticated`, sous RLS)
 * les lectures que font les écrans « liste des incidents » (devis à décider) et « validation de facture » (rendez-vous
 * prévu / intervention terminée) : colonne, valeur d'énumération, type de date et droits de lecture. Sans cela, un
 * écran dont la requête serait refusée par la base passerait tous ses tests contre le faux client.
 *
 * Aucune donnée n'est écrite durablement : transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SCHEMA_CONNU } from "./faux-postgrest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Le faux client des tests d'écrans colle à la base réelle", () => {
  let db: Client;
  let org = "";
  let gerant = "";

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
    const { rows: [o] } = await db.query(
      `insert into public.organizations (name, status) values ('Schéma des écrans — Agence','active') returning id`
    );
    org = o.id;
    const { rows: [u] } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new,
         email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
         'authenticated', 'gerant-' || gen_random_uuid() || '@test.local', 'x', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
         '','','','','')
       returning id`
    );
    gerant = u.id;
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, org]
    );
  });

  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  it.each(Object.entries(SCHEMA_CONNU))("table %s : chaque colonne déclarée existe", async (nom, { colonnes }) => {
    const { rows } = await db.query(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
      [nom]
    );
    const reelles = new Set(rows.map((r) => r.column_name as string));
    expect(reelles.size, `table ${nom} absente de la base`).toBeGreaterThan(0);
    expect(colonnes.filter((c) => !reelles.has(c))).toEqual([]);
  });

  describe("lues par un gérant, sous RLS", () => {
    const lire = async (sql: string, params: unknown[]) => {
      await db.query("savepoint lecture");
      try {
        await db.query("set local role authenticated");
        await db.query(
          `select set_config('request.jwt.claims',
             json_build_object('sub', $1::text, 'role','authenticated','aal','aal2')::text, true)`,
          [gerant]
        );
        return await db.query(sql, params);
      } finally {
        await db.query("reset role");
        await db.query("rollback to savepoint lecture");
      }
    };

    it("la page des incidents : les devis valables et non retenus (statut « depose », échéance >= aujourd'hui)", async () => {
      const { rows } = await lire(
        `select incident_id from public.incident_devis
          where organization_id = $1 and statut = 'depose' and valide_jusqu_au >= $2`,
        [org, "2026-10-15"]
      );
      expect(rows).toEqual([]);
    });

    it("l'écran de validation de facture : rendez-vous prévu et fin d'intervention", async () => {
      const { rows } = await lire(
        `select id, debut_prevu, terminee_le from public.incident_interventions
          where organization_id = $1 and incident_id = $2`,
        [org, gerant]
      );
      expect(rows).toEqual([]);
    });

    it("l'écran de validation de facture : les factures de l'intervention", async () => {
      const { rows } = await lire(
        `select id, intervention_id, numero, montant_ttc_cents, montant_reference_cents, ecart_justification,
                document_id, validee_le, decision_motif, imputation_validee
           from public.intervention_factures
          where organization_id = $1 and intervention_id = any($2::uuid[])`,
        [org, [gerant]]
      );
      expect(rows).toEqual([]);
    });

    it("l'écran de la facture : les règlements déclarés (D23), lus par le gérant sous RLS", async () => {
      const { rows } = await lire(
        `select id, facture_id, montant_cents, date_reglement, moyen, reference, created_at, retire_le, retrait_motif
           from public.intervention_facture_reglements
          where organization_id = $1 and facture_id = any($2::uuid[])
          order by date_reglement, created_at`,
        [org, [gerant]]
      );
      expect(rows).toEqual([]);
    });

    it("la valeur « depose » est bien un statut de devis, « retenu » aussi", async () => {
      const { rows } = await db.query(`select unnest(enum_range(null::public.devis_statut))::text as statut`);
      expect(rows.map((r) => r.statut)).toEqual(expect.arrayContaining(["depose", "retenu"]));
    });
  });
});
