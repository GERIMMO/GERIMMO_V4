/**
 * Décision X19 (fiche SA-10, audit du 13 octobre 2026) : une limite quotidienne réglable des appels payants à l'IA,
 * et l'arrêt d'urgence consulté avant CHAQUE appel payant, gestes manuels compris (migration 20261014730000).
 *
 * Ces tests gardent, sur la base :
 *  — le réglage (une seule ligne, 50 par défaut, de 0 à 1 000), réglable par le superviseur permanent seul, journalisé ;
 *  — la réservation : accordée sous la limite, refusée au-delà (et comptée comme refus), jamais accordée sous arrêt ;
 *  — la correspondance usage → clé d'arrêt, miroir de USAGES_IA (src/lib/plafond-ia.ts) ;
 *  — le compteur au jour de Paris ;
 *  — l'atomicité : vingt appels simultanés sous une limite de cinq n'en accordent que cinq ;
 *  — les droits (anon jamais, un compte ordinaire jamais, le traitement et la supervision oui) ;
 *  — le rejeu de la migration, sans effet (le réglage et les compteurs restent).
 *
 * Nécessite SUPABASE_DB_URL (base locale jetable). Tout est joué dans une transaction annulée, sauf le test de
 * simultanéité, qui doit valider ses écritures pour se mesurer : il remet la base dans son état d'avant à la fin.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client, Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { PLAFOND_IA_PAR_DEFAUT, PLAFOND_IA_MAXIMUM, USAGES_IA, type UsageIA } from "../src/lib/plafond-ia";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const FICHIER = "supabase/migrations/20261014730000_plafond_appels_ia.sql";
const CLES_MISSION = ["consignes", "veille", "appels", "quittances", "relances", "rappels", "abonnements", "signatures", "marketing", "territoire", "purge", "orchestrateur"];

describe.skipIf(!DB_URL)("limite quotidienne des appels payants à l'IA (X19)", () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => { await db.query("begin"); auteur = undefined; });
  afterEach(async () => { await db.query("rollback"); });

  // ── Aides ────────────────────────────────────────────────────────────────

  async function creerUtilisateur(superAdmin = false): Promise<string> {
    await db.query("reset role");
    const { rows: [{ id }] } = await db.query<{ id: string }>(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
        'test-pia-'||gen_random_uuid()||'@test.local','x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
      returning id`);
    if (superAdmin) {
      await db.query(`insert into public.memberships (account_id, organization_id, role, status) values ($1, null, 'super_admin', 'active')`, [id]);
    }
    return id;
  }

  /** Se faire passer pour un compte (aal2 par défaut), pour le traitement (service_role) ou pour anon. */
  async function simuler(qui: { compte?: string; role: "authenticated" | "service_role" | "anon"; aal?: string }) {
    await db.query("reset role");
    const claims = qui.role === "authenticated"
      ? { sub: qui.compte, role: "authenticated", aal: qui.aal ?? "aal2" }
      : { role: qui.role };
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await db.query(`set local role ${qui.role}`);
  }
  const commeTraitement = () => simuler({ role: "service_role" });

  async function reserver(usage: string): Promise<string> {
    const { rows: [{ r }] } = await db.query<{ r: string }>(`select public.reserver_appel_ia($1) as r`, [usage]);
    return r;
  }

  async function regler(plafond: number) {
    await db.query("reset role");
    await db.query(`update public.ia_plafond_reglage set plafond_jour = $1 where singleton`, [plafond]);
  }

  async function compteur(): Promise<{ appels: number; refus: number } | null> {
    await db.query("reset role");
    const { rows } = await db.query<{ appels: number; refus: number }>(
      `select appels, refus from public.ia_appels_jour where jour = public.aujourdhui_paris()`
    );
    return rows[0] ?? null;
  }

  let auteur: string | undefined;
  async function arreter(cle: string) {
    await db.query("reset role");
    auteur ??= await creerUtilisateur();
    await db.query(
      `insert into public.supervision_arrets (cle, arrete, motif, auteur) values ($1, true, 'Essai de contrôle', $2)
       on conflict (cle) do update set arrete = true`,
      [cle, auteur]
    );
  }
  async function lever(cle: string) {
    await db.query("reset role");
    await db.query(`update public.supervision_arrets set arrete = false where cle = $1`, [cle]);
  }

  // ── Le réglage ───────────────────────────────────────────────────────────

  it("une seule ligne de réglage, 50 appels par jour par défaut, de 0 à 1 000", async () => {
    expect(PLAFOND_IA_PAR_DEFAUT).toBe(50);
    expect(PLAFOND_IA_MAXIMUM).toBe(1000);
    const { rows } = await db.query(`select singleton, plafond_jour from public.ia_plafond_reglage`);
    expect(rows).toHaveLength(1);
    // La valeur posée par la migration est celle documentée côté application.
    const { rows: [{ defaut }] } = await db.query<{ defaut: string }>(
      `select column_default as defaut from information_schema.columns
        where table_schema = 'public' and table_name = 'ia_plafond_reglage' and column_name = 'plafond_jour'`
    );
    expect(Number(defaut)).toBe(PLAFOND_IA_PAR_DEFAUT);
    await db.query("savepoint s");
    await expect(db.query(`insert into public.ia_plafond_reglage (singleton, plafond_jour) values (false, 10)`)).rejects.toThrow();
    await db.query("rollback to savepoint s");
    await expect(db.query(`update public.ia_plafond_reglage set plafond_jour = 1001`)).rejects.toThrow();
    await db.query("rollback to savepoint s");
    await expect(db.query(`update public.ia_plafond_reglage set plafond_jour = -1`)).rejects.toThrow();
  });

  it("le superviseur permanent règle la limite ; le geste est journalisé ; le compteur du jour n'est pas remis à zéro", async () => {
    const superviseur = await creerUtilisateur(true);
    await regler(3);
    await commeTraitement();
    expect(await reserver("brief")).toBe("accorde");
    await simuler({ compte: superviseur, role: "authenticated" });
    await db.query(`select public.regler_plafond_ia(7)`);
    await db.query("reset role");
    const { rows: [r] } = await db.query(`select plafond_jour, modifie_par from public.ia_plafond_reglage where singleton`);
    expect(r).toMatchObject({ plafond_jour: 7, modifie_par: superviseur });
    expect(await compteur()).toEqual({ appels: 1, refus: 0 });
    const { rows: journal } = await db.query(
      `select action, auteur, details from public.supervision_operations where action = 'plafond_ia' and auteur = $1`, [superviseur]
    );
    expect(journal).toEqual([{ action: "plafond_ia", auteur: superviseur, details: { plafond: 7, precedent: 3 } }]);
  });

  it.each([
    ["sans double vérification", { aal: "aal1", superAdmin: true }],
    ["un compte ordinaire", { aal: "aal2", superAdmin: false }],
  ])("refuse le réglage à %s", async (_nom, { aal, superAdmin }) => {
    const compte = await creerUtilisateur(superAdmin);
    await simuler({ compte, role: "authenticated", aal });
    await expect(db.query(`select public.regler_plafond_ia(7)`)).rejects.toThrow(/Supervision permanente/);
  });

  it.each([-1, 1001, null])("refuse une limite hors bornes (%s)", async (valeur) => {
    const superviseur = await creerUtilisateur(true);
    await simuler({ compte: superviseur, role: "authenticated" });
    await expect(db.query(`select public.regler_plafond_ia($1)`, [valeur])).rejects.toThrow(/de 0 à 1 000/);
  });

  // ── La réservation ───────────────────────────────────────────────────────

  it("accorde sous la limite, refuse au-delà et compte le refus, au jour de Paris", async () => {
    await regler(2);
    await commeTraitement();
    expect(await reserver("veille")).toBe("accorde");
    expect(await reserver("devis")).toBe("accorde");
    expect(await reserver("brief")).toBe("plafond");
    expect(await reserver("visuel_marketing")).toBe("plafond");
    expect(await compteur()).toEqual({ appels: 2, refus: 2 });
    // Le jour du compteur est celui de Paris, jamais celui de la session.
    await db.query("reset role");
    const { rows: [{ jours }] } = await db.query<{ jours: string[] }>(`select array_agg(jour::text) as jours from public.ia_appels_jour`);
    const { rows: [{ paris }] } = await db.query<{ paris: string }>(`select public.aujourdhui_paris()::text as paris`);
    expect(jours).toContain(paris);
    const { rows: [{ def }] } = await db.query<{ def: string }>(`select pg_get_functiondef('public.reserver_appel_ia(text)'::regprocedure) as def`);
    expect(def).toContain("public.aujourdhui_paris()");
    expect(def.toLowerCase()).not.toContain("current_date");
  });

  it("une limite à 0 n'accorde aucun appel", async () => {
    await regler(0);
    await commeTraitement();
    for (const usage of Object.keys(USAGES_IA)) expect(await reserver(usage)).toBe("plafond");
    expect((await compteur())?.appels).toBe(0);
  });

  it("refuse un usage inconnu", async () => {
    await commeTraitement();
    await expect(reserver("inconnu")).rejects.toThrow(/Usage de l'IA inconnu/);
  });

  // ── L'arrêt d'urgence ────────────────────────────────────────────────────

  it("l'arrêt global arrête tous les appels, sans les compter", async () => {
    await regler(100);
    await arreter("global");
    await commeTraitement();
    for (const usage of Object.keys(USAGES_IA)) expect(await reserver(usage)).toBe("arret");
    expect(await compteur()).toBeNull();
    await lever("global");
    await commeTraitement();
    expect(await reserver("brief")).toBe("accorde");
  });

  it("chaque clé d'arrêt arrête exactement les usages que USAGES_IA lui associe (miroir de la base)", async () => {
    await regler(1000);
    for (const cle of CLES_MISSION) {
      await arreter(cle);
      for (const [usage, u] of Object.entries(USAGES_IA) as [UsageIA, (typeof USAGES_IA)[UsageIA]][]) {
        await commeTraitement();
        expect(await reserver(usage), `${usage} sous l'arrêt « ${cle} »`).toBe(u.arret === cle ? "arret" : "accorde");
      }
      await lever(cle);
    }
  });

  // ── Les droits ───────────────────────────────────────────────────────────

  it("anon n'exécute ni la réservation ni le réglage, et ne lit ni n'écrit les tables", async () => {
    await db.query("reset role");
    const { rows: [d] } = await db.query(`
      select has_function_privilege('anon', 'public.reserver_appel_ia(text)', 'execute') as reserver,
             has_function_privilege('anon', 'public.regler_plafond_ia(integer)', 'execute') as regler,
             has_table_privilege('anon', 'public.ia_plafond_reglage', 'select,insert,update,delete,truncate') as reglage,
             has_table_privilege('anon', 'public.ia_appels_jour', 'select,insert,update,delete,truncate') as compteur,
             has_table_privilege('authenticated', 'public.ia_appels_jour', 'insert,update,delete,truncate') as ecriture_client,
             has_table_privilege('authenticated', 'public.ia_plafond_reglage', 'insert,update,delete,truncate') as reglage_client`);
    expect(d).toEqual({ reserver: false, regler: false, reglage: false, compteur: false, ecriture_client: false, reglage_client: false });
  });

  it("un compte ordinaire ne réserve pas (il épuiserait la limite de tous) ; la supervision et le traitement, oui", async () => {
    const ordinaire = await creerUtilisateur();
    const superviseur = await creerUtilisateur(true);
    await db.query("savepoint s");
    await simuler({ compte: ordinaire, role: "authenticated" });
    await expect(reserver("devis")).rejects.toThrow(/Accès réservé/);
    await db.query("rollback to savepoint s");
    await simuler({ compte: superviseur, role: "authenticated", aal: "aal1" });
    await expect(reserver("brief")).rejects.toThrow(/Accès réservé/);
    await db.query("rollback to savepoint s");
    await simuler({ compte: superviseur, role: "authenticated" });
    expect(await reserver("brief")).toBe("accorde");
    await commeTraitement();
    expect(await reserver("devis")).toBe("accorde");
  });

  it("un compte ordinaire ne lit ni la limite ni le compteur ; le superviseur permanent les lit", async () => {
    await commeTraitement();
    await reserver("brief");
    const ordinaire = await creerUtilisateur();
    await simuler({ compte: ordinaire, role: "authenticated" });
    expect((await db.query(`select * from public.ia_plafond_reglage`)).rows).toEqual([]);
    expect((await db.query(`select * from public.ia_appels_jour`)).rows).toEqual([]);
    const superviseur = await creerUtilisateur(true);
    await simuler({ compte: superviseur, role: "authenticated" });
    expect((await db.query(`select * from public.ia_plafond_reglage`)).rows).toHaveLength(1);
    expect((await db.query(`select * from public.ia_appels_jour where jour = public.aujourdhui_paris()`)).rows).toHaveLength(1);
  });

  // ── Le rejeu ─────────────────────────────────────────────────────────────

  it("se rejoue sans effet : le réglage choisi et les compteurs restent", async () => {
    await regler(12);
    await commeTraitement();
    await reserver("brief");
    await db.query("reset role");
    await db.query(readFileSync(FICHIER, "utf8"));
    const { rows: [r] } = await db.query(`select plafond_jour from public.ia_plafond_reglage where singleton`);
    expect(r.plafond_jour).toBe(12);
    expect(await compteur()).toEqual({ appels: 1, refus: 0 });
  });
});

// ── La simultanéité ────────────────────────────────────────────────────────
// Hors transaction annulée : la mesure exige que chaque appel valide son écriture. La base est remise dans son état
// d'avant (réglage et ligne du jour) à la fin, quoi qu'il arrive.
describe.skipIf(!DB_URL)("limite quotidienne des appels à l'IA : appels simultanés (X19)", () => {
  it("vingt appels simultanés sous une limite de cinq n'en accordent que cinq", async () => {
    const pool = new Pool({ connectionString: DB_URL, max: 20 });
    const admin = await pool.connect();
    const { rows: [avant] } = await admin.query(`select plafond_jour from public.ia_plafond_reglage where singleton`);
    const { rows: ligne } = await admin.query(`select appels, refus from public.ia_appels_jour where jour = public.aujourdhui_paris()`);
    admin.release();
    try {
      await pool.query(`update public.ia_plafond_reglage set plafond_jour = 5 where singleton`);
      await pool.query(`delete from public.ia_appels_jour where jour = public.aujourdhui_paris()`);
      const statuts = await Promise.all(Array.from({ length: 20 }, async () => {
        const c = await pool.connect();
        try {
          await c.query("begin");
          await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
          await c.query("set local role service_role");
          const { rows: [{ r }] } = await c.query<{ r: string }>(`select public.reserver_appel_ia('veille') as r`);
          // Une pause avant de valider : les autres appels attendent le verrou de la ligne du jour.
          await c.query("select pg_sleep(0.02)");
          await c.query("commit");
          return r;
        } finally { c.release(); }
      }));
      expect(statuts.filter((s) => s === "accorde")).toHaveLength(5);
      expect(statuts.filter((s) => s === "plafond")).toHaveLength(15);
      const { rows: [compte] } = await pool.query(`select appels, refus from public.ia_appels_jour where jour = public.aujourdhui_paris()`);
      expect(compte).toEqual({ appels: 5, refus: 15 });
    } finally {
      await pool.query(`update public.ia_plafond_reglage set plafond_jour = $1 where singleton`, [avant.plafond_jour]);
      await pool.query(`delete from public.ia_appels_jour where jour = public.aujourdhui_paris()`);
      if (ligne[0]) {
        await pool.query(`insert into public.ia_appels_jour (jour, appels, refus) values (public.aujourdhui_paris(), $1, $2)`, [ligne[0].appels, ligne[0].refus]);
      }
      await pool.end();
    }
  });
});
