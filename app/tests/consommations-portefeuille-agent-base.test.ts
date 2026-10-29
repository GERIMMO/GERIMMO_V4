import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const nom = "20261029094905_consommations_portefeuille_immeuble";

describe.skipIf(!url)("consommations : mandat sur un lot sans accès aux autres lots du bâtiment", () => {
  let db: Client;
  let org: string, bien: string, lotA: string, lotB: string, bailA: string, bailB: string, mandat: string;
  let admin: string, agent: string, proprietaire: string;
  let global: { contrat: string; facture: string; compteur: string };
  let autorise: typeof global, interdit: typeof global, repartition: string, empreinte: string;
  const id = async (sql: string, args: unknown[] = []) => (await db.query<{ id: string }>(sql, args)).rows[0].id;
  async function compte() {
    const r = (await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      values(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',gen_random_uuid()||'@example.invalid','x',now(),'{}','{}',now(),now(),'','','','','') returning id,email`)).rows[0];
    await db.query("insert into public.accounts(id,email) values($1,$2) on conflict do nothing", [r.id, r.email]);
    return r.id as string;
  }
  async function postgres() { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); }
  async function session(c: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated')::text,true)", [c]);
    await db.query("set local role authenticated");
  }
  async function refus(sql: string, args: unknown[] = []) {
    await db.query("savepoint refus");
    await expect(db.query(sql, args)).rejects.toMatchObject({ code: "42501" });
    await db.query("rollback to savepoint refus");
  }
  const parts = (deux = false) => JSON.stringify([
    { lot_id: lotA, bail_id: bailA, poids: 1, recuperable: true },
    ...(deux ? [{ lot_id: lotB, bail_id: bailB, poids: 1, recuperable: true }] : []),
  ]);
  async function preparer(facture: string, deux = false) {
    return id("select public.preparer_repartition_fourniture($1,$2,'TEST clé confirmée avec les justificatifs') id", [facture, parts(deux)]);
  }
  async function creerSuivi(lot: string | null, suffixe: string) {
    const document = await id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'justificatif',$2,$1::uuid::text||'/'||$2||'.pdf','application/pdf',100,repeat($3,64)) returning id", [org, `TEST-${suffixe}`, suffixe]);
    const contrat = await id("insert into public.contrats_fourniture(organization_id,bien_id,lot_id,categorie,fournisseur) values($1,$2,$3,'eau','TEST eau') returning id", [org, bien, lot]);
    const facture = await id("insert into public.factures_fourniture(organization_id,contrat_id,document_id,reference,periode_debut,periode_fin,total_cents) values($1,$2,$3,$4,'2026-09-01','2026-09-30',10000) returning id", [org, contrat, document, `TEST-${suffixe}`]);
    const compteur = await id("insert into public.compteurs_consommation(organization_id,bien_id,lot_id,type,unite,libelle,index_initial,date_index_initial,prochaine_demande) values($1,$2,$3,'eau_froide','m3',$4,100,'2026-09-01','2026-10-01') returning id", [org, bien, lot, `TEST ${suffixe}`]);
    return { contrat, facture, compteur };
  }
  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect(); await db.query("begin");
    org = await id("insert into public.organizations(name,status,type) values('TEST portefeuille consommations','active','agence') returning id");
    admin = await compte(); agent = await compte(); proprietaire = await compte();
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$4,'admin_agence'),($2,$4,'agent'),($3,$4,'proprietaire_direct')", [admin, agent, proprietaire, org]);
    bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST immeuble','immeuble','1 rue fictive','75001','Paris') returning id", [org]);
    const creerLot = (nom: string) => id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,$3,'loue') returning id", [org, bien, nom]);
    lotA = await creerLot("TEST lot confié"); lotB = await creerLot("TEST lot hors portefeuille");
    const mandant = await id("insert into public.persons(organization_id,nom) values($1,'TEST Bailleur') returning id", [org]);
    await db.query("insert into public.detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$3,100),($1,$4,$3,100)", [org, lotA, mandant, lotB]);
    mandat = await id("insert into public.mandats(organization_id,person_id,etat,date_debut,agent_account_id) values($1,$2,'brouillon','2026-01-01',$3) returning id", [org, mandant, agent]);
    await db.query("insert into public.mandat_lignes(organization_id,mandat_id,lot_id,taux_honoraires,date_debut) values($1,$2,$3,7,'2026-01-01')", [org, mandat, lotA]);
    const creerBail = (lot: string) => id("insert into public.baux(organization_id,lot_id,type,etat,date_debut,loyer_hc,charges,charges_mode) values($1,$2,'nu','actif','2026-01-01',500,50,'provision') returning id", [org, lot]);
    bailA = await creerBail(lotA); bailB = await creerBail(lotB);
    global = await creerSuivi(null, "a"); autorise = await creerSuivi(lotA, "b"); interdit = await creerSuivi(lotB, "c");
    await session(admin); repartition = await preparer(global.facture, true);
    empreinte = (await db.query("select empreinte from public.repartitions_fourniture where id=$1", [repartition])).rows[0].empreinte;
    await postgres();
  });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await postgres(); });

  it("un lot confié ne rend pas visibles le contrat, la facture et le compteur général", async () => {
    await session(agent);
    expect((await db.query("select public.est_agent_restreint($1) restreint,public.lot_hors_portefeuille($1,$2) interdit", [org, lotB])).rows[0]).toEqual({ restreint: true, interdit: true });
    expect((await db.query("select id from public.lots where bien_id=$1", [bien])).rows).toEqual([{ id: lotA }]);
    for (const [table, colonne] of [["contrats_fourniture", "contrat"], ["factures_fourniture", "facture"], ["compteurs_consommation", "compteur"]] as const) {
      expect((await db.query(`select id from public.${table} where id=any($1::uuid[])`, [[global[colonne], autorise[colonne], interdit[colonne]]])).rows).toEqual([{ id: autorise[colonne] }]);
    }
  });
  it("ne révèle pas le JSON des lots et baux hors portefeuille préparé par un administrateur", async () => {
    await session(agent);
    expect((await db.query("select lignes,source from public.repartitions_fourniture where id=$1", [repartition])).rows).toEqual([]);
    expect((await db.query("select consommations_interne.gerant($1,$2,null) autorise", [org, bien])).rows[0].autorise).toBe(false);
  });
  it("refuse la préparation et la validation globales même avec les identifiants et empreinte connus", async () => {
    await session(agent);
    await refus("select public.preparer_repartition_fourniture($1,$2,'TEST clé globale forgée')", [global.facture, parts()]);
    await refus("select public.valider_repartition_fourniture($1,$2)", [repartition, empreinte]);
    await postgres(); expect((await db.query("select statut,validee_par from public.repartitions_fourniture where id=$1", [repartition])).rows[0]).toEqual({ statut: "brouillon", validee_par: null });
  });
  it("conserve les modifications et les relevés du compteur du lot autorisé", async () => {
    await session(agent);
    await db.query("update public.contrats_fourniture set reference='TEST référence conservée' where id=$1", [autorise.contrat]);
    await db.query("update public.compteurs_consommation set libelle='TEST compteur corrigé' where id=$1", [autorise.compteur]);
    expect(await id("select public.enregistrer_releve_compteur($1,$2,120,'2026-10-01') id", [org, autorise.compteur])).toBeTruthy();
    expect((await db.query("select reference from public.contrats_fourniture where id=$1", [autorise.contrat])).rows[0].reference).toBe("TEST référence conservée");
  });
  it("autorise la répartition du contrat propre au lot confié", async () => {
    await session(agent); const r = await preparer(autorise.facture);
    const e = (await db.query("select empreinte from public.repartitions_fourniture where id=$1", [r])).rows[0].empreinte;
    await db.query("select public.valider_repartition_fourniture($1,$2)", [r, e]);
    expect((await db.query("select statut from public.repartitions_fourniture where id=$1", [r])).rows[0].statut).toBe("validee");
  });
  it("refuse les gestes directs sur le lot du collègue et le compteur général", async () => {
    await session(agent);
    for (const c of [interdit.compteur, global.compteur]) await refus("select public.enregistrer_releve_compteur($1,$2,120,'2026-10-01')", [org, c]);
    await refus("select public.preparer_repartition_fourniture($1,$2,'TEST autre contrat forgé')", [interdit.facture, parts()]);
  });
  it.each(["admin", "proprietaire"] as const)("préserve la lecture complète et la validation du rôle global %s", async (role) => {
    await session(role === "admin" ? admin : proprietaire);
    const r = (await db.query("select lignes,source from public.repartitions_fourniture where id=$1", [repartition])).rows[0];
    expect(r.lignes).toHaveLength(2); expect(r.source.baux.map((b: { id: string }) => b.id)).toContain(bailB);
    await db.query("select public.valider_repartition_fourniture($1,$2)", [repartition, empreinte]);
    expect((await db.query("select statut from public.repartitions_fourniture where id=$1", [repartition])).rows[0].statut).toBe("validee");
  });
  it("réévalue le portefeuille avant validation d’un ancien brouillon par lot", async () => {
    await session(agent); const r = await preparer(autorise.facture);
    const e = (await db.query("select empreinte from public.repartitions_fourniture where id=$1", [r])).rows[0].empreinte;
    await postgres(); await db.query("update public.mandat_lignes set date_fin='2026-10-01' where mandat_id=$1", [mandat]);
    await session(agent); await refus("select public.valider_repartition_fourniture($1,$2)", [r, e]);
    expect((await db.query("select id from public.repartitions_fourniture where id=$1", [r])).rows).toEqual([]);
  });
  it("le retour conservateur et le rejeu ne rouvrent pas le bâtiment ni l’accès anonyme", async () => {
    await db.query(readFileSync(`supabase/retours-arriere/${nom}.retour.sql`, "utf8"));
    await session(agent);
    expect((await db.query("select consommations_interne.gerant($1,$2,null) autorise", [org, bien])).rows[0].autorise).toBe(false);
    await postgres();
    for (let i = 0; i < 2; i++) await db.query(readFileSync(`supabase/migrations/${nom}.sql`, "utf8"));
    expect((await db.query("select has_function_privilege('anon','consommations_interne.gerant(uuid,uuid,uuid)','execute') anonyme")).rows[0].anonyme).toBe(false);
    await session(agent);
    expect((await db.query("select consommations_interne.gerant($1,$2,null) global,consommations_interne.gerant($1,$2,$3) lot", [org, bien, lotA])).rows[0]).toEqual({ global: false, lot: true });
  });
});
