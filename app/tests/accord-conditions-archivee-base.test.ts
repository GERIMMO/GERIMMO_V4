/**
 * DÉCISIONS DU 24/11/2026, LOT D4 (REPRISE) — relecture D4R, défauts D4R-01, D4R-03 et D4R-07 ; RELECTURE DE LA FUSION DU
 * 25/11/2026, constat R-01 (migration 20261125150000_accord_conditions_version_archivee, modifiée en place : jamais
 * appliquée en production).
 *
 *  · R-01 : la première écriture de cette migration faisait REFUSER par `accepter_cgu` tout accord aux conditions
 *    clients sur une version non archivée. Sur une base neuve (CI, banc), le choix du premier mot de passe d'un
 *    propriétaire échouait ; et chaque future version aurait fermé les inscriptions jusqu'à son archivage, refusé dès
 *    qu'il existe un abonné. Désormais `accepter_cgu` ENREGISTRE l'accord, comme avant (texte du 24/10, sans empreinte
 *    pour une version non archivée), et SEULE une ligne qui porte l'empreinte du texte archivé vaut preuve d'accord à
 *    une version : côté application (`preuveConditionsEnVigueur`) et côté base (`abonnements_sans_accord_conditions`,
 *    qui décide la non-reconduction faute d'accord exprès). Une ligne forgée (« 2099-01-01 », ou la version d'après
 *    posée avant son archivage) ne vaut pas preuve, ne masque pas une preuve réelle et ne bloque rien. Essayé ici en
 *    base, sous le rôle `authenticated`, comme le ferait un navigateur.
 *  · Ce qui ne change pas : version archivée (empreinte recopiée), conditions de l'espace artisan, règles des espaces
 *    invités, ouverture d'un espace propriétaire, refus au visiteur ; mêmes droits, SECURITY DEFINER, chemin vide.
 *  · D4R-03 : une relance de loyer envoyée à la main n'est jamais reprise d'elle-même par la tâche des courriels
 *    (la consigne au bail n'est écrite que par l'action du propriétaire) ; les autres types gardent leur reprise.
 *  · Rejeu sans effet ; retour qui rend le texte exact de 20261024100000 à `abonnements_sans_accord_conditions` (et celui
 *    de 20261024090000 à `accepter_cgu`) ; marche avant ensuite ; une base où la première écriture avait été jouée
 *    retrouve le texte du 24/10.
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
const NON_RECONDUCTION = readFileSync("supabase/migrations/20261024100000_acceptation_conditions_et_classement_artisans.sql", "utf8");
/** Le texte d'`accepter_cgu` posé par 20261024090000 : celui que la base garde dans toutes les positions de publication. */
const TEXTE_24_10 = /create or replace function public\.accepter_cgu\([\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(AVANT)?.[1] ?? "";
/** Le texte d'`abonnements_sans_accord_conditions` posé par 20261024100000 (celui que le retour rend). */
const NON_RECONDUCTION_AVANT = /create or replace function public\.abonnements_sans_accord_conditions\([\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(NON_RECONDUCTION)?.[1] ?? "";
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
    expect(code).not.toMatch(/\bgrant\b[^;]*\bauthenticated\b[^;]*abonnements_sans_accord_conditions/i);
    expect(code).not.toMatch(/\bdrop\s+(table|column|function)\b/i);
    // R-01 : deux définisseurs, chacun à chemin vide — `accepter_cgu` (reposée au texte du 24/10 si la première écriture
    // de cette migration avait été jouée) et `abonnements_sans_accord_conditions`.
    expect(code.match(/security definer/g)?.length).toBe(2);
    expect(code.match(/security definer\s+set search_path = ''/g)?.length).toBe(2);
    // R-01 : plus aucun refus d'une version non archivée dans `accepter_cgu`.
    expect(code).not.toMatch(/raise exception 'Version des conditions non archivée/);
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

  // R-01 (relecture de la fusion) : ce test affirmait le REFUS de toute version non archivée. Ce refus bloquait le choix
  // du premier mot de passe d'un propriétaire sur une base neuve (CI rouge) et, en production, les inscriptions à chaque
  // nouvelle version tant qu'elle n'est pas archivée. Il dit désormais la règle sûre : l'accord s'enregistre, SANS
  // empreinte ; c'est l'empreinte qui fait la preuve (tests suivants).
  it("R-01 — sous le rôle authenticated, un accord à une version non archivée s'enregistre, sans empreinte : rien n'est refusé ni bloqué", async () => {
    await session(client);
    for (const appel of [
      "select public.accepter_cgu('2099-01-01', 'compte', 'conditions_clients')",
      "select public.accepter_cgu('2099-01-01')",
      "select public.accepter_cgu(p_version => '2099-01-01', p_source => 'autre-source')",
      "select public.accepter_cgu(' 2099-01-02 ', 'compte')",
      // La version en vigueur avant son archivage : le premier mot de passe d'un propriétaire, l'inscription.
      `select public.accepter_cgu('${CONDITIONS_VERSION}', 'compte', 'conditions_clients')`,
    ]) expect(await echec(appel), appel).toBe("");
    // Une même transaction : même heure d'écriture ; l'ordre se lit par version.
    expect((await lignes(client)).sort((x, y) => x.version.localeCompare(y.version))).toEqual([
      { version: CONDITIONS_VERSION, source: "compte", document: "conditions_clients", empreinte_sha256: null },
      { version: "2099-01-01", source: "compte", document: "conditions_clients", empreinte_sha256: null },
      { version: "2099-01-01", source: "compte", document: "conditions_clients", empreinte_sha256: null },
      { version: "2099-01-01", source: "compte", document: "conditions_clients", empreinte_sha256: null },
      { version: "2099-01-02", source: "compte", document: "conditions_clients", empreinte_sha256: null },
    ]);
    // Les gardes d'entrée restent : version vide ou trop longue, document inconnu.
    expect(await echec("select public.accepter_cgu('  ')")).toMatch(/^22023 Version des conditions invalide/);
    expect(await echec("select public.accepter_cgu('2099-01-01', 'compte', 'autre')")).toMatch(/^22023 Document des conditions invalide/);
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
    // R-01 : des lignes forgées plus récentes (sans empreinte) ne masquent pas la preuve réelle.
    await session(client);
    expect(await echec("select public.accepter_cgu('2099-01-01')")).toBe("");
    expect(await echec("select public.accepter_cgu('2099-01-01', 'espace_proprietaire')")).toBe("");
    expect(await preuveConditionsEnVigueur(supabase, client)).toBe(preuve);
  });

  /** Un espace propriétaire abonné dont `client` est le responsable (abonnement vivant, non programmé pour finir). */
  async function espaceAbonne(): Promise<string> {
    await db.query("reset role");
    const org = (await db.query<{ id: string }>("insert into public.organizations(name,type,status) values('TEST R-01 accord exprès','proprietaire_direct','active') returning id")).rows[0].id;
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [client, org]);
    await db.query(`insert into public.abonnements(organization_id,stripe_subscription_id,stripe_statut,periode_fin,annulation_demandee)
      values($1,$2,'active','2027-03-01T00:00:00Z',false)`, [org, `sub_r01_${org.slice(0, 8)}`]);
    return org;
  }
  async function sansAccord(version: string): Promise<string[]> {
    await role("service_role");
    const { rows } = await db.query<{ organization_id: string }>("select organization_id from public.abonnements_sans_accord_conditions($1)", [version]);
    await db.query("reset role");
    return rows.map((r) => r.organization_id);
  }

  it("R-01, côté base — accord exprès : une ligne forgée sans empreinte, posée AVANT l'archivage de la version, ne vaut pas accord ; la ligne à empreinte, oui ; une ligne forgée ensuite ne la masque pas", async () => {
    const org = await espaceAbonne();
    expect(await archiver("essai-r01-ancienne")).toMatchObject({ statut: "archivee" });
    await session(client);
    expect(await echec("select public.accepter_cgu('essai-r01-ancienne')")).toBe(""); // l'accord réel d'une version antérieure
    // Le compte devine la version suivante et l'« accepte » avant qu'elle soit archivée, par chaque voie ouverte.
    for (const source of ["compte", "espace_proprietaire"]) {
      expect(await echec("select public.accepter_cgu('essai-r01-suivante', $1)", [source])).toBe("");
    }
    expect(await archiver("essai-r01-suivante")).toMatchObject({ statut: "archivee" });
    expect((await lignes(client)).filter((l) => l.version === "essai-r01-suivante").map((l) => l.empreinte_sha256)).toEqual([null, null]);
    // Avant R-01, ces lignes comptaient comme accord : l'espace sortait de la liste sans avoir donné d'accord prouvé.
    expect(await sansAccord("essai-r01-suivante")).toContain(org);
    // L'accord exprès réel, sur la version archivée (empreinte recopiée), compte.
    await session(client);
    expect(await echec("select public.accepter_cgu('essai-r01-suivante')")).toBe("");
    expect(await sansAccord("essai-r01-suivante")).not.toContain(org);
    // Une ligne forgée de plus, plus récente, ne masque pas cet accord.
    await session(client);
    expect(await echec("select public.accepter_cgu('2099-01-01')")).toBe("");
    expect(await sansAccord("essai-r01-suivante")).not.toContain(org);
  });

  it("R-01, côté base — une ligne forgée ne bloque rien et ne fait pas preuve de commande : l'archivage passe, la supervision la montre, la preuve de commande reste réservée au traitement", async () => {
    await session(client);
    expect(await echec("select public.accepter_cgu('2099-01-01')")).toBe("");
    // L'archivage d'une version n'est pas gêné par une ligne forgée (aucune clé, aucune garde sur les accords).
    expect(await archiver("essai-r01-archivage")).toMatchObject({ statut: "archivee" });
    // La supervision (super-administrateur, /admin/sante) la voit parmi les accords à une version non archivée.
    await role("service_role");
    const { rows } = await db.query<{ version: string }>("select version from public.acceptations_sans_version_archivee() where document = 'conditions_clients'");
    expect(rows.map((r) => r.version)).toContain("2099-01-01");
    await db.query("reset role");
    // La preuve d'une commande ne se lie que par le traitement (clé de service), à partir du journal écrit par le
    // serveur après `preuveConditionsEnVigueur` (empreinte exigée) : un compte connecté ne peut ni l'écrire ni la lier.
    const { rows: droits } = await db.query<{ f: string; compte: boolean; anon: boolean; service: boolean }>(`
      select p.proname f, has_function_privilege('authenticated', p.oid, 'execute') compte, has_function_privilege('anon', p.oid, 'execute') anon,
             has_function_privilege('service_role', p.oid, 'execute') service
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname in ('lier_preuve_commande', 'abonnement_geste_consigner', 'abonnements_sans_accord_conditions') order by 1`);
    expect(droits).toEqual([
      { f: "abonnement_geste_consigner", compte: false, anon: false, service: true },
      { f: "abonnements_sans_accord_conditions", compte: false, anon: false, service: true },
      { f: "lier_preuve_commande", compte: false, anon: false, service: true },
    ]);
  });

  it("droits identiques : compte connecté seulement ; définisseur, chemin vide ; le déclencheur n'est appelable par personne", async () => {
    const { rows } = await db.query<{ f: string; anon: boolean; compte: boolean; definer: boolean; chemin: string }>(`
      select p.proname f, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') compte,
             p.prosecdef definer, coalesce(array_to_string(p.proconfig, ','), '') chemin
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname in ('accepter_cgu', 'abonnements_sans_accord_conditions', 'courriels_relance_manuelle_sans_reprise') order by 1`);
    expect(rows).toEqual([
      { f: "abonnements_sans_accord_conditions", anon: false, compte: false, definer: true, chemin: 'search_path=""' },
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

  it("rejeu sans effet ; `accepter_cgu` garde le texte du 24/10 avant comme après ; le retour rend le texte exact de 20261024100000 à la non-reconduction et retire le déclencheur ; marche avant ensuite", async () => {
    const src = async (signature: string) => (await db.query<{ src: string }>("select prosrc src from pg_proc where oid = $1::text::regprocedure", [signature])).rows[0].src;
    const corps = () => src("public.accepter_cgu(text,text,text)");
    const nonReconduction = () => src("public.abonnements_sans_accord_conditions(text)");
    const declencheur = async () => (await db.query("select 1 from pg_trigger where tgname = 'relance_loyer_manuelle_sans_reprise' and not tgisinternal")).rowCount;
    expect(TEXTE_24_10).toBeTruthy();
    expect(NON_RECONDUCTION_AVANT).toBeTruthy();
    // R-01 : la migration appliquée, `accepter_cgu` a exactement le texte du 24/10 (aucune garde de plus) : le code en
    // ligne, ancien ou nouveau, appelle la même fonction avant et après elle.
    expect(await corps()).toBe(TEXTE_24_10);
    const migreNonReconduction = await nonReconduction();
    expect(migreNonReconduction).not.toBe(NON_RECONDUCTION_AVANT);
    expect(migreNonReconduction).toContain("c.empreinte_sha256 = v.empreinte_sha256");
    await db.query(MIGRATION);
    expect(await corps()).toBe(TEXTE_24_10);
    expect(await nonReconduction()).toBe(migreNonReconduction);
    expect(await declencheur()).toBe(1);
    await db.query(RETOUR);
    await db.query(RETOUR);
    expect(await corps()).toBe(TEXTE_24_10);
    expect(await nonReconduction()).toBe(NON_RECONDUCTION_AVANT);
    expect(await declencheur()).toBe(0);
    expect((await db.query("select has_function_privilege('anon', 'public.accepter_cgu(text,text,text)'::regprocedure, 'execute') a, has_function_privilege('authenticated', 'public.accepter_cgu(text,text,text)'::regprocedure, 'execute') c")).rows[0])
      .toEqual({ a: false, c: true });
    expect((await db.query("select has_function_privilege('authenticated', 'public.abonnements_sans_accord_conditions(text)'::regprocedure, 'execute') c, has_function_privilege('service_role', 'public.abonnements_sans_accord_conditions(text)'::regprocedure, 'execute') s")).rows[0])
      .toEqual({ c: false, s: true });
    await session(client);
    expect(await echec("select public.accepter_cgu('2099-01-01')")).toBe("");
    await db.query("reset role");
    await db.query(MIGRATION);
    expect(await corps()).toBe(TEXTE_24_10);
    expect(await nonReconduction()).toBe(migreNonReconduction);
    await session(client);
    expect(await echec("select public.accepter_cgu('2099-01-03')")).toBe("");
  });

  it("R-01 — une base où la première écriture de cette migration avait été jouée (refus des versions non archivées) retrouve le texte du 24/10", async () => {
    // La première écriture, reconstituée : le texte du 24/10 avec le refus d'une version non archivée.
    const ancienne = TEXTE_24_10.replace(
      "  insert into public.acceptations_cgu",
      `  if coalesce(p_source, 'compte') <> 'espace_proprietaire' and p_document = 'conditions_clients'
     and not exists (select 1 from public.versions_conditions v where v.document = 'conditions_clients' and v.version = btrim(p_version)) then
    raise exception 'Version des conditions non archivée : accord non enregistré' using errcode = '22023';
  end if;
  insert into public.acceptations_cgu`);
    expect(ancienne).not.toBe(TEXTE_24_10);
    await db.query(`create or replace function public.accepter_cgu(p_version text, p_source text default 'compte', p_document text default 'conditions_clients')
      returns void language plpgsql security definer set search_path = '' as $$${ancienne}$$`);
    await session(client);
    expect(await echec("select public.accepter_cgu('2099-01-05')")).toMatch(/^22023 Version des conditions non archivée/);
    await db.query("reset role");
    await db.query(MIGRATION);
    expect((await db.query<{ src: string }>("select prosrc src from pg_proc where oid = 'public.accepter_cgu(text,text,text)'::regprocedure")).rows[0].src).toBe(TEXTE_24_10);
    await session(client);
    expect(await echec("select public.accepter_cgu('2099-01-05')")).toBe("");
  });

});
