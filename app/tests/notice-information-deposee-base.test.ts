/**
 * LE TYPE DE DOCUMENT « NOTICE D'INFORMATION DÉPOSÉE », DANS LA BASE — décision du dirigeant du 24/11/2026 (Q46).
 *
 * En attendant que Gerimmo joigne lui-même le texte officiel, le bailleur dépose la notice d'information de son bail.
 * La migration 20261124180000 n'ajoute qu'une valeur au type des documents. Ce que ces tests tiennent :
 *  1. la valeur existe ; un document de ce type se range et se lie à un bail comme les autres pièces ;
 *  2. aucune règle de conservation n'est créée pour ce type (sa durée reste à décider : rien n'est inventé) ;
 *  3. la migration se rejoue ; son retour ne retire que l'inscription de la migration (PostgreSQL ne sait pas retirer
 *     une valeur d'un type énuméré) et ne supprime aucun document.
 * Le dépôt sous la session d'un propriétaire, avec ses droits, est tenu par le parcours e2e « decisions-24-11-d3 ».
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { TYPE_GED_NOTICE_DEPOSEE } from "@/lib/documents-bail";

const NOM = "20261124180000_notice_information_deposee";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("notice déposée — manifeste, retour et écriture de la migration (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/notice-information-deposee-base.test.ts"');
  });

  it("elle n'ajoute qu'une valeur au type des documents : ni droit, ni politique, ni fonction, ni donnée, ni règle de conservation", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "").trim();
    expect(sql).toBe("alter type public.document_type add value if not exists 'notice_information';");
    expect(TYPE_GED_NOTICE_DEPOSEE).toBe("notice_information");
    // Le retour ne supprime aucun document et ne touche pas au type.
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8").replace(/^\s*--.*$/gm, "").trim();
    expect(retour).toBe("delete from supabase_migrations.schema_migrations where version = '20261124180000';");
  });
});

describe.skipIf(!url)("notice déposée (avec base)", () => {
  let db: Client;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => { await db.query("begin"); });
  afterEach(async () => { await db.query("rollback"); });
  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  const valeurs = async () => (await db.query<{ v: string }>("select unnest(enum_range(null::public.document_type))::text v")).rows.map((r) => r.v);

  it("la valeur existe, une seule fois ; aucune règle de conservation n'est posée pour elle", async () => {
    expect((await valeurs()).filter((v) => v === "notice_information")).toHaveLength(1);
    expect((await db.query("select count(*)::int n from public.retention_rules where data_type = 'document:notice_information'")).rows[0].n).toBe(0);
  });

  it("un document de ce type se range dans un espace et se lie à un bail, comme une autre pièce", async () => {
    const org = await id("insert into public.organizations(name,type,status) values('Essai notice fictif','proprietaire_direct','active') returning id");
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Bien fictif','appartement','1 rue Test','69001','Lyon',false) returning id", [org]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat,surface_m2) values($1,$2,'Lot fictif','disponible',40) returning id", [org, bien]);
    const bail = await id("insert into public.baux(organization_id,lot_id,type,etat) values($1,$2,'nu','brouillon') returning id", [org, lot]);
    const doc = await id(`insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
      values($1,'notice_information','Notice d''information (déposée par le bailleur)',$2,'application/pdf',1200,encode(extensions.digest('notice-fictive','sha256'),'hex')) returning id`, [org, `${org}/notice-fictive.pdf`]);
    await db.query("insert into public.document_liens(organization_id,document_id,entite,entite_id) values($1,$2,'bail',$3)", [org, doc, bail]);
    const { rows } = await db.query("select d.type::text t from public.document_liens l join public.documents d on d.id = l.document_id where l.entite='bail' and l.entite_id=$1", [bail]);
    expect(rows).toEqual([{ t: "notice_information" }]);
  });

  it("la migration se rejoue sans rien changer ; son retour ne retire que son inscription et ne supprime aucun document", async () => {
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const avant = await valeurs();
    await db.query(migration);
    await db.query(migration);
    expect(await valeurs()).toEqual(avant);
    const documents = (await db.query("select count(*)::int n from public.documents")).rows[0].n;
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261124180000','notice_information_deposee') on conflict do nothing");
    await db.query(retour);
    await db.query(retour);
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261124180000'")).rows[0].n).toBe(0);
    expect(await valeurs()).toEqual(avant);
    expect((await db.query("select count(*)::int n from public.documents")).rows[0].n).toBe(documents);
  });
});
