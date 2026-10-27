import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Audit #264 (ED-01, CB-15) : l'assurance du locataire classée pendant la préparation du bail
// suit les locataires engagés à l'activation ; le refus d'un colocataire cite l'étape « Le bail ».
const url = process.env.SUPABASE_DB_URL;
if (url) {
  const cible = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(cible.hostname) || !/^\/gerimmo_ci_[a-z_]+$/.test(cible.pathname)) {
    throw Error("Base locale de recette requise pour l'assurance du locataire.");
  }
}
const MIGRATION = readFileSync("supabase/migrations/20261027100300_bail_assurance_activation_et_libelle_colocation.sql", "utf8");

describe.skipIf(!url)("assurance du locataire — reprise après l'activation du bail", () => {
  let db: Client, org: string, proprio: string, compteLocataire: string, lot: string, bail: string;
  let locataire: string, colocataire: string, parti: string, garant: string, document: string;
  async function compte() {
    const id = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [id, `${id}@test.local`]);
    return id;
  }
  async function agir(id: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  }
  async function service() {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims','',true)");
  }
  const personne = async (nom: string, account: string | null = null) =>
    (await db.query("insert into persons(organization_id,nom,prenom,account_id,email) values($1,$2,'Test',$3,$4) returning id", [org, nom, account, `${randomUUID()}@test.local`])).rows[0].id as string;
  const liensPersonne = async (doc = document) =>
    (await db.query("select entite_id from document_liens where document_id=$1 and entite='personne' order by entite_id", [doc])).rows.map(r => r.entite_id);
  const classer = async () => {
    await agir(proprio);
    expect((await db.query("select public.affecter_piece_attendue_bail($1,$2,'assurance_locataire',$3,null) d", [org, bail, document])).rows[0].d).toBe(document);
    await service();
  };

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => {
    await db.query("begin");
    await service();
    proprio = await compte(); compteLocataire = await compte();
    org = (await db.query("insert into organizations(name,type,status,essai_fin) values('TEST assurance activation','proprietaire_direct','essai',public.aujourdhui_paris()+30) returning id")).rows[0].id;
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$2,'locataire')", [proprio, org, compteLocataire]);
    const bien = (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST Bien','appartement','1 rue fictive','75001','Paris') returning id", [org])).rows[0].id;
    lot = (await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST Lot','disponible') returning id", [org, bien])).rows[0].id;
    locataire = await personne("TEST Locataire", compteLocataire);
    colocataire = await personne("TEST Colocataire"); parti = await personne("TEST Parti"); garant = await personne("TEST Garant");
    bail = (await db.query(`insert into baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance)
      values($1,$2,$3,'colocation','brouillon',public.aujourdhui_paris(),750,50,5) returning id`, [org, lot, locataire])).rows[0].id;
    await db.query(`insert into bail_personnes(organization_id,bail_id,person_id,role,garant_de,date_depart)
      values($1,$2,$3,'colocataire',null,null),($1,$2,$4,'colocataire',null,public.aujourdhui_paris()-1),($1,$2,$5,'garant',$6,null)`, [org, bail, colocataire, parti, garant, locataire]);
    document = (await db.query(`insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte,deposited_by,expire_le)
      values($1,'attestation_assurance','Attestation d’assurance du locataire',$2,'application/pdf',1234,$3,$4,public.aujourdhui_paris()+10) returning id`,
    [org, `${org}/${randomUUID()}.pdf`, randomUUID().replaceAll("-", "").repeat(2), proprio])).rows[0].id;
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("rattache la pièce au locataire principal et aux colocataires présents à l'activation, jamais aux garants", async () => {
    await classer();
    expect(await liensPersonne()).toEqual([]);
    await db.query("update baux set etat='actif' where id=$1", [bail]);
    expect(await liensPersonne()).toEqual([locataire, colocataire].sort());
    // La couverture reste à vérifier : aucune validation n'est inventée.
    expect((await db.query("select verifie_le from documents where id=$1", [document])).rows[0].verifie_le).toBeNull();
  });

  it("l'espace locataire reprend l'attestation et l'alerte d'échéance la suit", async () => {
    await classer();
    await db.query("update baux set etat='actif' where id=$1", [bail]);
    await agir(compteLocataire);
    expect((await db.query("select document_id,type,source from public.mes_pieces_locataire($1)", [org])).rows)
      .toEqual([{ document_id: document, type: "attestation_assurance", source: "dossier" }]);
    expect((await db.query("select document_id from public.mon_document_locataire($1,$2)", [org, document])).rowCount).toBe(1);
    await service();
    await db.query("select public.generer_alertes_assurance()");
    expect((await db.query("select type,details->>'document_id' as document from alerts where organization_id=$1 and type='assurance_expiration'", [org])).rows)
      .toEqual([{ type: "assurance_expiration", document }]);
  });

  it("ne rattache rien tant que le bail reste en préparation", async () => {
    await classer();
    await db.query("update baux set loyer_hc=760 where id=$1", [bail]);
    expect(await liensPersonne()).toEqual([]);
  });

  it("la reprise de la migration complète un bail déjà actif et se rejoue sans doublon", async () => {
    await classer();
    await db.query("update baux set etat='actif' where id=$1", [bail]);
    await db.query("delete from document_liens where document_id=$1 and entite='personne'", [document]);
    await db.query(MIGRATION);
    await db.query(MIGRATION);
    expect(await liensPersonne()).toEqual([locataire, colocataire].sort());
  });

  it("CB-15 : le refus d'un colocataire sur un bail non partagé nomme l'étape « Le bail »", async () => {
    const nu = (await db.query("insert into baux(organization_id,lot_id,type,etat) values($1,$2,'nu','brouillon') returning id", [org, lot])).rows[0].id;
    const candidat = await personne("TEST Candidat");
    await agir(proprio);
    await expect(db.query("select public.choisir_personne_bail($1,$2,'colocataire',null,null)", [nu, candidat]))
      .rejects.toMatchObject({ message: "Pour plusieurs locataires sur ce contrat, choisissez la colocation à l’étape Le bail." });
  });
});
