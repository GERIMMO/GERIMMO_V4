import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe.skipIf(!url)("Profils fiscaux : persistance, historique et séparation des comptes", () => {
  let db: Client, owner: string, other: string, org: string, orgB: string, personne: string, sci: string, etranger: string;
  const admin = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const as = async (id: string) => { await admin(); await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2" })]); await db.query("set local role authenticated"); };
  const refus = async (sql: string, params: unknown[]) => { await db.query("savepoint refus"); try { await db.query(sql, params); return ""; } catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; } finally { await db.query("release savepoint refus"); } };
  const compte = async () => (await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current) values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','test-profil-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}',now(),now(),'','','','','') returning id`)).rows[0].id;
  const enregistrer = (id = personne, imposition = "ir", nu = "reel", meuble = "non_concerne") => db.query("select public.enregistrer_profil_fiscal_detenteur($1,2026,$2,$3,$4,'Déclaration précédente vérifiée') id", [id, imposition, nu, meuble]);
  beforeAll(async () => {
    if (!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):[0-9]{1,5}\/gerimmo_ci_[a-z_]+$/.test(url)) throw Error("Base locale dédiée requise");
    db = new Client({ connectionString: url }); await db.connect(); await db.query("begin");
    owner = await compte(); other = await compte();
    org = (await db.query("insert into organizations(name,status,type) values('TEST Fiscal A','active','proprietaire_direct') returning id")).rows[0].id;
    orgB = (await db.query("insert into organizations(name,status,type) values('TEST Fiscal B','active','proprietaire_direct') returning id")).rows[0].id;
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$4,'proprietaire_direct')", [owner, org, other, orgB]);
    for (const [o, qualite] of [[org, "Personne physique"], [org, "SCI"], [orgB, "Personne physique"]]) {
      const personneId = (await db.query("insert into persons(organization_id,nom,qualite) values($1,'TEST détenteur',$2) returning id", [o, qualite])).rows[0].id;
      const bien = (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST Bien','immeuble','1 rue TEST','75001','Paris') returning id", [o])).rows[0].id;
      const lot = (await db.query("insert into lots(organization_id,bien_id,nom) values($1,$2,'TEST Lot') returning id", [o, bien])).rows[0].id;
      await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,'2025-01-01')", [o, lot, personneId]);
      if (o === orgB) etranger = personneId; else if (qualite === "SCI") sci = personneId; else personne = personneId;
    }
  });
  beforeEach(async () => { await admin(); await db.query("savepoint scenario"); });
  afterEach(async () => { await db.query("rollback to savepoint scenario"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  it("enregistre le détenteur et sa qualité, sans créer un régime par lot", async () => {
    await as(owner); await enregistrer();
    expect((await db.query("select person_id,qualite,imposition,location_nue,location_meublee,annee,version,auteur from fiscal_profils_detenteurs")).rows).toEqual([{ person_id: personne, qualite: "Personne physique", imposition: "ir", location_nue: "reel", location_meublee: "non_concerne", annee: 2026, version: 1, auteur: owner }]);
  });
  it("double envoi identique idempotent, correction dans une nouvelle version", async () => {
    await as(owner); const a = await enregistrer(), b = await enregistrer(); expect(a.rows[0].id).toBe(b.rows[0].id);
    await enregistrer(personne, "ir", "micro", "reel");
    expect((await db.query("select version,location_nue from fiscal_profils_detenteurs order by version")).rows).toEqual([{ version: 1, location_nue: "reel" }, { version: 2, location_nue: "micro" }]);
  });
  it("SCI IS n’accepte pas le micro et conserve un profil commun à tous ses biens", async () => {
    await as(owner); await enregistrer(sci, "is", "non_concerne", "non_concerne");
    expect(await refus("select enregistrer_profil_fiscal_detenteur($1,2026,'ir','micro','non_concerne','Justification vérifiée')", [sci])).toMatch(/micro/);
    expect((await db.query("select imposition,qualite from fiscal_profils_detenteurs where person_id=$1", [sci])).rows).toEqual([{ imposition: "is", qualite: "SCI" }]);
  });
  it("refuse IS pour un particulier et profil d’une année sans détention", async () => {
    await as(owner);
    expect(await refus("select enregistrer_profil_fiscal_detenteur($1,2026,'is','reel','non_concerne','Justification vérifiée')", [personne])).toMatch(/société propriétaire/);
    expect(await refus("select enregistrer_profil_fiscal_detenteur($1,2024,'ir','reel','non_concerne','Justification vérifiée')", [personne])).toMatch(/Aucune détention/);
  });
  it("un propriétaire sorti reste identifiable pour son année passée", async () => {
    await db.query("update detentions set date_fin='2026-06-30' where person_id=$1", [personne]); await as(owner); await enregistrer();
    expect((await db.query("select count(*) from fiscal_profils_detenteurs")).rows[0].count).toBe("1");
  });
  it("aucune lecture croisée ni mutation directe ni écriture pour un autre espace", async () => {
    await as(owner); await enregistrer();
    expect(await refus("select enregistrer_profil_fiscal_detenteur($1,2026,'ir','reel','non_concerne','Justification vérifiée')", [etranger])).toMatch(/Accès refusé/);
    expect(await refus("update fiscal_profils_detenteurs set imposition='is' where person_id=$1", [personne])).toMatch(/permission denied/);
    await as(other); expect((await db.query("select * from fiscal_profils_detenteurs where organization_id=$1", [org])).rows).toHaveLength(0);
    expect(await refus("select enregistrer_profil_fiscal_detenteur($1,2026,'ir','reel','non_concerne','Justification vérifiée')", [personne])).toMatch(/Accès refusé/);
  });
  it("abonnement fermé interdit une nouvelle version mais garde l’historique lisible", async () => {
    await as(owner); await enregistrer(); await admin(); await db.query("select public.tache_systeme()"); await db.query("update organizations set status='suspendue' where id=$1", [org]); await db.query("select set_config('gerimmo.systeme','',true)"); await as(owner);
    expect(await refus("select enregistrer_profil_fiscal_detenteur($1,2026,'ir','micro','non_concerne','Justification vérifiée')", [personne])).toMatch(/Abonnement suspendu|n.enregistre plus/);
    expect((await db.query("select version from fiscal_profils_detenteurs")).rows).toEqual([{ version: 1 }]);
  });
  it("adhésion inactive et appel anonyme ne peuvent pas enregistrer un profil", async () => {
    await db.query("update memberships set status='inactive' where account_id=$1", [owner]); await as(owner);
    expect(await refus("select enregistrer_profil_fiscal_detenteur($1,2026,'ir','reel','non_concerne','Justification vérifiée')", [personne])).toMatch(/Accès refusé/);
    await admin(); await db.query("set local role anon");
    expect(await refus("select enregistrer_profil_fiscal_detenteur($1,2026,'ir','reel','non_concerne','Justification vérifiée')", [personne])).toMatch(/permission denied/);
  });
});
