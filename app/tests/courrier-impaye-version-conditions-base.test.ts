/**
 * LE COURRIER D'IMPAYÉ PART AUSSI SOUS LA VERSION DU 24 NOVEMBRE 2026 DES CONDITIONS — textes officiels, lot T4.
 *
 * Le courrier envoyé le jour d'un prélèvement échoué vaut mise en demeure et cite l'article 15.4 des conditions. Il ne
 * part que pour un contrat conclu sous une version inscrite dans une liste fermée, tenue en DEUX endroits : le code
 * (`VERSIONS_AVEC_ARTICLE_15_4`, src/lib/relances-paiement.ts) et la base (fonction `empreinte_avant_alertes_direction`).
 * Une nouvelle version des conditions oubliée dans l'une des deux listes priverait ses clients de ce courrier, sans
 * erreur visible. Ce que ces tests tiennent :
 *  1. sans base : la version EN VIGUEUR figure dans les deux listes, qui sont identiques ; la migration 20261125104000
 *     ne change qu'une ligne du texte de 20261116201034, et son retour rend ce texte mot pour mot ; manifeste et retour ;
 *  2. avec base : la fonction installée porte la liste du code ; droits inchangés ; rejeu sans effet ; retour, puis
 *     marche avant.
 * Le parcours complet (courrier parti, lecture seule, régularisation) est rejoué pour CHAQUE version de la liste dans
 * tests/impayes-et-retractations-durables-base.test.ts.
 *
 * Nécessite SUPABASE_DB_URL pour la seconde partie. Transaction annulée à la fin de chaque test ; le fichier rejoue du
 * DDL : il tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CONDITIONS_VERSION } from "../src/lib/editeur";
import { VERSIONS_AVEC_ARTICLE_15_4 } from "../src/lib/relances-paiement";
import { sansRetraitDuRegistre } from "./fixtures/registre-retour";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261125104000_courrier_impaye_conditions_du_24_novembre";
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
const ORIGINE = readFileSync("supabase/migrations/20261116201034_courriers_incidents_abonnement.sql", "utf8");
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
if (url && (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) || !new URL(url).pathname.startsWith("/gerimmo_ci_"))) {
  throw new Error("Base locale fictive gerimmo_ci_… obligatoire.");
}

/** Le corps (entre `$$`) d'une fonction dans un fichier SQL. */
function corps(source: string, entete: string): string {
  const debut = source.indexOf(entete);
  if (debut < 0) throw new Error(`fonction introuvable : ${entete}`);
  const m = /as \$\$([\s\S]*?)\$\$;/.exec(source.slice(debut));
  if (!m) throw new Error(`corps introuvable : ${entete}`);
  return m[1];
}
const D_ORIGINE = corps(ORIGINE, "create function public.empreinte_metier_courriel(p_org uuid,p_contexte jsonb) returns text");
/** Les versions de la liste écrite dans un texte SQL : `cgu_version not in ('…','…')`. */
function versionsDuSql(texte: string): string[] {
  const m = /contrat\.cgu_version not in \(([^)]*)\)/.exec(texte);
  if (!m) throw new Error("liste des versions introuvable dans la fonction");
  return [...m[1].matchAll(/'([^']+)'/g)].map((v) => v[1]);
}

describe("courrier d'impayé et version des conditions (sans base)", () => {
  it("la version en vigueur des conditions est dans la liste du code ET dans celle de la migration ; les deux listes sont les mêmes", () => {
    const duSql = versionsDuSql(corps(MIGRATION, "create or replace function public.empreinte_avant_alertes_direction("));
    expect(VERSIONS_AVEC_ARTICLE_15_4, "ajoutez la nouvelle version à VERSIONS_AVEC_ARTICLE_15_4 (src/lib/relances-paiement.ts)").toContain(CONDITIONS_VERSION);
    expect(duSql, "ajoutez la nouvelle version à la fonction de la base (nouvelle migration)").toContain(CONDITIONS_VERSION);
    expect([...duSql].sort()).toEqual([...VERSIONS_AVEC_ARTICLE_15_4].sort());
    expect(duSql).toEqual(["2026-10-24", "2026-11-15", "2026-11-24"]);
    // Aucune version antérieure n'est retirée.
    expect(versionsDuSql(D_ORIGINE)).toEqual(["2026-10-24", "2026-11-15"]);
  });

  it("la migration ne change qu'une ligne du texte de 20261116201034 ; son retour rend ce texte mot pour mot", () => {
    expect(corps(MIGRATION, "create or replace function public.empreinte_avant_alertes_direction(")).toBe(D_ORIGINE.replace(
      "    or contrat.cgu_version is null or contrat.cgu_version not in ('2026-10-24','2026-11-15') or contrat.cgu_version is distinct from c->>'version'",
      "    or contrat.cgu_version is null or contrat.cgu_version not in ('2026-10-24','2026-11-15','2026-11-24')  -- lot T4 : version du 24/11/2026 ajoutée\n    or contrat.cgu_version is distinct from c->>'version'"));
    expect(corps(RETOUR, "create or replace function public.empreinte_avant_alertes_direction(")).toBe(D_ORIGINE);
    // RET-01 (essai « retours » du 25/11) : le retour retire sa version du registre des migrations, et rien d'autre ;
    // sansRetraitDuRegistre exige cette suppression une fois, puis la retire du texte contrôlé ci-dessous.
    for (const sql of [MIGRATION, sansRetraitDuRegistre(RETOUR, NOM.slice(0, 14))]) {
      const code = sql.replace(/^\s*--.*$/gm, "");
      expect(code.match(/create or replace function public\.(\w+)/g)).toEqual(["create or replace function public.empreinte_avant_alertes_direction"]);
      expect(code).toContain("language plpgsql security definer set search_path='' as $$");
      expect(code).not.toMatch(/\bgrant\b|\bdelete\s+from\b|\bdrop\b|\binsert into\b|\btruncate\b|create policy/i);
    }
  });

  it("la migration est au manifeste une seule fois, après celle qui a donné son nom à la fonction ; retour listé, en tête de l'ordre complet", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261116201223_alertes_direction_et_reports.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    const chaine = lisezMoi.slice(lisezMoi.indexOf("Ordre complet si tout doit être défait :"));
    expect(chaine.indexOf("`20261125104000` (courrier d'impayé")).toBeGreaterThan(0);
    expect(chaine.indexOf("`20261125104000` (courrier d'impayé")).toBeLessThan(chaine.indexOf("`20261116201223` ("));
    expect(chaine.indexOf("`20261125103000` (factures conservées dix ans")).toBeLessThan(chaine.indexOf("`20261024105901` ("));
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/courrier-impaye-version-conditions-base.test.ts"');
  });
});

describe.skipIf(!url)("courrier d'impayé et version des conditions (avec base)", () => {
  let db: Client;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => { await db.query("begin"); await db.query(MIGRATION); });
  afterEach(async () => { await db.query("rollback"); });

  const etat = async () => (await db.query<{ s: string; acl: string | null; def: boolean; conf: string | null }>(
    `select p.prosrc as s, p.proacl::text as acl, p.prosecdef as def, array_to_string(p.proconfig, ',') as conf
       from pg_proc p where p.oid = 'public.empreinte_avant_alertes_direction(uuid,jsonb)'::regprocedure`)).rows[0];

  it("la fonction installée porte la liste du code ; elle reste réservée au traitement, et la chaîne des e-mails l'appelle toujours", async () => {
    const e = await etat();
    expect([...versionsDuSql(e.s)].sort()).toEqual([...VERSIONS_AVEC_ARTICLE_15_4].sort());
    expect(e.def).toBe(true);
    expect(e.conf).toBe('search_path=""');
    const droits = (await db.query<{ a: boolean; c: boolean }>(
      `select has_function_privilege('anon', 'public.empreinte_avant_alertes_direction(uuid,jsonb)', 'EXECUTE') as a,
              has_function_privilege('authenticated', 'public.empreinte_avant_alertes_direction(uuid,jsonb)', 'EXECUTE') as c`)).rows[0];
    expect(droits).toEqual({ a: false, c: false });
    // Le maillon suivant de la chaîne (20261116201223) appelle cette fonction par ce nom.
    const suivant = (await db.query<{ n: number }>(
      "select count(*)::int as n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc like '%public.empreinte_avant_alertes_direction(p_org,p_contexte)%'")).rows[0].n;
    expect(suivant).toBeGreaterThanOrEqual(1);
    // Un contexte inconnu de ce maillon est passé au précédent, comme avant : pas d'erreur, pas d'empreinte inventée.
    await db.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
    expect((await db.query("select public.empreinte_avant_alertes_direction(gen_random_uuid(), '{\"type\":\"relance_abonnement\",\"id\":\"sub_inconnu\"}'::jsonb) as e")).rows[0].e).toBeNull();
  });

  it("la migration se rejoue sans effet ; le retour rend le texte de 20261116201034 sans toucher aux droits, se rejoue, puis la marche avant redonne le même état", async () => {
    const apres = await etat();
    await db.query(MIGRATION);
    expect(await etat()).toEqual(apres);
    await db.query(RETOUR);
    const revenu = await etat();
    expect(revenu.s).toBe(D_ORIGINE);
    expect(versionsDuSql(revenu.s)).toEqual(["2026-10-24", "2026-11-15"]);
    expect({ acl: revenu.acl, def: revenu.def, conf: revenu.conf }).toEqual({ acl: apres.acl, def: apres.def, conf: apres.conf });
    await db.query(RETOUR);
    expect(await etat()).toEqual(revenu);
    await db.query(MIGRATION);
    expect(await etat()).toEqual(apres);
  });
});
