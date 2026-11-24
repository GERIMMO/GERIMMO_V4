/**
 * DÉCISIONS DU 24/11/2026, LOT D4 (REPRISE) — relecture D4R, défauts D4R-01, D4R-03 et D4R-07
 * (migration 20261125150000_accord_conditions_version_archivee).
 *
 *  · D4R-01 / D4R-07 : un compte connecté qui appelle DIRECTEMENT `accepter_cgu` ne peut plus enregistrer un accord aux
 *    conditions clients pour une version qui n'est pas archivée (« 2099-01-01 », ou la version en vigueur avant son
 *    archivage) : la ligne n'aurait pas d'empreinte du texte. Essayé ici en base, sous le rôle `authenticated`, comme
 *    le ferait un navigateur — et non par une simulation de l'action serveur.
 *  · Ce qui ne change pas : version archivée (empreinte recopiée), conditions de l'espace artisan, règles des espaces
 *    invités, ouverture d'un espace propriétaire, refus au visiteur ; mêmes droits, SECURITY DEFINER, chemin vide.
 *  · D4R-03 : une relance de loyer envoyée à la main n'est jamais reprise d'elle-même par la tâche des courriels
 *    (la consigne au bail n'est écrite que par l'action du propriétaire) ; les autres types gardent leur reprise.
 *  · Rejeu sans effet ; retour qui rend le texte exact de 20261024090000 ; marche avant ensuite.
 *
 * Nécessite SUPABASE_DB_URL. Tout se joue dans une transaction annulée ; le dernier test rejoue du DDL : fichier en
 * série (FICHIERS_EN_SERIE de vitest.config.ts). Aucun e-mail.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { clientSurPg } from "./fixtures/supabase-sur-pg";

vi.mock("@/lib/editeur-serveur", () => ({ lireEditeur: async () => ({ editeur: {}, indisponible: false }) }));
vi.mock("@/lib/reglage-souscription-serveur", () => ({ lireReglageSouscription: async () => ({ blocageIdentiteActif: true }) }));
import { preuveConditionsEnVigueur } from "../src/lib/garde-souscription-serveur";
import { CONDITIONS_VERSION } from "../src/lib/editeur";

const NOM = "20261125150000_accord_conditions_version_archivee";
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
const AVANT = readFileSync("supabase/migrations/20261024090000_versions_conditions_et_archives_comptes.sql", "utf8");
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const sha256 = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const ARCHIVER = "select public.archiver_version_conditions($1, $2, $3::date, $4, $5, $6::jsonb, $7, $8) as r";

describe("lot D4 (reprise) — fichiers de la migration (sans base)", () => {
  it("au manifeste une fois, après le lot D5, avec son retour listé, au registre des migrations, en série", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261125140000_ancien_parcours_signature_manuelle_droits_retires.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/accord-conditions-archivee-base.test.ts"');
  });

  it("additive : rien d'ouvert au visiteur, aucune table supprimée, définisseur avec chemin vide, sans la fonction du jour", () => {
    const code = MIGRATION.replace(/--.*$/gm, "");
    expect(code).not.toMatch(/\bgrant\b[^;]*\banon\b/i);
    expect(code).not.toMatch(/\bdrop\s+(table|column|function)\b/i);
    expect(code.match(/security definer/g)?.length).toBe(1);
    expect(code).toMatch(/security definer\s+set search_path = ''/);
    expect(code).not.toContain("aujourdhui_paris");
    expect(code).not.toMatch(/_avant_|_maillon_/);
  });
});

describe.skipIf(!url)("lot D4 (reprise) — accord aux conditions et relance à la main (avec base)", () => {
  const db = new Client({ connectionString: url });
  let client = "";

  async function compte(): Promise<string> {
    const { rows: [{ id, email }] } = await db.query<{ id: string; email: string }>(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         'test-d4r-' || gen_random_uuid() || '@example.invalid', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '')
       returning id, email`);
    await db.query("insert into public.accounts (id, email) values ($1, $2) on conflict (id) do nothing", [id, email]);
    return id;
  }
  async function session(id: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated', 'aal', 'aal1')::text, true)", [id]);
    await db.query("set local role authenticated");
  }
  async function role(nom: "anon" | "service_role") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', json_build_object('role', $1::text)::text, true)", [nom]);
    await db.query(`set local role ${nom}`);
  }
  async function echec(sql: string, params: unknown[] = []): Promise<string> {
    await db.query("savepoint essai");
    try { await db.query(sql, params); await db.query("release savepoint essai"); return ""; }
    catch (e) { await db.query("rollback to savepoint essai"); return `${(e as { code?: string }).code} ${(e as Error).message}`; }
  }
  async function archiver(version: string, texte = "<p>Texte fictif des conditions</p>") {
    await role("service_role");
    const { rows: [{ r }] } = await db.query<{ r: Record<string, unknown> }>(ARCHIVER,
      ["conditions_clients", version, "2026-11-01", "substantielle", texte, JSON.stringify({ email: "contact@example.com" }), sha256(texte), "Essai de la reprise D4."]);
    await db.query("reset role");
    return r;
  }
  async function lignes(id: string) {
    await db.query("reset role");
    return (await db.query<{ version: string; source: string; document: string; empreinte_sha256: string | null }>(
      "select version, source, document, empreinte_sha256 from public.acceptations_cgu where account_id = $1 order by created_at, id", [id])).rows;
  }

  beforeAll(async () => {
    await db.connect();
    await db.query("begin");
    client = await compte();
  });
  afterAll(async () => { await db.query("rollback"); await db.end(); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("reset role"); await db.query("rollback to savepoint cas"); });

  it("D4R-01 — sous le rôle authenticated, une version des conditions clients non archivée est refusée, rien n'est écrit", async () => {
    await session(client);
    for (const appel of [
      "select public.accepter_cgu('2099-01-01', 'compte', 'conditions_clients')",
      "select public.accepter_cgu('2099-01-01')",
      "select public.accepter_cgu(p_version => '2099-01-01', p_source => 'autre-source')",
      "select public.accepter_cgu(' 2099-01-02 ', 'compte')",
    ]) expect(await echec(appel), appel).toMatch(/^22023 Version des conditions non archivée/);
    expect(await lignes(client)).toEqual([]);
  });

  it("D4R-01 — une version archivée s'accepte, avec l'empreinte de l'archive (souscription et accord à une nouvelle version)", async () => {
    expect(await archiver("essai-d4r-1")).toMatchObject({ statut: "archivee" });
    await session(client);
    expect(await echec("select public.accepter_cgu(p_version => 'essai-d4r-1', p_source => 'compte')")).toBe("");
    expect(await echec("select public.accepter_cgu('essai-d4r-1', 'compte', 'conditions_clients')")).toBe("");
    expect(await lignes(client)).toEqual([
      { version: "essai-d4r-1", source: "compte", document: "conditions_clients", empreinte_sha256: sha256("<p>Texte fictif des conditions</p>") },
      { version: "essai-d4r-1", source: "compte", document: "conditions_clients", empreinte_sha256: sha256("<p>Texte fictif des conditions</p>") },
    ]);
  });

  it("inchangé : conditions de l'espace artisan, règles des invités, ouverture d'un espace propriétaire ; refus au visiteur", async () => {
    await session(client);
    expect(await echec("select public.accepter_cgu('2099-01-01', 'compte', 'conditions_artisans')")).toBe("");
    expect(await echec("select public.accepter_cgu('2099-01-01', 'compte', 'regles_invites')")).toBe("");
    expect(await echec("select public.accepter_cgu('2099-01-01', 'espace_proprietaire')")).toBe("");
    expect(await echec("select public.accepter_cgu('2099-01-01', 'espace_proprietaire', 'conditions_artisans')")).toMatch(/^22023 Document des conditions invalide pour un espace propriétaire/);
    // Ces lignes n'ont pas d'empreinte : elles ne valent pas preuve d'accord aux conditions clients (côté application).
    expect((await lignes(client)).map((l) => [l.source, l.document, l.empreinte_sha256]).sort((x, y) => `${x}`.localeCompare(`${y}`))).toEqual([
      ["compte", "conditions_artisans", null],
      ["compte", "regles_invites", null],
      ["espace_proprietaire", "conditions_clients", null],
    ]);
    await role("anon");
    expect(await echec("select public.accepter_cgu('2099-01-01')")).toMatch(/^42501/);
  });

  it("D4R-01, côté application — une ligne sans empreinte pour la version en vigueur ne vaut pas preuve ; avec l'empreinte de l'archive, oui", async () => {
    const supabase = clientSurPg(db, { transactionnel: true }) as never;
    // Une ligne d'avant la migration (appel direct, version non encore archivée) : posée sans déclencheur, sans empreinte.
    await db.query("reset role");
    await db.query("set local session_replication_role = replica");
    await db.query("insert into public.acceptations_cgu (account_id, version, source, document) values ($1, $2, 'compte', 'conditions_clients')", [client, CONDITIONS_VERSION]);
    await db.query("set local session_replication_role = origin");
    await session(client);
    expect(await preuveConditionsEnVigueur(supabase, client)).toBeNull();
    // Version archivée puis acceptée : la ligne porte l'empreinte, la preuve est rendue.
    await db.query("reset role");
    if ((await db.query("select 1 from public.versions_conditions where document = 'conditions_clients' and version = $1", [CONDITIONS_VERSION])).rowCount === 0) {
      expect(await archiver(CONDITIONS_VERSION)).toMatchObject({ statut: "archivee" });
    }
    await session(client);
    expect(await echec("select public.accepter_cgu($1, 'compte', 'conditions_clients')", [CONDITIONS_VERSION])).toBe("");
    const preuve = await preuveConditionsEnVigueur(supabase, client);
    expect(preuve).toBeTruthy();
    await db.query("reset role");
    expect((await db.query("select empreinte_sha256 is not null e from public.acceptations_cgu where id = $1", [preuve])).rows[0].e).toBe(true);
  });

  it("droits identiques : compte connecté seulement ; définisseur, chemin vide ; le déclencheur n'est appelable par personne", async () => {
    const { rows } = await db.query<{ f: string; anon: boolean; compte: boolean; definer: boolean; chemin: string }>(`
      select p.proname f, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') compte,
             p.prosecdef definer, coalesce(array_to_string(p.proconfig, ','), '') chemin
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname in ('accepter_cgu', 'courriels_relance_manuelle_sans_reprise') order by 1`);
    expect(rows).toEqual([
      { f: "accepter_cgu", anon: false, compte: true, definer: true, chemin: 'search_path=""' },
      { f: "courriels_relance_manuelle_sans_reprise", anon: false, compte: false, definer: false, chemin: 'search_path=""' },
    ]);
    expect((await db.query("select pg_get_function_identity_arguments('public.accepter_cgu(text,text,text)'::regprocedure) a")).rows[0].a)
      .toBe("p_version text, p_source text, p_document text");
  });

  it("D4R-03 — une relance de loyer à la main attachée à son courriel n'a ni reprise autonome ni copie chiffrée ; les autres types gardent la leur", async () => {
    const org = (await db.query<{ id: string }>("insert into public.organizations(name,type,status) values('TEST reprise D4R','proprietaire_direct','active') returning id")).rows[0].id;
    const id = (n: string) => sha256(`d4r-03-${n}-${org}`);
    for (const n of ["manuelle", "autre"]) {
      await db.query(`insert into public.courriels_durables(id, organization_id, empreinte, etat, charge_chiffree, expire_le, reprise_autonome, reprendre_apres)
        values ($1, $2, $3, 'en_attente', 'charge-chiffree-fictive', now() + interval '10 minutes', true, now() - interval '1 minute')`, [id(n), org, sha256(n)]);
    }
    // Comme `attacher_contexte_courriel` : le contexte se pose par une mise à jour, la reprise autonome avec lui.
    await db.query("update public.courriels_durables set contexte_metier = $2::jsonb, finalisation_etat = 'en_attente', reprise_autonome = true where id = $1",
      [id("manuelle"), JSON.stringify({ type: "relance_loyer_manuelle", id: org, niveau: "relance_1", reste: "750", total: "750", acteur: client })]);
    await db.query("update public.courriels_durables set contexte_metier = $2::jsonb, finalisation_etat = 'en_attente', reprise_autonome = true where id = $1",
      [id("autre"), JSON.stringify({ type: "relance_report_rdv", id: org })]);
    const { rows } = await db.query<{ id: string; reprise_autonome: boolean; charge: boolean }>(
      "select id, reprise_autonome, charge_chiffree is not null charge from public.courriels_durables where organization_id = $1", [org]);
    expect(Object.fromEntries(rows.map((r) => [r.id, [r.reprise_autonome, r.charge]]))).toEqual({ [id("manuelle")]: [false, false], [id("autre")]: [true, true] });
    // La tâche des reprises ne la voit pas ; elle voit l'autre.
    const repris = (await db.query<{ id: string }>("select id from public.courriels_a_reprendre() where organization_id = $1", [org])).rows.map((r) => r.id);
    expect(repris).toEqual([id("autre")]);
    // Une réinsertion avec le contexte déjà posé suit la même règle.
    await db.query(`insert into public.courriels_durables(id, organization_id, empreinte, etat, charge_chiffree, expire_le, reprise_autonome, contexte_metier)
      values ($1, $2, $3, 'en_attente', 'x', now() + interval '10 minutes', true, '{"type":"relance_loyer_manuelle"}'::jsonb)`, [id("directe"), org, sha256("directe")]);
    expect((await db.query("select reprise_autonome, charge_chiffree from public.courriels_durables where id = $1", [id("directe")])).rows[0])
      .toEqual({ reprise_autonome: false, charge_chiffree: null });
  });

  it("rejeu sans effet ; le retour rend le texte exact du 24/10 et retire le déclencheur ; marche avant ensuite", async () => {
    const corps = async () => (await db.query<{ src: string }>("select prosrc src from pg_proc where oid = 'public.accepter_cgu(text,text,text)'::regprocedure")).rows[0].src;
    const declencheur = async () => (await db.query("select 1 from pg_trigger where tgname = 'relance_loyer_manuelle_sans_reprise' and not tgisinternal")).rowCount;
    const migre = await corps();
    await db.query(MIGRATION);
    expect(await corps()).toBe(migre);
    expect(await declencheur()).toBe(1);
    await db.query(RETOUR);
    await db.query(RETOUR);
    const attendu = /create or replace function public\.accepter_cgu\([\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(AVANT)?.[1];
    expect(attendu).toBeTruthy();
    expect(await corps()).toBe(attendu);
    expect(await declencheur()).toBe(0);
    expect((await db.query("select has_function_privilege('anon', 'public.accepter_cgu(text,text,text)'::regprocedure, 'execute') a, has_function_privilege('authenticated', 'public.accepter_cgu(text,text,text)'::regprocedure, 'execute') c")).rows[0])
      .toEqual({ a: false, c: true });
    await session(client);
    expect(await echec("select public.accepter_cgu('2099-01-01')")).toBe("");
    await db.query("reset role");
    await db.query(MIGRATION);
    expect(await corps()).toBe(migre);
    await session(client);
    expect(await echec("select public.accepter_cgu('2099-01-03')")).toMatch(/^22023 Version des conditions non archivée/);
  });
});
