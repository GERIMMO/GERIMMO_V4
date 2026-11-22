/**
 * BAIL DÉJÀ EN COURS : DPE CLASSÉ G EN ALERTE, ET PLUS D'ALERTE D'ÉTAT DES LIEUX D'ENTRÉE POUR UN BAIL REPRIS —
 * décisions 2B et 3A du dirigeant, 22/11/2026 (migration 20261122090000_bail_repris_dpe_g_et_edl_entree.sql).
 *
 * Le DPE classé G lui-même est éprouvé dans tests/bail-deja-en-cours-base.test.ts (bail du jour bloqué, bail déjà en
 * cours activé). Ce que ces tests tiennent, en base, le jour de Paris FIGÉ au 20/11/2026 :
 *  1. un bail repris en cours (entré avant novembre) s'active SANS alerte « État des lieux d'entrée » ;
 *  2. un bail entré plus tôt ce mois-ci la reçoit toujours, datée de son entrée ;
 *  3. la règle de l'alerte est celle de la date de bascule : pas d'alerte ⇔ `loyers_suivis_depuis` renseignée ;
 *  4. rejeu de la migration ; retour arrière exact ; retour tolérant si celui du 20/11 est déjà passé ; définition
 *     inattendue refusée.
 *
 * Nécessite SUPABASE_DB_URL (base de test locale). Transaction annulée après chaque test.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const NOM = "20261122090000_bail_repris_dpe_g_et_edl_entree";
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
const RETOUR_DU_20 = readFileSync("supabase/retours-arriere/20261120190000_bail_deja_en_cours.retour.sql", "utf8");
const LISEZ_MOI = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");

const JOUR = "2026-11-20";

describe("la migration et son retour, à la lecture", () => {
  it("la migration nomme son retour, et le LISEZ-MOI des retours le recense, avant celui du 20/11", () => {
    expect(MIGRATION).toContain(`supabase/retours-arriere/${NOM}.retour.sql`);
    expect(LISEZ_MOI).toContain(`${NOM}.retour.sql`);
    const chaine = LISEZ_MOI.slice(LISEZ_MOI.indexOf("Ordre complet si tout doit être défait"));
    expect(chaine.indexOf("`20261122090000`")).toBeGreaterThan(-1);
    expect(chaine.indexOf("`20261122090000`")).toBeLessThan(chaine.indexOf("`20261120200000`"));
  });

  it("aucune ligne n'est écrite, modifiée ni effacée ; lot_blocages_location n'est pas redéfinie", () => {
    for (const sql of [MIGRATION, RETOUR]) {
      expect(sql).not.toMatch(/\bupdate\s+public\.\w+\s+set\b/i);
      expect(sql).not.toMatch(/\b(?:insert\s+into|truncate|alter\s+table|drop\s+table)\b/i);
      expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.lot_blocages_location\b/i);
    }
    expect(MIGRATION).not.toMatch(/\bdelete\s+from\b/i);
    expect(RETOUR.match(/\bdelete\s+from\b/gi)).toHaveLength(1);
    expect(RETOUR).toContain("delete from supabase_migrations.schema_migrations where version = '20261122090000'");
  });

  it("activer_bail est corrigée en relisant sa définition, sans appeler de fonction de la migration du 20/11 au soir", () => {
    expect(MIGRATION).toContain("pg_get_functiondef('public.activer_bail(uuid)'::regprocedure)");
    expect(MIGRATION).toContain("if position('Décision 3A du 22/11/2026' in v_def) > 0 then return; end if;");
    const correctif = MIGRATION.slice(MIGRATION.indexOf("$nouveau$"), MIGRATION.lastIndexOf("$nouveau$"));
    expect(correctif).not.toContain("premier_mois_suivi");
    expect(correctif).toContain("public.aujourdhui_paris()");
  });
});

describe.skipIf(!DB_URL)("Bail repris en cours : l'alerte « État des lieux d'entrée »", () => {
  let db: Client;
  let org: string;
  let compte: string;
  let bailleur: string;
  let locataire: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  async function enTantQuePostgres() {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  }
  async function simuler(uid: string) {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await db.query(`set local role authenticated`);
  }
  async function refus(sql: string, params: unknown[] = []): Promise<string> {
    await db.query("savepoint essai");
    try {
      await db.query(sql, params);
      await db.query("release savepoint essai");
      return "";
    } catch (e) {
      await db.query("rollback to savepoint essai");
      return (e as Error).message;
    }
  }
  async function nousSommesLe(jour: string) {
    await enTantQuePostgres();
    await db.query(`create or replace function public.aujourdhui_paris() returns date language sql stable set search_path = '' as $$ select date '${jour}' $$`);
  }

  beforeEach(async () => {
    await db.query("begin");
    await nousSommesLe(JOUR);
    const { rows: [o] } = await db.query(
      `insert into public.organizations (name, status, type) values ('Bail repris', 'active', 'proprietaire_direct') returning id`);
    org = o.id;
    const { rows: [u] } = await db.query(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
        'test-edl-repris-'||gen_random_uuid()||'@test.local','x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
      returning id`);
    compte = u.id;
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'proprietaire_direct')`, [compte, org]);
    const { rows } = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Bailleur'),($1,'Locataire') returning id, nom`, [org]);
    bailleur = rows.find((p) => p.nom === "Bailleur")!.id;
    locataire = rows.find((p) => p.nom === "Locataire")!.id;
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  /** Un bail en brouillon sur un logement neuf (jamais mis en location, sans diagnostic, détenu à 100 %). */
  async function brouillon(entree: string): Promise<string> {
    await simuler(compte);
    const { rows: [{ id: bien }] } = await db.query(
      `select public.creer_bien_avec_lot($1,'12 rue des Lilas','appartement'::public.bien_type,
         '12 rue des Lilas', null, '33000','Bordeaux',1998,false,45,2) as id`, [org]);
    await enTantQuePostgres();
    const { rows: [{ id: lot }] } = await db.query(`select id from public.lots where bien_id = $1`, [bien]);
    await db.query(`delete from public.detentions where lot_id = $1`, [lot]);
    await db.query(`insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`, [lot, org, bailleur]);
    const { rows: [{ id }] } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, charges, jour_echeance, date_debut)
       values ($1,$2,$3,700,50,5,$4::date) returning id`, [org, lot, locataire, entree]);
    return id;
  }
  async function deposerContrat(bail: string): Promise<string> {
    await enTantQuePostgres();
    const { rows: [{ id: document }] } = await db.query(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte, deposited_by)
       values ($1,'bail','Bail signé', $1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',1000,'e-'||gen_random_uuid(),$2)
       returning id`, [org, compte]);
    await simuler(compte);
    const r = await refus(`select public.activer_bail_papier($1,$2,$3)`, [org, bail, document]);
    await enTantQuePostgres();
    return r;
  }
  const alertesEdl = async (bail: string) => (await db.query(
    `select to_char(echeance,'YYYY-MM-DD') as echeance from public.alerts
      where organization_id=$1 and type='edl_entree' and details->>'bail_id'=$2`, [org, bail])).rows as { echeance: string }[];
  const depuis = async (bail: string) => (await db.query(
    `select etat::text, to_char(loyers_suivis_depuis,'YYYY-MM-DD') as depuis from public.baux where id=$1`, [bail])).rows[0] as { etat: string; depuis: string | null };

  it("un bail entré le 01/11/2024, activé le 20/11/2026, ne reçoit pas l'alerte « État des lieux d'entrée »", async () => {
    const bail = await brouillon("2024-11-01");
    expect(await deposerContrat(bail)).toBe("");
    expect(await depuis(bail)).toEqual({ etat: "actif", depuis: "2026-11-01" });
    expect(await alertesEdl(bail)).toEqual([]);
  });

  it("entré le dernier jour du mois précédent : repris lui aussi, pas d'alerte", async () => {
    const bail = await brouillon("2026-10-31");
    expect(await deposerContrat(bail)).toBe("");
    expect((await depuis(bail)).depuis).toBe("2026-11-01");
    expect(await alertesEdl(bail)).toEqual([]);
  });

  it("entré plus tôt ce mois-ci : l'alerte est posée, datée de l'entrée, comme avant", async () => {
    const bail = await brouillon("2026-11-03");
    expect(await deposerContrat(bail)).toBe("");
    expect(await depuis(bail)).toEqual({ etat: "actif", depuis: null });
    expect(await alertesEdl(bail)).toEqual([{ echeance: "2026-11-03" }]);
  });

  it("l'alerte et la date de bascule disent la même chose, quel que soit le jour de l'activation", async () => {
    for (const [entree, jour] of [["2026-11-03", "2026-11-30"], ["2026-11-03", "2026-12-01"], ["2025-01-10", "2026-01-31"], ["2025-12-31", "2026-01-01"]] as const) {
      await db.query("savepoint cas");
      await nousSommesLe(jour);
      const bail = await brouillon(entree);
      expect(await deposerContrat(bail), `${entree} activé le ${jour}`).toBe("");
      const repris = (await depuis(bail)).depuis !== null;
      expect((await alertesEdl(bail)).length === 0, `${entree} activé le ${jour}`).toBe(repris);
      expect(repris, `${entree} activé le ${jour}`).toBe(entree.slice(0, 7) < jour.slice(0, 7));
      await db.query("rollback to savepoint cas");
    }
  });

  const empreintes = async () => (await db.query(
    `select p.proname, md5(pg_get_functiondef(p.oid)) as empreinte, p.proacl::text as droits
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('activer_bail','bail_blocages_mise_en_location','lot_blocages_location','controler_mise_en_location')
      order by 1`)).rows as { proname: string; empreinte: string; droits: string | null }[];
  const definition = async (signature: string) =>
    (await db.query(`select pg_get_functiondef($1::regprocedure) as def`, [signature])).rows[0].def as string;

  it("la migration se rejoue sans effet", async () => {
    await enTantQuePostgres();
    const avant = await empreintes();
    await db.query(MIGRATION);
    await db.query(MIGRATION);
    expect(await empreintes()).toEqual(avant);
  });

  it("le retour rend activer_bail et le filtre à leur forme d'avant, se rejoue ; puis la migration revient au même état", async () => {
    await enTantQuePostgres();
    const migre = await empreintes();
    await db.query(RETOUR);
    const revenu = await empreintes();
    expect(await definition("public.activer_bail(uuid)")).not.toContain("Décision 3A");
    expect(await definition("public.bail_blocages_mise_en_location(uuid)")).not.toContain("DPE classe G");
    // Fonctions inchangées par l'aller comme par le retour, et droits des deux autres conservés.
    for (const nom of ["lot_blocages_location", "controler_mise_en_location"]) {
      expect(revenu.find((f) => f.proname === nom), nom).toEqual(migre.find((f) => f.proname === nom));
    }
    for (const nom of ["activer_bail", "bail_blocages_mise_en_location"]) {
      expect(revenu.find((f) => f.proname === nom)!.droits, nom).toBe(migre.find((f) => f.proname === nom)!.droits);
    }
    await db.query(RETOUR);
    expect(await empreintes()).toEqual(revenu);

    // Après le retour, le bail repris reçoit de nouveau l'alerte.
    const bail = await brouillon("2024-11-01");
    expect(await deposerContrat(bail)).toBe("");
    expect(await alertesEdl(bail)).toEqual([{ echeance: "2024-11-01" }]);

    await enTantQuePostgres();
    await db.query(MIGRATION);
    expect(await empreintes()).toEqual(migre);
  });

  it("joué après le retour du 20/11, le retour ne recrée pas la fonction que celui-ci a retirée", async () => {
    await enTantQuePostgres();
    await db.query(RETOUR_DU_20);
    expect(await refus(RETOUR)).toBe("");
    const { rows: [{ n }] } = await db.query(
      `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname='bail_blocages_mise_en_location'`);
    expect(n).toBe(0);
    expect(await definition("public.activer_bail(uuid)")).not.toContain("Décision 3A");
  });

  it("une définition inattendue de activer_bail arrête la migration avec un message qui dit où, sans rien changer", async () => {
    await enTantQuePostgres();
    await db.query(RETOUR);
    const def = await definition("public.activer_bail(uuid)");
    await db.query(def.replace("where e.bail_id = p_bail and e.type = 'entree' and e.etat = 'signe'", "where e.bail_id = p_bail and e.etat = 'signe' and e.type = 'entree'"));
    const avant = await empreintes();
    expect(await refus(MIGRATION)).toMatch(/Décision 3A : définition inattendue de activer_bail/);
    expect(await empreintes()).toEqual(avant);
  });
});
