/**
 * M16 (audit du 19/10/2026) — les demandes de contact du site vitrine dans l'e-mail de 5 h du relais : la base.
 *
 * `public.demandes_contact_en_attente()` (migration 20261019122000_relais_point_demandes_contact.sql) rend deux
 * nombres : les demandes de `demandes_devis` non traitées (`traitee_le` nul) et, parmi elles, celles reçues il y a plus
 * de 48 h. Jamais un nom, une adresse, un téléphone ni un message. Réservée au traitement (service_role), comme les
 * autres lectures du relais ; fermée à `anon` et `authenticated`.
 *
 * Le déclencheur `demandes_devis_limiter` force `created_at` à l'instant de l'insertion : l'ancienneté d'une demande se
 * pose ensuite, en propriétaire de la base, le temps de la transaction du cas.
 *
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

const CHEMIN_MIGRATION = "supabase/migrations/20261019122000_relais_point_demandes_contact.sql";
const CHEMIN_RETOUR = "supabase/retours-arriere/20261019122000_relais_point_demandes_contact.retour.sql";
const FONCTION = "public.demandes_contact_en_attente()";

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
async function agir(id: string, aal = "aal2") {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated','aal',$2::text)::text, true)", [id, aal]);
  await db.query("set local role authenticated");
}
async function refusee(sql: string, params: unknown[] = []): Promise<string> {
  await db.query("savepoint e");
  try {
    await db.query(sql, params);
    await db.query("release savepoint e");
    return "";
  } catch (err) {
    await db.query("rollback to savepoint e");
    return (err as Error).message;
  }
}
async function compte(): Promise<string> {
  await proprietaire();
  const { rows: [u] } = await db.query<{ id: string }>(
    `insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
     values(gen_random_uuid(),'authenticated','authenticated','contact-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}') returning id`
  );
  return u.id;
}
/** Une demande du formulaire, telle que l'action serveur l'écrit ; `depuis` recule ensuite sa date de réception. */
async function demande(numero: number, depuis: string | null = null): Promise<string> {
  await proprietaire();
  const { rows: [d] } = await db.query<{ id: string }>(
    `insert into public.demandes_devis(nom, email, agence, telephone, nb_lots, message)
     values ('Visiteur fictif', $1, 'Agence fictive', '0100000000', '12', $2) returning id`,
    [`contact-${numero}@example.invalid`, `Message fictif numéro ${numero}`]
  );
  if (depuis) await db.query("update public.demandes_devis set created_at = now() - $2::interval where id = $1", [d.id, depuis]);
  return d.id;
}
type Comptage = { en_attente: number; depuis_plus_de_48h: number };
async function compter(): Promise<Comptage> {
  await service();
  const { rows: [{ c }] } = await db.query<{ c: Comptage }>(`select ${FONCTION} as c`);
  return c;
}

describe.skipIf(!DB_URL)("M16 — demandes de contact du site vitrine comptées pour le relais : la base", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query("begin");
    // Le cas part d'une file vide ; tout est annulé à la fin.
    await proprietaire();
    await db.query("delete from public.demandes_devis");
  });
  afterEach(async () => { await db.query("rollback"); });

  it("aucune demande : deux zéros, des nombres", async () => {
    expect(await compter()).toEqual({ en_attente: 0, depuis_plus_de_48h: 0 });
    await service();
    const { rows } = await db.query<{ cle: string; type: string }>(`select e.key as cle, jsonb_typeof(e.value) as type from jsonb_each(${FONCTION}) e order by 1`);
    expect(rows).toEqual([{ cle: "depuis_plus_de_48h", type: "number" }, { cle: "en_attente", type: "number" }]);
  });

  it("une demande marquée traitée (par le super-administrateur permanent) n'est plus comptée", async () => {
    const id = await demande(1, "5 days");
    expect(await compter()).toEqual({ en_attente: 1, depuis_plus_de_48h: 1 });
    const superviseur = await compte();
    await proprietaire();
    await db.query("insert into memberships(account_id,organization_id,role,status) values($1,null,'super_admin','active')", [superviseur]);
    await agir(superviseur);
    const { rows: [{ t }] } = await db.query<{ t: boolean }>("select public.demande_devis_traitee($1) as t", [id]);
    expect(t).toBe(true);
    expect(await compter()).toEqual({ en_attente: 0, depuis_plus_de_48h: 0 });
  });

  it("deux demandes non traitées dont une reçue il y a plus de 48 h : « 2 (dont 1 … 48 h) », sans aucune donnée de la demande", async () => {
    await demande(1);
    await demande(2, "3 days");
    expect(await compter()).toEqual({ en_attente: 2, depuis_plus_de_48h: 1 });
    await service();
    const { rows: [{ brut }] } = await db.query<{ brut: string }>(`select ${FONCTION}::text as brut`);
    expect(brut).not.toContain("@");
    expect(brut).not.toContain("Visiteur");
    expect(brut).not.toContain("Message fictif");
    expect(brut).not.toContain("0100000000");
    // Le seuil est une durée depuis maintenant : à 47 h, la demande attend mais n'est pas « depuis plus de 48 h ».
    await demande(3, "47 hours");
    expect(await compter()).toEqual({ en_attente: 3, depuis_plus_de_48h: 1 });
  });

  it("réservée au traitement : ni anon, ni authenticated, ni un compte connecté ne l'appellent", async () => {
    await proprietaire();
    for (const [role, attendu] of [["anon", false], ["authenticated", false], ["service_role", true]] as const) {
      const { rows: [{ peut }] } = await db.query<{ peut: boolean }>("select has_function_privilege($1, $2, 'EXECUTE') as peut", [role, FONCTION]);
      expect(peut, role).toBe(attendu);
    }
    // Le propriétaire de la base a le droit d'exécution, mais la garde interne refuse hors traitement.
    expect(await refusee(`select ${FONCTION}`)).toMatch(/Accès réservé au traitement/);
    const agent = await compte();
    await agir(agent);
    expect(await refusee(`select ${FONCTION}`)).toMatch(/permission denied|Accès réservé au traitement/);
  });

  it("se rejoue sans effet ni erreur : les demandes restent, la fonction reste fermée à anon", async () => {
    await demande(1, "3 days");
    await demande(2);
    await proprietaire();
    const migration = readFileSync(CHEMIN_MIGRATION, "utf8");
    await db.query(migration);
    await db.query(migration);
    expect(await compter()).toEqual({ en_attente: 2, depuis_plus_de_48h: 1 });
    await proprietaire();
    const { rows: [{ anon, svc }] } = await db.query<{ anon: boolean; svc: boolean }>(
      "select has_function_privilege('anon', $1, 'EXECUTE') as anon, has_function_privilege('service_role', $1, 'EXECUTE') as svc", [FONCTION]
    );
    expect(anon).toBe(false);
    expect(svc).toBe(true);
  });

  // Relecture du 19/10 : le retour borne l'attente de verrou (un passage de 5 h qui exécuterait la fonction au même
  // instant ne le ferait pas attendre indéfiniment), supprime la fonction, retire sa seule version d'historique, se rejoue.
  it("le retour arrière borne l'attente de verrou (10 s) avant le drop, supprime la fonction et sa version d'historique, se rejoue, puis la migration se réapplique", async () => {
    const retour = readFileSync(CHEMIN_RETOUR, "utf8");
    const code = retour.replace(/^--.*$/gm, "");
    expect(code).toMatch(/set local lock_timeout = '10s';/);
    expect(code.indexOf("set local lock_timeout")).toBeLessThan(code.indexOf("drop function if exists public.demandes_contact_en_attente()"));
    // Sans COMMIT interne : il se joue dans la transaction contrôlée (psql --single-transaction), ici celle du cas.
    expect(code).not.toMatch(/^\s*(begin|commit)\s*;/im);

    await demande(1, "3 days");
    await proprietaire();
    await db.query("create schema if not exists supabase_migrations");
    await db.query("create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[])");
    await db.query("insert into supabase_migrations.schema_migrations (version, name) values ('20261019122000', 'relais_point_demandes_contact'), ('20261018231827', 'abonnement_jour_paris') on conflict do nothing");
    await db.query(retour);
    expect((await db.query("select current_setting('lock_timeout') as v")).rows[0].v).toBe("10s");
    expect((await db.query("select to_regprocedure($1) is null as retiree", [FONCTION])).rows[0].retiree).toBe(true);
    const versions = async () => (await db.query("select version from supabase_migrations.schema_migrations where version in ('20261019122000','20261018231827') order by 1")).rows.map((r) => r.version);
    expect(await versions()).toEqual(["20261018231827"]);
    // Rejouable : rien à faire, aucune erreur.
    await db.query(retour);
    expect((await db.query("select to_regprocedure($1) is null as retiree", [FONCTION])).rows[0].retiree).toBe(true);
    // La migration se réapplique ensuite et compte à nouveau ; la demande n'a pas bougé.
    await db.query(readFileSync(CHEMIN_MIGRATION, "utf8"));
    expect(await compter()).toEqual({ en_attente: 1, depuis_plus_de_48h: 1 });
  });
});
