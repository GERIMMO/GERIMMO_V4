import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
config({ path: ".env.local" });
const url = process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);
describe.skipIf(!url)("réservation IA privée : contrôle SQL réel", () => {
  let db: Client, owner: string, tenant: string, autre: string, org: string, orgB: string;
  const admin = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const as = async (id: string) => { await admin(); await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2" })]); await db.query("set local role authenticated"); };
  const compte = async () => (await db.query("insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current) values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','test-ia-prive-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}',now(),now(),'','','','','') returning id")).rows[0].id;
  const appel = async (usage = "conversation_privee", espace = org) => (await db.query("select public.reserver_appel_ia_prive($1,$2) r", [espace, usage])).rows[0].r;
  const refus = async (sql: string, args: unknown[] = []) => { await db.query("savepoint refus"); try { await db.query(sql, args); return ""; } catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; } finally { await db.query("release savepoint refus"); } };
  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect(); await db.query("begin");
    owner = await compte(); tenant = await compte(); autre = await compte();
    org = (await db.query("insert into organizations(name,type,status) values('TEST IA A','proprietaire_direct','active') returning id")).rows[0].id;
    orgB = (await db.query("insert into organizations(name,type,status) values('TEST IA B','proprietaire_direct','active') returning id")).rows[0].id;
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$4,'proprietaire_direct'),($2,$4,'locataire'),($3,$5,'proprietaire_direct')", [owner, tenant, autre, org, orgB]);
    await db.query("update supervision_arrets set arrete=false"); await db.query("update ia_plafond_reglage set plafond_jour=100"); await db.query("delete from ia_appels_jour where jour=aujourdhui_paris()");
  });
  beforeEach(async () => { await admin(); await db.query("savepoint scenario"); });
  afterEach(async () => { await db.query("rollback to savepoint scenario"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  it("propriétaire et locataire ont chacun leur compteur privé", async () => {
    await as(owner); expect(await appel()).toBe("accorde");
    await as(tenant); expect((await db.query("select * from ia_appels_comptes_jour")).rows).toEqual([]); expect(await appel()).toBe("accorde");
    expect((await db.query("select account_id,appels from ia_appels_comptes_jour")).rows).toEqual([{ account_id: tenant, appels: 1 }]);
    await as(autre); expect((await db.query("select * from ia_appels_comptes_jour")).rows).toEqual([]);
    expect(await refus("select reserver_appel_ia_prive($1,'conversation_privee')", [org])).toMatch(/Accès refusé/);
  });
  it("le double clic ne part pas deux fois et consomme une seule place globale", async () => {
    await as(owner); expect(await appel()).toBe("accorde"); expect(await appel()).toBe("patientez");
    await admin(); expect((await db.query("select appels from ia_appels_jour where jour=aujourdhui_paris()")).rows[0].appels).toBe(1);
  });
  it("le quota personnel reste le même en changeant d’espace", async () => {
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'locataire')", [owner, orgB]);
    await db.query("insert into ia_appels_comptes_jour values($1,aujourdhui_paris(),'conversation_privee',10,null)", [owner]);
    await as(owner); expect(await appel()).toBe("limite_compte"); expect(await appel("conversation_privee", orgB)).toBe("limite_compte");
    expect(await appel("lecture_document")).toBe("accorde");
  });
  it("l’arrêt global et le plafond bloquent les deux usages sans consommer le quota du compte", async () => {
    await db.query("insert into supervision_arrets(cle,arrete,motif,auteur) values('global',true,'TEST privé',$1) on conflict(cle) do update set arrete=true", [owner]); await as(owner); expect(await appel()).toBe("arret");
    await admin(); await db.query("update supervision_arrets set arrete=false where cle='global'"); await db.query("update ia_plafond_reglage set plafond_jour=0"); await as(owner);
    expect(await appel()).toBe("plafond"); expect(await appel("lecture_document")).toBe("plafond");
    expect((await db.query("select appels from ia_appels_comptes_jour")).rows.every(r => r.appels === 0)).toBe(true);
  });
  it("adhésion inactive, rôle artisan et organisation suspendue ne peuvent appeler", async () => {
    await db.query("update memberships set status='inactive' where account_id=$1", [tenant]); await as(tenant); expect(await refus("select reserver_appel_ia_prive($1,'lecture_document')", [org])).toMatch(/Accès refusé/);
    await admin(); await db.query("update memberships set role='artisan' where account_id=$1", [owner]); await as(owner); expect(await refus("select reserver_appel_ia_prive($1,'conversation_privee')", [org])).toMatch(/Accès refusé/);
    await admin(); await db.query("select tache_systeme()"); await db.query("update organizations set status='suspendue' where id=$1", [orgB]); await db.query("select set_config('gerimmo.systeme','',true)"); await as(autre); expect(await refus("select reserver_appel_ia_prive($1,'lecture_document')", [orgB])).toMatch(/Accès refusé/);
  });
  it("ni usage interne, ni identité passée par le client, ni écriture directe autorisée", async () => {
    await as(owner); expect(await refus("select reserver_appel_ia_prive($1,'veille')", [org])).toMatch(/Usage/);
    expect(await refus("update ia_appels_comptes_jour set appels=0")).toMatch(/permission denied/);
    expect(await refus("select reserver_appel_ia('conversation_privee')")).toMatch(/Accès réservé/);
    await admin(); await db.query("set local role anon"); expect(await refus("select reserver_appel_ia_prive($1,'lecture_document')", [org])).toMatch(/permission denied/);
  });
  it("un essai expiré ne réserve aucun appel privé ni place globale", async () => {
    await db.query("select tache_systeme()");
    await db.query("update organizations set status='essai',essai_fin=aujourdhui_paris()-1 where id=$1",[org]);
    await db.query("select set_config('gerimmo.systeme','',true)");
    for(const compte of [owner,tenant]) {
      await as(compte);
      for(const usage of ['conversation_privee','lecture_document']) expect(await refus("select reserver_appel_ia_prive($1,$2)",[org,usage])).toMatch(/Accès refusé/);
    }
    await admin();
    expect((await db.query("select * from ia_appels_comptes_jour where account_id=any($1::uuid[])",[[owner,tenant]])).rows).toEqual([]);
    expect((await db.query("select * from ia_appels_jour where jour=aujourdhui_paris()")).rows).toEqual([]);
  });
  it("le retour privé est atomique, garde les compteurs et autorise le rejeu sans rouvrir par accident", async () => {
    await as(owner);expect(await appel()).toBe("accorde");await admin();
    const retour=readFileSync("supabase/retours-arriere/20261028145948_assistant_prive_et_usages_ia.retour.sql","utf8");
    const migration=readFileSync("supabase/migrations/20261028145948_assistant_prive_et_usages_ia.sql","utf8");
    const avant=(await db.query("select * from ia_appels_comptes_jour where account_id=$1",[owner])).rows;
    expect(await refus(retour+"select 1/0;")).toContain("division by zero");
    expect((await db.query("select has_function_privilege('authenticated','reserver_appel_ia_prive(uuid,text)','execute') autorise")).rows[0].autorise).toBe(true);
    await db.query(retour);await db.query(retour);
    expect((await db.query("select pg_get_functiondef('reserver_appel_ia_prive(uuid,text)'::regprocedure) definition")).rows[0].definition).not.toContain("aujourdhui_paris");
    expect(await refus("select reserver_appel_ia_prive($1,'conversation_privee')",[org])).toContain("désactivé");
    await as(owner);expect(await refus("select reserver_appel_ia_prive($1,'conversation_privee')",[org])).toContain("permission denied");await admin();
    await db.query(migration);await db.query(migration);
    expect((await db.query("select * from ia_appels_comptes_jour where account_id=$1",[owner])).rows).toEqual(avant);
    expect((await db.query("select has_function_privilege('authenticated','reserver_appel_ia_prive(uuid,text)','execute') autorise")).rows[0].autorise).toBe(true);
  });

});
