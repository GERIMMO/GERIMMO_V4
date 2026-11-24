/**
 * L'ANCIEN RÉGLAGE DES REPÈRES FISCAUX NE LAISSE PLUS UNE SOURCE PÉRIMÉE — décision du 24/11/2026 (Q38), reprise du
 * lot D3 (M2).
 *
 * Avant : réglage avec source (15 000 €, 30 %, « page A »), puis ancien réglage à deux arguments (16 000 €, 35 %) :
 * la lecture rendait 16 000 € et 35 % avec la source « page A », qui ne les justifie pas. La migration 20261124210000
 * fait vider la source par l'ancien réglage. Ce que ces tests tiennent, sous les vrais rôles :
 *  1. après l'ancien réglage, la lecture ne rend plus de source ; le journal garde celle du geste d'avant ;
 *  2. le réglage « avec source » n'est pas touché ; les droits de l'ancien réglage non plus ;
 *  3. la migration se rejoue ; son retour rend le texte du 23/11 (et le défaut), se rejoue, et se joue avant le retour
 *     de 20261124190000.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261124210000_reperes_fiscaux_ancien_reglage_sans_source";
const SOURCE_DU_LOT = "20261124190000_reperes_fiscaux_source";
const DU_23 = "20261123090000_reperes_fiscaux_reglage";
/** Une source d'essai, fictive : aucune page officielle n'est citée dans les tests. */
const SOURCE = "Site officiel fictif, page d’essai du 01/01/2026";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("ancien réglage des repères fiscaux — manifeste et retour écrits (sans base)", () => {
  it("la migration est au manifeste une seule fois, après la source du lot D3, avec son retour listé et placé en tête de l'ordre complet", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf(`${SOURCE_DU_LOT}.sql`));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(lisezMoi.indexOf("`20261124210000` (repères fiscaux, reprise du lot D3")).toBeGreaterThan(0);
    expect(lisezMoi.indexOf("`20261124210000` (repères fiscaux, reprise du lot D3")).toBeLessThan(lisezMoi.indexOf("`20261124190000` (repères fiscaux, source du contrôle"));
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/reperes-fiscaux-ancien-reglage-base.test.ts"');
  });

  it("une seule fonction réécrite, mêmes droits qu'avant, aucun droit ouvert à anon, aucune donnée écrite", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql.match(/create or replace function public\.(\w+)/g)).toEqual(["create or replace function public.regler_reperes_fiscaux"]);
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public|service_role)\b/i);
    expect(sql).toContain("revoke all on function public.regler_reperes_fiscaux(integer, integer) from public, anon, service_role;");
    expect(sql).toContain("grant execute on function public.regler_reperes_fiscaux(integer, integer) to authenticated;");
    expect(sql.replace(/\$\$[\s\S]*?\$\$/g, "")).not.toMatch(/insert into|update public\.|delete from/i);
    // Le texte rendu par le retour est celui du 23/11, mot pour mot.
    const corps = (texte: string) => /returns void language plpgsql security definer set search_path = '' as \$\$([\s\S]*?)\$\$;/.exec(texte)?.[1].trim();
    expect(corps(readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8"))).toBe(corps(readFileSync(`supabase/migrations/${DU_23}.sql`, "utf8").split("create or replace function public.regler_reperes_fiscaux")[1]));
  });
});

describe.skipIf(!url)("ancien réglage des repères fiscaux (avec base)", () => {
  let db: Client;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query("begin");
    await db.query("update public.reperes_fiscaux_reglage set micro_foncier_plafond_euros = 15000, micro_foncier_abattement_pourcent = 30, verifie_le = null, source = null, modifie_le = null, modifie_par = null where singleton");
  });
  afterEach(async () => { await db.query("rollback"); });

  async function superviseur(): Promise<string> {
    await db.query("reset role");
    const { rows: [{ id }] } = await db.query<{ id: string }>(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        'test-ancien-reglage-'||gen_random_uuid()||'@test.local', 'x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '')
      returning id`);
    await db.query("insert into public.memberships (account_id, organization_id, role, status) values ($1, null, 'super_admin', 'active')", [id]);
    return id;
  }
  async function simuler(compte: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: compte, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  }
  const lire = async () => (await db.query<{ r: Record<string, unknown> }>("select public.reperes_fiscaux_avec_source() r")).rows[0].r;
  const AVEC_SOURCE = "select public.regler_reperes_fiscaux_avec_source($1, $2, $3)";
  const ANCIEN = "select public.regler_reperes_fiscaux($1, $2)";

  it("le cas du relecteur : réglage avec source, puis ancien réglage → les nouvelles valeurs s'affichent SANS l'ancienne source", async () => {
    const compte = await superviseur();
    await simuler(compte);
    await db.query(AVEC_SOURCE, [15000, 30, SOURCE]);
    expect(await lire()).toMatchObject({ micro_foncier_plafond_euros: 15000, source: SOURCE });
    await db.query(ANCIEN, [16000, 35]);
    expect(await lire()).toMatchObject({ micro_foncier_plafond_euros: 16000, micro_foncier_abattement_pourcent: 35, source: null });
    // La source effacée n'est pas perdue : le journal la garde dans le geste « avec source » qui l'avait enregistrée.
    await db.query("reset role");
    const { rows } = await db.query<{ details: Record<string, unknown> }>("select details from public.supervision_operations where action = 'reperes_fiscaux' and cree_le >= transaction_timestamp() order by (details->>'plafond_euros')::int");
    expect(rows.map((l) => l.details.source ?? null)).toEqual([SOURCE, null]);
    // Le réglage avec source repose une source, comme avant.
    await simuler(compte);
    await db.query(AVEC_SOURCE, [16000, 35, SOURCE]);
    expect(await lire()).toMatchObject({ micro_foncier_plafond_euros: 16000, source: SOURCE });
  });

  it("droits inchangés : l'ancien réglage reste réservé au superviseur permanent, fermé au visiteur et au traitement", async () => {
    await db.query("reset role");
    const { rows } = await db.query(`
      select has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') compte,
             has_function_privilege('service_role', p.oid, 'execute') traitement, p.prosecdef definer, array_to_string(p.proconfig, ',') chemin
        from pg_proc p where p.oid = 'public.regler_reperes_fiscaux(integer, integer)'::regprocedure`);
    expect(rows).toEqual([{ anon: false, compte: true, traitement: false, definer: true, chemin: 'search_path=""' }]);
  });

  it("la migration se rejoue ; son retour rend le texte du 23/11 (et le défaut), se rejoue, puis le retour de la source se joue", async () => {
    await db.query("reset role");
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const etat = async (nom: string) => (await db.query<{ e: string; d: string }>(
      "select md5(pg_get_functiondef(p.oid)) e, coalesce(p.proacl::text,'') d from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public' where p.proname = $1", [nom])).rows;
    const avec = await etat("regler_reperes_fiscaux"), avecSource = await etat("regler_reperes_fiscaux_avec_source");
    await db.query(migration);
    await db.query(migration);
    expect(await etat("regler_reperes_fiscaux")).toEqual(avec);
    expect(await etat("regler_reperes_fiscaux_avec_source")).toEqual(avecSource);

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261124210000','reperes_fiscaux_ancien_reglage_sans_source') on conflict do nothing");
    await db.query(retour);
    await db.query(retour);
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261124210000'")).rows[0].n).toBe(0);
    // Le texte du 23/11 : celui que pose la migration du 23/11 rejouée seule.
    const apresRetour = await etat("regler_reperes_fiscaux");
    expect(apresRetour).not.toEqual(avec);
    await db.query(readFileSync(`supabase/migrations/${DU_23}.sql`, "utf8"));
    expect(await etat("regler_reperes_fiscaux")).toEqual(apresRetour);
    // Le défaut revient avec lui (c'est ce que le LISEZ-MOI annonce).
    const compte = await superviseur();
    await simuler(compte);
    await db.query(AVEC_SOURCE, [15000, 30, SOURCE]);
    await db.query(ANCIEN, [16000, 35]);
    expect(await lire()).toMatchObject({ micro_foncier_plafond_euros: 16000, source: SOURCE });

    // Ordre du LISEZ-MOI : ce retour d'abord, puis celui de la source (qui supprime la colonne) ; l'ancien réglage marche encore.
    await db.query("reset role");
    await db.query(readFileSync(`supabase/retours-arriere/${SOURCE_DU_LOT}.retour.sql`, "utf8"));
    await simuler(compte);
    await db.query(ANCIEN, [15500, 31]);
    await db.query("reset role");
    await db.query(retour); // rejouable aussi sans la colonne

    // Reposées dans l'ordre : même définition qu'au départ.
    await db.query(readFileSync(`supabase/migrations/${SOURCE_DU_LOT}.sql`, "utf8"));
    await db.query(migration);
    expect(await etat("regler_reperes_fiscaux")).toEqual(avec);
  });
});
