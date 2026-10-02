import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
describe.skipIf(!url)("garde SQL des dates d’attestation", () => {
  let db: Client;
  let artisan: string;
  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect(); await db.query("begin");
    await db.query("drop trigger if exists controler_dates_attestation_artisan on public.artisan_pieces");
    await db.query(readFileSync("supabase/migrations/20261002200000_dates_attestations_artisans.sql", "utf8"));
    artisan = (await db.query("insert into artisans(raison_sociale,siret,telephone) values('Recette dates', '98765432109876', '0600000000') returning id")).rows[0].id;
  });
  afterAll(async () => { if (db) { await db.query("rollback"); await db.end(); } });
  async function deposer(emise: string, expiration: string) {
    await db.query("savepoint essai_date");
    try {
      await db.query(`insert into artisan_pieces(artisan_id,type,storage_path,mime_type,taille_octets,empreinte,emise_le,expire_le)
        values($1::uuid,'rc_pro','artisans/'||($1::uuid)::text||'/test.pdf','application/pdf',100,'empreinte-recette',${emise},${expiration})`, [artisan]);
      return null;
    } catch (e) { return (e as Error).message; }
    finally { await db.query("rollback to savepoint essai_date"); }
  }
  it("refuse une émission future même par insertion directe", async () => {
    expect(await deposer("current_date + 2", "current_date + 365")).toMatch(/futur/);
  });
  it("refuse la fin de validité antérieure à l’émission", async () => {
    expect(await deposer("current_date - 2", "current_date - 3")).toMatch(/précéder/);
  });
  it("accepte un document correctement daté", async () => {
    expect(await deposer("current_date - 2", "current_date + 365")).toBeNull();
  });
});
