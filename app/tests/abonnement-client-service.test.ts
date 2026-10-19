import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { verifierBaseDeTest } from "./garde-base";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
describe.skipIf(!url)("enregistrement du client de paiement", () => {
  let db: Client;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db.end(); });
  beforeEach(async () => { await db.query("begin"); });
  afterEach(async () => { await db.query("rollback"); });
  it("réserve l'exécution au service", async () => {
    const { rows: [droits] } = await db.query(`select
      has_function_privilege('anon','public.abonnement_client_pose(uuid,text)','execute') as anonyme,
      has_function_privilege('authenticated','public.abonnement_client_pose(uuid,text)','execute') as compte,
      has_function_privilege('service_role','public.abonnement_client_pose(uuid,text)','execute') as service`);
    expect(droits).toEqual({ anonyme: false, compte: false, service: true });
  });
  it("enregistre une seule association, sans remplacer un dossier existant", async () => {
    const { rows: [{ id }] } = await db.query("insert into public.organizations(name,type,status) values ('Organisation de test','proprietaire_direct','essai') returning id");
    await db.query("set local role service_role; select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
    await db.query("select public.abonnement_client_pose($1,'cus_fictif')", [id]);
    await db.query("select public.abonnement_client_pose($1,'cus_autre')", [id]);
    await db.query("reset role");
    expect((await db.query("select stripe_customer_id from public.abonnements where organization_id=$1", [id])).rows[0].stripe_customer_id).toBe("cus_fictif");
  });
});
