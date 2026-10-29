import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const migration = "20261029094312_ar24_consentements_portefeuille_agent";

describe.skipIf(!url)("AR24 et consentements : portefeuille réel de l’agent", () => {
  let db: Client;
  let org: string, admin: string, agent: string, sansMandat: string, locataireA: string, locataireB: string;
  let bailA: string, bailB: string, personneA: string, personneB: string, mandatA: string;
  let courrierA: string, courrierB: string;
  const id = async (sql: string, args: unknown[] = []) => (await db.query<{ id: string }>(sql, args)).rows[0].id;
  async function compte() {
    return id("insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',gen_random_uuid()||'@example.invalid','x',now(),'{}','{}',now(),now()) returning id");
  }
  async function session(compteId: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: compteId, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  }
  async function postgres() {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims','',true)");
  }
  async function refus(sql: string, args: unknown[]) {
    await db.query("savepoint refus");
    await expect(db.query(sql, args)).rejects.toThrow(/inaccessible|portefeuille|refusé/i);
    await db.query("rollback to savepoint refus");
  }
  async function preparer(bail: string, commande: string) {
    const dette = (await db.query("select public.dette_recommande_ar24($1) as r", [bail])).rows[0].r;
    return (await db.query("select public.preparer_recommande_ar24($1,$2,$3,'<p>Test local</p>',$4,$5,15,'sandbox') as r", [commande, org, bail, "a".repeat(64), dette])).rows[0].r;
  }
  const reserver = (commande: string, email: string) => db.query("select public.reserver_recommande_ar24($1,$2,$3,$4,100) as r", [org, commande, "a".repeat(64), email]);
  const lecture = async () => (await db.query("select id from public.recommandes_ar24 where organization_id=$1 order by id", [org])).rows.map(r => r.id);
  const accords = async () => (await db.query("select person_id from public.consentements_documents_locataire where organization_id=$1 order by person_id", [org])).rows.map(r => r.person_id);

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => {
    await db.query("begin"); await postgres();
    admin = await compte(); agent = await compte(); sansMandat = await compte();
    locataireA = await compte(); locataireB = await compte();
    org = await id("insert into public.organizations(name,type,status,essai_fin) values('TEST portefeuille AR24','agence','essai',public.aujourdhui_paris()+30) returning id");
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$6,'admin_agence'),($2,$6,'agent'),($3,$6,'agent'),($4,$6,'locataire'),($5,$6,'locataire')", [admin, agent, sansMandat, locataireA, locataireB, org]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST immeuble','immeuble','1 rue Test','75001','Paris') returning id", [org]);
    const mandant = await id("insert into public.persons(organization_id,nom) values($1,'TEST bailleur') returning id", [org]);
    const lots: string[] = [], baux: string[] = [], personnes: string[] = [];
    for (const [indice, locataire] of [locataireA, locataireB].entries()) {
      const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,$3,'loue') returning id", [org, bien, `TEST lot ${indice}`]);
      lots.push(lot);
      await db.query("insert into public.detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$3,100)", [org, lot, mandant]);
      const personne = await id("insert into public.persons(organization_id,nom,prenom,email,account_id) values($1,'Test','Locataire',$2,$3) returning id", [org, `locataire${indice}@example.invalid`, locataire]);
      personnes.push(personne);
      const bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,'nu','actif',public.aujourdhui_paris()-90,750,50,5) returning id", [org, lot, personne]);
      baux.push(bail);
      await db.query("insert into public.appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$2,date_trunc('month',public.aujourdhui_paris())::date,public.aujourdhui_paris()-1,750,50,800)", [org, bail]);
    }
    [bailA, bailB] = baux; [personneA, personneB] = personnes;
    mandatA = await id("insert into public.mandats(organization_id,person_id,etat,agent_account_id) values($1,$2,'actif',$3) returning id", [org, mandant, agent]);
    await db.query("insert into public.mandat_lignes(organization_id,mandat_id,lot_id,taux_honoraires) values($1,$2,$3,7)", [org, mandatA, lots[0]]);
    await db.query("insert into public.connexions_ar24(organization_id,environnement,expediteur_id,tarif_ttc_centimes,actif) values($1,'sandbox',42,100,true)", [org]);
    for (const [indice, locataire] of [locataireA, locataireB].entries()) {
      await session(locataire);
      await db.query("select public.modifier_consentement_document($1,'recommandes',true,$2)", [org, `locataire${indice}@example.invalid`]);
    }
    await session(admin);
    courrierA = randomUUID(); courrierB = randomUUID();
    await preparer(bailA, courrierA); await preparer(bailB, courrierB);
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("l’agent ne lit que les courriers et accords de son mandat", async () => {
    await session(agent);
    expect((await db.query("select public.bail_hors_portefeuille($1,$2) as hors", [org, bailB])).rows[0].hors).toBe(true);
    expect(await lecture()).toEqual([courrierA]);
    expect(await accords()).toEqual([personneA]);
  });
  it("un agent sans mandat ne lit ni recommandé ni accord de locataire", async () => {
    await session(sansMandat);
    expect(await lecture()).toEqual([]); expect(await accords()).toEqual([]);
  });
  it("les accords seuls ne révèlent pas l’adresse e-mail d’un locataire hors mandat", async () => {
    await session(agent); expect(await accords()).toEqual([personneA]);
    await session(sansMandat); expect(await accords()).toEqual([]);
  });
  it("les deux RPC refusent le retour anticipé d’une commande hors portefeuille déjà réservée", async () => {
    await reserver(courrierB, "locataire1@example.invalid");
    await session(agent);
    await refus("select public.preparer_recommande_ar24($1,$2,$3,'Test',$4,'{}',15,'sandbox')", [randomUUID(), org, bailB, "a".repeat(64)]);
    await refus("select public.reserver_recommande_ar24($1,$2,$3,$4,100)", [org, courrierB, "a".repeat(64), "locataire1@example.invalid"]);
  });
  it("la préparation et la réservation restent possibles pour le mandat attribué", async () => {
    await session(agent);
    expect((await preparer(bailA, courrierA)).id).toBe(courrierA);
    expect((await reserver(courrierA, "locataire0@example.invalid")).rows[0].r.reserve).toBe(true);
    expect((await reserver(courrierA, "locataire0@example.invalid")).rows[0].r.reserve).toBe(false);
  });
  it("la réservation refuse aussi de renvoyer un courrier hors mandat déjà suivi", async () => {
    await reserver(courrierB, "locataire1@example.invalid");
    await session(sansMandat);
    await refus("select public.reserver_recommande_ar24($1,$2,$3,$4,100)", [org, courrierB, "a".repeat(64), "locataire1@example.invalid"]);
  });
  it("le retrait du mandat coupe lectures et deux RPC même pour le brouillon que l’agent préparait", async () => {
    await session(agent); await preparer(bailA, courrierA);
    await session(admin);
    await db.query("update public.mandats set agent_account_id=$1 where id=$2", [sansMandat, mandatA]);
    await session(agent);
    expect(await lecture()).toEqual([]); expect(await accords()).toEqual([]);
    await refus("select public.preparer_recommande_ar24($1,$2,$3,'Test',$4,'{}',15,'sandbox')", [courrierA, org, bailA, "a".repeat(64)]);
    await refus("select public.reserver_recommande_ar24($1,$2,$3,$4,100)", [org, courrierA, "a".repeat(64), "locataire0@example.invalid"]);
    await session(sansMandat);
    expect(await lecture()).toEqual([courrierA]);
  });
  it("le locataire garde ses accords et leur retrait après sortie", async () => {
    await postgres();
    await db.query("update public.memberships set status='inactive' where account_id=$1 and organization_id=$2 and role='locataire'", [locataireB, org]);
    await session(locataireB);
    expect(await accords()).toEqual([personneB]);
    expect(await lecture()).toEqual([]);
    expect((await db.query("select public.modifier_consentement_document($1,'recommandes',false,'') as r", [org])).rows[0].r).toBe(false);
  });
  it("l’administrateur conserve les deux dossiers, sans élargir le portefeuille de l’agent", async () => {
    expect(new Set(await lecture())).toEqual(new Set([courrierA, courrierB]));
    expect(new Set(await accords())).toEqual(new Set([personneA, personneB]));
    expect((await reserver(courrierB, "locataire1@example.invalid")).rows[0].r.reserve).toBe(true);
  });
  it("la garde de mutation protège aussi les écritures privilégiées réalisées sous identité agent", async () => {
    await session(agent); await db.query("reset role");
    await refus("update public.recommandes_ar24 set contenu='Modification interdite' where id=$1", [courrierB]);
  });
  it("rejeu et retour conservateur gardent les protections sans effacer les courriers", async () => {
    await postgres();
    const sql = readFileSync(`supabase/migrations/${migration}.sql`, "utf8");
    await db.query(sql); await db.query(sql);
    await db.query(readFileSync(`supabase/retours-arriere/${migration}.retour.sql`, "utf8"));
    expect((await db.query("select count(*)::int as n from public.recommandes_ar24 where organization_id=$1", [org])).rows[0].n).toBe(2);
    await session(agent); expect(await lecture()).toEqual([courrierA]); expect(await accords()).toEqual([personneA]);
  });
});
