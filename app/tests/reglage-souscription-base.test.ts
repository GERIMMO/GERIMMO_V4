import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const nom = "20261022210326_reglage_blocage_souscription_identite";
const migration = readFileSync(`supabase/migrations/${nom}.sql`, "utf8");
const retour = readFileSync(`supabase/retours-arriere/${nom}.retour.sql`, "utf8");

describe.skipIf(!url)("blocage souscription : droits réels et historique", () => {
  let db: Client;
  let admin: string;
  let compte: string;
  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect(); await db.query("begin");
    const users = await db.query(`insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
      select gen_random_uuid(),'authenticated','authenticated','regle-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}'
      from generate_series(1,2) returning id,email`);
    [admin, compte] = users.rows.map(r => r.id);
    for (const user of users.rows) await db.query("insert into public.accounts(id,email) values($1,$2) on conflict(id) do nothing", [user.id,user.email]);
    await db.query("insert into public.memberships(account_id,organization_id,role,status) values($1,null,'super_admin','active')", [admin]);
  });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("reset role"); });

  async function session(id: string, aal = "aal2") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal',$2::text)::text,true)", [id,aal]);
    await db.query("set local role authenticated");
  }
  const lire = async () => (await db.query("select blocage_souscription_identite,revision from public.supervision_identite where singleton")).rows[0];
  const changer = (actif: boolean, revision: number) => db.query(
    "update public.supervision_identite set blocage_souscription_identite=$1,revision=revision+1 where singleton and revision=$2 returning revision", [actif,revision]);

  it("conserve la règle active par défaut et protège la table par RLS", async () => {
    expect((await lire()).blocage_souscription_identite).toBe(true);
    expect((await db.query("select relrowsecurity from pg_class where oid='public.supervision_identite'::regclass")).rows[0].relrowsecurity).toBe(true);
  });
  it("autorise les clients à lire le réglage mais pas à le modifier", async () => {
    await session(compte);
    const avant = await lire();
    expect((await changer(false,avant.revision)).rowCount).toBe(0);
    expect(await lire()).toEqual(avant);
  });
  it("refuse un superadmin sans second facteur", async () => {
    await session(admin,"aal1");
    const avant = await lire();
    expect((await changer(false,avant.revision)).rowCount).toBe(0);
  });
  it("ne donne aucun droit nouveau aux visiteurs anonymes", async () => {
    await db.query("set local role anon");
    await expect(db.query("select blocage_souscription_identite from public.supervision_identite")).rejects.toMatchObject({ code: "42501" });
  });
  it("lève puis réactive la règle en conservant l'auteur et les deux états", async () => {
    await session(admin);
    const avant = await lire();
    expect((await changer(false,avant.revision)).rowCount).toBe(1);
    expect((await lire()).blocage_souscription_identite).toBe(false);
    expect((await changer(true,avant.revision+1)).rowCount).toBe(1);
    const traces = await db.query("select auteur,avant,apres from public.supervision_registre where objet='supervision_identite' and auteur=$1 order by (apres->>'revision')::int",[admin]);
    expect(traces.rows).toHaveLength(2);
    expect(traces.rows[0]).toMatchObject({ auteur: admin, avant: { blocage_souscription_identite: true }, apres: { blocage_souscription_identite: false } });
    expect(traces.rows[1]).toMatchObject({ auteur: admin, avant: { blocage_souscription_identite: false }, apres: { blocage_souscription_identite: true } });
  });
  it("une page périmée ne peut pas écraser un changement plus récent", async () => {
    await session(admin);
    const avant = await lire();
    await changer(false,avant.revision);
    expect((await changer(true,avant.revision)).rowCount).toBe(0);
    expect((await lire()).blocage_souscription_identite).toBe(false);
  });
  it("le rejeu, le retour et la réapplication préservent la décision et sa trace", async () => {
    await session(admin);
    await changer(false,(await lire()).revision);
    await db.query("reset role");
    await db.query(migration);
    expect((await lire()).blocage_souscription_identite).toBe(false);
    await db.query(retour);
    expect((await lire()).blocage_souscription_identite).toBe(false);
    expect((await db.query("select has_column_privilege('authenticated','public.supervision_identite','blocage_souscription_identite','UPDATE') as autorise")).rows[0].autorise).toBe(false);
    await db.query(migration);
    await session(admin);
    expect((await changer(true,(await lire()).revision)).rowCount).toBe(1);
    expect((await db.query("select count(*)::int as n from public.supervision_registre where objet='supervision_identite' and auteur=$1",[admin])).rows[0].n).toBe(2);
  });
});
