import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { verifierBaseDeTest } from "./garde-base";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
describe.skipIf(!url)("lecture de la session courante", () => {
  let db: Client;
  let compte: string;
  let autre: string;
  let session: string;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query("begin");
    [compte, autre, session] = [randomUUID(), randomUUID(), randomUUID()];
    for (const id of [compte, autre]) {
      await db.query("insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,$2,now(),'{}','{}')", [id, [id, "example.invalid"].join("@")]);
    }
    await db.query("insert into auth.sessions(id,user_id,created_at) values($1,$2,now()-interval '2 hours')", [session, compte]);
  });
  afterEach(async () => { await db.query("rollback"); });
  async function lire(id: string, sid: string | null = session) {
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated", session_id: sid })]);
    await db.query("set local role authenticated");
    try { return (await db.query("select * from public.ma_session_active()")).rows; }
    finally { await db.query("reset role"); }
  }
  it("ne renvoie que sa propre session et sa date de création", async () => {
    const rows = await lire(compte);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(session);
    expect(Date.now() - rows[0].cree_le.getTime()).toBeGreaterThan(119 * 60000);
    expect(await lire(autre)).toEqual([]);
  });
  it("refuse les références absentes, mal formées et inconnues", async () => {
    for (const sid of [null, "invalide", randomUUID()]) expect(await lire(compte, sid)).toEqual([]);
  });
  it("la reconnexion du compte n'avance pas le début de l'ancienne session", async () => {
    const avant = await lire(compte);
    await db.query("update auth.users set last_sign_in_at=now() where id=$1", [compte]);
    await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [randomUUID(), compte]);
    expect(await lire(compte)).toEqual(avant);
  });
  it("une session expirée ou révoquée ne peut plus être lue", async () => {
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [session]);
    expect(await lire(compte)).toEqual([]);
    await db.query("delete from auth.sessions where id=$1", [session]);
    expect(await lire(compte)).toEqual([]);
  });
  it("n'ouvre ni le registre Auth ni la fonction aux visiteurs", async () => {
    const { rows: [r] } = await db.query(`select
      has_function_privilege('anon','public.ma_session_active()','execute') as anonyme,
      has_function_privilege('authenticated','public.ma_session_active()','execute') as compte,
      has_table_privilege('authenticated','auth.sessions','select') as registre`);
    expect(r).toEqual({ anonyme: false, compte: true, registre: false });
  });
});
