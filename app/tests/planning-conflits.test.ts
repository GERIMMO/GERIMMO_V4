import { randomUUID, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const migration = readFileSync(new URL("../supabase/migrations/20261013102000_planning_conflits.sql", import.meta.url), "utf8");
const instant = Math.ceil((Date.now() + 7 * 86400000) / 3600000) * 3600000;
const date = (heure: number) => new Date(instant + heure * 3600000).toISOString();

describe.skipIf(!url)("ART004 — confirmation sans chevauchement silencieux", () => {
  let db: Client;
  let org: string, orgB: string, admin: string, adminB: string, loc: string, locB: string, compte: string, compteB: string, artisan: string, artisanB: string;
  let mission: string, autre: string, creneau: string;
  const id = async (sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows[0].id as string;
  const postgres = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  async function agir(uid: string) { await postgres(); await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)",[uid]); await db.query("set local role authenticated"); }
  async function essai(f: () => Promise<unknown>) { await db.query("savepoint essai"); try { const r = await f(); await db.query("release savepoint essai"); return r; } catch (e) { await db.query("rollback to savepoint essai"); throw e; } }
  async function utilisateur() { return id("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values(gen_random_uuid(),$1,'x',now()) returning id",[`planning-${randomUUID()}@example.invalid`]); }
  async function creerMission(a = artisan, o = org, l = loc) {
    await postgres();
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST conflit','appartement','1 rue TEST','75001','Paris') returning id",[o]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST','loue') returning id",[o,bien]);
    const personne = (await db.query("select id from public.persons where organization_id=$1 and account_id=$2 limit 1",[o,l])).rows[0]?.id ?? await id("insert into public.persons(organization_id,account_id,nom) values($1,$2,'TEST') returning id",[o,l]);
    const bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif',current_date-30,500,50) returning id",[o,lot,personne]);
    const incident = await id("insert into public.incidents(organization_id,numero,lot_id,bail_id,declarant_person_id,canal,categorie,description,etat,imputation,imputation_justification) values($1,$2,$3,$4,$5,'espace_locataire','plomberie_canalisation','TEST planning','qualifie','proprietaire','TEST') returning id",[o,`TEST-${randomUUID()}`,lot,bail,personne]);
    return id("insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut) values($1,$2,$3,'entretien_courant','acceptee') returning id",[o,incident,a]);
  }
  async function slot(m: string, debut = 0, fin = 2, auteur = "artisan", o = org) { await postgres(); return id("insert into public.intervention_creneaux(organization_id,intervention_id,propose_par,tour,debut,fin) values($1,$2,$3,1,$4,$5) returning id",[o,m,auteur,date(debut),date(fin)]); }
  async function choisir(cr = creneau, u = loc, o = org) { await agir(u); return db.query("select public.choisir_creneau($1,$2)",[o,cr]); }
  async function confirmerAutre(debut = 1, fin = 3) { const cr = await slot(autre,debut,fin); await choisir(cr); }
  async function etat(m = mission) { await postgres(); return (await db.query("select statut,debut_prevu,fin_prevue from public.incident_interventions where id=$1",[m])).rows[0]; }
  async function prive(statut = "accepte", a = artisan) { await postgres(); const c = await id("insert into public.artisan_clients(artisan_id,nom,type,adresse) values($1,$2,'particulier','Adresse TEST') returning id",[a,randomUUID()]); return id("insert into public.artisan_chantiers(artisan_id,client_id,titre,adresse,description,statut) values($1,$2,'TEST','Adresse TEST','TEST',$3) returning id",[a,c,statut]); }
  async function planningPrive(h: string, debut = 0, fin = 2, motif = "") { await agir(compte); return db.query("select public.artisan_externe_ecrire('planning',$1,1,$2,$3)",[h,{debut:date(debut),fin:date(fin),conflit_motif:motif},randomUUID()]); }
  async function arbitrer(motif: string | null, user = admin, cible = mission, o = org) { await agir(user); return db.query("select public.fixer_creneau_arbitrage_motive($1,$2,$3,$4,'Accord TEST',$5)",[o,cible,date(0),date(2),motif]); }

  beforeAll(async () => {
    db = new Client({connectionString:url}); await db.connect(); await db.query("begin");
    if (process.env.PLANNING_CONFLITS_PREVIEW === "1") await db.query(migration);
    org = await id("insert into public.organizations(name,status) values('ART004 TEST','active') returning id");
    orgB = await id("insert into public.organizations(name,status) values('ART004 TEST B','active') returning id");
    const comptes: string[] = []; for (let n=0;n<6;n++) comptes.push(await utilisateur());
    [admin,adminB,loc,locB,compte,compteB] = comptes;
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'admin_agence'),($3,$4,'admin_agence'),($5,$2,'locataire'),($6,$4,'locataire')",[admin,org,adminB,orgB,loc,locB]);
    const art = async (u:string) => id("insert into public.artisans(account_id,raison_sociale,siret,telephone) values($1,'TEST ART004',$2,'0600000000') returning id",[u,String(randomInt(10000000000000,99999999999999))]);
    artisan=await art(compte);artisanB=await art(compteB);
    await db.query("update public.artisan_modules_locaux set actif=true");
  });
  beforeEach(async()=>{await postgres();await db.query("savepoint cas");mission=await creerMission();autre=await creerMission();creneau=await slot(mission);});
  afterEach(async()=>{await db.query("rollback to savepoint cas");await postgres();});
  afterAll(async()=>{await db?.query("rollback");await db?.end();});

  it("retient normalement un rendez-vous libre",async()=>{await choisir();expect((await etat()).statut).toBe("planifiee");});
  it.each([[1,3],[-1,1],[-1,3],[0,2]])("refuse le chevauchement confirmé [%i,%i] sans toucher les alternatives",async(d,f)=>{await confirmerAutre(d,f);await expect(essai(()=>choisir())).rejects.toThrow(/chevauche/);expect((await etat()).statut).toBe("acceptee");expect((await db.query("select statut from public.intervention_creneaux where id=$1",[creneau])).rows[0].statut).toBe("propose");});
  it.each([[-2,0],[2,4]])("permet deux rendez-vous adjacents [%i,%i]",async(d,f)=>{await confirmerAutre(d,f);await choisir();expect((await etat()).statut).toBe("planifiee");});
  it("ne réserve pas les simples propositions d'une autre mission",async()=>{await slot(autre,0,2);await choisir();expect((await etat()).statut).toBe("planifiee");});
  it("la confirmation laisse choisir une autre proposition libre",async()=>{await confirmerAutre();const libre=await slot(mission,4,6);await expect(essai(()=>choisir())).rejects.toThrow(/chevauche/);await choisir(libre);expect(new Date((await etat()).debut_prevu).toISOString()).toBe(date(4));});
  it("permet de proposer trois alternatives qui chevauchent un rendez-vous",async()=>{await confirmerAutre();await agir(compte);await db.query("select public.proposer_creneaux($1,$2)",[mission,JSON.stringify([{debut:date(0),fin:date(2)},{debut:date(1),fin:date(3)},{debut:date(4),fin:date(6)}])]);expect((await etat()).statut).toBe("acceptee");});
  it("bloque également une contre-proposition confirmée par l'artisan",async()=>{await confirmerAutre();const cr=await slot(mission,0,2,"locataire");await agir(compte);await expect(essai(()=>db.query("select public.accepter_creneau_locataire($1)",[cr]))).rejects.toThrow(/chevauche/);});
  it("ne confond pas deux artisans",async()=>{await postgres();await db.query("update public.incident_interventions set artisan_id=$1 where id=$2",[artisanB,autre]);await confirmerAutre();await choisir();expect((await etat()).statut).toBe("planifiee");});
  it("voit un conflit inter-agences sans révéler l'autre dossier",async()=>{const ailleurs=await creerMission(artisan,orgB,locB);const cr=await slot(ailleurs,1,3,"artisan",orgB);await choisir(cr,locB,orgB);await expect(essai(()=>choisir())).rejects.toThrow(/^Ce créneau chevauche un rendez-vous déjà confirmé de l’artisan\./);});
  it("une annulation libère la plage",async()=>{await confirmerAutre();await postgres();await db.query("update public.incident_interventions set statut='annulee',annulation_motif='TEST' where id=$1",[autre]);await choisir();expect((await etat()).statut).toBe("planifiee");});
  it("une mission annulée ne peut pas être confirmée via un ancien créneau",async()=>{await postgres();await db.query("update public.incident_interventions set statut='annulee',annulation_motif='TEST' where id=$1",[mission]);await expect(essai(()=>choisir())).rejects.toThrow(/n’attend pas/);});
  it("le locataire d'une autre agence ne choisit pas une date du dossier",async()=>{await expect(essai(()=>choisir(creneau,locB))).rejects.toThrow(/Accès refusé/);});
  it("l'autre artisan ne confirme pas le créneau",async()=>{const cr=await slot(mission,0,2,"locataire");await agir(compteB);await expect(essai(()=>db.query("select public.accepter_creneau_locataire($1)",[cr]))).rejects.toThrow(/Accès refusé/);});
  it("le helper interne n'est pas exposé aux comptes ni anonymes",async()=>{await agir(loc);await expect(essai(()=>db.query("select public.conflit_planning_artisan($1,$2,$3)",[artisan,date(0),date(2)]))).rejects.toThrow(/permission denied/);await postgres();expect((await db.query("select has_function_privilege('anon','public.conflit_planning_artisan(uuid,timestamptz,timestamptz,uuid,uuid)','execute') ok")).rows[0].ok).toBe(false);});
  it("l'arbitrage ordinaire ne contourne pas le conflit",async()=>{await confirmerAutre();await agir(admin);await expect(essai(()=>db.query("select public.fixer_creneau_arbitrage($1,$2,$3,$4,'Un motif ordinaire')",[org,mission,date(0),date(2)]))).rejects.toThrow(/chevauche/);});
  it.each([null,"court"," "])("un maintien sans vraie justification échoue (%s)",async(m)=>{await confirmerAutre();await expect(essai(()=>arbitrer(m))).rejects.toThrow(/Cochez le maintien/);});
  it("l'arbitrage motivé autorisé conserve auteur, motif et conflit dans l'historique",async()=>{await confirmerAutre();await arbitrer("Deux équipes distinctes confirmées avec l’artisan");await postgres();const e=(await db.query("select acteur_account_id,details from public.incident_evenements where details->>'intervention_id'=$1 and type='arbitrage_creneau'",[mission])).rows[0];expect(e.acteur_account_id).toBe(admin);expect(e.details.conflit_confirme).toBe(true);expect(e.details.conflit_motif).toMatch(/équipes distinctes/);});
  it.each(["locataire","artisan","autre agence"])("la dérogation ne donne aucun nouveau droit au %s",async(role)=>{await confirmerAutre();await expect(essai(()=>arbitrer("Deux équipes distinctes confirmées",role==="locataire"?loc:role==="artisan"?compte:adminB))).rejects.toThrow(/Accès refusé|portefeuille/);});
  it("le report arbitré conserve le créneau précédent caduc",async()=>{await choisir();await agir(admin);await db.query("select public.fixer_creneau_arbitrage_motive($1,$2,$3,$4,'Report demandé',null)",[org,mission,date(4),date(6)]);await postgres();expect((await db.query("select statut from public.intervention_creneaux where intervention_id=$1 order by statut",[mission])).rows.map(x=>x.statut).sort()).toEqual(["caduc","retenu"]);});
  it("un chantier privé confirmé bloque le choix Gerimmo",async()=>{const h=await prive();await planningPrive(h);await expect(essai(()=>choisir())).rejects.toThrow(/chevauche/);});
  it("une mission Gerimmo confirmée bloque le chantier privé sans maintien",async()=>{await choisir();const h=await prive();await expect(essai(()=>planningPrive(h))).rejects.toThrow(/autre chantier/);await planningPrive(h,0,2,"Deuxième équipe disponible, maintien confirmé");await postgres();expect((await db.query("select conflit_motif from public.artisan_rendez_vous where chantier_id=$1",[h])).rows[0].conflit_motif).toMatch(/Deuxième/);});
  it("un chantier privé annulé ou terminé ne réserve plus la plage",async()=>{const h=await prive();await planningPrive(h);await postgres();await db.query("update public.artisan_chantiers set statut='termine' where id=$1",[h]);await choisir();expect((await etat()).statut).toBe("planifiee");});
  it("l'agent sans mandat sur le lot ne peut pas utiliser la dérogation",async()=>{await postgres();const agent=await utilisateur();await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'agent')",[agent,org]);await expect(essai(()=>arbitrer("Deux équipes distinctes confirmées",agent))).rejects.toThrow(/portefeuille/);});
  it.each([["2020-01-01T09:00:00Z","2020-01-01T11:00:00Z"],[null,date(2)]])("l'arbitrage refuse une date passée ou absente",async(debut,fin)=>{await agir(admin);await expect(essai(()=>db.query("select public.fixer_creneau_arbitrage_motive($1,$2,$3,$4,'TEST',null)",[org,mission,debut,fin]))).rejects.toThrow(/dates futures/);});
});
