/**
 * LA SOURCE DU CONTRÔLE DES REPÈRES FISCAUX, DANS LA BASE — décision du dirigeant du 24/11/2026 (Q38).
 *
 * « Contrôle les deux valeurs sur le site officiel, enregistre la date et la source. » Le réglage du 23/11 datait la
 * vérification ; il enregistre maintenant aussi la source (migration 20261124190000). Ce que ces tests tiennent, sous
 * les vrais rôles :
 *  1. à la livraison : aucune source (aucune donnée n'est écrite par la migration) ;
 *  2. tout compte connecté lit les quatre valeurs par `reperes_fiscaux_avec_source()` ; anon n'a rien ;
 *  3. seul le superviseur permanent en double vérification règle ; la source est exigée (une ligne de 10 à 300
 *     caractères) ; la vérification est datée du jour de Paris ; le journal garde la source d'avant et d'après ;
 *  4. les deux fonctions du 23/11 ne sont pas touchées ;
 *  5. la migration se rejoue sans effacer la source ; son retour retire ses deux fonctions et la colonne, se rejoue,
 *     et laisse le réglage du 23/11 intact ; il se joue avant le retour du 23/11.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261124190000_reperes_fiscaux_source";
const AVANT = "20261123090000_reperes_fiscaux_reglage";
/** Une source d'essai, fictive : aucune page officielle n'est citée dans les tests. */
const SOURCE = "Site officiel fictif, page d’essai du 01/01/2026";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("source des repères fiscaux — manifeste, retour et droits écrits (sans base)", () => {
  it("la migration est au manifeste une seule fois, après le réglage du 23/11, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf(`${AVANT}.sql`));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    // Elle cite la fonction du jour de Paris et la table du réglage : son retour est en tête de l'ordre complet.
    expect(lisezMoi).toContain("`20261124190000` (repères fiscaux, source du contrôle");
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/reperes-fiscaux-source-base.test.ts"');
  });

  it("aucun droit n'est ouvert à anon ; aucune donnée n'est écrite ; les fonctions du 23/11 ne sont pas réécrites", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    expect(sql).toContain("revoke all on function public.reperes_fiscaux_avec_source() from public, anon;");
    expect(sql).toContain("revoke all on function public.regler_reperes_fiscaux_avec_source(integer, integer, text) from public, anon, service_role;");
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
    expect(sql).not.toMatch(/function public\.(reperes_fiscaux|regler_reperes_fiscaux)\(/);
    // Hors du corps des fonctions : ni insertion ni mise à jour (la colonne naît vide).
    expect(sql.replace(/\$\$[\s\S]*?\$\$/g, "")).not.toMatch(/insert into|update public\./i);
    // La lecture ne rend que quatre valeurs : ni l'auteur, ni l'heure de la modification.
    const lecture = /create or replace function public\.reperes_fiscaux_avec_source\(\)[\s\S]*?\$\$;/.exec(sql)?.[0] ?? "";
    expect(lecture).not.toMatch(/modifie_par|modifie_le|auth\.|accounts/);
    expect(lecture.match(/'[a-z_]+',/g)).toEqual(["'micro_foncier_plafond_euros',", "'micro_foncier_abattement_pourcent',", "'verifie_le',", "'source',"]);
  });
});

describe.skipIf(!url)("source des repères fiscaux (avec base)", () => {
  let db: Client;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query("begin");
    // Un point de départ connu, quel que soit l'état laissé sur le banc : la livraison.
    await db.query("update public.reperes_fiscaux_reglage set micro_foncier_plafond_euros = 15000, micro_foncier_abattement_pourcent = 30, verifie_le = null, source = null, modifie_le = null, modifie_par = null where singleton");
  });
  afterEach(async () => { await db.query("rollback"); });

  const LIVRAISON = { micro_foncier_plafond_euros: 15000, micro_foncier_abattement_pourcent: 30, verifie_le: null, source: null };

  async function compte(superviseur = false): Promise<string> {
    await db.query("reset role");
    const { rows: [{ id }] } = await db.query<{ id: string }>(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        'test-source-reperes-'||gen_random_uuid()||'@test.local', 'x', now(),
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
  const lire = async () => (await db.query<{ r: unknown }>("select public.reperes_fiscaux_avec_source() r")).rows[0].r;
  const jourDeParis = async () => { await db.query("reset role"); return (await db.query<{ j: string }>("select public.aujourdhui_paris()::text j")).rows[0].j; };
  const ligne = async () => {
    await db.query("reset role");
    return (await db.query<{ plafond: number; abattement: number; verifie: string | null; source: string | null; par: string | null }>(
      "select micro_foncier_plafond_euros plafond, micro_foncier_abattement_pourcent abattement, verifie_le::text verifie, source, modifie_par par from public.reperes_fiscaux_reglage where singleton")).rows[0];
  };
  const journal = async () => {
    await db.query("reset role");
    return (await db.query<{ auteur: string; details: Record<string, unknown> }>(
      "select auteur, details from public.supervision_operations where action = 'reperes_fiscaux' and cree_le >= transaction_timestamp() order by (details->>'plafond_euros')::int")).rows;
  };
  const REGLER = "select public.regler_reperes_fiscaux_avec_source($1, $2, $3)";

  it("à la livraison : aucune source ; la contrainte refuse une source illisible même en écriture directe", async () => {
    expect((await ligne()).source).toBeNull();
    expect(await refus("update public.reperes_fiscaux_reglage set source = 'court'")).toMatch(/reperes_fiscaux_source_lisible/);
    expect(await refus("update public.reperes_fiscaux_reglage set source = $1", [`${SOURCE}\nseconde ligne`])).toMatch(/reperes_fiscaux_source_lisible/);
    expect(await refus("update public.reperes_fiscaux_reglage set source = $1", [` ${SOURCE}`])).toMatch(/reperes_fiscaux_source_lisible/);
    expect(await refus("update public.reperes_fiscaux_reglage set source = $1", ["a".repeat(301)])).toMatch(/reperes_fiscaux_source_lisible/);
  });

  it("tout compte connecté lit les quatre valeurs ; la table reste fermée ; anon n'a rien", async () => {
    const ordinaire = await compte();
    await simuler({ compte: ordinaire, role: "authenticated" });
    expect(await lire()).toEqual(LIVRAISON);
    expect(await refus("select source from public.reperes_fiscaux_reglage")).toMatch(/permission denied/);
    await simuler({ role: "service_role" });
    expect(await lire()).toEqual(LIVRAISON);
    await simuler({ role: "anon" });
    expect(await refus("select public.reperes_fiscaux_avec_source()")).toMatch(/permission denied/);
    expect(await refus(REGLER, [15000, 30, SOURCE])).toMatch(/permission denied/);
  });

  it("seul le superviseur permanent en double vérification règle ; la source est exigée ; un refus ne change rien", async () => {
    const superviseur = await compte(true);
    const ordinaire = await compte();
    await simuler({ compte: ordinaire, role: "authenticated" });
    expect(await refus(REGLER, [16000, 31, SOURCE])).toMatch(/Supervision permanente/);
    await simuler({ compte: superviseur, role: "authenticated", aal: "aal1" });
    expect(await refus(REGLER, [16000, 31, SOURCE])).toMatch(/Supervision permanente/);
    await simuler({ role: "service_role" });
    expect(await refus(REGLER, [16000, 31, SOURCE])).toMatch(/permission denied/);

    await simuler({ compte: superviseur, role: "authenticated" });
    for (const source of [null, "", "   ", "court", "a".repeat(301), `${SOURCE}\nseconde ligne`, `${SOURCE}\tavec tabulation`]) {
      expect(await refus(REGLER, [16000, 31, source]), JSON.stringify(source)).toMatch(/Source du contrôle/);
    }
    expect(await refus(REGLER, [999, 31, SOURCE])).toMatch(/Plafond du micro-foncier/);
    expect(await refus(REGLER, [16000, 100, SOURCE])).toMatch(/Abattement du micro-foncier/);
    expect(await ligne()).toEqual({ plafond: 15000, abattement: 30, verifie: null, source: null, par: null });
    expect(await journal()).toEqual([]);
  });

  it("le réglage enregistre la source avec la date du jour de Paris, et le journal garde la source d'avant", async () => {
    const superviseur = await compte(true);
    const ordinaire = await compte();
    const jour = await jourDeParis();

    await simuler({ compte: superviseur, role: "authenticated" });
    await db.query(REGLER, [15300, 31, `  ${SOURCE}  `]);
    expect(await ligne()).toEqual({ plafond: 15300, abattement: 31, verifie: jour, source: SOURCE, par: superviseur });
    // Le propriétaire lit aussitôt les valeurs, leur date et leur source.
    await simuler({ compte: ordinaire, role: "authenticated" });
    expect(await lire()).toEqual({ micro_foncier_plafond_euros: 15300, micro_foncier_abattement_pourcent: 31, verifie_le: jour, source: SOURCE });

    const autre = "Autre site officiel fictif, page d’essai du 02/02/2026";
    await simuler({ compte: superviseur, role: "authenticated" });
    await db.query(REGLER, [16000, 30, autre]);
    const lignes = await journal();
    expect(lignes.map((l) => l.details)).toEqual([
      { plafond_euros: 15300, abattement_pourcent: 31, verifie_le: jour, source: SOURCE, plafond_precedent: 15000, abattement_precedent: 30, verification_precedente: null, source_precedente: null },
      { plafond_euros: 16000, abattement_pourcent: 30, verifie_le: jour, source: autre, plafond_precedent: 15300, abattement_precedent: 31, verification_precedente: jour, source_precedente: SOURCE },
    ]);
    expect(lignes.every((l) => l.auteur === superviseur)).toBe(true);
  });

  it("les deux fonctions du 23/11 restent telles quelles : mêmes trois valeurs lues, même réglage à deux arguments", async () => {
    const superviseur = await compte(true);
    await simuler({ compte: superviseur, role: "authenticated" });
    expect((await db.query("select public.reperes_fiscaux() r")).rows[0].r).toEqual({ micro_foncier_plafond_euros: 15000, micro_foncier_abattement_pourcent: 30, verifie_le: null });
    await db.query(REGLER, [15300, 31, SOURCE]);
    // L'ancien réglage, que l'application n'appelle plus, ne touche pas la source.
    await db.query("select public.regler_reperes_fiscaux(15400, 32)");
    expect(await ligne()).toMatchObject({ plafond: 15400, abattement: 32, source: SOURCE });
  });

  it("droits : la lecture pour les comptes et le traitement, le réglage pour les comptes seulement", async () => {
    const { rows } = await db.query<{ f: string; anon: boolean; compte: boolean; traitement: boolean; definer: boolean; chemin: string }>(`
      select p.proname f, has_function_privilege('anon', p.oid, 'execute') anon,
             has_function_privilege('authenticated', p.oid, 'execute') compte,
             has_function_privilege('service_role', p.oid, 'execute') traitement,
             p.prosecdef definer, array_to_string(p.proconfig, ',') chemin
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname in ('reperes_fiscaux_avec_source', 'regler_reperes_fiscaux_avec_source') order by 1`);
    expect(rows).toEqual([
      { f: "regler_reperes_fiscaux_avec_source", anon: false, compte: true, traitement: false, definer: true, chemin: 'search_path=""' },
      { f: "reperes_fiscaux_avec_source", anon: false, compte: true, traitement: true, definer: true, chemin: 'search_path=""' },
    ]);
  });

  it("la migration se rejoue sans effacer la source ; son retour retire ses objets seulement, se rejoue ; reposée, la source repart vide", async () => {
    await db.query("reset role");
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const etat = async (noms: string[]) => (await db.query<{ f: string; e: string; d: string }>(`
      select p.proname f, md5(pg_get_functiondef(p.oid)) e, coalesce(p.proacl::text,'') d
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname = any($1::text[]) order by 1`, [noms])).rows;
    const DU_LOT = ["reperes_fiscaux_avec_source", "regler_reperes_fiscaux_avec_source"], DU_23 = ["reperes_fiscaux", "regler_reperes_fiscaux"];
    const colonne = async () => (await db.query("select 1 from information_schema.columns where table_schema='public' and table_name='reperes_fiscaux_reglage' and column_name='source'")).rowCount === 1;

    await db.query("update public.reperes_fiscaux_reglage set micro_foncier_plafond_euros = 15300, verifie_le = date '2026-11-24', source = $1 where singleton", [SOURCE]);
    const avec = await etat(DU_LOT), du23 = await etat(DU_23);
    expect(avec).toHaveLength(2);
    await db.query(migration);
    await db.query(migration);
    expect(await etat(DU_LOT)).toEqual(avec);
    expect(await ligne()).toMatchObject({ plafond: 15300, verifie: "2026-11-24", source: SOURCE });

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261124190000','reperes_fiscaux_source') on conflict do nothing");
    await db.query(retour);
    expect(await etat(DU_LOT)).toEqual([]);
    expect(await colonne()).toBe(false);
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261124190000'")).rows[0].n).toBe(0);
    // Le réglage du 23/11 est intact : mêmes fonctions, mêmes valeurs, même date.
    expect(await etat(DU_23)).toEqual(du23);
    expect((await db.query("select micro_foncier_plafond_euros p, verifie_le::text v from public.reperes_fiscaux_reglage where singleton")).rows[0]).toEqual({ p: 15300, v: "2026-11-24" });
    await db.query(retour);
    expect(await colonne()).toBe(false);
    // Puis le retour du 23/11 se joue sans encombre (ordre du LISEZ-MOI), et le nôtre reste rejouable sans la table.
    await db.query(readFileSync(`supabase/retours-arriere/${AVANT}.retour.sql`, "utf8"));
    await db.query(retour);
    expect((await db.query("select to_regclass('public.reperes_fiscaux_reglage')::text t")).rows[0].t).toBeNull();

    // Reposées dans l'ordre : mêmes définitions, mêmes droits, et aucune source héritée.
    await db.query(readFileSync(`supabase/migrations/${AVANT}.sql`, "utf8"));
    await db.query(migration);
    expect(await etat(DU_LOT)).toEqual(avec);
    expect(await ligne()).toEqual({ plafond: 15000, abattement: 30, verifie: null, source: null, par: null });
  });
});
