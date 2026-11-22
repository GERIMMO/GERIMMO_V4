/**
 * L'INTERRUPTEUR « IA ACTIVÉE / DÉSACTIVÉE » DANS LA BASE — mission palier 1 (22/11/2026).
 *
 * Ce que ces tests tiennent, sous les vrais rôles :
 *  1. par défaut l'IA est activée : la livraison ne change rien ;
 *  2. seul le superviseur permanent (double vérification) bascule l'interrupteur, et le geste est journalisé ;
 *  3. IA désactivée : les DEUX gardes par lesquelles passe chaque appel payant rendent « desactive », avant l'arrêt
 *     d'urgence et avant la limite, et RIEN n'est compté (ni appel, ni refus, ni compteur du compte) ;
 *  4. IA réactivée : tout reprend comme avant ;
 *  5. `ia_disponible()` est la seule lecture offerte aux comptes ordinaires (la table reste fermée) ; anon n'a rien ;
 *  6. la migration se rejoue sans effet, son retour rend les définitions d'avant à l'identique, une définition
 *     inattendue arrête tout.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261122120000_interrupteur_ia";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("interrupteur IA — manifeste et retour (sans base)", () => {
  it("la migration est au manifeste une seule fois, après les deux gardes qu'elle modifie, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261014730000_plafond_appels_ia.sql"));
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261028145948_assistant_prive_et_usages_ia.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
  });

  it("les deux gardes sont modifiées en relisant leur définition en vigueur ; aucun droit n'est ouvert à anon", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).toContain("pg_get_functiondef('public.reserver_appel_ia(text)'::regprocedure)");
    expect(sql).toContain("pg_get_functiondef('public.reserver_appel_ia_prive(uuid,text)'::regprocedure)");
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    expect(sql).toContain("revoke all on function public.regler_ia_active(boolean) from public, anon, service_role;");
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
  });
});

describe.skipIf(!url)("interrupteur IA (avec base)", () => {
  let db: Client;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query("begin");
    // Un point de départ connu, quel que soit l'état laissé sur le banc : IA activée, aucun arrêt, limite large, compteur vide.
    await db.query("update public.ia_plafond_reglage set ia_active = true, plafond_jour = 100 where singleton");
    await db.query("update public.supervision_arrets set arrete = false");
    await db.query("delete from public.ia_appels_jour where jour = public.aujourdhui_paris()");
  });
  afterEach(async () => { await db.query("rollback"); });

  async function compte(superviseur = false): Promise<string> {
    await db.query("reset role");
    const { rows: [{ id }] } = await db.query<{ id: string }>(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        'test-interrupteur-ia-'||gen_random_uuid()||'@test.local', 'x', now(),
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
  const reserver = async (usage: string) => (await db.query<{ r: string }>("select public.reserver_appel_ia($1) r", [usage])).rows[0].r;
  const reserverPrive = async (org: string, usage: string) => (await db.query<{ r: string }>("select public.reserver_appel_ia_prive($1,$2) r", [org, usage])).rows[0].r;
  const disponible = async () => (await db.query<{ d: boolean }>("select public.ia_disponible() d")).rows[0].d;
  async function compteurs() {
    await db.query("reset role");
    const jour = (await db.query<{ appels: number; refus: number }>("select appels, refus from public.ia_appels_jour where jour = public.aujourdhui_paris()")).rows[0] ?? { appels: 0, refus: 0 };
    const comptes = (await db.query<{ n: number }>("select coalesce(sum(appels),0)::int n from public.ia_appels_comptes_jour")).rows[0].n;
    return { appels: jour.appels, refus: jour.refus, comptes };
  }
  /** Un espace de propriétaire avec son titulaire : de quoi passer la garde des appels privés. */
  async function espace() {
    const titulaire = await compte();
    const org = (await db.query<{ id: string }>("insert into public.organizations(name,type,status) values('TEST interrupteur IA','proprietaire_direct','active') returning id")).rows[0].id;
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [titulaire, org]);
    return { titulaire, org };
  }

  it("par défaut l'IA est activée : la colonne vaut vrai et chaque rôle autorisé le lit", async () => {
    const { rows: [{ defaut }] } = await db.query<{ defaut: string }>(
      "select column_default defaut from information_schema.columns where table_schema='public' and table_name='ia_plafond_reglage' and column_name='ia_active'");
    expect(defaut).toBe("true");
    const ordinaire = await compte();
    await simuler({ compte: ordinaire, role: "authenticated" });
    expect(await disponible()).toBe(true);
    // La table, elle, reste fermée au compte ordinaire : il ne lit ni la limite ni l'interrupteur.
    expect((await db.query("select * from public.ia_plafond_reglage")).rows).toEqual([]);
    await simuler({ role: "service_role" });
    expect(await disponible()).toBe(true);
    await simuler({ role: "anon" });
    expect(await refus("select public.ia_disponible()")).toMatch(/permission denied/);
    expect(await refus("select public.regler_ia_active(false)")).toMatch(/permission denied/);
  });

  it("seul le superviseur permanent en double vérification bascule l'interrupteur ; le geste est journalisé", async () => {
    const superviseur = await compte(true);
    const ordinaire = await compte();
    await simuler({ compte: ordinaire, role: "authenticated" });
    expect(await refus("select public.regler_ia_active(false)")).toMatch(/Supervision permanente/);
    await simuler({ compte: superviseur, role: "authenticated", aal: "aal1" });
    expect(await refus("select public.regler_ia_active(false)")).toMatch(/Supervision permanente/);
    await simuler({ role: "service_role" });
    expect(await refus("select public.regler_ia_active(false)")).toMatch(/permission denied/);
    await db.query("reset role");
    expect((await db.query("select ia_active from public.ia_plafond_reglage where singleton")).rows[0].ia_active).toBe(true);

    await simuler({ compte: superviseur, role: "authenticated" });
    expect(await refus("select public.regler_ia_active(null)")).toMatch(/activée ou désactivée/);
    await db.query("select public.regler_ia_active(false)");
    expect(await disponible()).toBe(false);
    await db.query("reset role");
    const reglage = (await db.query("select ia_active, modifie_par, plafond_jour from public.ia_plafond_reglage where singleton")).rows[0];
    expect(reglage).toEqual({ ia_active: false, modifie_par: superviseur, plafond_jour: 100 });
    const journal = (await db.query("select action, auteur, details from public.supervision_operations where action='ia_active' and auteur=$1", [superviseur])).rows;
    expect(journal).toEqual([{ action: "ia_active", auteur: superviseur, details: { active: false, precedent: true } }]);

    await simuler({ compte: superviseur, role: "authenticated" });
    await db.query("select public.regler_ia_active(true)");
    expect(await disponible()).toBe(true);
  });

  it("IA désactivée : les deux gardes rendent « desactive » et rien n'est compté, pour chaque usage", async () => {
    const superviseur = await compte(true);
    const { titulaire, org } = await espace();
    await simuler({ compte: superviseur, role: "authenticated" });
    await db.query("select public.regler_ia_active(false)");

    await simuler({ role: "service_role" });
    for (const usage of ["veille", "redaction_veille", "visuel_marketing", "article", "brief", "devis", "atelier"]) expect(await reserver(usage)).toBe("desactive");
    await simuler({ compte: superviseur, role: "authenticated" });
    expect(await reserver("brief")).toBe("desactive");
    await simuler({ compte: titulaire, role: "authenticated" });
    expect(await disponible()).toBe(false);
    for (const usage of ["conversation_privee", "lecture_document"]) expect(await reserverPrive(org, usage)).toBe("desactive");
    expect(await compteurs()).toEqual({ appels: 0, refus: 0, comptes: 0 });
  });

  it("IA désactivée : « desactive » prime sur l'arrêt d'urgence et sur une limite à 0", async () => {
    const superviseur = await compte(true);
    const { titulaire, org } = await espace();
    await db.query("reset role");
    await db.query("insert into public.supervision_arrets (cle, arrete, motif, auteur) values ('global', true, 'Essai de contrôle', $1) on conflict (cle) do update set arrete = true", [superviseur]);
    await db.query("update public.ia_plafond_reglage set plafond_jour = 0 where singleton");
    await simuler({ role: "service_role" });
    expect(await reserver("brief")).toBe("arret");
    await simuler({ compte: superviseur, role: "authenticated" });
    await db.query("select public.regler_ia_active(false)");
    await simuler({ role: "service_role" });
    expect(await reserver("brief")).toBe("desactive");
    await simuler({ compte: titulaire, role: "authenticated" });
    expect(await reserverPrive(org, "conversation_privee")).toBe("desactive");
    expect(await compteurs()).toEqual({ appels: 0, refus: 0, comptes: 0 });
  });

  it("IA réactivée : les appels sont de nouveau accordés et comptés ; un compte hors de l'espace reste refusé", async () => {
    const superviseur = await compte(true);
    const { titulaire, org } = await espace();
    const etranger = await compte();
    await simuler({ compte: superviseur, role: "authenticated" });
    await db.query("select public.regler_ia_active(false)");
    await db.query("select public.regler_ia_active(true)");
    await simuler({ role: "service_role" });
    expect(await reserver("brief")).toBe("accorde");
    await simuler({ compte: titulaire, role: "authenticated" });
    expect(await reserverPrive(org, "lecture_document")).toBe("accorde");
    expect(await compteurs()).toEqual({ appels: 2, refus: 0, comptes: 1 });
    // L'interrupteur n'a rien ouvert : la garde privée revérifie toujours l'adhésion.
    await simuler({ compte: etranger, role: "authenticated" });
    expect(await refus("select public.reserver_appel_ia_prive($1,'conversation_privee')", [org])).toMatch(/Accès refusé/);
  });

  it("la migration se rejoue sans effet ; son retour rend les gardes d'avant ; une définition inattendue arrête tout", async () => {
    await db.query("reset role");
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const empreintes = async () => (await db.query<{ a: string; b: string }>(
      "select md5(pg_get_functiondef('public.reserver_appel_ia(text)'::regprocedure)) a, md5(pg_get_functiondef('public.reserver_appel_ia_prive(uuid,text)'::regprocedure)) b")).rows[0];
    const droits = async () => (await db.query<{ d: string }>(
      "select string_agg(p.proname||':'||coalesce(p.proacl::text,''), ' | ' order by p.proname) d from pg_proc p where p.oid in ('public.reserver_appel_ia(text)'::regprocedure, 'public.reserver_appel_ia_prive(uuid,text)'::regprocedure)")).rows[0].d;
    const existe = async (signature: string) => (await db.query<{ n: number }>("select count(*)::int n from pg_proc where oid = to_regprocedure($1)", [signature])).rows[0].n === 1;
    const colonne = async () => (await db.query<{ n: number }>("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='ia_plafond_reglage' and column_name='ia_active'")).rows[0].n === 1;

    const avecInterrupteur = await empreintes();
    const droitsAvant = await droits();
    await db.query(migration);
    expect(await empreintes()).toEqual(avecInterrupteur);
    expect(await droits()).toBe(droitsAvant);

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122120000','interrupteur_ia') on conflict do nothing");
    await db.query(retour);
    const sansInterrupteur = await empreintes();
    expect(sansInterrupteur.a).not.toBe(avecInterrupteur.a);
    expect(sansInterrupteur.b).not.toBe(avecInterrupteur.b);
    expect((await db.query<{ p: number }>("select position('ia_active' in pg_get_functiondef('public.reserver_appel_ia(text)'::regprocedure)) + position('ia_active' in pg_get_functiondef('public.reserver_appel_ia_prive(uuid,text)'::regprocedure)) p")).rows[0].p).toBe(0);
    expect(await existe("public.regler_ia_active(boolean)")).toBe(false);
    expect(await existe("public.ia_disponible()")).toBe(false);
    expect(await colonne()).toBe(false);
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261122120000'")).rows[0].n).toBe(0);
    expect(await droits()).toBe(droitsAvant);
    // Le retour se rejoue sans effet, et les gardes d'avant répondent toujours.
    await db.query(retour);
    expect(await empreintes()).toEqual(sansInterrupteur);
    await simuler({ role: "service_role" });
    expect(await reserver("brief")).toBe("accorde");
    await db.query("reset role");

    // Une définition qui n'a plus la ligne attendue arrête la migration sans rien changer.
    await db.query("savepoint inattendue");
    await db.query(`do $$ declare d text; begin
      d := replace(pg_get_functiondef('public.reserver_appel_ia(text)'::regprocedure), 'sous arrêt, rien n''est compté.', 'sous arrêt, rien n''est compté !');
      execute d; end $$`);
    await expect(db.query(migration)).rejects.toThrow("Interrupteur IA : définition inattendue de reserver_appel_ia");
    await db.query("rollback to savepoint inattendue");
    expect(await colonne()).toBe(false);

    await db.query(migration);
    expect(await empreintes()).toEqual(avecInterrupteur);
    expect(await droits()).toBe(droitsAvant);
    expect(await existe("public.regler_ia_active(boolean)")).toBe(true);
    expect(await colonne()).toBe(true);
    expect((await db.query("select ia_active from public.ia_plafond_reglage where singleton")).rows[0].ia_active).toBe(true);
  });
});
