/**
 * Audit final (PUB-20) — « Compléter le logement » mène au lot à compléter, pas à la liste du parc.
 * Migration 20261028100400_parcours_demarrage_lot_bloque.sql : la ligne lot_pret porte le lot bloqué et son bien ; la
 * ligne « bail » ne propose toujours que le lot prêt.
 *
 * Transaction annulée à la fin. Nécessite SUPABASE_DB_URL (sinon ignoré).
 */
import { readFileSync } from "node:fs";
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const MIGRATION = "20261028100400_parcours_demarrage_lot_bloque";

describe("parcours de démarrage — le lot bloqué (fichiers)", () => {
  it("ne change que la lecture du lot bloqué, ferme la fonction à anon, figure une fois au manifeste avec son retour", () => {
    const sql = readFileSync(`supabase/migrations/${MIGRATION}.sql`, "utf8");
    const avant = readFileSync("supabase/migrations/20261027100500_parcours_demarrage_pluriel_baux.sql", "utf8");
    const corps = (t: string) => t.slice(t.indexOf("create or replace function public.parcours_demarrage"), t.indexOf("$function$;"));
    expect(corps(sql)).toContain("coalesce(v_lot_pret, v_lot_bloque), coalesce(v_bien_pret, v_bien_bloque)");
    // La ligne « bail » garde le seul lot prêt.
    expect(corps(sql)).toMatch(/'Le bail signé déposé[^']*' end,\n\s+v_lot_pret, v_bien_pret/);
    expect(sql).toContain("set search_path = ''");
    expect(sql.trim().endsWith("select public.fermer_fonctions_a_anon();")).toBe(true);
    expect(corps(avant)).not.toContain("v_lot_bloque");
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${MIGRATION}.sql`)).toHaveLength(1);
    const retour = readFileSync(`supabase/retours-arriere/${MIGRATION}.retour.sql`, "utf8");
    expect(retour).not.toContain("v_lot_bloque");
    expect(retour).toContain("delete from supabase_migrations.schema_migrations where version = '20261028100400'");
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`${MIGRATION}.retour.sql`);
  });
});

describe.skipIf(!DB_URL)("parcours de démarrage — le lot bloqué (base)", () => {
  let db: Client;
  let org = "", compte = "", bien = "", lot = "";

  const etapes = async () => {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role','authenticated','aal','aal2')::text, true)`,
      [compte]
    );
    await db.query("set local role authenticated");
    const { rows } = await db.query(`select etape, faite, detail, lot_id, bien_id from public.parcours_demarrage($1)`, [org]);
    await db.query("reset role");
    return Object.fromEntries(rows.map((r) => [r.etape, r]));
  };

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
    const { rows: [o] } = await db.query(
      `insert into public.organizations (name, status, type, address_line1, postal_code, city, email_contact)
       values ('LotBloqueAF','active','proprietaire_direct','1 rue Haute','69007','Lyon','lotbloque@test.local') returning id`);
    org = o.id;
    const { rows: [u] } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
         email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         'lotbloque-' || gen_random_uuid() || '@test.local', 'x', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '','','','','')
       returning id`);
    compte = u.id;
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1,$2,'proprietaire_direct')`, [compte, org]);
    const { rows: [b] } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Maison','maison','2 rue Basse','69007','Lyon') returning id`, [org]);
    bien = b.id;
    const { rows: [l] } = await db.query(
      `insert into public.lots (bien_id, organization_id, nom, etat) values ($1,$2,'Lot A','disponible') returning id`, [bien, org]);
    lot = l.id;
  });

  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  it("un lot encore bloqué : la ligne « Préparation du logement » porte ce lot et son bien, la ligne « bail » rien", async () => {
    const e = await etapes();
    expect(e.lot_pret.faite).toBe(false);
    expect(e.lot_pret.detail).toBeTruthy();
    expect(e.lot_pret).toMatchObject({ lot_id: lot, bien_id: bien });
    expect(e.bail).toMatchObject({ lot_id: null, bien_id: null });
  });
});
