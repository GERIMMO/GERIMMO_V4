import { randomInt, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe.skipIf(!url)("Activation artisan — identité réelle et politique Storage", () => {
  let db: Client, artisan: string, compteArtisan: string, sansArtisan: string;
  async function identite(id: string | null) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [id]);
    await db.query("set local role authenticated");
  }
  async function actif(code = "clients") {
    return (await db.query("select public.artisan_module_actif($1) actif", [code])).rows[0].actif;
  }
  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect(); await db.query("begin");
    // Prévisualisation transactionnelle : la définition précédente revient au rollback.
    await db.query(await readFile("supabase/migrations/20261012225000_garde_activation_artisan.sql", "utf8"));
    await db.query("update public.artisan_modules_locaux set actif=true");
    compteArtisan = randomUUID(); sansArtisan = randomUUID();
    for (const id of [compteArtisan, sansArtisan]) await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,'x',now())", [id, `activation-${id}@example.invalid`]);
    artisan = (await db.query("insert into public.artisans(account_id,raison_sociale,siret,telephone) values($1,'TEST activation',$2,'0600000000') returning id", [compteArtisan, String(randomInt(10000000000000,99999999999999))])).rows[0].id;
  });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("reset role"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  it("un artisan réel lit les activations et un code inconnu reste fermé", async () => {
    await identite(compteArtisan);
    expect(await actif()).toBe(true); expect(await actif("reglements")).toBe(true); expect(await actif("inconnu")).toBe(false);
  });
  it("un compte authentifié sans artisan ne lit aucun switch actif", async () => {
    await identite(sansArtisan);
    expect(await actif()).toBe(false); expect(await actif("reglements")).toBe(false);
  });
  it("le rôle authenticated sans identité reste fermé", async () => {
    await identite(null); expect(await actif()).toBe(false);
  });
  it("aucun appel anonyme n’est accordé", async () => {
    const r = await db.query("select has_function_privilege('anon','public.artisan_module_actif(text)','execute') anon, has_function_privilege('authenticated','public.artisan_module_actif(text)','execute') connecte");
    expect(r.rows[0]).toEqual({ anon: false, connecte: true });
  });
  it("une désactivation ferme le prédicat même pour l’artisan réel", async () => {
    await db.query("update public.artisan_modules_locaux set actif=false");
    await identite(compteArtisan); expect(await actif()).toBe(false);
  });
  it("la politique Storage conserve le dépôt propre à l’artisan", async () => {
    await identite(compteArtisan);
    const name = `${artisan}/${randomUUID()}.pdf`;
    await db.query("insert into storage.objects(bucket_id,name,owner,metadata) values('artisan-prive',$1,$2,$3)", [name, compteArtisan, { size: 100, mimetype: "application/pdf" }]);
    expect((await db.query("select name from storage.objects where bucket_id='artisan-prive' and name=$1", [name])).rows).toHaveLength(1);
  });
  it("la politique Storage refuse le dépôt d’un compte sans artisan", async () => {
    await identite(sansArtisan);
    await expect(db.query("insert into storage.objects(bucket_id,name,owner,metadata) values('artisan-prive',$1,$2,$3)", [`${artisan}/${randomUUID()}.pdf`, sansArtisan, { size: 100, mimetype: "application/pdf" }])).rejects.toThrow(/row-level security|Accès|compte/i);
  });
});
