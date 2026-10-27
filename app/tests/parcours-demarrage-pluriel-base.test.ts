/**
 * Audit #264 (CB-16) — le parcours de démarrage écrit « 2 baux en cours », jamais « 2 bailx en cours ».
 * Migration 20261027100500_parcours_demarrage_pluriel_baux.sql : seule l'expression du pluriel change.
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

const MIGRATION = "20261027100500_parcours_demarrage_pluriel_baux";

describe("parcours de démarrage — pluriel de « bail » (fichiers)", () => {
  it("la migration ne change que le pluriel, ferme la fonction à anon et figure une fois au manifeste avec son retour", () => {
    const sql = readFileSync(`supabase/migrations/${MIGRATION}.sql`, "utf8");
    const avant = readFileSync("supabase/migrations/20260927163000_parcours_demarrage_premier_loyer.sql", "utf8");
    const corps = (texte: string) => texte.slice(texte.indexOf("create or replace function public.parcours_demarrage"), texte.indexOf("$function$;"));
    expect(corps(sql)).toContain("then 'baux' else 'bail' end");
    expect(corps(sql)).not.toContain("'x'");
    expect(corps(sql).replace("format('%s %s en cours', v_bail, case when v_bail > 1 then 'baux' else 'bail' end)", ""))
      .toBe(corps(avant).replace("format('%s bail%s en cours', v_bail, case when v_bail > 1 then 'x' else '' end)", ""));
    expect(sql).toContain("set search_path = ''");
    expect(sql.trim().endsWith("select public.fermer_fonctions_a_anon();")).toBe(true);
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${MIGRATION}.sql`)).toHaveLength(1);
    expect(readFileSync(`supabase/retours-arriere/${MIGRATION}.retour.sql`, "utf8")).toContain("then 'x' else '' end");
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`${MIGRATION}.retour.sql`);
  });
});

describe.skipIf(!DB_URL)("parcours de démarrage — pluriel de « bail » (base)", () => {
  let db: Client;
  let org = "", compte = "";
  const lots: string[] = [];

  const agir = async () => {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role','authenticated','aal','aal2')::text, true)`,
      [compte]
    );
    await db.query("set local role authenticated");
  };
  const etapeBail = async () => {
    await agir();
    const { rows } = await db.query(`select etape, faite, detail from public.parcours_demarrage($1)`, [org]);
    await db.query("reset role");
    return rows.find((r) => r.etape === "bail");
  };
  const ajouterBail = async (lot: string, nom: string) => {
    const { rows: [personne] } = await db.query(
      `insert into public.persons (organization_id, nom, prenom) values ($1,$2,'Test') returning id`, [org, nom]);
    await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat, date_debut, loyer_hc, charges)
       values ($1,$2,$3,'actif', current_date - 30, 600, 40)`, [org, lot, personne.id]);
  };

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
    const { rows: [o] } = await db.query(
      `insert into public.organizations (name, status, type, address_line1, postal_code, city, email_contact)
       values ('Pluriel264','active','proprietaire_direct','1 rue Haute','69007','Lyon','pluriel264@test.local') returning id`);
    org = o.id;
    const { rows: [u] } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
         email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         'pluriel264-' || gen_random_uuid() || '@test.local', 'x', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '','','','','')
       returning id`);
    compte = u.id;
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1,$2,'proprietaire_direct')`, [compte, org]);
    const { rows: [b] } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Maison','maison','2 rue Basse','69007','Lyon') returning id`, [org]);
    for (const nom of ["Lot A", "Lot B"]) {
      const { rows: [l] } = await db.query(
        `insert into public.lots (bien_id, organization_id, nom, etat) values ($1,$2,$3,'loue') returning id`, [b.id, org, nom]);
      lots.push(l.id);
    }
  });

  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  it("un bail en cours : « 1 bail en cours »", async () => {
    await ajouterBail(lots[0], "Premier");
    expect(await etapeBail()).toMatchObject({ faite: true, detail: "1 bail en cours" });
  });

  it("deux baux en cours : « 2 baux en cours », jamais « bailx »", async () => {
    await ajouterBail(lots[1], "Second");
    expect(await etapeBail()).toMatchObject({ faite: true, detail: "2 baux en cours" });
  });
});
