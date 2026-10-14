/**
 * D44 (audit du 13/10, PRF-04) — « équivalence entre le rôle lu par le proxy et is_super_admin() »,
 * second facteur compris, vérifiée sur une vraie base.
 *
 * Le proxy ne peut pas appeler is_super_admin() à chaque requête (il lit déjà les adhésions actives et
 * le niveau du second facteur, rien de plus). Il décide donc avec `estSuperviseurActif(roles, niveau)`.
 * Ce test joue, pour chaque situation de compte et chaque niveau de session, EXACTEMENT les deux
 * lectures du proxy sous la session du compte (même requête sur `memberships`, soumise à la RLS ; le
 * niveau est la revendication `aal` du jeton, comme le lit supabase-js) et exige la même réponse que
 * `public.is_super_admin()`, celle que le layout /admin et les politiques RLS appliquent.
 *
 * Tout est joué dans une transaction annulée à la fin.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { estSuperviseurActif } from "../src/lib/mfa";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("D44 — le proxy et is_super_admin() décident pareil", () => {
  let db: Client;
  const comptes: Record<string, string> = {};

  async function creerCompte(nom: string) {
    const { rows: [u] } = await db.query(
      `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values (gen_random_uuid(), 'authenticated', 'authenticated', $1 || '-' || gen_random_uuid() || '@test.local', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()) returning id`,
      [nom]
    );
    comptes[nom] = u.id;
    return u.id as string;
  }

  /** Ouvre la session du compte avec ce niveau de second facteur (undefined = revendication absente). */
  async function agir(compte: string, aal: string | undefined) {
    await db.query("reset role");
    const revendications: Record<string, string> = { sub: compte, role: "authenticated" };
    if (aal !== undefined) revendications.aal = aal;
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(revendications)]);
    await db.query("set local role authenticated");
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query("begin");
    const { rows: [org] } = await db.query("insert into public.organizations (name) values ('Agence équivalence D44') returning id");
    await creerCompte("superviseur");
    await creerCompte("superviseur-suspendu");
    await creerCompte("administrateur-agence");
    await creerCompte("superviseur-et-agence");
    await creerCompte("locataire");
    await creerCompte("sans-adhesion");
    await db.query("insert into public.memberships (account_id, organization_id, role, status) values ($1, null, 'super_admin', 'active')", [comptes["superviseur"]]);
    await db.query("insert into public.memberships (account_id, organization_id, role, status) values ($1, null, 'super_admin', 'inactive')", [comptes["superviseur-suspendu"]]);
    await db.query("insert into public.memberships (account_id, organization_id, role, status) values ($1, $2, 'admin_agence', 'active')", [comptes["administrateur-agence"], org.id]);
    await db.query("insert into public.memberships (account_id, organization_id, role, status) values ($1, null, 'super_admin', 'active'), ($1, $2, 'admin_agence', 'active')", [comptes["superviseur-et-agence"], org.id]);
    await db.query("insert into public.memberships (account_id, organization_id, role, status) values ($1, $2, 'locataire', 'active')", [comptes["locataire"], org.id]);
  });
  afterEach(async () => { await db.query("rollback"); });

  const NIVEAUX: (string | undefined)[] = [undefined, "aal1", "aal2", "aal3", ""];

  it.each(["superviseur", "superviseur-suspendu", "administrateur-agence", "superviseur-et-agence", "locataire", "sans-adhesion"])(
    "%s : même décision que is_super_admin() à tous les niveaux de session",
    async (nom) => {
      for (const aal of NIVEAUX) {
        await agir(comptes[nom], aal);
        // Lecture n° 1 du proxy : les adhésions ACTIVES du compte, sous sa propre session (RLS comprise).
        const { rows } = await db.query("select role from public.memberships where account_id = $1 and status = 'active'", [comptes[nom]]);
        // Lecture n° 2 : le niveau du jeton (supabase-js : currentLevel = revendication `aal`, sinon null).
        const niveau = aal === undefined || aal === "" ? null : aal;
        const decisionProxy = estSuperviseurActif(rows.map((r) => r.role as string), niveau);
        const { rows: [sql] } = await db.query("select public.is_super_admin() as ok");
        expect(decisionProxy, `${nom} @ ${aal ?? "sans aal"}`).toBe(sql.ok);
        await db.query("reset role");
      }
    }
  );

  it("les seuls cas où l'on entre : adhésion super_admin active ET aal2", async () => {
    const entrants: string[] = [];
    for (const nom of Object.keys(comptes)) {
      for (const aal of NIVEAUX) {
        await agir(comptes[nom], aal);
        const { rows } = await db.query("select role from public.memberships where account_id = $1 and status = 'active'", [comptes[nom]]);
        if (estSuperviseurActif(rows.map((r) => r.role as string), aal ?? null)) entrants.push(`${nom}@${aal}`);
        await db.query("reset role");
      }
    }
    expect(entrants.sort()).toEqual(["superviseur-et-agence@aal2", "superviseur@aal2"]);
  });
});
