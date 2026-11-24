/**
 * LES REPÈRES FISCAUX DANS LA BASE — audit palier 1, P2-09 (23/11/2026).
 *
 * Le plafond et l'abattement du micro-foncier, cités par l'aide du récapitulatif fiscal, ne sont plus écrits dans le
 * code : ils vivent dans un réglage du superviseur. Ce que ces tests tiennent, sous les vrais rôles :
 *  1. à la livraison : les valeurs que le code affichait (15 000 €, 30 %), SANS date de vérification ;
 *  2. tout compte connecté lit les trois valeurs par `reperes_fiscaux()` ; la table reste fermée à tous ; anon n'a rien ;
 *  3. seul le superviseur permanent en double vérification règle ; la base refait les bornes ; la vérification est
 *     datée du jour de Paris ; chaque geste est au journal avec les valeurs d'avant ;
 *  4. la migration se rejoue sans remettre les valeurs de livraison à la place de celles du superviseur ; son retour
 *     retire les fonctions et la table et se rejoue ; reposée, elle repart de la livraison, sans date.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261123090000_reperes_fiscaux_reglage";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("repères fiscaux — manifeste, retour et droits écrits (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    // Elle cite la fonction du jour de Paris et le journal de la supervision : elle vient après eux.
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261122200000_envois_automatiques_reglage.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    // Le retour de la fonction du jour refuse tant qu'un objet la cite : celui-ci est inscrit dans l'ordre des retours.
    expect(lisezMoi).toContain("`20261123090000` (repères fiscaux");
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
  });

  it("aucun droit n'est ouvert à anon ; la table est fermée à tous ; le réglage est réservé aux comptes connectés", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    expect(sql).toContain("revoke all on public.reperes_fiscaux_reglage from public, anon, authenticated, service_role;");
    expect(sql).toContain("revoke all on function public.reperes_fiscaux() from public, anon;");
    expect(sql).toContain("revoke all on function public.regler_reperes_fiscaux(integer, integer) from public, anon, service_role;");
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
    // La lecture ne rend que trois valeurs : ni l'auteur, ni l'heure de la modification.
    const lecture = /create or replace function public\.reperes_fiscaux\(\)[\s\S]*?\$\$;/.exec(sql)?.[0] ?? "";
    expect(lecture).not.toMatch(/modifie_par|modifie_le|auth\.|accounts/);
    expect(lecture.match(/'[a-z_]+',/g)).toEqual(["'micro_foncier_plafond_euros',", "'micro_foncier_abattement_pourcent',", "'verifie_le',"]);
  });
});

describe.skipIf(!url)("repères fiscaux (avec base)", () => {
  let db: Client;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query("begin");
    // Un point de départ connu, quel que soit l'état laissé sur le banc : la livraison.
    await db.query("update public.reperes_fiscaux_reglage set micro_foncier_plafond_euros = 15000, micro_foncier_abattement_pourcent = 30, verifie_le = null, modifie_le = null, modifie_par = null where singleton");
  });
  afterEach(async () => { await db.query("rollback"); });

  const LIVRAISON = { micro_foncier_plafond_euros: 15000, micro_foncier_abattement_pourcent: 30, verifie_le: null };

  async function compte(superviseur = false): Promise<string> {
    await db.query("reset role");
    const { rows: [{ id }] } = await db.query<{ id: string }>(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        'test-reperes-fiscaux-'||gen_random_uuid()||'@test.local', 'x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '')
      returning id`);
    if (superviseur) await db.query("insert into public.memberships (account_id, organization_id, role, status) values ($1, null, 'super_admin', 'active')", [id]);
    return id;
  }
  async function simuler(qui: { compte?: string; role: "authenticated" | "service_role" | "anon"; aal?: string }) {
    await db.query("reset role");
    const claims = qui.role === "authenticated" ? { sub: qui.compte, role: "authenticated", aal: qui.aal ?? "aal2" } : { role: qui.role };
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await db.query(`set local role ${qui.role}`);
  }
  const refus = async (sql: string, args: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, args); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  const lire = async () => (await db.query<{ r: unknown }>("select public.reperes_fiscaux() r")).rows[0].r;
  const jourDeParis = async () => { await db.query("reset role"); return (await db.query<{ j: string }>("select public.aujourdhui_paris()::text j")).rows[0].j; };
  const ligne = async () => {
    await db.query("reset role");
    return (await db.query<{ plafond: number; abattement: number; verifie: string | null; par: string | null; quand: boolean }>(
      "select micro_foncier_plafond_euros plafond, micro_foncier_abattement_pourcent abattement, verifie_le::text verifie, modifie_par par, modifie_le is not null quand from public.reperes_fiscaux_reglage where singleton")).rows[0];
  };
  const journal = async () => {
    await db.query("reset role");
    return (await db.query<{ auteur: string; objet: string | null; details: Record<string, unknown> }>(
      "select auteur, objet, details from public.supervision_operations where action = 'reperes_fiscaux' and cree_le >= transaction_timestamp() order by (details->>'plafond_euros')::int")).rows;
  };

  it("à la livraison : 15 000 € et 30 %, sans date de vérification ; une seule ligne, bornée", async () => {
    const { rows } = await db.query<{ c: string; d: string | null }>(
      "select column_name c, column_default d from information_schema.columns where table_schema='public' and table_name='reperes_fiscaux_reglage' and column_name in ('micro_foncier_plafond_euros','micro_foncier_abattement_pourcent','verifie_le') order by 1");
    expect(rows).toEqual([
      { c: "micro_foncier_abattement_pourcent", d: "30" },
      { c: "micro_foncier_plafond_euros", d: "15000" },
      { c: "verifie_le", d: null },
    ]);
    expect((await db.query("select count(*)::int n from public.reperes_fiscaux_reglage")).rows[0].n).toBe(1);
    // Une seconde ligne est impossible, et les contraintes refusent une valeur aberrante même en écriture directe.
    expect(await refus("insert into public.reperes_fiscaux_reglage (singleton) values (false)")).toMatch(/reperes_fiscaux_reglage_unique/);
    expect(await refus("update public.reperes_fiscaux_reglage set micro_foncier_plafond_euros = 150")).toMatch(/reperes_fiscaux_plafond_plausible/);
    expect(await refus("update public.reperes_fiscaux_reglage set micro_foncier_abattement_pourcent = 100")).toMatch(/reperes_fiscaux_abattement_plausible/);
  });

  it("tout compte connecté lit les trois valeurs ; la table reste fermée ; anon n'a rien", async () => {
    const ordinaire = await compte();
    await simuler({ compte: ordinaire, role: "authenticated" });
    expect(await lire()).toEqual(LIVRAISON);
    expect(await refus("select * from public.reperes_fiscaux_reglage")).toMatch(/permission denied/);
    expect(await refus("update public.reperes_fiscaux_reglage set micro_foncier_plafond_euros = 20000")).toMatch(/permission denied/);
    await simuler({ role: "service_role" });
    expect(await lire()).toEqual(LIVRAISON);
    expect(await refus("select * from public.reperes_fiscaux_reglage")).toMatch(/permission denied/);
    await simuler({ role: "anon" });
    expect(await refus("select public.reperes_fiscaux()")).toMatch(/permission denied/);
    expect(await refus("select public.regler_reperes_fiscaux(15000, 30)")).toMatch(/permission denied/);
    expect(await refus("select * from public.reperes_fiscaux_reglage")).toMatch(/permission denied/);
  });

  it("seul le superviseur permanent en double vérification règle ; rien ne change ni ne se journalise sur un refus", async () => {
    const superviseur = await compte(true);
    const ordinaire = await compte();
    await simuler({ compte: ordinaire, role: "authenticated" });
    expect(await refus("select public.regler_reperes_fiscaux(16000, 31)")).toMatch(/Supervision permanente/);
    await simuler({ compte: superviseur, role: "authenticated", aal: "aal1" });
    expect(await refus("select public.regler_reperes_fiscaux(16000, 31)")).toMatch(/Supervision permanente/);
    await simuler({ role: "service_role" });
    expect(await refus("select public.regler_reperes_fiscaux(16000, 31)")).toMatch(/permission denied/);

    // Le superviseur lui-même : la base refait les bornes, sans rien convertir.
    await simuler({ compte: superviseur, role: "authenticated" });
    for (const [plafond, abattement, motif] of [
      [null, 30, /Plafond du micro-foncier/], [999, 30, /Plafond du micro-foncier/], [1000001, 30, /Plafond du micro-foncier/], [-15000, 30, /Plafond du micro-foncier/],
      [15000, null, /Abattement du micro-foncier/], [15000, 0, /Abattement du micro-foncier/], [15000, 100, /Abattement du micro-foncier/],
    ] as [number | null, number | null, RegExp][]) {
      expect(await refus("select public.regler_reperes_fiscaux($1, $2)", [plafond, abattement]), `${plafond} / ${abattement}`).toMatch(motif);
    }
    expect(await ligne()).toEqual({ plafond: 15000, abattement: 30, verifie: null, par: null, quand: false });
    expect(await journal()).toEqual([]);
  });

  it("le réglage enregistre, date la vérification du jour de Paris et journalise avec les valeurs d'avant", async () => {
    const superviseur = await compte(true);
    const ordinaire = await compte();
    const jour = await jourDeParis();

    await simuler({ compte: superviseur, role: "authenticated" });
    await db.query("select public.regler_reperes_fiscaux(15300, 31)");
    expect(await ligne()).toEqual({ plafond: 15300, abattement: 31, verifie: jour, par: superviseur, quand: true });
    // Le propriétaire lit aussitôt les nouvelles valeurs, datées.
    await simuler({ compte: ordinaire, role: "authenticated" });
    expect(await lire()).toEqual({ micro_foncier_plafond_euros: 15300, micro_foncier_abattement_pourcent: 31, verifie_le: jour });

    // Confirmer sans rien changer est un geste à part entière : il date et se journalise aussi.
    await db.query("reset role");
    await db.query("update public.reperes_fiscaux_reglage set verifie_le = date '2025-03-12' where singleton");
    await simuler({ compte: superviseur, role: "authenticated" });
    await db.query("select public.regler_reperes_fiscaux(15300, 31)");
    expect((await ligne()).verifie).toBe(jour);
    await db.query("select public.regler_reperes_fiscaux(16000, 30)");

    // Trois gestes de la même transaction : on les distingue par leurs valeurs d'avant.
    const lignes = await journal();
    expect(lignes).toHaveLength(3);
    expect(lignes.every((l) => l.auteur === superviseur && l.objet === null)).toBe(true);
    // Seconde reprise du lot D3 (24/11, migration 20261124230000) : chaque ligne de ce réglage dit aussi la source qu'il
    // efface (« source_effacee »). Ici aucune source n'était enregistrée : elle est vide. L'attente d'avant ne la listait pas.
    expect(lignes.map((l) => l.details)).toEqual(expect.arrayContaining([
      { plafond_euros: 15300, abattement_pourcent: 31, verifie_le: jour, plafond_precedent: 15000, abattement_precedent: 30, verification_precedente: null, source_effacee: null },
      { plafond_euros: 15300, abattement_pourcent: 31, verifie_le: jour, plafond_precedent: 15300, abattement_precedent: 31, verification_precedente: "2025-03-12", source_effacee: null },
      { plafond_euros: 16000, abattement_pourcent: 30, verifie_le: jour, plafond_precedent: 15300, abattement_precedent: 31, verification_precedente: jour, source_effacee: null },
    ]));
    // Le journal n'est lisible que du superviseur permanent.
    await simuler({ compte: ordinaire, role: "authenticated" });
    expect((await db.query("select 1 from public.supervision_operations where action = 'reperes_fiscaux'")).rows).toEqual([]);
  });

  it("sans ligne de réglage, la lecture rend null (l'écran ne cite alors aucune valeur) et le réglage la recrée", async () => {
    const superviseur = await compte(true);
    await db.query("reset role");
    await db.query("delete from public.reperes_fiscaux_reglage");
    await simuler({ compte: superviseur, role: "authenticated" });
    expect(await lire()).toBeNull();
    await db.query("select public.regler_reperes_fiscaux(15000, 30)");
    expect(await lire()).toEqual({ ...LIVRAISON, verifie_le: await jourDeParis() });
  });

  it("droits : la lecture pour les comptes et le traitement, le réglage pour les comptes seulement, la table pour personne", async () => {
    const { rows } = await db.query<{ f: string; anon: boolean; compte: boolean; traitement: boolean; definer: boolean; chemin: string }>(`
      select p.proname f, has_function_privilege('anon', p.oid, 'execute') anon,
             has_function_privilege('authenticated', p.oid, 'execute') compte,
             has_function_privilege('service_role', p.oid, 'execute') traitement,
             p.prosecdef definer, array_to_string(p.proconfig, ',') chemin
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname in ('reperes_fiscaux', 'regler_reperes_fiscaux') order by 1`);
    expect(rows).toEqual([
      { f: "regler_reperes_fiscaux", anon: false, compte: true, traitement: false, definer: true, chemin: 'search_path=""' },
      { f: "reperes_fiscaux", anon: false, compte: true, traitement: true, definer: true, chemin: 'search_path=""' },
    ]);
    const [table] = (await db.query<{ rls: boolean; droits: string | null; politiques: number }>(
      "select c.relrowsecurity rls, c.relacl::text droits, (select count(*)::int from pg_policy p where p.polrelid = c.oid) politiques from pg_class c where c.oid = 'public.reperes_fiscaux_reglage'::regclass")).rows;
    expect(table.rls).toBe(true);
    expect(table.politiques).toBe(0);
    expect(table.droits ?? "").not.toMatch(/anon|authenticated|service_role/);
  });

  it("la migration se rejoue sans toucher au réglage du superviseur ; son retour retire tout et se rejoue ; reposée, elle repart de la livraison", async () => {
    await db.query("reset role");
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const etat = async () => (await db.query<{ f: string; e: string; d: string }>(`
      select p.proname f, md5(pg_get_functiondef(p.oid)) e, coalesce(p.proacl::text,'') d
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname in ('reperes_fiscaux', 'regler_reperes_fiscaux') order by 1`)).rows;
    const existeTable = async () => (await db.query<{ t: string | null }>("select to_regclass('public.reperes_fiscaux_reglage')::text t")).rows[0].t !== null;

    // Reprise du lot D3 (24/11) : la migration 20261124210000 réécrit `regler_reperes_fiscaux` (elle y vide la source).
    // Ce test tient la migration du 23/11 seule : on défait d'abord cette réécriture (son retour rend le texte du 23/11),
    // sinon « rejouer ne change rien » comparerait le texte du 23/11 à celui du 24/11.
    // Seconde reprise (20261124230000) : même raison, son retour se joue d'abord (ordre du LISEZ-MOI).
    await db.query(readFileSync("supabase/retours-arriere/20261124230000_reperes_fiscaux_ancien_reglage_journal_source.retour.sql", "utf8"));
    await db.query(readFileSync("supabase/retours-arriere/20261124210000_reperes_fiscaux_ancien_reglage_sans_source.retour.sql", "utf8"));
    await db.query("update public.reperes_fiscaux_reglage set micro_foncier_plafond_euros = 15300, micro_foncier_abattement_pourcent = 31, verifie_le = date '2026-11-23' where singleton");
    const avec = await etat();
    expect(avec).toHaveLength(2);
    await db.query(migration);
    await db.query(migration);
    expect(await etat()).toEqual(avec);
    expect(await ligne()).toMatchObject({ plafond: 15300, abattement: 31, verifie: "2026-11-23" });

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261123090000','reperes_fiscaux_reglage') on conflict do nothing");
    await db.query(retour);
    expect(await etat()).toEqual([]);
    expect(await existeTable()).toBe(false);
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261123090000'")).rows[0].n).toBe(0);
    await db.query(retour);
    expect(await existeTable()).toBe(false);

    // Reposée : mêmes définitions, mêmes droits, et la livraison — aucune date de vérification héritée.
    await db.query(migration);
    expect(await etat()).toEqual(avec);
    expect(await ligne()).toEqual({ plafond: 15000, abattement: 30, verifie: null, par: null, quand: false });
  });
});
