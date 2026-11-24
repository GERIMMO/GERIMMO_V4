/**
 * L'ARCHIVE D'UN COMPTE FERMÉ ATTEND LA SUPPRESSION DE LA FICHE DU CLIENT CHEZ LE PRESTATAIRE DE PAIEMENT — textes
 * officiels, lot T4, seconde reprise du 24/11/2026 (relecture T4R-01).
 *
 * Avec des factures gardées dix ans (20261125103000), la preuve du contrat et la dernière facture arrivent à leur
 * terme le même jour : `purger_archives_comptes` retirait la facture ET supprimait l'archive dans le même appel. Or la
 * liste des clients à supprimer chez le prestataire (`clients_stripe_au_terme`) ne lit que les archives : l'archive
 * partie, la fiche du client restait chez le prestataire sans limite.
 *
 * Ce que ces tests tiennent pour la migration 20261125105000 :
 *  1. sans base : manifeste, retour listé, droits ; la fonction ne diffère de son texte d'avant que par les lignes
 *     marquées « T4R-01 », et le retour rend ce texte mot pour mot ;
 *  2. une archive AVEC client, à dix ans et un jour : la purge retire la facture et GARDE l'archive ; le client est
 *     alors proposé à la suppression ; une fois sa suppression tracée, la purge suivante supprime l'archive ;
 *  3. une archive SANS client reste purgeable, comme avant ;
 *  4. la contre-épreuve : avec le texte d'avant (retour), l'archive part et le client n'est plus jamais proposé ;
 *  5. rejeu sans effet, retour, puis marche avant.
 *
 * Nécessite SUPABASE_DB_URL (base locale fictive). Transaction annulée à la fin de chaque test. Le fichier rejoue du
 * DDL : il tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261125105000_archive_compte_apres_client_stripe";
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
/** La dernière définition jouée dans l'ordre du manifeste (20261024140000 passe AVANT 20261024105901). */
const REGLAGES = readFileSync("supabase/migrations/20261024105901_reglages_conservation_superadmin.sql", "utf8");
const DIX_ANS = readFileSync("supabase/migrations/20261125103000_factures_conservation_dix_ans.sql", "utf8");
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
if (url && (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) || !new URL(url).pathname.startsWith("/gerimmo_ci_"))) {
  throw new Error("Base locale fictive gerimmo_ci_… obligatoire.");
}

/** Le corps (entre `$$`) de la DERNIÈRE définition d'une fonction dans un fichier SQL. */
function corps(source: string, nom: string): string {
  const debut = source.lastIndexOf(`create or replace function public.${nom}(`);
  if (debut < 0) throw new Error(`fonction ${nom} introuvable`);
  const m = /as \$\$([\s\S]*?)\$\$;/.exec(source.slice(debut));
  if (!m) throw new Error(`corps de ${nom} introuvable`);
  return m[1];
}

describe("archive gardée jusqu'à la suppression du client chez le prestataire — manifeste, droits et texte (sans base)", () => {
  it("la migration est au manifeste une seule fois, après celles dont elle reprend ou suit le texte, avec son retour listé et son test en série", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    for (const avant of ["20261024140000_conservation_et_prospection.sql", "20261024105901_reglages_conservation_superadmin.sql", "20261125103000_factures_conservation_dix_ans.sql", "20261125104000_courrier_impaye_conditions_du_24_novembre.sql"]) {
      expect(manifeste.indexOf(`${NOM}.sql`), avant).toBeGreaterThan(manifeste.indexOf(avant));
    }
    // 20261024105901 est bien la dernière des deux définitions d'avant, dans l'ordre réellement joué.
    expect(manifeste.indexOf("20261024105901_reglages_conservation_superadmin.sql")).toBeGreaterThan(manifeste.indexOf("20261024140000_conservation_et_prospection.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/archive-compte-apres-client-stripe-base.test.ts"');
    expect(MIGRATION).toContain(`supabase/retours-arriere/${NOM}.retour.sql`);
  });

  it("une seule fonction réécrite, aucun droit ouvert, aucune donnée écrite, aucune règle d'accès touchée", () => {
    for (const sql of [MIGRATION, RETOUR]) {
      const code = sql.replace(/^\s*--.*$/gm, "");
      expect(code.match(/create or replace function public\.(\w+)/g)).toEqual(["create or replace function public.purger_archives_comptes"]);
      expect(code).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public|authenticated)\b/i);
      expect(code).toContain("grant execute on function public.purger_archives_comptes() to service_role;");
      const hors = code.replace(/\$\$[\s\S]*?\$\$/g, "");
      expect(hors).not.toMatch(/\b(insert into|update|delete from|truncate|drop|alter)\b|create policy|disable (trigger|row level security)/i);
      expect(code).toContain("select public.fermer_fonctions_a_anon();");
    }
  });

  it("la fonction ne diffère de son texte d'avant que par les lignes marquées « T4R-01 » ; le retour rend ce texte mot pour mot", () => {
    const avant = corps(REGLAGES, "purger_archives_comptes");
    expect(corps(RETOUR, "purger_archives_comptes")).toBe(avant);
    expect(corps(MIGRATION, "purger_archives_comptes")).toBe(avant.replace(
      "     where a.preuve_conservee_jusqu_au < v_jour and jsonb_array_length(a.factures) = 0;",
      "     where a.preuve_conservee_jusqu_au < v_jour and jsonb_array_length(a.factures) = 0\n" +
        "       -- T4R-01 : l'archive est la seule trace qui fait supprimer la fiche du client chez le prestataire de paiement.\n" +
        "       and (a.stripe_customer_id is null\n" +
        "            or exists (select 1 from public.clients_stripe_supprimes s where s.stripe_customer_id = a.stripe_customer_id));"));
    expect(corps(MIGRATION, "purger_archives_comptes")).not.toBe(avant);
  });
});

describe.skipIf(!url)("archive gardée jusqu'à la suppression du client chez le prestataire (avec base)", () => {
  let db: Client;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query("begin");
    await db.query(DIX_ANS);
    await db.query(MIGRATION);
    await db.query("update public.retention_rules set actif = true where data_type in ('archive:facture', 'archive:preuve_contrat')");
  });
  afterEach(async () => { await db.query("rollback"); });

  const un = async <T>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] as T;
  /** Une archive de compte fermé : fin du dernier abonnement payé et factures données par leur âge, en mois. */
  const archiver = async (client: string | null, finIlYaMois: number, facturesIlYaMois: number[]) => (await un<{ id: string }>(
    `insert into public.archives_comptes (account_id_origine, stripe_customer_id, fin_dernier_abonnement_paye, factures)
     values (gen_random_uuid(), $1, ((current_date - make_interval(months => $2::int))::date - 1),
             (select coalesce(jsonb_agg(jsonb_build_object('numero', 'F-' || m, 'emise_le', ((current_date - make_interval(months => m))::date - 1)::text)), '[]'::jsonb)
                from unnest($3::int[]) m))
     returning id`, [client, finIlYaMois, facturesIlYaMois])).id;
  const facturesRestantes = async (id: string) =>
    (await un<{ n: number } | undefined>("select jsonb_array_length(factures) as n from public.archives_comptes where id = $1", [id]))?.n ?? null;
  const purger = async () => (await un<{ r: Record<string, number> }>("select public.purger_archives_comptes() as r")).r;
  const commeLeTraitement = async <T>(action: () => Promise<T>): Promise<T> => {
    await db.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
    try { return await action(); } finally { await db.query("select set_config('request.jwt.claims', '', true)"); }
  };
  const clientsAuTerme = () => commeLeTraitement(async () =>
    (await db.query<{ stripe_customer_id: string }>("select stripe_customer_id from public.clients_stripe_au_terme(500)")).rows.map((r) => r.stripe_customer_id).filter((c) => c.startsWith("cus_t4r_")));
  const tracerSuppression = (client: string) => commeLeTraitement(() => db.query("select public.client_stripe_supprime($1)", [client]));

  it("T4R-01 — dix ans et un jour, archive AVEC client : la facture part, l'archive RESTE ; le client est proposé ; sa suppression tracée, l'archive part", async () => {
    const a = await archiver("cus_t4r_dix_ans", 120, [120]);
    // Tout arrive à son terme le même jour : la facture est retirée, mais la ligne ne part pas.
    expect(await purger()).toEqual({ archives_comptes_factures_retirees: 1, archives_comptes_supprimees: 0 });
    expect(await facturesRestantes(a)).toBe(0);
    // L'archive est toujours là : le client reste désigné à la mission de suppression, purge après purge.
    expect(await clientsAuTerme()).toEqual(["cus_t4r_dix_ans"]);
    expect(await purger()).toEqual({ archives_comptes_factures_retirees: 0, archives_comptes_supprimees: 0 });
    expect(await clientsAuTerme()).toEqual(["cus_t4r_dix_ans"]);
    // La mission applicative supprime la fiche chez le prestataire, puis en pose la trace.
    await tracerSuppression("cus_t4r_dix_ans");
    expect(await clientsAuTerme()).toEqual([]);
    expect(await purger()).toEqual({ archives_comptes_factures_retirees: 0, archives_comptes_supprimees: 1 });
    expect(await facturesRestantes(a)).toBeNull();
    expect((await un<{ n: string }>("select count(*) as n from public.clients_stripe_supprimes where stripe_customer_id = 'cus_t4r_dix_ans'")).n).toBe("1");
  });

  it("une archive SANS client reste purgeable : facture retirée et ligne supprimée dans le même appel, comme avant", async () => {
    const a = await archiver(null, 120, [120]);
    expect(await purger()).toEqual({ archives_comptes_factures_retirees: 1, archives_comptes_supprimees: 1 });
    expect(await facturesRestantes(a)).toBeNull();
  });

  it("le client déjà supprimé chez le prestataire (trace posée avant la purge) : l'archive part dans le même appel", async () => {
    const a = await archiver("cus_t4r_deja_supprime", 120, [120]);
    await tracerSuppression("cus_t4r_deja_supprime");
    expect(await purger()).toEqual({ archives_comptes_factures_retirees: 1, archives_comptes_supprimees: 1 });
    expect(await facturesRestantes(a)).toBeNull();
  });

  it("deux archives du même client : aucune ne part avant la trace, les deux partent après", async () => {
    const a = await archiver("cus_t4r_deux_archives", 120, [120]);
    const b = await archiver("cus_t4r_deux_archives", 130, []);
    const autre = await archiver("cus_t4r_autre_client", 130, []);
    expect((await purger()).archives_comptes_supprimees).toBe(0);
    await tracerSuppression("cus_t4r_deux_archives");
    expect((await purger()).archives_comptes_supprimees).toBe(2);
    expect(await facturesRestantes(a)).toBeNull();
    expect(await facturesRestantes(b)).toBeNull();
    // La trace d'un client ne libère pas l'archive d'un autre.
    expect(await facturesRestantes(autre)).toBe(0);
  });

  it("avant le terme, rien ne change : ni facture retirée, ni archive supprimée, client ou non", async () => {
    const a = await archiver("cus_t4r_neuf_ans", 108, [108]);
    const b = await archiver(null, 108, [108]);
    expect(await purger()).toEqual({ archives_comptes_factures_retirees: 0, archives_comptes_supprimees: 0 });
    expect(await facturesRestantes(a)).toBe(1);
    expect(await facturesRestantes(b)).toBe(1);
    expect(await clientsAuTerme()).toEqual([]);
  });

  it("contre-épreuve : avec le texte d'avant (retour), l'archive part avec sa facture et le client n'est plus jamais proposé", async () => {
    await db.query(RETOUR);
    await archiver("cus_t4r_perdu", 120, [120]);
    expect(await purger()).toEqual({ archives_comptes_factures_retirees: 1, archives_comptes_supprimees: 1 });
    expect(await clientsAuTerme()).toEqual([]);
    expect((await un<{ n: string }>("select count(*) as n from public.clients_stripe_supprimes where stripe_customer_id = 'cus_t4r_perdu'")).n).toBe("0");
  });

  it("droits : la purge n'est ouverte ni à un visiteur ni à un compte connecté", async () => {
    const r = await un<{ anon: boolean; connecte: boolean; service: boolean; definer: boolean; chemin: string[] }>(
      `select has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as connecte,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as service, p.prosecdef as definer, p.proconfig as chemin
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'purger_archives_comptes'`);
    expect(r).toEqual({ anon: false, connecte: false, service: true, definer: true, chemin: ['search_path=""'] });
  });

  it("la migration se rejoue sans effet ; le retour rend le texte d'avant et se rejoue ; la marche avant redonne le même état", async () => {
    const etat = async () => (await un<{ e: string }>(
      "select md5(p.prosrc || coalesce(p.proacl::text, '') || p.prosecdef::text || coalesce(p.proconfig::text, '')) as e from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'purger_archives_comptes'")).e;
    const src = async () => (await un<{ s: string }>("select prosrc as s from pg_proc where proname = 'purger_archives_comptes' and pronamespace = 'public'::regnamespace")).s;
    const apres = await etat();
    expect(await src()).toBe(corps(MIGRATION, "purger_archives_comptes"));
    await db.query(MIGRATION);
    expect(await etat()).toBe(apres);
    await db.query(RETOUR);
    expect(await src()).toBe(corps(REGLAGES, "purger_archives_comptes"));
    const revenu = await etat();
    expect(revenu).not.toBe(apres);
    await db.query(RETOUR);
    expect(await etat()).toBe(revenu);
    await db.query(MIGRATION);
    expect(await etat()).toBe(apres);
  });
});
