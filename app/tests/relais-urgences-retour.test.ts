/**
 * D46-B, suite (décision du 15/10/2026, « envoi immédiat pour les urgences ») — la file en panne et le retour arrière.
 *
 *  — une erreur de la file (ici, une contrainte qui refuse toute ligne) n'empêche JAMAIS l'alerte d'être posée : le
 *    déclencheur la rattrape ; l'e-mail de 5 h rappelle quand même l'urgence (« hors file ») ;
 *  — le retour arrière (20261014811000_relais_urgences_immediates.retour.sql) retire le déclencheur, les six fonctions et
 *    les deux tables, laisse les alertes intactes et la pose d'une alerte possible ; il se rejoue sans effet ; la
 *    migration se rejoue ensuite et tout revient.
 *
 * Ces essais posent des verrous de table (contrainte sur la file, déclencheur retiré de `supervision_alertes_internes`)
 * tenus jusqu'à la fin de leur transaction : le fichier tourne en série (vitest.config.ts, FICHIERS_EN_SERIE).
 * Nécessite SUPABASE_DB_URL (base locale jetable). Chaque cas est joué dans une transaction annulée.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const MIGRATION = readFileSync("supabase/migrations/20261014811000_relais_urgences_immediates.sql", "utf8");
const RETOUR = readFileSync("supabase/retours-arriere/20261014811000_relais_urgences_immediates.retour.sql", "utf8");
/** Le retour sans sa garde de transaction ni son begin/commit : joué dans la transaction du test, annulée à la fin. */
const RETOUR_DANS_LE_TEST = RETOUR
  .replace(/do \$retour_arriere\$\s*begin\s*if statement_timestamp\(\) <> transaction_timestamp\(\)[\s\S]*?end \$retour_arriere\$;/, "")
  .replace(/^begin;$/m, "")
  .replace(/^commit;$/m, "");

let db: Client;

async function service() {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
  await db.query("set local role service_role");
}
async function proprietaire() {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', '', true)`);
}
async function agir(id: string) {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text, true)", [id]);
  await db.query("set local role authenticated");
}
async function compte(): Promise<string> {
  await proprietaire();
  const { rows: [u] } = await db.query<{ id: string }>(
    `insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
     values(gen_random_uuid(),'authenticated','authenticated','retour-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}') returning id`
  );
  return u.id;
}
async function planActif() {
  const createur = await compte();
  const responsable = await compte();
  await proprietaire();
  await db.query("insert into memberships(account_id,organization_id,role,status) values($1,null,'super_admin','active'),($2,null,'super_admin','active')", [createur, responsable]);
  await agir(createur);
  const { rows: [p] } = await db.query<{ id: string }>(
    "select enregistrer_vacances(null,'Vacances TEST',now()-interval '1 hour',now()+interval '1 day','Europe/Paris',$1,null,60) id", [responsable]
  );
  return { createur, plan: p.id };
}
async function signaler(createur: string, plan: string, cle: string) {
  await agir(createur);
  const { rows: [r] } = await db.query<{ id: string }>("select signaler_urgence_vacances($1,$2,'Urgence fictive') id", [plan, cle]);
  return r.id;
}
async function objets() {
  await proprietaire();
  const { rows: [o] } = await db.query<{ tables: number; fonctions: number; declencheur: number }>(
    `select (select count(*)::int from pg_class where oid in (coalesce(to_regclass('public.relais_urgences'), 0), coalesce(to_regclass('public.relais_urgences_envois'), 0))) as tables,
            (select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace and proname in
              ('nature_urgence_relais','relais_urgence_a_envoyer','prendre_urgences_relais','terminer_urgences_relais','urgences_relais_recentes','urgences_relais_au_quotidien')) as fonctions,
            (select count(*)::int from pg_trigger where tgrelid = 'public.supervision_alertes_internes'::regclass and tgname = 'relais_urgence_a_envoyer') as declencheur`
  );
  return o;
}

describe.skipIf(!DB_URL)("D46-B — e-mail immédiat des urgences : file en panne et retour arrière", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => { await db.query("begin"); });
  afterEach(async () => { await db.query("rollback"); });

  it("une erreur de la file n'empêche jamais l'alerte d'être posée ; l'e-mail de 5 h la rappelle « hors file »", async () => {
    const { createur, plan } = await planActif();
    await proprietaire();
    // La file refuse toute ligne le temps de l'essai (transaction annulée à la fin).
    await db.query("alter table public.relais_urgences add constraint essai_refus check (false) not valid");
    const id = await signaler(createur, plan, "incident-file-en-panne");
    await proprietaire();
    expect((await db.query("select count(*)::int n from supervision_alertes_internes where id=$1", [id])).rows[0].n).toBe(1);
    expect((await db.query("select count(*)::int n from public.relais_urgences where alerte_id=$1", [id])).rows[0].n).toBe(0);
    await service();
    const { rows: [{ r }] } = await db.query<{ r: { urgences: { alerte: string; nature: string; email: string }[] } }>("select public.urgences_relais_recentes() r");
    expect(r.urgences.find((u) => u.alerte === id)).toMatchObject({ nature: "signalement_manuel", email: "hors_file" });
  });

  it("le retour arrière retire tout, garde les alertes, se rejoue sans effet ; la migration rejouée remet tout", async () => {
    const { createur, plan } = await planActif();
    const avant = await signaler(createur, plan, "incident-avant-retour");
    expect(await objets()).toEqual({ tables: 2, fonctions: 6, declencheur: 1 });
    await proprietaire();
    await db.query(RETOUR_DANS_LE_TEST);
    expect(await objets()).toEqual({ tables: 0, fonctions: 0, declencheur: 0 });
    // Les alertes sont intactes, et la pose d'une alerte reste possible sans la file.
    const apres = await signaler(createur, plan, "incident-apres-retour");
    await proprietaire();
    expect((await db.query("select count(*)::int n from supervision_alertes_internes where id = any($1::uuid[])", [[avant, apres]])).rows[0].n).toBe(2);
    // Rejoué : sans effet ni erreur.
    await db.query(RETOUR_DANS_LE_TEST);
    expect(await objets()).toEqual({ tables: 0, fonctions: 0, declencheur: 0 });
    // La marche avant : tout revient, et une alerte nouvelle entre de nouveau dans la file.
    await db.query(MIGRATION);
    expect(await objets()).toEqual({ tables: 2, fonctions: 6, declencheur: 1 });
    const nouvelle = await signaler(createur, plan, "incident-apres-reprise");
    await proprietaire();
    expect((await db.query("select alerte_id from public.relais_urgences")).rows).toEqual([{ alerte_id: nouvelle }]);
  });

  it("le retour refuse d'être joué dans un lot déjà ouvert (migrations.yml, begin;)", async () => {
    await proprietaire();
    await db.query("savepoint e");
    let message = "";
    try {
      await db.query(RETOUR);
    } catch (err) {
      message = (err as Error).message;
    }
    await db.query("rollback to savepoint e");
    expect(message).toMatch(/Retour arrière refusé : ce script gère sa propre transaction/);
  });
});
