import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { verifierBaseDeTest } from "./garde-base";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const noms = ["20261020010000_abonnement_client_service", "20261020011000_session_origine_verifiee", "20261020020000_stripe_reprises_durables"];
const source = (nom: string) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8");
// Les scripts de retour ouvrent leur propre transaction en exploitation. Les essais
// restent dans leur transaction jetable pour ne modifier ni données ni droits durables.
const retour = (nom: string) => readFileSync(`supabase/retours-arriere/${nom}.retour.sql`, "utf8")
  .replace(/do \$retour_arriere\$[\s\S]*?end \$retour_arriere\$;/, "")
  .replace(/^begin;|^commit;/gm, "");
describe.skipIf(!url)("audit octobre : migration, retour et rejeu", () => {
  let db: Client;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => { await db.query("begin"); });
  afterEach(async () => { await db.query("rollback"); });
  const fonction = async (nom: string) => (await db.query("select pg_get_functiondef($1::regprocedure) as definition,proacl::text as droits from pg_proc where oid=$1::regprocedure", [nom])).rows[0];
  it("l'association Stripe retrouve exactement sa définition après retour et rejeu", async () => {
    const f = "public.abonnement_client_pose(uuid,text)";
    const avant = await fonction(f);
    await db.query(source(noms[0]));
    expect(await fonction(f)).toEqual(avant);
    await db.query(retour(noms[0]));
    expect((await db.query("select has_function_privilege('authenticated',$1,'execute') as droit", [f])).rows[0].droit).toBe(true);
    await db.query(source(noms[0]));
    expect(await fonction(f)).toEqual(avant);
  });
  it("le retour de la lecture de session préserve tous les comptes et sessions", async () => {
    const f = "public.ma_session_active()";
    const avant = await fonction(f);
    const comptes = async () => (await db.query("select (select count(*) from auth.users) as comptes,(select count(*) from auth.sessions) as sessions")).rows[0];
    const populations = await comptes();
    await db.query(source(noms[1]));
    expect(await fonction(f)).toEqual(avant);
    await db.query(retour(noms[1]));
    expect((await db.query("select to_regprocedure($1) as fonction", [f])).rows[0].fonction).toBeNull();
    expect(await comptes()).toEqual(populations);
    await db.query(source(noms[1]));
    expect(await fonction(f)).toEqual(avant);
  });
  it("le retour Stripe conserve les reçus terminés et le bilan, puis permet le rejeu", async () => {
    const f = "public.stripe_evenement_prendre(text,text,jsonb,uuid)";
    const avant = await fonction(f);
    await db.query("insert into public.abonnement_evenements(stripe_event_id,type,charge,traite_le) values('evt_retour_oct20','invoice.paid','{\"objet\":\"in_retour\",\"client\":\"cus_retour\"}',now())");
    const org = (await db.query("insert into public.organizations(name,type,status) values('Retour fictif Stripe','proprietaire_direct','essai') returning id")).rows[0].id;
    await db.query("insert into public.abonnements(organization_id,stripe_controle_le,stripe_controle_ecarts) values($1,now(),array['statut'])", [org]);
    const lire = async () => (await db.query("select charge,traite_le from public.abonnement_evenements where stripe_event_id='evt_retour_oct20'")).rows[0];
    const recu = await lire();
    await db.query(source(noms[2])); expect(await fonction(f)).toEqual(avant);
    await db.query(retour(noms[2]));
    expect(await lire()).toEqual(recu);
    expect((await db.query("select stripe_controle_ecarts from public.abonnements where organization_id=$1", [org])).rows[0].stripe_controle_ecarts).toEqual(["statut"]);
    expect((await db.query("select to_regprocedure($1) as fonction", [f])).rows[0].fonction).toBeNull();
    await db.query(source(noms[2])); expect(await fonction(f)).toEqual(avant);
    expect(await lire()).toEqual(recu);
  });
  it("refuse un retour Stripe tant qu'une réception durable attend", async () => {
    await db.query("insert into public.abonnement_evenements(stripe_event_id,type,charge) values('evt_attente_oct20','invoice.paid','{\"objet\":\"in_retour\",\"client\":\"cus_retour\"}')");
    await expect(db.query(retour(noms[2]))).rejects.toThrow("restent à traiter");
  });
  it("refuse le script de retour Stripe dans une transaction externe", async () => {
    await db.query("select 1");
    const script = readFileSync(`supabase/retours-arriere/${noms[2]}.retour.sql`, "utf8");
    await expect(db.query(script)).rejects.toThrow("gère sa propre transaction");
  });
});
