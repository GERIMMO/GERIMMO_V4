import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
const url = process.env.SUPABASE_DB_URL;
if (url && !["localhost","127.0.0.1","[::1]"].includes(new URL(url).hostname)) throw new Error("Ces tests exigent une base locale.");

describe.skipIf(!url)("Suppression transactionnelle des brouillons", () => {
  let db: Client, org: string, user: string, bien: string, lot: string, bail: string, personne: string;
  beforeAll(async () => { db = new Client({connectionString:url}); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });
  async function id(sql: string, params: unknown[] = []) { return (await db.query(sql,params)).rows[0].id as string; }
  beforeEach(async () => {
    await db.query("begin");
    await db.query(readFileSync("supabase/migrations/20261010090000_supprimer_bail_brouillon.sql","utf8"));
    org = await id("insert into public.organizations(name,status) values ('Test suppression brouillon','active') returning id");
    user = await id("insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values(gen_random_uuid(),'authenticated','authenticated','brouillon-'||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now()) returning id");
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')",[user,org]);
    bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Bien test','appartement','1 rue Test','69007','Lyon',false) returning id",[org]);
    lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot test','brouillon') returning id",[org,bien]);
    personne = await id("insert into public.persons(organization_id,nom,prenom,email) values($1,'Test','Locataire','loc-'||gen_random_uuid()||'@test.local') returning id",[org]);
    bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,type,date_debut,loyer_hc,charges) values($1,$2,$3,'brouillon','nu',current_date,500,20) returning id",[org,lot,personne]);
  });
  async function connecter() {
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated')::text,true)",[user]);
    await db.query("set local role authenticated");
  }
  async function supprimer(organisation = org) { return db.query("select public.supprimer_bail_brouillon($1,$2) as resultat",[organisation,bail]); }
  async function document() { return id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'bail','PDF brouillon','test/brouillon.pdf','application/pdf',1,gen_random_uuid()::text) returning id",[org]); }
  it("supprime la préparation et conserve logement, personnes, fichiers et trace", async () => {
    const doc = await document();
    await db.query("insert into public.document_liens(organization_id,document_id,entite,entite_id) values($1,$2,'bail',$3)",[org,doc,bail]);
    await db.query("insert into public.bail_personnes(organization_id,bail_id,person_id,role) values($1,$2,$3,'garant')",[org,bail,personne]);
    await db.query("insert into public.inventaire_lignes(organization_id,bail_id,designation) values($1,$2,'Table')",[org,bail]);
    await db.query("insert into public.etats_des_lieux(organization_id,bail_id,type) values($1,$2,'entree')",[org,bail]);
    await connecter();
    expect((await supprimer()).rows[0].resultat).toEqual({bail_id:bail,lot_id:lot,bien_id:bien});
    await db.query("reset role");
    for(const table of ["baux","bail_personnes","inventaire_lignes","etats_des_lieux"]) {
      expect((await db.query(`select count(*)::int as n from public.${table} where ${table === "baux" ? "id" : "bail_id"}=$1`,[bail])).rows[0].n).toBe(0);
    }
    expect((await db.query("select count(*)::int as n from public.lots where id=$1 and etat='brouillon'",[lot])).rows[0].n).toBe(1);
    expect((await db.query("select count(*)::int as n from public.persons where id=$1",[personne])).rows[0].n).toBe(1);
    expect((await db.query("select count(*)::int as n from public.document_liens where document_id=$1 and entite='lot' and entite_id=$2",[doc,lot])).rows[0].n).toBe(1);
    expect((await db.query("select count(*)::int as n from public.audit_log where action='bail_brouillon_supprime' and details->>'bail_id'=$1",[bail])).rows[0].n).toBe(1);
  });
  it.each(["actif","preavis","termine"])("refuse un bail %s", async etat => {
    // Fixture d’un contrat déjà existant, créée hors API ; pas de transition simulée.
    await db.query("delete from public.baux where id=$1",[bail]);
    if(etat!=="termine") lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot contrat existant','loue') returning id",[org,bien]);
    bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,type,date_debut,loyer_hc,charges) values($1,$2,$3,$4,'nu',current_date,500,20) returning id",[org,lot,personne,etat]);
    await connecter(); await expect(supprimer()).rejects.toThrow(/Seuls les baux en brouillon/);
  });
  it("refuse un bail signé même encore en brouillon", async () => {
    const doc=await document(); await db.query("update public.baux set document_signe=$1 where id=$2",[doc,bail]);
    await connecter(); await expect(supprimer()).rejects.toThrow(/signé ou a déjà été transmis/);
  });
  it("refuse un bail déjà transmis", async () => {
    await db.query("update public.baux set signe_envoye_le=now() where id=$1",[bail]);
    await connecter(); await expect(supprimer()).rejects.toThrow(/signé ou a déjà été transmis/);
  });
  it("refuse un document envoyé en signature", async () => {
    const doc=await document();
    await db.query("insert into public.document_liens(organization_id,document_id,entite,entite_id) values($1,$2,'bail',$3)",[org,doc,bail]);
    await db.query("insert into public.demandes_signature(organization_id,document_id,person_id) values($1,$2,$3)",[org,doc,personne]);
    await connecter(); await expect(supprimer()).rejects.toThrow(/envoyé en signature/);
  });
  it("refuse un état des lieux signé", async () => {
    await db.query("insert into public.etats_des_lieux(organization_id,bail_id,type,etat,signe_le) values($1,$2,'entree','signe',now())",[org,bail]);
    await connecter(); await expect(supprimer()).rejects.toThrow(/état des lieux.*signé/);
  });
  it("conserve les opérations financières associées", async () => {
    await db.query("insert into public.appels_loyer(organization_id,bail_id,periode,date_echeance) values($1,$2,current_date,current_date)",[org,bail]);
    await connecter(); await expect(supprimer()).rejects.toThrow(/opérations ou un suivi/);
  });
  it("refuse un autre propriétaire sans accès à l’organisation", async () => {
    const autre=await id("insert into public.organizations(name,status) values('Autre test','active') returning id");
    await connecter(); await expect(supprimer(autre)).rejects.toThrow(/Accès refusé/);
  });
  it.each(["locataire","agent"])("refuse un rôle %s sans droit sur le lot", async role => {
    await db.query("update public.memberships set role=$1 where account_id=$2 and organization_id=$3",[role,user,org]);
    await connecter(); await expect(supprimer()).rejects.toThrow(/Accès refusé/);
  });
  it("ne rouvre pas la suppression directe et refuse un double appel", async () => {
    await connecter();
    expect((await db.query("select has_table_privilege(current_user,'public.baux','DELETE') as autorise")).rows[0].autorise).toBe(false);
    await supprimer(); await expect(supprimer()).rejects.toThrow(/introuvable ou a déjà été supprimé/);
  });
});
