import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

async function creerUtilisateur(db: Client): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-mentions-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

async function simuler(db: Client, accountId: string | null, role = "authenticated") {
  await db.query("reset role");
  if (accountId) {
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [accountId]
    );
  } else {
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  }
  await db.query(`set local role ${role}`);
}

async function attendreEchec(db: Client, motif: RegExp, sql: string, params: unknown[] = []) {
  await db.query("savepoint e");
  await expect(db.query(sql, params)).rejects.toThrow(motif);
  await db.query("rollback to savepoint e");
}

describe.skipIf(!DB_URL)("Contrats individuels sur un même logement", () => {
  let db: Client;
  let org: string;
  let admin: string;
  let proprietaire: string;
  let locataire: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("begin");
    const {
      rows: [o],
    } = await db.query(
      `insert into public.organizations (name, status) values ('Mentions Bail','active') returning id`
    );
    org = o.id;
    admin = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [admin, org]
    );
    const pers = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Bailleur'),($1,'Locataire') returning id, nom`,
      [org]
    );
    proprietaire = pers.rows.find((p) => p.nom === "Bailleur")!.id;
    locataire = pers.rows.find((p) => p.nom === "Locataire")!.id;
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  // Un lot prêt à louer : détention 100 %, diagnostics valides, disponible —
  // pour qu'aucun autre blocage ne masque ce que ce test mesure.
  async function lotLouable(): Promise<string> {
    await simuler(db, admin);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'9 rue des Mentions','appartement'::public.bien_type,
         '9 rue des Mentions', null, '75011','Paris',1985,false,42,2) as id`,
      [org]
    );
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims','',true)`);
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id = $1`, [bien]);
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`,
      [lot, org, proprietaire]
    );
    await db.query(
      `insert into public.diagnostics (organization_id, lot_id, type, date_realisation, date_expiration)
       values ($1,$2,'dpe',current_date,current_date+365)`,
      [org, lot]
    );
    await db.query(
      `insert into public.diagnostics (organization_id, bien_id, type, date_realisation, date_expiration)
       values ($1,$2,'erp',current_date,current_date+180)`,
      [org, bien]
    );
    await db.query(`update public.lots set etat='disponible' where id=$1`, [lot]);
    await simuler(db, admin);
    return lot;
  }

  async function docBail(): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte, deposited_by)
       values ($1,'bail','Bail signé', $1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',1000,'e-'||gen_random_uuid(),$2)
       returning id`,
      [org, admin]
    );
    return id;
  }

  // Le brouillon tel qu'il sort du formulaire : les champs facultatifs le
  // restent, seul ce qui est passé est renseigné.
  async function creerBrouillon(
    lot: string,
    champs: { chambre?: string | null; loyer?: number | null; dateDebut?: string | null; locataire?: string | null } = {}
  ): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, document_signe,
                                loyer_hc, charges, jour_echeance, date_debut, type, chambre_id)
       values ($1,$2,$3,$4,$5,50,5,$6,'colocation',$7) returning id`,
      [
        org,
        lot,
        champs.locataire === undefined ? locataire : champs.locataire,
        await docBail(),
        champs.loyer === undefined ? 750 : champs.loyer,
        champs.dateDebut === undefined ? new Date().toISOString().slice(0, 10) : champs.dateDebut,
        champs.chambre ?? null,
      ]
    );
    return id;
  }

  async function preparer() {
    const lot = await lotLouable();
    await db.query("update public.lots set colocation_loyer_reference=1000 where id=$1", [lot]);
    const { rows: chambres } = await db.query(`insert into public.lot_chambres(organization_id,lot_id,nom,surface_m2,volume_m3,description,espaces_partages)
      values ($1,$2,'Jardin',12,30,'Chambre au calme','Cuisine, séjour et salle de bains'),($1,$2,'Cour',10,25,'Chambre sur cour','Cuisine, séjour et salle de bains') returning id`,[org,lot]);
    const { rows: [autre] } = await db.query("insert into public.persons(organization_id,nom) values($1,'Second locataire') returning id",[org]);
    const premier = await creerBrouillon(lot,{chambre:chambres[0].id,loyer:450});
    const second = await creerBrouillon(lot,{chambre:chambres[1].id,loyer:500,locataire:autre.id});
    return {lot,chambres,premier,second};
  }
  it("active deux chambres, conserve un seul logement et deux échéanciers indépendants",async()=>{
    const {lot,premier,second}=await preparer();
    await db.query('select public.activer_bail($1)',[premier]);
    await db.query('select public.activer_bail($1)',[second]);
    await db.query('select public.generer_appels_loyer($1)',[premier]);
    await db.query('select public.generer_appels_loyer($1)',[second]);
    expect((await db.query('select etat from public.lots where id=$1',[lot])).rows[0].etat).toBe('loue');
    expect((await db.query('select distinct bail_id from public.appels_loyer where bail_id=any($1)',[[premier,second]])).rows).toHaveLength(2);
    expect((await db.query('select * from public.contrats_du_lot($1)',[lot])).rows).toHaveLength(2);
    await db.query('set constraints all immediate');
  });
  it("refuse une chambre déjà occupée et le chevauchement avec le logement entier",async()=>{
    const {lot,chambres,premier}=await preparer();await db.query('select public.activer_bail($1)',[premier]);
    const doublon=await creerBrouillon(lot,{chambre:chambres[0].id,loyer:200});
    await attendreEchec(db,/déjà en cours/i,'select public.activer_bail($1)',[doublon]);
    const entier=await creerBrouillon(lot,{loyer:800});
    await attendreEchec(db,/déjà en cours/i,'select public.activer_bail($1)',[entier]);
  });
  it("contrôle le plafond à l’activation et lors d’une augmentation, même en écriture directe",async()=>{
    const {lot,premier,second}=await preparer();await db.query('select public.activer_bail($1)',[premier]);
    await db.query('update public.baux set loyer_hc=600 where id=$1',[second]);
    await attendreEchec(db,/dépasse le plafond/i,'select public.activer_bail($1)',[second]);
    await db.query('update public.baux set loyer_hc=500 where id=$1',[second]);await db.query('select public.activer_bail($1)',[second]);
    await attendreEchec(db,/dépasse le plafond/i,'update public.baux set loyer_hc=600 where id=$1',[second]);
    await attendreEchec(db,/inférieur aux loyers/i,'update public.lots set colocation_loyer_reference=900 where id=$1',[lot]);
  });
  it("un départ et une annulation de congé préservent le bail et le loyer de l’autre chambre",async()=>{
    const {lot,premier,second}=await preparer();await db.query('select public.activer_bail($1)',[premier]);await db.query('select public.activer_bail($1)',[second]);
    await db.query("select public.enregistrer_conge($1,'locataire',current_date,3::smallint)",[premier]);
    expect((await db.query('select etat from public.lots where id=$1',[lot])).rows[0].etat).toBe('loue');
    await db.query('set constraints all immediate');
    await db.query("select public.annuler_conge($1,'Le locataire reste')",[premier]);
    expect((await db.query('select etat from public.baux where id=$1',[second])).rows[0].etat).toBe('actif');
    await db.query('select public.devalider_bail($1)',[premier]);
    expect((await db.query('select etat from public.lots where id=$1',[lot])).rows[0].etat).toBe('loue');
  });
  it("mesure surface ET volume, interdit les cotitulaires et conserve la description signée",async()=>{
    const {lot,chambres,premier}=await preparer();
    await attendreEchec(db,/check constraint/i,'update public.lot_chambres set surface_m2=8.99 where id=$1',[chambres[0].id]);
    await attendreEchec(db,/check constraint/i,'update public.lot_chambres set volume_m3=19.99 where id=$1',[chambres[0].id]);
    await attendreEchec(db,/individuel/i,"insert into public.bail_personnes(organization_id,bail_id,person_id,role) values($1,$2,$3,'colocataire')",[org,premier,proprietaire]);
    await db.query('select public.activer_bail($1)',[premier]);
    await attendreEchec(db,/contrat signé/i,"update public.lot_chambres set description='Autre description' where id=$1",[chambres[0].id]);
    expect((await db.query('select count(*) from public.lots where id=$1',[lot])).rows[0].count).toBe('1');
  });
  it("prépare l’état des lieux de la chambre concernée et des seuls espaces partagés",async()=>{
    const {premier}=await preparer();
    const {rows:[edl]}=await db.query("insert into public.etats_des_lieux(organization_id,bail_id,type) values($1,$2,'entree') returning id",[org,premier]);
    await db.query('select public.generer_grille_edl($1)',[edl.id]);
    const pieces=(await db.query('select distinct piece from public.edl_lignes where edl_id=$1',[edl.id])).rows.map(r=>r.piece);
    expect(pieces.sort()).toEqual(['Espaces partagés','Jardin']);
  });
  it("clôture uniquement le contrat sortant après son état des lieux",async()=>{
    const {lot,premier,second}=await preparer();await db.query('select public.activer_bail($1)',[premier]);await db.query('select public.activer_bail($1)',[second]);
    await db.query("select public.enregistrer_conge($1,'locataire',current_date,3::smallint)",[premier]);
    await attendreEchec(db,/sans état des lieux/i,'select public.terminer_bail($1)',[premier]);
    const {rows:[edl]}=await db.query("insert into public.etats_des_lieux(organization_id,bail_id,type) values($1,$2,'sortie') returning id",[org,premier]);
    await db.query('select public.generer_grille_edl($1)',[edl.id]);
    await db.query("update public.edl_lignes set etat='bon' where edl_id=$1",[edl.id]);
    await db.query('select public.signer_edl($1)',[edl.id]);
    await db.query('select public.terminer_bail($1)',[premier]);
    expect((await db.query('select etat from public.lots where id=$1',[lot])).rows[0].etat).toBe('loue');
    expect((await db.query('select etat from public.baux where id=$1',[second])).rows[0].etat).toBe('actif');
    await db.query('set constraints all immediate');
  });
  it("la fenêtre locataire ne révèle pas le contrat ni le loyer de la chambre voisine",async()=>{
    const {lot,premier,second}=await preparer();await db.query('select public.activer_bail($1)',[premier]);await db.query('select public.activer_bail($1)',[second]);
    await simuler(db,null,'postgres');
    const compte=await creerUtilisateur(db);
    await db.query('update public.persons set account_id=$1 where id=$2',[compte,locataire]);
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'locataire')",[compte,org]);
    await simuler(db,compte);
    const fiche=(await db.query('select * from public.fiche_lot($1)',[lot])).rows[0];
    expect(fiche.bail_id).toBe(premier);expect(Number(fiche.loyer_hc)).toBe(450);
    const contrats=(await db.query('select * from public.contrats_du_lot($1)',[lot])).rows;
    expect(contrats.map(c=>c.id)).toEqual([premier]);
    expect((await db.query('select * from public.lot_chambres where lot_id=$1',[lot])).rows).toHaveLength(0);
  });
});
