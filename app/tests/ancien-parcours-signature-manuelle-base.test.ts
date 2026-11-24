/**
 * ANCIEN PARCOURS « TÉLÉCHARGER, SIGNER, REDÉPOSER » RETIRÉ — décisions du 24/11, lot D5 (question Q21).
 * Migration 20261125140000.
 *
 * Ce que ces tests tiennent :
 *  1. sans base : manifeste, retour listé, test en série ; la migration et son retour ne suppriment rien (ni table, ni
 *     colonne, ni fonction, ni ligne) et n'ouvrent aucun droit au visiteur ; le code ne cite plus les fonctions fermées ;
 *  2. avec base : après la migration, un compte connecté n'appelle plus les trois fonctions qui écrivaient dans ce
 *     parcours ; les deux lectures encore utiles restent ouvertes ; table, fonctions et déclencheurs sont toujours là ;
 *  3. garde-fou : une demande manuelle encore en attente arrête la migration sans rien modifier ; une demande signée ou
 *     une archive de l'ancien prestataire ne l'arrête pas ;
 *  4. rejeu sans effet ; retour (droits rendus), rejeu du retour, puis marche avant.
 *
 * Nécessite SUPABASE_DB_URL (base locale fictive). Transaction annulée à la fin du fichier. Le fichier rejoue des
 * droits : il tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FICHIERS_EN_SERIE } from "../vitest.config";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261125140000_ancien_parcours_signature_manuelle_droits_retires";
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
const FERMEES = [
  "public.envoyer_pour_signature(uuid,uuid,uuid)",
  "public.retourner_document_signe(uuid,uuid,text,text,bigint,text)",
  "public.annuler_demande_signature(uuid,uuid)",
];
const GARDEES = ["public.mes_demandes_signature(uuid)", "public.demandes_signature_document(uuid,uuid)"];
const sansCommentaires = (sql: string) => sql.replace(/^\s*--.*$/gm, "");

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
if (url && (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) || !new URL(url).pathname.startsWith("/gerimmo_ci_"))) {
  throw new Error("Base locale fictive gerimmo_ci_… obligatoire.");
}

describe("ancien parcours de signature manuelle — manifeste, rien de supprimé (sans base)", () => {
  it("la migration est au manifeste une seule fois, son retour existe et est listé, son test tourne en série", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261125110000_relance_report_rdv_et_relance_a_la_main.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`${NOM}.retour.sql`);
    expect(FICHIERS_EN_SERIE).toContain("tests/ancien-parcours-signature-manuelle-base.test.ts");
  });

  it("ni la migration ni son retour ne suppriment ou ne modifient quoi que ce soit : seulement des droits d'exécution", () => {
    for (const sql of [MIGRATION, RETOUR].map(sansCommentaires)) {
      expect(sql).not.toMatch(/\b(drop|delete|truncate|alter|update|insert|create)\b/i);
      expect(sql).not.toMatch(/\bto\s+(anon|public)\b/i);
    }
    expect(sansCommentaires(RETOUR).match(/grant execute on function [^;]+ to authenticated;/g)).toHaveLength(3);
  });

  it("plus aucun fichier de l'application n'appelle les fonctions fermées, ni la lecture du locataire", () => {
    const fichiers = (dossier: string): string[] =>
      readdirSync(dossier).flatMap((n) => {
        const chemin = join(dossier, n);
        return statSync(chemin).isDirectory() ? fichiers(chemin) : /\.(ts|tsx|mjs)$/.test(n) ? [chemin] : [];
      });
    const appels = /rpc\(\s*["'`](envoyer_pour_signature|retourner_document_signe|annuler_demande_signature|mes_demandes_signature)["'`]/;
    expect(fichiers("src").filter((f) => appels.test(readFileSync(f, "utf8")))).toEqual([]);
    expect(existsSync("src/app/actions/signature-locataire.ts")).toBe(false);
    expect(existsSync("src/app/locataire/[orgId]/documents/depot-signature.tsx")).toBe(false);
  });
});

describe.skipIf(!url)("ancien parcours de signature manuelle — droits en base", () => {
  const db = new Client({ connectionString: url });
  const droit = async (role: string, fonction: string) =>
    (await db.query("select has_function_privilege($1, $2::regprocedure, 'execute') as d", [role, fonction])).rows[0].d as boolean;
  const lignes = async () => Number((await db.query("select count(*)::int n from public.demandes_signature")).rows[0].n);
  const tentative = async (sql: string) => {
    await db.query("savepoint t");
    try { await db.query(sql); await db.query("release savepoint t"); return ""; }
    catch (e) { await db.query("rollback to savepoint t"); return e instanceof Error ? e.message : String(e); }
  };
  const poser = async (signee: boolean, prestataire: string) => {
    // Fixture : une ligne posée sans déclencheurs ni clés étrangères (identifiants fictifs), retirée par la transaction.
    await db.query("set local session_replication_role = replica");
    const { rows } = await db.query(
      `insert into public.demandes_signature(organization_id, document_id, person_id, signee_le, prestataire)
       values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1, $2) returning id`,
      [signee ? new Date().toISOString() : null, prestataire]);
    await db.query("set local session_replication_role = origin");
    return rows[0].id as string;
  };
  const retirer = async (id: string) => {
    await db.query("set local session_replication_role = replica");
    await db.query("delete from public.demandes_signature where id = $1", [id]);
    await db.query("set local session_replication_role = origin");
  };

  beforeAll(async () => { await db.connect(); await db.query("begin"); });
  afterAll(async () => { await db.query("rollback").catch(() => {}); await db.end(); });

  it("après la migration : les trois fonctions d'écriture sont fermées aux comptes connectés et au visiteur ; rien n'a disparu", async () => {
    const avant = await lignes();
    expect(await tentative(MIGRATION)).toBe("");
    for (const f of FERMEES) {
      expect(await droit("authenticated", f), f).toBe(false);
      expect(await droit("anon", f), f).toBe(false);
      expect(await droit("service_role", f), f).toBe(true);
    }
    for (const f of GARDEES) {
      expect(await droit("authenticated", f), f).toBe(true);
      expect(await droit("anon", f), f).toBe(false);
    }
    expect(await lignes()).toBe(avant);
    const { rows } = await db.query(
      "select tgname from pg_trigger where tgrelid = 'public.demandes_signature'::regclass and not tgisinternal order by 1");
    expect(rows.map((r) => r.tgname)).toEqual(expect.arrayContaining(["signature_manuelle_bail_garde", "signature_manuelle_fin_nouveaux_envois"]));
  });

  it("un compte connecté est refusé à l'appel", async () => {
    await db.query("savepoint role");
    await db.query("set local role authenticated");
    expect(await tentative("select public.annuler_demande_signature(gen_random_uuid(), gen_random_uuid())")).toMatch(/permission denied for function annuler_demande_signature/);
    expect(await tentative("select public.retourner_document_signe(gen_random_uuid(), gen_random_uuid(), 'a', 'application/pdf', 1, 'e')")).toMatch(/permission denied for function retourner_document_signe/);
    expect(await tentative("select public.envoyer_pour_signature(gen_random_uuid(), gen_random_uuid(), gen_random_uuid())")).toMatch(/permission denied for function envoyer_pour_signature/);
    await db.query("rollback to savepoint role");
  });

  it("garde-fou : une demande manuelle en attente arrête la migration ; une demande signée ou une archive de l'ancien prestataire, non", async () => {
    expect(await tentative(RETOUR)).toBe("");
    const enAttente = await poser(false, "manuel");
    expect(await tentative(MIGRATION)).toMatch(/1 ancienne\(s\) demande\(s\) de signature manuelle encore en attente/);
    for (const f of FERMEES) expect(await droit("authenticated", f), f).toBe(true);
    await retirer(enAttente);
    const signee = await poser(true, "manuel");
    const archive = await poser(false, "youtrust");
    expect(await tentative(MIGRATION)).toBe("");
    for (const f of FERMEES) expect(await droit("authenticated", f), f).toBe(false);
    await retirer(signee);
    await retirer(archive);
  });

  it("rejeu sans effet ; retour, rejeu du retour, puis marche avant", async () => {
    expect(await tentative(MIGRATION)).toBe("");
    for (const f of FERMEES) expect(await droit("authenticated", f), f).toBe(false);
    expect(await tentative(RETOUR)).toBe("");
    expect(await tentative(RETOUR)).toBe("");
    for (const f of FERMEES) {
      expect(await droit("authenticated", f), f).toBe(true);
      expect(await droit("anon", f), f).toBe(false);
    }
    expect(await tentative(MIGRATION)).toBe("");
    for (const f of FERMEES) expect(await droit("authenticated", f), f).toBe(false);
  });
});
