/**
 * LE JOURNAL DE L'ANCIEN RÉGLAGE DES REPÈRES FISCAUX DIT QUELLE SOURCE IL A EFFACÉE — décision du 24/11/2026 (Q38),
 * seconde reprise du lot D3 (point 5 de la relecture).
 *
 * Depuis 20261124210000, l'ancien réglage à deux arguments vide la source d'un contrôle d'avant ; sa ligne de journal ne
 * le disait pas. La migration 20261124230000 y ajoute « source_effacee ». Ce que ces tests tiennent, sous les vrais rôles :
 *  1. après un réglage avec source puis l'ancien réglage, la ligne de journal de l'ancien réglage porte la source effacée ;
 *     sans source avant, elle porte « vide » ; le réglage lui-même ne change pas ;
 *  2. droits inchangés ;
 *  3. la migration se rejoue ; son retour rend le texte de 20261124210000, se rejoue, et l'ordre complet des trois retours
 *     (celui-ci, 20261124210000, 20261124190000) se joue sans laisser un réglage en panne ;
 *  4. le retour de 20261124190000 dit lui-même son ordre.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261124230000_reperes_fiscaux_ancien_reglage_journal_source";
const SANS_SOURCE = "20261124210000_reperes_fiscaux_ancien_reglage_sans_source";
const SOURCE_DU_LOT = "20261124190000_reperes_fiscaux_source";
/** Une source d'essai, fictive : aucune page officielle n'est citée dans les tests. */
const SOURCE = "Site officiel fictif, page d’essai du 01/01/2026";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("journal de l'ancien réglage des repères fiscaux — manifeste et retours écrits (sans base)", () => {
  it("la migration est au manifeste une seule fois, après 20261124210000, avec son retour listé et placé en tête de l'ordre complet", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf(`${SANS_SOURCE}.sql`));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(lisezMoi.indexOf("`20261124230000` (repères fiscaux, seconde reprise du lot D3")).toBeGreaterThan(0);
    expect(lisezMoi.indexOf("`20261124230000` (repères fiscaux, seconde reprise du lot D3")).toBeLessThan(lisezMoi.indexOf("`20261124210000` (repères fiscaux, reprise du lot D3"));
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/reperes-fiscaux-journal-source-base.test.ts"');
  });

  it("une seule fonction réécrite, une seule ligne de plus que le texte de 20261124210000, mêmes droits, aucune donnée écrite", () => {
    const brut = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const sql = brut.replace(/^\s*--.*$/gm, "");
    expect(sql.match(/create or replace function public\.(\w+)/g)).toEqual(["create or replace function public.regler_reperes_fiscaux"]);
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public|service_role)\b/i);
    expect(sql).toContain("revoke all on function public.regler_reperes_fiscaux(integer, integer) from public, anon, service_role;");
    expect(sql).toContain("grant execute on function public.regler_reperes_fiscaux(integer, integer) to authenticated;");
    expect(sql.replace(/\$\$[\s\S]*?\$\$/g, "")).not.toMatch(/insert into|update public\.|delete from/i);
    const corps = (texte: string) => /returns void language plpgsql security definer set search_path = '' as \$\$([\s\S]*?)\$\$;/.exec(texte)?.[1].trim();
    const du21 = corps(readFileSync(`supabase/migrations/${SANS_SOURCE}.sql`, "utf8"))!;
    expect(corps(brut)).toBe(du21.replace("'verification_precedente', r.verifie_le));",
      "'verification_precedente', r.verifie_le,\n                             'source_effacee', r.source));  -- seconde reprise D3 : la source que ce geste efface"));
    // Le texte rendu par le retour est celui de 20261124210000, mot pour mot.
    expect(corps(readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8"))).toBe(du21);
  });

  it("le retour de 20261124190000 dit lui-même qu'il se joue après ceux de 20261124230000 et de 20261124210000", () => {
    const retour = readFileSync(`supabase/retours-arriere/${SOURCE_DU_LOT}.retour.sql`, "utf8");
    expect(retour).toContain("-- Se joue APRÈS les retours de 20261124230000 puis de 20261124210000");
    expect(retour).toContain("-- Se joue AVANT le retour de 20261123090000");
  });
});

describe.skipIf(!url)("journal de l'ancien réglage des repères fiscaux (avec base)", () => {
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
        'test-journal-source-'||gen_random_uuid()||'@test.local', 'x', now(),
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
  const journal = async () => {
    await db.query("reset role");
    return (await db.query<{ details: Record<string, unknown> }>("select details from public.supervision_operations where action = 'reperes_fiscaux' and cree_le >= transaction_timestamp() order by (details->>'plafond_euros')::int")).rows.map((l) => l.details);
  };
  const AVEC_SOURCE = "select public.regler_reperes_fiscaux_avec_source($1, $2, $3)";
  const ANCIEN = "select public.regler_reperes_fiscaux($1, $2)";

  it("le cas du relecteur : la ligne de journal de l'ancien réglage dit quelle source a été effacée ; sans source avant, elle dit « vide »", async () => {
    const compte = await superviseur();
    await simuler(compte);
    await db.query(AVEC_SOURCE, [15000, 30, SOURCE]);
    await db.query(ANCIEN, [16000, 35]);
    // Le réglage lui-même n'a pas changé : les nouvelles valeurs, sans source.
    expect(await lire()).toMatchObject({ micro_foncier_plafond_euros: 16000, micro_foncier_abattement_pourcent: 35, source: null });
    const [avecSource, ancien] = await journal();
    expect(avecSource).toMatchObject({ plafond_euros: 15000, source: SOURCE });
    expect(ancien).toMatchObject({ plafond_euros: 16000, abattement_pourcent: 35, plafond_precedent: 15000, source_effacee: SOURCE });
    expect(ancien).not.toHaveProperty("source");
    // Second ancien réglage : il n'y avait plus de source, la ligne le dit.
    await simuler(compte);
    await db.query(ANCIEN, [17000, 36]);
    const lignes = await journal();
    expect(lignes[2]).toMatchObject({ plafond_euros: 17000, source_effacee: null });
    expect(lignes[2]).toHaveProperty("source_effacee");
  });

  it("droits inchangés : l'ancien réglage reste réservé au superviseur permanent, fermé au visiteur et au traitement", async () => {
    await db.query("reset role");
    const { rows } = await db.query(`
      select has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') compte,
             has_function_privilege('service_role', p.oid, 'execute') traitement, p.prosecdef definer, array_to_string(p.proconfig, ',') chemin
        from pg_proc p where p.oid = 'public.regler_reperes_fiscaux(integer, integer)'::regprocedure`);
    expect(rows).toEqual([{ anon: false, compte: true, traitement: false, definer: true, chemin: 'search_path=""' }]);
    const compte = (await db.query<{ id: string }>("select id from auth.users limit 1")).rows[0]?.id ?? "00000000-0000-4000-8000-000000000000";
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: compte, role: "authenticated" })]);
    await db.query("set local role authenticated");
    await expect(db.query(ANCIEN, [16000, 35])).rejects.toThrow(/Supervision permanente/);
  });

  it("la migration se rejoue ; son retour rend le texte de 20261124210000 et se rejoue ; les trois retours se jouent dans l'ordre du LISEZ-MOI", async () => {
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

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261124230000','reperes_fiscaux_ancien_reglage_journal_source') on conflict do nothing");
    await db.query(retour);
    await db.query(retour);
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261124230000'")).rows[0].n).toBe(0);
    // Le texte de 20261124210000 : celui que pose cette migration rejouée seule.
    const apresRetour = await etat("regler_reperes_fiscaux");
    expect(apresRetour).not.toEqual(avec);
    await db.query(readFileSync(`supabase/migrations/${SANS_SOURCE}.sql`, "utf8"));
    expect(await etat("regler_reperes_fiscaux")).toEqual(apresRetour);
    // Le journal ne dit plus la source effacée (c'est ce que le LISEZ-MOI annonce) ; le réglage, lui, vide toujours la source.
    const compte = await superviseur();
    await simuler(compte);
    await db.query(AVEC_SOURCE, [15000, 30, SOURCE]);
    await db.query(ANCIEN, [16000, 35]);
    expect(await lire()).toMatchObject({ micro_foncier_plafond_euros: 16000, source: null });
    expect((await journal())[1]).not.toHaveProperty("source_effacee");

    // Ordre complet : ce retour, puis celui de 20261124210000, puis celui de la source (qui supprime la colonne).
    await db.query(readFileSync(`supabase/retours-arriere/${SANS_SOURCE}.retour.sql`, "utf8"));
    await db.query(retour); // rejoué après le retour de 20261124210000 : il ne remet pas un texte qui écrit la colonne
    await db.query(readFileSync(`supabase/retours-arriere/${SOURCE_DU_LOT}.retour.sql`, "utf8"));
    await simuler(compte);
    await db.query(ANCIEN, [15500, 31]); // l'ancien réglage marche encore, sans la colonne

    // Reposées dans l'ordre : même définition qu'au départ.
    await db.query("reset role");
    await db.query(readFileSync(`supabase/migrations/${SOURCE_DU_LOT}.sql`, "utf8"));
    await db.query(readFileSync(`supabase/migrations/${SANS_SOURCE}.sql`, "utf8"));
    await db.query(migration);
    expect(await etat("regler_reperes_fiscaux")).toEqual(avec);
  });
});
