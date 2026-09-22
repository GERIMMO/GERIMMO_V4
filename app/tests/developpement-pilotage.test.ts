import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);
const SHA = "a".repeat(40), AUTRE_SHA = "b".repeat(40);
describe.skipIf(!DB_URL)("Pilotage développement — contrôles et accords liés à la version", () => {
  let db: Client; let sa: string, tiers: string;
  const id = async (sql: string, args: unknown[] = []) => (await db.query<{ id: string }>(sql, args)).rows[0].id;
  const agir = async (compte: string, aal = "aal2") => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: compte, role: "authenticated", aal })]);
    await db.query("set local role authenticated");
  };
  const refus = async (sql: string, args: unknown[] = []) => {
    await db.query("savepoint refus_developpement");
    try { await db.query(sql, args); return ""; } catch (e) { await db.query("rollback to savepoint refus_developpement"); return (e as Error).message; }
    finally { await db.query("release savepoint refus_developpement"); }
  };
  const proposition = (rapport: object = { resultat: "reussi", revision: SHA }) => id("insert into public.development_proposals(source,titre,probleme,revision,rapport_controles,statut) values('test','Amélioration test','Problème de test',$1,$2,'autorisation') returning id", [SHA, rapport]);
  const etat = async (propositionId: string) => (await db.query("select revision,statut,autorisee_par,autorisee_le from public.development_proposals where id=$1", [propositionId])).rows[0];
  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL }); await db.connect(); await db.query("begin");
    const compte = () => id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','test-developpement-'||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`);
    sa = await compte(); tiers = await compte();
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,null,'super_admin')", [sa]);
  });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  beforeEach(async () => { await db.query("savepoint cas_developpement"); await agir(sa); });
  afterEach(async () => { await db.query("rollback to savepoint cas_developpement"); await db.query("release savepoint cas_developpement"); });
  it("refuse une révision abrégée ou arbitraire dès son enregistrement", async () => {
    const p = await proposition();
    for (const sha of ["abc1234", "version validée", "a".repeat(39)]) {
      expect(await refus("update public.development_proposals set revision=$1,rapport_controles='{}' where id=$2", [sha, p])).toMatch(/référence complète/);
    }
  });
  it("refuse un compte rendu réussi provenant d'une autre révision", async () => {
    expect(await refus("insert into public.development_proposals(source,titre,probleme,revision,rapport_controles) values('test','Test','Test',$1,$2)", [SHA, { resultat: "reussi", revision: AUTRE_SHA }])).toMatch(/révision exacte/);
  });
  it("exige une identité de supervision avec double vérification", async () => {
    const p = await proposition();
    await agir(tiers); expect(await refus("select public.decider_developpement($1,$2,true)", [p, SHA])).toMatch(/superviseur permanent/);
    await agir(sa, "aal1"); expect(await refus("select public.decider_developpement($1,$2,true)", [p, SHA])).toMatch(/superviseur permanent/);
  });
  it("n'accepte ni un ancien écran ni des contrôles inachevés", async () => {
    const p = await proposition();
    expect(await refus("select public.decider_developpement($1,$2,true)", [p, AUTRE_SHA])).toMatch(/version a changé/);
    const incomplet = await proposition({ resultat: "en_cours", revision: SHA });
    expect(await refus("select public.decider_developpement($1,$2,true)", [incomplet, SHA])).toMatch(/contrôles doivent réussir/);
  });
  it("enregistre un accord pour la version contrôlée puis refuse une seconde décision", async () => {
    const p = await proposition();
    await db.query("select public.decider_developpement($1,$2,true)", [p, SHA]);
    expect(await etat(p)).toMatchObject({ revision: SHA, statut: "preproduction", autorisee_par: sa });
    expect((await etat(p)).autorisee_le).toBeTruthy();
    expect(await refus("select public.decider_developpement($1,$2,false)", [p, SHA])).toMatch(/n’attend plus/);
  });
  it.each(["solution", "risque", "rapport", "revision", "autorisation"])("un changement de %s annule l'accord", async champ => {
    const p = await proposition(); await db.query("select public.decider_developpement($1,$2,true)", [p, SHA]);
    if (champ === "solution") await db.query("update public.development_proposals set solution_proposee='Nouvelle approche' where id=$1", [p]);
    if (champ === "risque") await db.query("update public.development_proposals set risque='eleve' where id=$1", [p]);
    if (champ === "rapport") await db.query("update public.development_proposals set rapport_controles=rapport_controles||'{\"detail\":\"Nouvelle exécution\"}'::jsonb where id=$1", [p]);
    if (champ === "revision") await db.query("update public.development_proposals set revision=$2,rapport_controles='{}' where id=$1", [p, AUTRE_SHA]);
    if (champ === "autorisation") await db.query("update public.development_proposals set autorisation_requise=false where id=$1", [p]);
    expect((await etat(p)).autorisee_par).toBeNull(); expect((await etat(p)).autorisee_le).toBeNull();
    if (champ !== "autorisation") expect(await refus("update public.development_proposals set statut='publiee' where id=$1", [p])).toMatch(/Publication impossible/);
  });
  it("ne réutilise pas un résultat réussi quand la révision change", async () => {
    const p = await proposition();
    expect(await refus("update public.development_proposals set revision=$2 where id=$1", [p, AUTRE_SHA])).toMatch(/révision exacte/);
  });
  it("ne déclare pas une publication sur la seule base d'une date d'accord", async () => {
    const p = await proposition();
    expect(await refus("update public.development_proposals set statut='publiee',autorisee_le=now(),autorisee_par=null where id=$1", [p])).toMatch(/Publication impossible/);
  });
  it("refuse un compte rendu non structuré et permet le refus d'une version non prête", async () => {
    const p = await proposition({ resultat: "echec", revision: SHA });
    expect(await refus("update public.development_proposals set rapport_controles='[]'::jsonb where id=$1", [p])).toMatch(/structuré/);
    await db.query("select public.decider_developpement($1,$2,false)", [p, SHA]);
    expect(await etat(p)).toMatchObject({ statut: "annulee", autorisee_par: null });
  });
});
