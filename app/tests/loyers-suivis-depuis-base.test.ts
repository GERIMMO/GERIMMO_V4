/**
 * UN BAIL REPRIS EN COURS NE RÉCLAME PAS LES LOYERS D'AVANT SON ARRIVÉE SUR GERIMMO — date de bascule, 20/11/2026
 * (migration 20261120200000_loyers_suivis_depuis.sql).
 *
 * Le défaut constaté sur le banc : depuis la décision B (un bail déjà en cours s'active par son contrat signé), un bail
 * entré le 01/11/2024 recevait à la première génération de l'échéancier 25 termes d'un coup, 18 750 € « impayés ».
 *
 * Ce que ces tests tiennent, en base, le jour de Paris FIGÉ au 20/11/2026 :
 *  1. la règle (`premier_mois_suivi`), identique à l'écran (lib/baux.ts) ;
 *  2. un bail entré deux ans plus tôt : premier mois suivi = mois de l'activation, UN terme, mois plein ;
 *  3. sans date de bascule, rien ne change : 25 termes (c'est le défaut, et c'est ce que gardent les baux d'avant) ;
 *  4. un bail activé le mois de son entrée garde son prorata d'entrée ; aujourd'hui ou plus tard : rien n'est posé ;
 *  5. le mois suivant, le cycle du 1er ajoute le terme suivant, sans jamais revenir en arrière ;
 *  6. terme échu : l'échéance du premier terme suivi tombe le mois d'après ;
 *  7. la valeur ne s'écrit pas à la main sur un bail signé, et se recalcule à chaque activation (« Corriger ») ;
 *  8. droits ; rejeu de la migration ; retour arrière exact, refusé tant qu'un bail porte une date de bascule.
 *
 * Nécessite SUPABASE_DB_URL (base de test locale). Transaction annulée après chaque test.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { moisEnClair, premierMoisSuivi } from "../src/lib/baux";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const NOM = "20261120200000_loyers_suivis_depuis";
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
const LISEZ_MOI = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");

/** Le jour de Paris des essais : un 20 du mois, pour qu'« avant ce mois », « ce mois-ci » et « plus tard » existent tous. */
const JOUR = "2026-11-20";
const CE_MOIS = "2026-11-01";

describe("la migration et son retour, à la lecture", () => {
  it("la migration nomme son retour, et le LISEZ-MOI des retours le recense", () => {
    expect(MIGRATION).toContain(`supabase/retours-arriere/${NOM}.retour.sql`);
    expect(LISEZ_MOI).toContain(`${NOM}.retour.sql`);
  });

  it("premier_mois_suivi cite le jour de Paris : son retour ouvre la chaîne « Ordre complet », avant celui de la décision B", () => {
    const chaine = LISEZ_MOI.slice(LISEZ_MOI.indexOf("Ordre complet si tout doit être défait"));
    expect(chaine.indexOf("`20261120200000`")).toBeGreaterThan(-1);
    expect(chaine.indexOf("`20261120200000`")).toBeLessThan(chaine.indexOf("`20261120190000`"));
  });

  it("aucune ligne n'est écrite, modifiée ni effacée ; activer_bail et le cycle mensuel ne sont pas redéfinis", () => {
    for (const sql of [MIGRATION, RETOUR]) {
      expect(sql).not.toMatch(/\bupdate\s+public\.\w+\s+set\b/i);
      expect(sql).not.toMatch(/\b(?:insert\s+into|truncate|drop\s+table)\b/i);
      expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.(?:activer_bail|cycle_mensuel_interne|generer_appels_loyer)\s*\(/i);
    }
    expect(MIGRATION).not.toMatch(/\bdelete\s+from\b/i);
    // Le seul effacement du retour : sa propre ligne dans l'historique des migrations.
    expect(RETOUR.match(/\bdelete\s+from\b/gi)).toHaveLength(1);
    expect(RETOUR).toContain("delete from supabase_migrations.schema_migrations where version = '20261120200000'");
  });

  it("le générateur est corrigé en relisant sa définition, avec une marque qui rend le rejeu sans effet", () => {
    expect(MIGRATION).toContain("pg_get_functiondef('public.generer_appels_loyer_interne(uuid)'::regprocedure)");
    expect(MIGRATION).toContain("if position('Date de bascule (20/11/2026)' in v_def) > 0 then return; end if;");
  });
});

describe.skipIf(!DB_URL)("Date de bascule : les loyers d'un bail repris en cours", () => {
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
  async function simuler(uid: string | null, role = "authenticated") {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [uid ? JSON.stringify({ sub: uid, role: "authenticated" }) : ""]);
    await db.query(`set local role ${role}`);
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
  /** Le jour de Paris figé : la fonction est remplacée dans la transaction du test, annulée avec lui. */
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
        'test-bascule-'||gen_random_uuid()||'@test.local','x', now(),
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

  /** Un logement tel qu'il sort de sa création : « brouillon », jamais mis en location, sans diagnostic, détenu à 100 %. */
  async function logement(): Promise<string> {
    await simuler(compte);
    const { rows: [{ id: bien }] } = await db.query(
      `select public.creer_bien_avec_lot($1,'12 rue des Lilas','appartement'::public.bien_type,
         '12 rue des Lilas', null, '33000','Bordeaux',1998,false,45,2) as id`, [org]);
    await enTantQuePostgres();
    const { rows: [{ id: lot }] } = await db.query(`select id from public.lots where bien_id = $1`, [bien]);
    await db.query(`delete from public.detentions where lot_id = $1`, [lot]);
    await db.query(`insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`, [lot, org, bailleur]);
    return lot;
  }
  /** Un brouillon à 700 € + 50 € de charges, payable le 5. */
  async function brouillon(entree: string, champs: { echu?: boolean } = {}): Promise<string> {
    const lot = await logement();
    const { rows: [{ id }] } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, charges, jour_echeance, date_debut, paiement_echeance)
       values ($1,$2,$3,700,50,5,$4::date,$5) returning id`,
      [org, lot, locataire, entree, champs.echu ? "echu" : "echoir"]);
    return id;
  }
  /** Le geste du propriétaire : le contrat signé est rangé, puis déposé sous son identité. Rend le refus, ou « » si accepté. */
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
  const bascule = async (bail: string) => (await db.query(
    `select etat::text, to_char(loyers_suivis_depuis,'YYYY-MM-DD') as depuis from public.baux where id=$1`, [bail])).rows[0] as { etat: string; depuis: string | null };
  /** « Générer l'échéancier », par le propriétaire. Rend le nombre de termes créés. */
  async function genererEcheancier(bail: string): Promise<number> {
    await simuler(compte);
    const { rows: [{ n }] } = await db.query(`select public.generer_appels_loyer($1) as n`, [bail]);
    await enTantQuePostgres();
    return n;
  }
  const termes = async (bail: string) => (await db.query(
    `select to_char(periode,'YYYY-MM-DD') as periode, loyer_hc::float8 as loyer, charges::float8 as charges, montant_du::float8 as du,
            to_char(date_echeance,'YYYY-MM-DD') as echeance, prorata
       from public.appels_loyer where bail_id=$1 order by periode`, [bail])).rows as { periode: string; loyer: number; charges: number; du: number; echeance: string; prorata: boolean }[];

  // ── 1. La règle ─────────────────────────────────────────────────────────────────────────────────────
  it("premier mois suivi : le mois en cours quand le mois d'entrée est passé, rien sinon ; l'écran dit la même chose que la base", async () => {
    for (const [entree, attendu] of [
      ["2024-11-01", CE_MOIS], ["2026-01-15", CE_MOIS], ["2026-10-31", CE_MOIS],
      ["2026-11-01", null], ["2026-11-19", null], ["2026-11-20", null], ["2026-11-21", null], ["2026-12-01", null], ["2027-03-10", null],
    ] as const) {
      const { rows: [r] } = await db.query(`select to_char(public.premier_mois_suivi($1::date),'YYYY-MM-DD') as base`, [entree]);
      expect(r.base, `base, entrée le ${entree}`).toBe(attendu);
      expect(premierMoisSuivi(entree, JOUR), `écran, entrée le ${entree}`).toBe(attendu);
    }
    expect((await db.query(`select public.premier_mois_suivi(null) as base`)).rows[0].base).toBeNull();
    expect(premierMoisSuivi(null, JOUR)).toBeNull();
    expect(premierMoisSuivi("pas une date", JOUR)).toBeNull();
    expect(moisEnClair(CE_MOIS)).toBe("novembre 2026");
  });

  // ── 2. Le cas constaté ──────────────────────────────────────────────────────────────────────────────
  it("un bail entré le 01/11/2024, activé le 20/11/2026 : suivi depuis novembre 2026, UN terme, mois plein", async () => {
    const bail = await brouillon("2024-11-01");
    expect(await bascule(bail)).toEqual({ etat: "brouillon", depuis: null });
    expect(await deposerContrat(bail)).toBe("");
    expect(await bascule(bail)).toEqual({ etat: "actif", depuis: CE_MOIS });

    expect(await genererEcheancier(bail)).toBe(1);
    expect(await termes(bail)).toEqual([
      { periode: "2026-11-01", loyer: 700, charges: 50, du: 750, echeance: "2026-11-05", prorata: false },
    ]);
    // Rejouer « Générer l'échéancier » n'ajoute rien.
    expect(await genererEcheancier(bail)).toBe(0);
    expect(await termes(bail)).toHaveLength(1);
  });

  // ── 3. Sans date de bascule, rien ne change ─────────────────────────────────────────────────────────
  it("le même bail SANS date de bascule reçoit 25 termes, 18 750 € : le défaut constaté, et le sort inchangé des baux d'avant", async () => {
    const bail = await brouillon("2024-11-01");
    expect(await deposerContrat(bail)).toBe("");
    await db.query(`update public.baux set loyers_suivis_depuis = null where id=$1`, [bail]);
    expect(await genererEcheancier(bail)).toBe(25);
    const lignes = await termes(bail);
    expect(lignes[0].periode).toBe("2024-11-01");
    expect(lignes.at(-1)!.periode).toBe("2026-11-01");
    expect(lignes.reduce((s, l) => s + l.du, 0)).toBe(18750);
  });

  // ── 4. Les bords ────────────────────────────────────────────────────────────────────────────────────
  it("entré le dernier jour du mois précédent : suivi depuis ce mois-ci, le jour d'octobre n'est pas appelé", async () => {
    const bail = await brouillon("2026-10-31");
    expect(await deposerContrat(bail)).toBe("");
    expect((await bascule(bail)).depuis).toBe(CE_MOIS);
    expect(await genererEcheancier(bail)).toBe(1);
    expect(await termes(bail)).toEqual([{ periode: "2026-11-01", loyer: 700, charges: 50, du: 750, echeance: "2026-11-05", prorata: false }]);
  });

  it("entré plus tôt CE mois-ci : aucune date de bascule, l'échéancier part de l'entrée avec son prorata, comme avant", async () => {
    const bail = await brouillon("2026-11-03");
    expect(await deposerContrat(bail)).toBe("");
    expect(await bascule(bail)).toEqual({ etat: "actif", depuis: null });
    expect(await genererEcheancier(bail)).toBe(1);
    // 28 jours sur 30 ; l'échéance n'est jamais antérieure à l'entrée (D01 du 14/10).
    expect(await termes(bail)).toEqual([{ periode: "2026-11-01", loyer: 653.33, charges: 46.67, du: 700, echeance: "2026-11-05", prorata: true }]);
  });

  it.each([["2026-11-01", "le 1er de ce mois"], ["2026-11-20", "aujourd'hui"], ["2026-11-21", "demain"], ["2027-01-01", "dans six semaines"]])(
    "le déclencheur ne pose rien pour un bail entré le %s (%s)",
    async (entree) => {
      const bail = await brouillon(entree);
      // Le passage « brouillon → actif » lui-même, sans les contrôles de mise en location (éprouvés ailleurs).
      await db.query(`update public.baux set etat = 'actif' where id=$1`, [bail]);
      expect(await bascule(bail)).toEqual({ etat: "actif", depuis: null });
    },
  );

  it("le déclencheur ne s'éveille qu'au passage « brouillon → actif » : un congé annulé ne touche pas la date de bascule", async () => {
    const bail = await brouillon("2024-11-01");
    expect(await deposerContrat(bail)).toBe("");
    await nousSommesLe("2027-02-10");
    await db.query(`update public.baux set etat = 'preavis', date_fin = '2027-05-10' where id=$1`, [bail]);
    await db.query(`update public.baux set etat = 'actif', date_fin = null where id=$1`, [bail]);
    expect(await bascule(bail)).toEqual({ etat: "actif", depuis: CE_MOIS });
  });

  // ── 5. Le mois suivant ──────────────────────────────────────────────────────────────────────────────
  it("le 1er décembre, le cycle mensuel ajoute décembre et rien d'avant novembre", async () => {
    const bail = await brouillon("2024-11-01");
    expect(await deposerContrat(bail)).toBe("");
    await nousSommesLe("2026-12-01");
    await db.query(`select public.cycle_mensuel_interne()`);
    expect((await termes(bail)).map((t) => [t.periode, t.du, t.prorata])).toEqual([
      ["2026-11-01", 750, false],
      ["2026-12-01", 750, false],
    ]);
    // La date de bascule, elle, n'a pas bougé.
    expect((await bascule(bail)).depuis).toBe(CE_MOIS);
  });

  // ── 6. Terme échu ───────────────────────────────────────────────────────────────────────────────────
  it("à terme échu, le premier terme suivi (novembre) se paie le 5 décembre", async () => {
    const bail = await brouillon("2024-11-01", { echu: true });
    expect(await deposerContrat(bail)).toBe("");
    expect(await genererEcheancier(bail)).toBe(1);
    expect(await termes(bail)).toEqual([{ periode: "2026-11-01", loyer: 700, charges: 50, du: 750, echeance: "2026-12-05", prorata: false }]);
  });

  // ── 7. Qui écrit la valeur ──────────────────────────────────────────────────────────────────────────
  it("sur un bail signé, le propriétaire ne déplace pas la date de bascule à la main", async () => {
    const bail = await brouillon("2024-11-01");
    expect(await deposerContrat(bail)).toBe("");
    await simuler(compte);
    expect(await refus(`update public.baux set loyers_suivis_depuis = '2024-11-01' where id=$1`, [bail])).toMatch(/Bail signé : son contenu est figé \(loyers_suivis_depuis\)/);
    expect(await refus(`update public.baux set loyers_suivis_depuis = null where id=$1`, [bail])).toMatch(/Bail signé : son contenu est figé \(loyers_suivis_depuis\)/);
    await enTantQuePostgres();
    expect((await bascule(bail)).depuis).toBe(CE_MOIS);
  });

  it("une valeur écrite dans le brouillon ne survit pas à l'activation : la base la recalcule", async () => {
    const repris = await brouillon("2024-11-01");
    await db.query(`update public.baux set loyers_suivis_depuis = '2020-01-01' where id=$1`, [repris]);
    expect(await deposerContrat(repris)).toBe("");
    expect((await bascule(repris)).depuis).toBe(CE_MOIS);

    const duMois = await brouillon("2026-11-03");
    await db.query(`update public.baux set loyers_suivis_depuis = '2027-06-01' where id=$1`, [duMois]);
    expect(await deposerContrat(duMois)).toBe("");
    expect((await bascule(duMois)).depuis).toBeNull();
  });

  it("« Corriger » puis un nouveau dépôt le mois suivant : la date de bascule suit la nouvelle activation", async () => {
    const bail = await brouillon("2024-11-01");
    expect(await deposerContrat(bail)).toBe("");
    expect((await bascule(bail)).depuis).toBe(CE_MOIS);

    await nousSommesLe("2026-12-04");
    await simuler(compte);
    expect(await refus(`select public.devalider_bail($1)`, [bail])).toBe("");
    await enTantQuePostgres();
    expect((await bascule(bail)).etat).toBe("brouillon");
    expect(await deposerContrat(bail)).toBe("");
    expect(await bascule(bail)).toEqual({ etat: "actif", depuis: "2026-12-01" });
    expect(await genererEcheancier(bail)).toBe(1);
    expect((await termes(bail)).map((t) => t.periode)).toEqual(["2026-12-01"]);
  });

  it("la date de bascule est toujours un 1er du mois", async () => {
    const bail = await brouillon("2024-11-01");
    expect(await refus(`update public.baux set loyers_suivis_depuis = '2026-11-20' where id=$1`, [bail])).toMatch(/baux_loyers_suivis_depuis_premier_du_mois/);
    expect(await refus(`update public.baux set loyers_suivis_depuis = '2026-11-01' where id=$1`, [bail])).toBe("");
  });

  // ── 8. Droits, rejeu, retour ────────────────────────────────────────────────────────────────────────
  it("droits : la règle se lit connecté, jamais en visiteur ; le générateur interne et le déclencheur restent fermés", async () => {
    const droit = async (role: string, fonction: string) =>
      (await db.query(`select has_function_privilege($1, $2, 'execute') as ok`, [role, fonction])).rows[0].ok as boolean;
    expect(await droit("anon", "public.premier_mois_suivi(date)")).toBe(false);
    expect(await droit("authenticated", "public.premier_mois_suivi(date)")).toBe(true);
    for (const role of ["anon", "authenticated"]) {
      expect(await droit(role, "public.generer_appels_loyer_interne(uuid)"), role).toBe(false);
      expect(await droit(role, "public.poser_loyers_suivis_depuis()"), role).toBe(false);
    }
    expect(await droit("service_role", "public.generer_appels_loyer_interne(uuid)")).toBe(true);
  });

  const empreintes = async () => (await db.query(
    `select p.proname, md5(pg_get_functiondef(p.oid)) as empreinte, p.proacl::text as droits
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('generer_appels_loyer_interne','generer_appels_loyer','cycle_mensuel_interne','activer_bail','premier_mois_suivi','poser_loyers_suivis_depuis')
      order by 1`)).rows as { proname: string; empreinte: string; droits: string | null }[];
  const colonnePresente = async () => (await db.query(
    `select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='baux' and column_name='loyers_suivis_depuis'`)).rows[0].n === 1;
  const declencheurPresent = async () => (await db.query(
    `select count(*)::int as n from pg_trigger where tgrelid='public.baux'::regclass and tgname='baux_loyers_suivis_depuis'`)).rows[0].n === 1;
  /** Le banc peut porter des baux repris par d'autres essais : on les met de côté, sans réveiller leurs déclencheurs. */
  async function aucunBailRepris() {
    await enTantQuePostgres();
    await db.query(`set local session_replication_role = replica`);
    await db.query(`update public.baux set loyers_suivis_depuis = null where loyers_suivis_depuis is not null`);
    await db.query(`set local session_replication_role = origin`);
  }

  it("la migration se rejoue sans effet", async () => {
    await enTantQuePostgres();
    const avant = await empreintes();
    await db.query(MIGRATION);
    await db.query(MIGRATION);
    expect(await empreintes()).toEqual(avant);
    expect(await colonnePresente()).toBe(true);
    expect(await declencheurPresent()).toBe(true);
  });

  it("le retour se refuse tant qu'un bail porte une date de bascule, sans rien changer", async () => {
    const bail = await brouillon("2024-11-01");
    expect(await deposerContrat(bail)).toBe("");
    const avant = await empreintes();
    expect(await refus(RETOUR)).toMatch(/Retour refusé : \d+ bail\(aux\) repris en cours portent une date de bascule/);
    expect(await empreintes()).toEqual(avant);
    expect(await colonnePresente()).toBe(true);
    expect((await bascule(bail)).depuis).toBe(CE_MOIS);
  });

  it("le retour rend le générateur à sa forme d'avant, retire colonne, déclencheur et règle, se rejoue ; puis la migration revient au même état", async () => {
    await aucunBailRepris();
    const migre = await empreintes();
    await db.query(RETOUR);
    const revenu = await empreintes();
    expect(revenu.map((f) => f.proname)).toEqual(["activer_bail", "cycle_mensuel_interne", "generer_appels_loyer", "generer_appels_loyer_interne"]);
    const { rows: [{ def }] } = await db.query(`select pg_get_functiondef('public.generer_appels_loyer_interne(uuid)'::regprocedure) as def`);
    expect(def).not.toContain("Date de bascule");
    expect(def).not.toContain("loyers_suivis_depuis");
    expect(def).toContain("\n  v_mois := date_trunc('month', v.date_debut)::date;\n");
    expect(await colonnePresente()).toBe(false);
    expect(await declencheurPresent()).toBe(false);
    // Fonctions inchangées par l'aller comme par le retour, droits compris.
    for (const nom of ["activer_bail", "cycle_mensuel_interne", "generer_appels_loyer"]) {
      expect(revenu.find((f) => f.proname === nom), nom).toEqual(migre.find((f) => f.proname === nom));
    }
    expect(revenu.find((f) => f.proname === "generer_appels_loyer_interne")!.droits).toBe(migre.find((f) => f.proname === "generer_appels_loyer_interne")!.droits);
    await db.query(RETOUR);
    expect(await empreintes()).toEqual(revenu);

    // Après le retour, le bail repris retrouve le défaut : tous les termes depuis l'entrée. L'essai est annulé avant de
    // rejouer la migration : un bail créé dans la transaction laisse un contrôle différé en attente sur `baux`, et
    // PostgreSQL refuse alors d'en modifier la structure.
    await db.query("savepoint apres_retour");
    const bail = await brouillon("2024-11-01");
    expect(await deposerContrat(bail)).toBe("");
    expect(await genererEcheancier(bail)).toBe(25);
    await db.query("rollback to savepoint apres_retour");

    await enTantQuePostgres();
    await db.query(MIGRATION);
    expect(await empreintes()).toEqual(migre);
    expect(await colonnePresente()).toBe(true);
    expect(await declencheurPresent()).toBe(true);
  });

  it("une définition inattendue du générateur arrête la migration avec un message qui dit où", async () => {
    await aucunBailRepris();
    await db.query(RETOUR);
    const { rows: [{ def }] } = await db.query(`select pg_get_functiondef('public.generer_appels_loyer_interne(uuid)'::regprocedure) as def`);
    await db.query(def.replace("v_mois := date_trunc('month', v.date_debut)::date;", "v_mois :=  date_trunc('month', v.date_debut)::date;"));
    const avant = await empreintes();
    expect(await refus(MIGRATION)).toMatch(/Date de bascule : définition inattendue de generer_appels_loyer_interne/);
    expect(await empreintes()).toEqual(avant);
    expect(await colonnePresente()).toBe(false);
  });
});
