/** Un UUID/chemin connu ne suffit pas à s'approprier une pièce du collègue. */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Documents — pas d'appropriation hors portefeuille", () => {
  let db: Client;
  let org: string, agentA: string, agentB: string, admin: string;
  let lotA: string, lotB: string, incidentA: string, incidentB: string, documentA: string;
  const id = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0].id as string;
  const devenir = async (compte: string) => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated')::text,true)", [compte]);
    await db.query("set local role authenticated");
  };
  const nouveauDocument = (chemin: string, empreinte: string, auteur = agentB) => id(`
    insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte,deposited_by)
    values($1,'photo_incident','Photo de recette',$2,'image/png',10,$3,$4) returning id`, [org, chemin, empreinte, auteur]);
  const tenterSansFuite = async (sql: string, params: unknown[]) => {
    await db.query("savepoint attaque");
    let refusee = false;
    try { await db.query(sql, params); }
    catch (erreur) {
      await db.query("rollback to savepoint attaque");
      expect(erreur).toMatchObject({ code: "42501" });
      refusee = true;
    }
    // Ces lectures suivent l'INSERT forgé sans RETURNING. Avant le correctif,
    // l'INSERT réussit et ces deux lectures exposent réellement la pièce.
    expect((await db.query("select id from public.documents where id=$1", [documentA])).rows).toHaveLength(0);
    expect((await db.query("select id from storage.objects where name=$1", [`${org}/photo-a.png`])).rows).toHaveLength(0);
    expect(refusee, "la tentative doit être refusée avant d'élargir la lecture").toBe(true);
    await db.query("release savepoint attaque");
  };

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL }); await db.connect(); await db.query("begin");
    org = await id("insert into public.organizations(name,status,type) values('Recette liens de documents','active','agence') returning id");
    const compte = (prefixe: string) => id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,
      email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,
      email_change,email_change_token_new,email_change_token_current)
      values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
      $1||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`, [prefixe]);
    [agentA, agentB, admin] = [await compte("agent-a"), await compte("agent-b"), await compte("admin")];
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'agent'),($3,$2,'agent'),($4,$2,'admin_agence')", [agentA, org, agentB, admin]);
    const bien = await id(`insert into public.biens(organization_id,nom,type,address_line1,postal_code,city)
      values($1,'Bien de recette','immeuble','1 rue de la Recette','75001','Paris') returning id`, [org]);
    lotA = await id("insert into public.lots(organization_id,bien_id,nom,created_by) values($1,$2,'Lot A',$3) returning id", [org, bien, agentA]);
    lotB = await id("insert into public.lots(organization_id,bien_id,nom,created_by) values($1,$2,'Lot B',$3) returning id", [org, bien, agentB]);
    const incident = (lot: string, numero: string) => id(`insert into public.incidents(organization_id,lot_id,numero,
      canal,categorie,description) values($1,$2,$3,'agence','plomberie_canalisation','Incident de recette') returning id`, [org, lot, numero]);
    incidentA = await incident(lotA, "INC-DOC-A"); incidentB = await incident(lotB, "INC-DOC-B");
    await db.query("insert into storage.objects(bucket_id,name,owner) values('documents',$1,$2),('documents',$3,$4),('documents',$5,$2)",
      [`${org}/photo-a.png`, agentA, `${org}/photo-b.png`, agentB, `${org}/photo-a-sans-fiche.png`]);
    documentA = await nouveauDocument(`${org}/photo-a.png`, "photo-a", agentA);
    await db.query("insert into public.document_liens(document_id,organization_id,entite,entite_id) values($1,$2,'incident',$3)", [documentA, org, incidentA]);
  });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("release savepoint cas"); });

  it.each(["lot", "incident"])("un lien forgé vers son propre %s ne révèle ni pièce ni fichier", async (entite) => {
    await devenir(agentB);
    await tenterSansFuite("insert into public.document_liens(document_id,organization_id,entite,entite_id) values($1,$2,$3::public.entite_liee,$4)",
      [documentA, org, entite, entite === "lot" ? lotB : incidentB]);
  });

  it("une nouvelle fiche portant le chemin du collègue n'ouvre pas son fichier", async () => {
    await devenir(agentB);
    await tenterSansFuite(`insert into public.documents(organization_id,type,storage_path,mime_type,taille_octets,empreinte,deposited_by)
      values($1,'photo_incident',$2,'image/png',10,'empreinte-forgee',$3)`, [org, `${org}/photo-a.png`, agentB]);
  });

  it("un fichier du collègue pas encore enregistré dans la GED reste inaccessible", async () => {
    await devenir(agentB);
    await expect(nouveauDocument(`${org}/photo-a-sans-fiche.png`, "sans-fiche-forgee")).rejects.toMatchObject({ code: "42501" });
  });

  it("le dépôt légitime garde sa première liaison organisation puis son contexte", async () => {
    await devenir(agentB);
    const doc = await nouveauDocument(`${org}/photo-b.png`, "photo-b");
    await db.query("insert into public.document_liens(document_id,organization_id,entite,entite_id) values($1,$2,'organisation',$2)", [doc, org]);
    await db.query("insert into public.document_liens(document_id,organization_id,entite,entite_id) values($1,$2,'incident',$3)", [doc, org, incidentB]);
    expect((await db.query("select id from public.documents where id=$1", [doc])).rows).toHaveLength(1);
    expect((await db.query("select id from storage.objects where name=$1", [`${org}/photo-b.png`])).rows).toHaveLength(1);
  });

  it("le titulaire peut rattacher une pièce déjà lisible dans son portefeuille", async () => {
    await devenir(agentA);
    await db.query("insert into public.document_liens(document_id,organization_id,entite,entite_id) values($1,$2,'lot',$3)", [documentA, org, lotA]);
    expect((await db.query("select id from public.documents where id=$1", [documentA])).rows).toHaveLength(1);
  });

  it("une suppression sans filtre ne retire pas les liens du collègue", async () => {
    await devenir(agentB);
    await expect(db.query("delete from public.document_liens")).rejects.toMatchObject({ code: "42501" });
  });

  it("l'administrateur conserve le rattachement transversal de l'agence", async () => {
    await devenir(admin);
    await db.query("insert into public.document_liens(document_id,organization_id,entite,entite_id) values($1,$2,'lot',$3)", [documentA, org, lotB]);
    await devenir(agentB);
    expect((await db.query("select id from public.documents where id=$1", [documentA])).rows).toHaveLength(1);
  });

  it("une nouvelle version légitime conserve ses liens existants", async () => {
    await devenir(agentA);
    await db.query("insert into storage.objects(bucket_id,name,owner) values('documents',$1,$2)", [`${org}/photo-a-v2.png`, agentA]);
    const version = (await db.query("select public.remplacer_document_ged($1,$2,$3,'image/png',10,'version-a','Photo version 2',null) id",
      [org, documentA, `${org}/photo-a-v2.png`])).rows[0].id;
    expect((await db.query("select remplace_id from public.documents where id=$1", [version])).rows[0].remplace_id).toBe(documentA);
    expect((await db.query("select id from public.document_liens where document_id=$1 and entite='incident' and entite_id=$2", [version, incidentA])).rows).toHaveLength(1);
  });

  it("le remplacement d'une pièce du collègue est refusé même avec son propre fichier", async () => {
    await devenir(agentB);
    await expect(db.query("select public.remplacer_document_ged($1,$2,$3,'image/png',10,'version-forgee','Version interdite',null)",
      [org, documentA, `${org}/photo-b.png`])).rejects.toMatchObject({ code: "42501" });
  });

  it("un chemin déjà lisible peut être référencé sans contrainte globale nouvelle", async () => {
    await devenir(agentA);
    const copie = await nouveauDocument(`${org}/photo-a.png`, "autre-reference-visible", agentA);
    expect(copie).not.toBe(documentA);
  });

  it("une autre fiche cachée du même fichier ne retire pas l'accès déjà partagé", async () => {
    await devenir(admin);
    await nouveauDocument(`${org}/photo-a.png`, "reference-privee-admin", admin);
    await db.query("insert into public.document_liens(document_id,organization_id,entite,entite_id) values($1,$2,'lot',$3)", [documentA, org, lotB]);
    await devenir(agentB);
    const copie = await nouveauDocument(`${org}/photo-a.png`, "reference-apres-partage");
    expect(copie).toBeTruthy();
  });

  it("le versionnage conserve un partage transversal déjà décidé par l'administrateur", async () => {
    await devenir(admin);
    await db.query("insert into public.document_liens(document_id,organization_id,entite,entite_id) values($1,$2,'lot',$3)", [documentA, org, lotB]);
    await devenir(agentA);
    await db.query("insert into storage.objects(bucket_id,name,owner) values('documents',$1,$2)", [`${org}/photo-partagee-v2.png`, agentA]);
    const version = (await db.query("select public.remplacer_document_ged($1,$2,$3,'image/png',10,'version-partagee','Version partagée',null) id",
      [org, documentA, `${org}/photo-partagee-v2.png`])).rows[0].id;
    await devenir(agentB);
    expect((await db.query("select id from public.documents where id=$1", [version])).rows).toHaveLength(1);
  });

  it("une pièce personnelle ne reçoit pas un nouveau lien hors portefeuille", async () => {
    await devenir(agentB);
    const doc = await nouveauDocument(`${org}/photo-b.png`, "photo-a-pas-partager");
    await expect(db.query("insert into public.document_liens(document_id,organization_id,entite,entite_id) values($1,$2,'lot',$3)",
      [doc, org, lotA])).rejects.toMatchObject({ code: "42501" });
  });

  it("les métadonnées ne peuvent pas être réécrites après une insertion autorisée", async () => {
    await devenir(agentB);
    const doc = await nouveauDocument(`${org}/photo-b.png`, "avant-detournement");
    await expect(db.query("update public.documents set storage_path=$1 where id=$2", [`${org}/photo-a.png`, doc])).rejects.toMatchObject({ code: "42501" });
  });
});
