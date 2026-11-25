/**
 * ÉTAT DES LIEUX : UNE PHOTO PAR ÉLÉMENT — audit palier 1 du 22/11/2026, P2-01, côté base.
 *
 * Ces tests tiennent, sous les vrais rôles :
 *  1. le gestionnaire de l'espace pose, remplace et retire la photo d'un élément ; la photo est un document de SON
 *     espace : le document d'un autre espace, ou un identifiant inconnu, est refusé par la clé étrangère ;
 *  2. le locataire de l'espace, un compte étranger, un visiteur ne peuvent rien poser ;
 *  3. un circuit de signature en cours fige la photo comme le reste de la ligne (l'essai à blanc de l'application
 *     s'appuie sur ce refus) ; l'état des lieux signé la fige définitivement, pose comme retrait ;
 *  4. la migration se rejoue sans effet ; son retour retire la clé et l'index et GARDE les liens posés.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261122234000_edl_photos_par_element";
const CLE = "edl_lignes_photo_meme_org_fk";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("photos de l'état des lieux — manifeste et retour (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/edl-photos-base.test.ts"');
  });

  it("la migration ne touche ni aux droits ni aux données ; le retour ne supprime ni colonne ni ligne", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/\bgrant\b|\bpolicy\b|disable row level security|poser_gardes_abonnement/i);
    expect(sql).not.toMatch(/\b(?:delete|update|truncate)\b/i);
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(retour).not.toMatch(/drop column|delete from public\.|truncate/i);
    expect(retour).toContain(`drop constraint if exists ${CLE}`);
  });
});

describe.skipIf(!url)("photos de l'état des lieux (avec base)", () => {
  let db: Client;
  let org = "", autre = "", gerant = "", locataire = "", etranger = "", bail = "", edl = "", ligne = "", photo = "", photo2 = "", photoAilleurs = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  async function compte() {
    return id("insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now()) returning id");
  }
  async function agir(compteId: string | null, role: "authenticated" | "anon" = "authenticated") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(compteId ? { sub: compteId, role, aal: "aal2" } : { role })]);
    await db.query(`set local role ${role}`);
  }
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  /** Renvoie le nombre de lignes écrites, ou le message du refus. */
  const poser = async (document: string | null, cible = ligne): Promise<number | string> => {
    await db.query("savepoint pose");
    try {
      const r = await db.query("update public.edl_lignes set photo_document_id=$2 where id=$1", [cible, document]);
      await db.query("release savepoint pose");
      return r.rowCount ?? 0;
    } catch (e) { await db.query("rollback to savepoint pose"); return (e as Error).message; }
  };
  const lue = async (cible = ligne) => { await base(); return (await db.query("select photo_document_id p from public.edl_lignes where id=$1", [cible])).rows[0].p as string | null; };
  const image = (o: string, nom: string) =>
    id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'autre',$2,$1::uuid::text||'/'||gen_random_uuid()||'.jpg','image/jpeg',100,gen_random_uuid()::text) returning id", [o, nom]);

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,type,status) values('Essai photos fictif','proprietaire_direct','active') returning id");
    autre = await id("insert into public.organizations(name,type,status) values('Autre espace fictif','proprietaire_direct','active') returning id");
    gerant = await compte(); locataire = await compte(); etranger = await compte();
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$2,'locataire'),($4,$5,'proprietaire_direct')", [gerant, org, locataire, etranger, autre]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Bien fictif','appartement','1 rue Test','69001','Lyon',false) returning id", [org]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','loue') returning id", [org, bien]);
    const fiche = await id("insert into public.persons(organization_id,nom,prenom,account_id) values($1,'Fictif','Locataire',$2) returning id", [org, locataire]);
    bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'nu','actif',current_date-100,600,40) returning id", [org, lot, fiche]);
    edl = await id("insert into public.etats_des_lieux(organization_id,bail_id,type,date_edl) values($1,$2,'entree',current_date-100) returning id", [org, bail]);
    ligne = await id("insert into public.edl_lignes(organization_id,edl_id,categorie,piece,libelle,etat) values($1,$2,'piece','Séjour','Sols','bon') returning id", [org, edl]);
    photo = await image(org, "Photo fictive 1"); photo2 = await image(org, "Photo fictive 2");
    photoAilleurs = await image(autre, "Photo d'un autre espace");
  });

  it("le gestionnaire pose, remplace et retire la photo ; le document d'un autre espace ou inconnu est refusé", async () => {
    await agir(gerant);
    expect(await poser(photo)).toBe(1);
    expect(await lue()).toBe(photo);
    await agir(gerant);
    // L'essai à blanc de l'application : réécrire la valeur actuelle passe tant que rien ne fige la ligne.
    expect(await poser(photo)).toBe(1);
    expect(await poser(photo2)).toBe(1);
    expect(await lue()).toBe(photo2);
    await agir(gerant);
    expect(await poser(photoAilleurs)).toMatch(new RegExp(CLE));
    expect(await poser(randomUUID())).toMatch(new RegExp(CLE));
    expect(await lue()).toBe(photo2);
    await agir(gerant);
    expect(await poser(null)).toBe(1);
    expect(await lue()).toBeNull();
    // Même hors des droits de l'application, la base refuse le document d'un autre espace.
    expect(await poser(photoAilleurs)).toMatch(new RegExp(CLE));
  });

  it("locataire de l'espace, gestionnaire d'un autre espace, visiteur : rien n'est écrit", async () => {
    for (const qui of [locataire, etranger]) {
      await agir(qui);
      expect(await poser(photo), qui).toBe(0);
    }
    await agir(null, "anon");
    const visiteur = await poser(photo);
    expect(visiteur === 0 || /permission denied|droit refusé/i.test(String(visiteur)), String(visiteur)).toBe(true);
    expect(await lue()).toBeNull();
    // Le gestionnaire d'un autre espace ne lit pas non plus la ligne.
    await agir(etranger);
    expect((await db.query("select count(*)::int n from public.edl_lignes where id=$1", [ligne])).rows[0].n).toBe(0);
  });

  it("circuit de signature en cours : la photo est figée comme le relevé ; circuit annulé : elle se pose de nouveau", async () => {
    await base();
    const acte = await id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'etat_des_lieux','Acte fictif',$1::uuid::text||'/acte.pdf','application/pdf',100,repeat('a',64)) returning id", [org]);
    const circuit = await id(
      "insert into public.bail_signature_circuits(organization_id,bail_id,document_id,created_by,environnement,empreinte,pdf_hash,signataires,prestataire,modele,cible_id,options) values($1,$2,$3,$4,'production',repeat('b',64),repeat('a',64),$5,'zoho','edl',$6,'{}'::jsonb) returning id",
      [org, bail, acte, gerant, JSON.stringify([
        { personId: "locataire", qualite: "Locataire", prenom: "Alice", nom: "Test", email: "alice@example.invalid", telephone: "+33600000001" },
        { personId: "owner", qualite: "Propriétaire", prenom: "Paule", nom: "Proprio", email: "paule@example.invalid", telephone: "+33600000002" },
      ]), edl],
    );
    // Circuit « prêt à relire », pas encore envoyé : le relevé se corrige encore, la photo aussi (règle existante).
    await agir(gerant);
    expect(await poser(photo2)).toBe(1);
    expect(await poser(null)).toBe(1);
    await base();
    // L'envoi d'un état des lieux en signature exige la confirmation de la visite sur place : on la pose comme l'écran.
    await db.query("select public.confirmer_edl_sur_place($1, $2, (select date_edl from public.etats_des_lieux where id=$3))", [circuit, gerant, edl]);
    for (const etat of ["preparation", "en_cours", "a_verifier"]) {
      await base();
      await db.query("update public.bail_signature_circuits set etat=$2 where id=$1", [circuit, etat]);
      await agir(gerant);
      expect(await poser(photo), etat).toMatch(/Annulez le circuit de signature de cet état des lieux avant de modifier son relevé/);
      // L'essai à blanc (valeur inchangée) rencontre le même refus : l'application ne dépose alors aucun fichier.
      expect(await poser(null), etat).toMatch(/Annulez le circuit de signature/);
    }
    expect(await lue()).toBeNull();
    await db.query("update public.bail_signature_circuits set etat='annule' where id=$1", [circuit]);
    await agir(gerant);
    expect(await poser(photo)).toBe(1);
    expect(await lue()).toBe(photo);
  });

  it("état des lieux signé : la photo est figée, pose, remplacement et retrait refusés, même hors des droits de l'application", async () => {
    await agir(gerant);
    expect(await poser(photo)).toBe(1);
    await base();
    await db.query("update public.etats_des_lieux set etat='signe', signe_le=now() where id=$1", [edl]);
    await agir(gerant);
    for (const valeur of [photo2, null, photo]) expect(await poser(valeur)).toMatch(/EDL signé : les lignes sont figées/);
    await base();
    expect(await poser(null)).toMatch(/EDL signé : les lignes sont figées/);
    expect(await lue()).toBe(photo);
  });

  it("rejeu sans effet ; le retour retire la clé et l'index et garde les liens ; la migration se rejoue", async () => {
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const cle = async () => (await db.query("select count(*)::int n from pg_constraint where conrelid='public.edl_lignes'::regclass and conname=$1", [CLE])).rows[0].n as number;
    const index = async () => (await db.query("select to_regclass('public.edl_lignes_photo_idx') is not null e")).rows[0].e as boolean;
    const colonne = async () => (await db.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='edl_lignes' and column_name='photo_document_id'")).rows[0].n as number;

    await agir(gerant);
    expect(await poser(photo)).toBe(1);
    await base();
    await db.query(migration);
    expect([await cle(), await index()]).toEqual([1, true]);
    expect(await lue()).toBe(photo);

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122234000','edl_photos_par_element') on conflict do nothing");
    await db.query(retour);
    expect([await cle(), await index(), await colonne()]).toEqual([0, false, 1]);
    expect(await lue()).toBe(photo);
    expect((await db.query("select count(*)::int n from public.documents where id=$1", [photo])).rows[0].n).toBe(1);
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261122234000'")).rows[0].n).toBe(0);
    await db.query(retour);
    expect(await cle()).toBe(0);

    await db.query(migration);
    expect([await cle(), await index()]).toEqual([1, true]);
    expect(await lue()).toBe(photo);
    await agir(gerant);
    expect(await poser(photoAilleurs)).toMatch(new RegExp(CLE));
    expect(await poser(photo2)).toBe(1);
  });
});
