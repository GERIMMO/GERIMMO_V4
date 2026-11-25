/**
 * L'ORIGINE D'UN ARTICLE DU JOURNAL — décision du dirigeant du 24/11/2026 (Q13), reprise du lot D1 (M4),
 * migration 20261124110000.
 *
 * Une mention fausse est pire que pas de mention : « Rédigé avec l’aide de l’IA » ne s'affiche que pour un article
 * d'origine « ia ». Ces tests tiennent, sous les vrais rôles :
 *  1. la colonne : « ia » par défaut (les articles existants et la parution automatique), « manuel » sur demande,
 *     aucune autre valeur ;
 *  2. un article « ia » ne redevient jamais « manuel » ; un article « manuel » peut devenir « ia » ;
 *  3. qui lit quoi : le visiteur lit l'origine des seuls articles parus (règle de lecture inchangée) ; il n'écrit rien ;
 *  4. la migration se rejoue sans rien modifier ; son retour garde la colonne et ses valeurs.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261124110000_publications_origine";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const lireFichier = (chemin: string) => readFileSync(chemin, "utf8");

describe("origine d'un article — manifeste, écriture de la migration et code (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé et son test en série", () => {
    const manifeste = lireFichier("e2e/local/ordre-migrations.txt").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(lireFichier("supabase/retours-arriere/LISEZ-MOI.md")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(lireFichier("tests/relais-migrations-manifeste.test.ts")).toContain(`"${NOM}.sql",`);
    expect(lireFichier("vitest.config.ts")).toContain('"tests/publications-origine-base.test.ts"');
  });

  it("la migration est additive : aucune ligne modifiée ou supprimée, aucune politique touchée ; le visiteur ne reçoit que la lecture de cette colonne", () => {
    const sql = lireFichier(`supabase/migrations/${NOM}.sql`).replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/\bpolicy\b/i);
    expect(sql).not.toMatch(/\b(delete from|truncate|drop table|drop column)\b/i);
    expect(sql).not.toMatch(/\bupdate public\./i);
    expect([...sql.matchAll(/grant ([^;]*) to ([a-z_, ]+);/gi)].map((m) => `${m[1].replace(/\s+/g, " ").trim()} → ${m[2].trim()}`))
      .toEqual(["select (origine) on table public.publications → anon"]);
    // Le retour garde la colonne.
    const retour = lireFichier(`supabase/retours-arriere/${NOM}.retour.sql`).replace(/^\s*--.*$/gm, "");
    expect(retour).not.toMatch(/drop column|drop table|delete from public\./i);
  });

  it("seul le brouillon vierge de la supervision pose « manuel » ; les créations assistées gardent le défaut « ia »", () => {
    const actions = lireFichier("src/app/admin/publications/nouvelle/actions.ts");
    const vierge = actions.slice(actions.indexOf("export async function creerArticleVierge"), actions.indexOf("export async function creerArticleIA"));
    const assiste = actions.slice(actions.indexOf("export async function creerArticleIA"));
    expect(vierge).toContain('origine: "manuel",');
    expect(assiste).not.toContain("origine");
    // La parution automatique crée son article sans citer l'origine dans son insertion : elle reçoit « ia ».
    const mission = lireFichier("src/lib/missions-planifiees/marketing.ts");
    expect(mission.match(/\.insert\(\{marketing_jour:[^\n]*/)?.[0]).not.toContain("origine");
    // Nulle part dans l'application un article n'est remis à « manuel ».
    expect(lireFichier("src/app/actions/publications.ts")).not.toMatch(/origine\s*:\s*["']manuel/);
  });
});

describe.skipIf(!url)("origine d'un article (avec base)", () => {
  let db: Client;
  let sa = "", membre = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  const compte = (prefixe: string) => id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
    values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
      $1||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`, [prefixe]);
  async function agir(compteId: string | null, role: "authenticated" | "anon" = "authenticated") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(compteId ? { sub: compteId, role, aal: "aal2", session_id: compteId } : { role })]);
    await db.query(`set local role ${role}`);
  }
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const refus = async (sql: string, p: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, p); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  /** Un article fictif, créé sous le rôle d'administration ; `origine` absente : la valeur par défaut s'applique. */
  const article = (slug: string, statut: "brouillon" | "publiee", origine?: string) => id(
    `insert into public.publications(periode,statut,titre,slug,chapo,corps,facebook_texte,publie_le${origine ? ",origine" : ""})
     values('TEST-ORIGINE',$1,'Article fictif '||$2,$2,'Chapô fictif.',repeat('Corps fictif de l''article. ',12),'Texte fictif.',case when $1='publiee' then now() - interval '1 hour' end${origine ? ",$3" : ""}) returning id`,
    origine ? [statut, slug, origine] : [statut, slug]);
  const origineDe = async (articleId: string) => { await base(); return (await db.query("select origine from public.publications where id=$1", [articleId])).rows[0].origine as string; };
  const REFUS_RETOUR_MANUEL = /garde cette origine : elle ne revient pas à « manuel »/;

  beforeEach(async () => {
    await db.query("begin");
    sa = await compte("sa"); membre = await compte("membre");
    await db.query("insert into auth.sessions(id,user_id) select x,x from unnest($1::uuid[]) x", [[sa, membre]]);
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,null,'super_admin')", [sa]);
  });

  it("« ia » par défaut, « manuel » sur demande, aucune autre valeur", async () => {
    expect(await origineDe(await article("test-origine-defaut", "brouillon"))).toBe("ia");
    expect(await origineDe(await article("test-origine-manuel", "brouillon", "manuel"))).toBe("manuel");
    expect(await refus("insert into public.publications(periode,titre,origine) values('TEST-ORIGINE','Article fictif refusé','humain')")).toMatch(/publications_origine_check/);
    expect(await refus("insert into public.publications(periode,titre,origine) values('TEST-ORIGINE','Article fictif refusé',null)")).toMatch(/null value in column "origine"/);
    // La supervision crée son brouillon vierge sous son propre rôle, comme le fait l'écran.
    await agir(sa);
    const vierge = await id("insert into public.publications(periode,statut,titre,chapo,corps,origine) values('TEST-ORIGINE','brouillon','Brouillon fictif écrit à la main','','','manuel') returning id");
    expect(await origineDe(vierge)).toBe("manuel");
  });

  it("un article « ia » ne redevient jamais « manuel » ; un article « manuel » peut devenir « ia »", async () => {
    const ia = await article("test-origine-ia", "brouillon");
    const manuel = await article("test-origine-main", "brouillon", "manuel");
    await agir(sa);
    expect(await refus("update public.publications set origine='manuel' where id=$1", [ia])).toMatch(REFUS_RETOUR_MANUEL);
    // Les autres modifications d'un article « ia » passent comme avant.
    expect(await refus("update public.publications set titre='Article fictif retouché', origine='ia' where id=$1", [ia])).toBe("");
    // Un article écrit à la main reçoit une aide de l'IA : il devient « ia », définitivement.
    expect(await refus("update public.publications set origine='ia' where id=$1", [manuel])).toBe("");
    expect(await refus("update public.publications set origine='manuel' where id=$1", [manuel])).toMatch(REFUS_RETOUR_MANUEL);
    // Même le rôle d'administration ne revient pas en arrière par mégarde.
    await base();
    expect(await refus("update public.publications set origine='manuel' where id=$1", [ia])).toMatch(REFUS_RETOUR_MANUEL);
    expect([await origineDe(ia), await origineDe(manuel)]).toEqual(["ia", "ia"]);
  });

  it("le visiteur lit l'origine des seuls articles parus ; ni lui ni un compte ordinaire n'écrivent", async () => {
    await article("test-origine-paru-ia", "publiee");
    await article("test-origine-paru-main", "publiee", "manuel");
    await article("test-origine-brouillon", "brouillon", "manuel");
    const lus = async () => (await db.query("select slug, origine from public.publications where slug like 'test-origine-%' order by slug")).rows;
    const PARUS = [{ slug: "test-origine-paru-ia", origine: "ia" }, { slug: "test-origine-paru-main", origine: "manuel" }];
    await agir(null, "anon");
    expect(await lus()).toEqual(PARUS);
    expect(await refus("update public.publications set origine='ia' where slug='test-origine-paru-main'")).toMatch(/permission denied/);
    // Une colonne interne reste fermée au visiteur.
    expect(await refus("select facebook_texte from public.publications")).toMatch(/permission denied/);
    // Un compte connecté ordinaire lit les mêmes articles parus ; la règle d'écriture (supervision seule) ne le laisse rien changer.
    await agir(membre);
    expect(await lus()).toEqual(PARUS);
    expect((await db.query("update public.publications set origine='ia' where slug='test-origine-paru-main' returning id")).rowCount).toBe(0);
    expect(await refus("insert into public.publications(periode,titre,origine) values('TEST-ORIGINE','Article fictif refusé','manuel')")).toMatch(/row-level security/);
  });

  it("structure, rejeu sans effet, retour qui garde la colonne et ses valeurs, nouvelle application", async () => {
    const migration = lireFichier(`supabase/migrations/${NOM}.sql`);
    const retour = lireFichier(`supabase/retours-arriere/${NOM}.retour.sql`);
    const manuel = await article("test-origine-garde", "brouillon", "manuel");
    const etat = async () => (await db.query(`select
        (select column_default from information_schema.columns where table_schema='public' and table_name='publications' and column_name='origine') defaut,
        (select is_nullable from information_schema.columns where table_schema='public' and table_name='publications' and column_name='origine') nullable,
        (select count(*)::int from pg_trigger where tgrelid='public.publications'::regclass and tgname='publications_origine_ia_definitive') declencheur,
        to_regprocedure('public.publications_origine_ia_definitive()') is not null fonction,
        has_column_privilege('anon','public.publications','origine','SELECT') visiteur_lit,
        has_column_privilege('anon','public.publications','origine','UPDATE') visiteur_ecrit,
        has_table_privilege('anon','public.publications','SELECT') visiteur_table`)).rows[0];
    const politiques = async () => (await db.query("select polname, polcmd, pg_get_expr(polqual,polrelid) lecture, pg_get_expr(polwithcheck,polrelid) ecriture from pg_policy where polrelid='public.publications'::regclass order by polname")).rows;
    const APRES = { defaut: "'ia'::text", nullable: "NO", declencheur: 1, fonction: true, visiteur_lit: true, visiteur_ecrit: false, visiteur_table: false };

    await base();
    expect(await etat()).toEqual(APRES);
    const regles = await politiques();
    expect((await db.query("select has_function_privilege(r,'public.publications_origine_ia_definitive()','execute') ok from unnest(array['anon','authenticated']) r")).rows.map((r) => r.ok)).toEqual([false, false]);

    await db.query(migration);
    expect(await etat()).toEqual(APRES);
    expect(await politiques()).toEqual(regles);
    expect(await origineDe(manuel)).toBe("manuel");

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261124110000','publications_origine') on conflict do nothing");
    await db.query(retour);
    expect(await etat()).toEqual({ ...APRES, declencheur: 0, fonction: false, visiteur_lit: false });
    expect(await politiques()).toEqual(regles);
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261124110000'")).rows[0].n).toBe(0);
    expect(await origineDe(manuel)).toBe("manuel"); // la colonne et ses valeurs sont gardées
    await db.query(retour); // rejouable

    await db.query(migration);
    expect(await etat()).toEqual(APRES);
    expect(await origineDe(manuel)).toBe("manuel");
  });
});
