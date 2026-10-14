import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
describe.skipIf(!url)("SA004/005 — vrais appels sous rôles, transaction annulée", () => {
  let db: Client, sa: string, artisanUser: string, other: string, artisan: string, org: string, bail: string, incident: string;
  const admin = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const as = async (id: string, aal = "aal2") => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated", aal })]);
    await db.query("set local role authenticated");
  };
  const failed = async (sql: string, args: unknown[] = []) => {
    await db.query("savepoint refuse");
    try { await db.query(sql, args); return ""; }
    catch (e) { await db.query("rollback to savepoint refuse"); return (e as Error).message; }
    finally { await db.query("release savepoint refuse"); }
  };
  const account = async () => (await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
    values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','test-sa45-'||gen_random_uuid()||'@example.invalid','x',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','') returning id`)).rows[0].id;
  const open = () => db.query("select public.ouvrir_session_artisan($1,'Diagnostic du dossier fictif')", [artisan]);
  const prepare = async () => (await db.query("select public.preparer_faits_direction() d")).rows[0].d;

  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect(); await db.query("begin");
    if (process.env.SUPERVISION_MIGRATION_PREVIEW === "1") for (const name of ["20261012222000_brief_direction_factuel.sql", "20261012222100_diagnostic_artisan_lecture.sql"]) {
      await db.query(readFileSync(new URL("../supabase/migrations/" + name, import.meta.url), "utf8"));
    }
    sa = await account(); artisanUser = await account(); other = await account();
    org = (await db.query("insert into public.organizations(name,status) values('TEST SA004/005','active') returning id")).rows[0].id;
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,null,'super_admin'),($2,$3,'proprietaire_direct')", [sa, other, org]);
    artisan = (await db.query("insert into public.artisans(account_id,raison_sociale,siret,email,telephone,statut_plateforme) values($1,'TEST Diagnostic',lpad((random()*10^13)::bigint::text,14,'0'),'test-'||gen_random_uuid()||'@example.invalid','0600000000','valide') returning id", [artisanUser])).rows[0].id;
    const bien = (await db.query("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST Brief','immeuble','1 rue TEST','75001','Paris') returning id", [org])).rows[0].id;
    const lot = (await db.query("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST Brief','loue') returning id", [org, bien])).rows[0].id;
    const person = (await db.query("insert into public.persons(organization_id,nom,prenom) values($1,'TEST','Brief') returning id", [org])).rows[0].id;
    bail = (await db.query("insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif',current_date-60,700,50) returning id", [org, lot, person])).rows[0].id;
    incident = (await db.query("insert into public.incidents(organization_id,numero,lot_id,bail_id,canal,categorie,description,urgence,etat) values($1,'TEST-'||gen_random_uuid(),$2,$3,'espace_locataire','plomberie_canalisation','Fuite fictive','urgente','declare') returning id", [org, lot, bail])).rows[0].id;
    await db.query("insert into public.appels_loyer(organization_id,bail_id,periode,date_echeance,montant_du) values($1,$2,date_trunc('month',current_date),current_date-2,750)", [org,bail]);
    await db.query("insert into public.encaissements(organization_id,bail_id,montant,date_paiement) values($1,$2,100,current_date)", [org,bail]);
  });
  beforeEach(async () => { await admin(); await db.query("savepoint scenario"); });
  afterEach(async () => { await db.query("rollback to savepoint scenario"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  it("diagnostic : motif vide refusé avant toute session", async () => {
    await as(sa); expect(await failed("select public.ouvrir_session_artisan($1,'   ')",[artisan])).toMatch(/motif/);
    expect((await db.query("select count(*) n from public.ma_session_artisan()")).rows[0].n).toBe("0");
  });
  it.each(["aal1", "autre"])("diagnostic : %s ne peut ouvrir ni collecter les faits", async mode => {
    await as(mode === "autre" ? other : sa, mode === "aal1" ? "aal1" : "aal2");
    expect(await failed("select public.ouvrir_session_artisan($1,'Test diagnostic')",[artisan])).toMatch(/supervision/);
    expect(await failed("select public.preparer_faits_direction()")).toMatch(/vérification/);
    expect(await failed("select public.collecter_source_direction('loyers')")).toMatch(/vérification/);
  });
  it("diagnostic : lecture de la cible, portée, motif, expiration et auteur réel", async () => {
    await as(sa); await open();
    expect((await db.query("select public.mon_artisan_id() id")).rows[0].id).toBe(artisan);
    expect((await db.query("select * from public.mon_artisan()")).rows[0].raison_sociale).toBe("TEST Diagnostic");
    const s=(await db.query("select * from public.ma_session_artisan_diagnostic()")).rows[0];
    expect(s).toMatchObject({artisan_id:artisan,auteur_reel:sa,portee:"diagnostic",motif:"Diagnostic du dossier fictif"});
    expect(new Date(s.expire_le).getTime()).toBeGreaterThan(Date.now());
    await db.query("select public.fermer_session_artisan()");
    await admin();
    const audit=(await db.query("select account_id,details from public.audit_log where account_id=$1 and action='ouverture_session_artisan'",[sa])).rows;
    expect(audit.at(-1)?.details).toMatchObject({auteur_reel:sa,artisan_id:artisan,portee:"diagnostic"});
  });
  it("diagnostic : ancien RPC d’attestation et DML direct sont refusés sans pièce", async () => {
    await as(sa); await open();
    expect(await failed("select public.deposer_ma_piece_artisan('decennale','artisans/'||$1||'/test.pdf','application/pdf',100,'sha',current_date,current_date+365)",[artisan])).toMatch(/lecture seule/);
    expect(await failed("update public.artisans set raison_sociale='Ne doit pas changer' where id=$1",[artisan])).toMatch(/lecture seule|permission denied/);
    expect(await failed("select public.exiger_artisan_reel()")).toMatch(/lecture seule/);
    await admin(); expect((await db.query("select count(*) n from public.artisan_pieces where artisan_id=$1",[artisan])).rows[0].n).toBe("0");
  });
  // Audit du 13/10/2026 (SUP-02) : la lecture seule d'une session de diagnostic était posée aussi
  // sur les tables de l'arrêt d'urgence, qui se trouvait refusé pendant le diagnostic.
  it("diagnostic ouvert : l'arrêt d'urgence reste possible, la lecture seule couvre toujours les données", async () => {
    await as(sa); await open();
    await db.query("select public.commander_arret_supervision('global',null,true,'Arrêt d''urgence pendant un diagnostic')");
    expect((await db.query("select public.verifier_arret_supervision('quittances') ok")).rows[0].ok).toBe(false);
    expect(await failed("update public.artisans set raison_sociale='Ne doit pas changer' where id=$1", [artisan])).toMatch(/lecture seule|permission denied/);
    await db.query("select public.commander_arret_supervision('global',null,false,'Reprise après le diagnostic')");
    expect((await db.query("select public.verifier_arret_supervision('quittances') ok")).rows[0].ok).toBe(true);
  });
  it("diagnostic : dépôt Storage direct refusé, aucun objet orphelin", async () => {
    await as(sa); await open();
    expect(await failed("insert into storage.objects(bucket_id,name) values('documents','artisans/'||$1||'/test-diagnostic.pdf')",[artisan])).toMatch(/lecture seule|row-level/);
  });
  it("diagnostic : un compte également artisan ne récupère aucune mutation", async () => {
    await db.query("update public.artisans set account_id=$1 where id=$2",[sa,artisan]);
    await as(sa); await open();
    expect(await failed("select public.exiger_artisan_reel()")).toMatch(/lecture seule/);
  });
  it.each(["expiration","aal1","retrait"])("diagnostic : %s coupe la lecture, fermeture toujours possible", async mode => {
    await as(sa); await open(); await admin();
    if(mode==='expiration')await db.query("update public.supervision_sessions_artisan set expire_le=now()-interval '1 minute' where account_id=$1",[sa]);
    if(mode==='retrait')await db.query("update public.memberships set status='inactive' where account_id=$1",[sa]);
    await as(sa,mode==='aal1'?'aal1':'aal2');
    expect((await db.query("select public.mon_artisan_id() id")).rows[0].id).toBeNull();
    expect((await db.query("select * from public.ma_session_artisan_diagnostic()")).rows).toHaveLength(0);
    await db.query("select public.fermer_session_artisan()");
    await admin();expect((await db.query("select count(*) n from public.supervision_sessions_artisan where account_id=$1 and fermee_le is null",[sa])).rows[0].n).toBe('0');
  });
  it("artisan réel : identité et dépôt normal conservés", async () => {
    await as(artisanUser);expect((await db.query("select public.exiger_artisan_reel() id")).rows[0].id).toBe(artisan);
    expect((await db.query("select public.deposer_ma_piece_artisan('decennale','artisans/'||$1||'/test.pdf','application/pdf',100,'sha',current_date,current_date+365) id",[artisan])).rows[0].id).toBeTruthy();
  });
  it("brief : faits urgents, montant exact du bail fictif et liens autorisés", async () => {
    await as(sa);const s=await prepare();expect(s.indisponibles).toEqual([]);
    expect(s.sources.incidents.donnees.mesures.urgents_ouverts).toBeGreaterThanOrEqual(1);
    expect(s.sources.incidents.donnees.faits.some((f:{href:string})=>f.href.includes(incident))).toBe(true);
    const fait=s.sources.loyers.donnees.faits.find((f:{href:string})=>f.href.endsWith(bail));
    expect(fait.titre).toContain('650.00');
    expect(s.auteur_reel).toBe(sa);
  });
  it("brief : panne d’une source conserve sa valeur et sa date, décisions intactes", async () => {
    await as(sa);const initial=await prepare();await admin();
    const before=(await db.query("select count(*) n from public.decisions_du_matin")).rows[0].n;
    await db.query("alter table public.incidents rename column urgence to urgence_indisponible_test");
    await as(sa);const apres=await prepare();
    expect(apres.indisponibles).toContain('incidents');
    expect(apres.sources.incidents.statut).toBe('indisponible');
    expect(apres.sources.incidents.donnees).toEqual(initial.sources.incidents.donnees);
    expect(apres.sources.incidents.observe_le).toEqual(initial.sources.incidents.observe_le);
    await admin();expect((await db.query("select count(*) n from public.decisions_du_matin")).rows[0].n).toBe(before);
  });
  it("brief : première lecture indisponible ne crée aucun zéro", async () => {
    await db.query("delete from public.brief_direction_snapshots");
    await db.query("alter table public.incidents rename column urgence to urgence_indisponible_test");
    await as(sa);const s=await prepare();
    expect(s.sources.incidents).toMatchObject({statut:'indisponible',donnees:null,observe_le:null});
  });
  it("brief : snapshots réservés AAL2, comptes ordinaires exclus", async () => {
    await as(sa);await prepare();await as(other);
    expect((await db.query("select * from public.brief_direction_snapshots")).rows).toHaveLength(0);
    expect(await failed("select public.lire_faits_direction(current_date)")).toMatch(/vérification/);
  });
});
