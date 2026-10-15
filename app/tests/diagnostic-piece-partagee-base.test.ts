/**
 * X07 (PROP-11), côté base : ce sur quoi s'appuie « utiliser cette pièce pour ce lot ».
 *  - Une même fiche document peut servir à plusieurs diagnostics (un par lot) : la pièce est PARTAGÉE, pas copiée ;
 *    le diagnostic d'un lot n'archive pas celui d'un autre lot ; le même fichier ne peut toujours pas être
 *    déposé deux fois (l'unicité par empreinte reste en place).
 *  - La frontière d'organisation tient dans la base elle-même : un diagnostic ne peut pas pointer vers la pièce
 *    d'une autre organisation, même si l'application se trompait.
 *  - Un compte qui n'est pas gérant de l'organisation ne peut pas créer ce rattachement.
 * Transaction annulée, base locale jetable (SUPABASE_DB_URL).
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe.skipIf(!url)("X07 : une pièce de diagnostic partagée entre deux lots, sans doublon ni fuite entre organisations", () => {
  let db: Client;
  let gerantA: string, gerantB: string;
  let orgA: string, orgB: string, bienA: string, lot1: string, lot2: string, lotB: string, pieceA: string, pieceB: string;

  const compte = async () => (await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
    values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','test-x07-'||gen_random_uuid()||'@example.invalid','x',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','') returning id`)).rows[0].id as string;
  const admin = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const comme = async (id: string) => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  };
  const echec = async (sql: string, args: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, args); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
    finally { await db.query("release savepoint refus"); }
  };
  const document = async (org: string, empreinte: string) => (await db.query(
    `insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
     values($1,'diagnostic','DPE — 13/10/2026',$2,'application/pdf',1234,$3) returning id`,
    [org, `${org}/${empreinte}.pdf`, empreinte])).rows[0].id as string;
  const diagnostic = (org: string, lot: string, doc: string) => db.query(
    `insert into public.diagnostics(organization_id,lot_id,type,date_realisation,date_expiration,document_id,classe_dpe)
     values($1,$2,'dpe','2026-01-10','2036-01-10',$3,'D') returning id`, [org, lot, doc]);

  beforeAll(async () => {
    if (!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):[0-9]{1,5}\/gerimmo_ci_[a-z_]+$/.test(url)) throw Error("Base locale dédiée requise");
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    gerantA = await compte();
    gerantB = await compte();
    orgA = (await db.query("insert into organizations(name,status,type) values('TEST X07 A','active','proprietaire_direct') returning id")).rows[0].id;
    orgB = (await db.query("insert into organizations(name,status,type) values('TEST X07 B','active','proprietaire_direct') returning id")).rows[0].id;
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$4,'proprietaire_direct')", [gerantA, orgA, gerantB, orgB]);
    bienA = (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Immeuble X07','immeuble','1 rue TEST','75001','Paris') returning id", [orgA])).rows[0].id;
    const nouveauLot = async (org: string, bien: string, nom: string) =>
      (await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,$3,'disponible') returning id", [org, bien, nom])).rows[0].id as string;
    lot1 = await nouveauLot(orgA, bienA, "Lot 1A");
    lot2 = await nouveauLot(orgA, bienA, "Lot 2B");
    const bienB = (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Immeuble B','immeuble','2 rue TEST','75002','Paris') returning id", [orgB])).rows[0].id;
    lotB = await nouveauLot(orgB, bienB, "Lot B");
    pieceA = await document(orgA, "a".repeat(64));
    pieceB = await document(orgB, "b".repeat(64));
  });
  beforeEach(async () => { await admin(); await db.query("savepoint scenario"); });
  afterEach(async () => { await db.query("rollback to savepoint scenario"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  it("deux lots du même immeuble utilisent la même fiche document : une pièce, deux diagnostics actifs", async () => {
    await comme(gerantA);
    await diagnostic(orgA, lot1, pieceA);
    await diagnostic(orgA, lot2, pieceA);
    await admin();
    const lignes = (await db.query("select lot_id, archived_at from public.diagnostics where document_id=$1 order by lot_id", [pieceA])).rows;
    expect(lignes).toHaveLength(2);
    // Le diagnostic du second lot n'archive pas celui du premier : chaque lot garde un DPE actif.
    expect(lignes.every((l) => l.archived_at === null)).toBe(true);
    expect((await db.query("select count(*)::int n from public.documents where organization_id=$1 and empreinte=$2", [orgA, "a".repeat(64)])).rows[0].n).toBe(1);
  });

  it("le même fichier ne peut toujours pas être déposé deux fois (unicité par empreinte conservée)", async () => {
    const message = await echec(
      `insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
       values($1,'diagnostic','Copie','copie.pdf','application/pdf',1234,$2)`, [orgA, "a".repeat(64)]);
    expect(message).toMatch(/documents_empreinte_unique|duplicate key/);
  });

  it("un diagnostic ne peut pas pointer vers la pièce d'une autre organisation", async () => {
    await comme(gerantA);
    const message = await echec(
      `insert into public.diagnostics(organization_id,lot_id,type,date_realisation,date_expiration,document_id)
       values($1,$2,'dpe','2026-01-10','2036-01-10',$3)`, [orgA, lot1, pieceB]);
    expect(message).toMatch(/diagnostics_document_meme_org_fk|violates foreign key/);
    await admin();
    expect((await db.query("select count(*)::int n from public.diagnostics where document_id=$1", [pieceB])).rows[0].n).toBe(0);
  });

  it("le gérant d'une autre organisation ne voit pas la pièce et ne peut pas rattacher un lot qui n'est pas le sien", async () => {
    await comme(gerantB);
    expect((await db.query("select id from public.documents where id=$1", [pieceA])).rows).toHaveLength(0);
    const message = await echec(
      `insert into public.diagnostics(organization_id,lot_id,type,date_realisation,date_expiration,document_id)
       values($1,$2,'dpe','2026-01-10','2036-01-10',$3)`, [orgA, lot2, pieceA]);
    expect(message).toMatch(/row-level security/);
  });

  it("un lot de l'autre organisation ne peut pas non plus recevoir la pièce (lot et pièce de la même organisation)", async () => {
    await comme(gerantA);
    const message = await echec(
      `insert into public.diagnostics(organization_id,lot_id,type,date_realisation,date_expiration,document_id)
       values($1,$2,'dpe','2026-01-10','2036-01-10',$3)`, [orgA, lotB, pieceA]);
    expect(message).toMatch(/diagnostics_lot_meme_org_fk|violates foreign key/);
  });
});
