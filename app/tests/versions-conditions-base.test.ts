/**
 * Plan de conformité du 23/10/2026 (lot 1A ; R12, base de R10/R60 et de R15) : migration
 * 20261024090000_versions_conditions_et_archives_comptes.sql et son retour arrière.
 *
 * Sans base : conventions du fichier (rejouable sans transaction interne, `search_path = ''`, fermeture à anon, retour
 * nommé et atomique, manifeste, LISEZ-MOI).
 *
 * Sur une vraie base (SUPABASE_DB_URL), dans une transaction annulée à la fin, la migration rejouée d'abord :
 *  · `versions_conditions` : archivage par la clé de service seulement, empreinte recalculée par la base (identique à
 *    celle du code), ajout seul (UPDATE, DELETE et TRUNCATE refusés, même au propriétaire), lecture anon et
 *    authenticated, version divergente refusée et consignée ;
 *  · `accepter_cgu` : appels existants inchangés (conditions clients), document choisi, document inconnu refusé, version
 *    inconnue ACCEPTÉE (aucune clé étrangère : rien n'empêche une inscription), empreinte posée depuis l'archive ;
 *  · `acceptations_sans_version_archivee()` : super-administrateur (second facteur) seulement ; règles des invités hors
 *    contrôle ;
 *  · `archives_comptes` : anon ne lit rien, un compte ordinaire et un super-administrateur sans second facteur ne voient
 *    rien, le super-administrateur permanent avec second facteur lit ; échéances calculées par la base (preuve 10 ans,
 *    factures 6 ans) ; modification, suppression avant terme et vidage refusés ; purge des factures une à une, puis de
 *    la ligne au terme de la preuve ;
 *  · retour arrière : tables vides retirées, `accepter_cgu(text, text)` rendue au texte exact de 20260927148000, rejeu
 *    sans effet ; tables non vides conservées ; la marche avant se rejoue ensuite.
 * Rejoue la migration et son retour (DDL sur acceptations_cgu) : classé en série (vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { transactionsInterdites } from "../scripts/verifier-transactions-migration.mjs";
import { extraireTexteContractuel, formeDeReference, sha256Hex } from "../src/lib/conditions-versions";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const VERSION = "20261024090000";
const NOM = `${VERSION}_versions_conditions_et_archives_comptes`;
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
const ORIGINE_CGU = readFileSync("supabase/migrations/20260927148000_acceptations_cgu_non_reecrivables.sql", "utf8");
const ARCHIVER = "select public.archiver_version_conditions($1, $2, $3::date, $4, $5, $6::jsonb, $7, $8) as r";

describe("versions des conditions et archives des comptes — fichiers (sans base)", () => {
  it("la migration est rejouable sans transaction interne, sans jour de Paris nommé, et ferme les fonctions à anon", () => {
    expect(transactionsInterdites(MIGRATION)).toEqual([]);
    const code = MIGRATION.replace(/--.*$/gm, "");
    expect(code).not.toContain("aujourdhui_paris");
    expect(code.match(/security definer/g)?.length).toBe(code.match(/security definer\s+set search_path = ''/g)?.length);
    expect(code.trim().endsWith("select public.fermer_fonctions_a_anon();")).toBe(true);
    expect(MIGRATION).toContain(`supabase/retours-arriere/${NOM}.retour.sql`);
    // Aucune clé étrangère des acceptations vers les versions tant que celles-ci ne sont pas archivées en production.
    expect(code).not.toMatch(/references\s+public\.versions_conditions/i);
    // La colonne d'organisation n'appelle pas la garde de lecture seule des abonnements.
    expect(code).not.toMatch(/\borganization_id\b/);
  });

  it("le retour est une seule instruction DO atomique, qui retire sa version d'historique", () => {
    expect(RETOUR.replace(/--.*$/gm, "").trim()).toMatch(/^do \$retour_atomique\$[\s\S]*\$retour_atomique\$;$/);
    expect(RETOUR).toContain(`delete from supabase_migrations.schema_migrations where left(version, 14) = '${VERSION}'`);
  });

  it("manifeste, procédure de retour et classement en série", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261023184512_annonces_locataire_jour_paris.sql"));
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/versions-conditions-base.test.ts"');
  });
});

describe.skipIf(!url)("versions des conditions et archives des comptes (avec base)", () => {
  let db: Client;
  let client = "";
  let autre = "";
  let superviseur = "";

  async function compte(prefixe: string, meta: Record<string, unknown> = {}): Promise<string> {
    const { rows: [{ id, email }] } = await db.query<{ id: string; email: string }>(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         $1 || '-' || gen_random_uuid() || '@example.invalid', 'x', now(), '{}'::jsonb, $2::jsonb, now(), now(),
         '', '', '', '', '')
       returning id, email`,
      [prefixe, JSON.stringify(meta)]
    );
    await db.query("insert into public.accounts (id, email) values ($1, $2) on conflict (id) do nothing", [id, email]);
    return id;
  }

  async function session(id: string, aal = "aal2") {
    await db.query("reset role");
    await db.query(
      "select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated', 'aal', $2::text)::text, true)",
      [id, aal]
    );
    await db.query("set local role authenticated");
  }
  async function serviceRole() {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true)");
    await db.query("set local role service_role");
  }
  async function anon() {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true)");
    await db.query("set local role anon");
  }
  async function proprietaire() {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', '', true)");
  }
  /** Le message d'erreur d'une requête qu'on attend en échec, sans avorter la transaction ; « » si elle passe. */
  async function echec(sql: string, params: unknown[] = []): Promise<string> {
    await db.query("savepoint essai");
    try {
      await db.query(sql, params);
      await db.query("release savepoint essai");
      return "";
    } catch (e) {
      await db.query("rollback to savepoint essai");
      return `${(e as { code?: string }).code} ${(e as Error).message}`;
    }
  }
  async function archiver(texte: string, version = "essai-1", identite: Record<string, unknown> = { email: "contact@example.com" }) {
    const { rows: [{ r }] } = await db.query<{ r: Record<string, unknown> }>(ARCHIVER, [
      "conditions_clients", version, "2026-11-01", "technique", texte, JSON.stringify(identite), sha256Hex(texte), "Essai de la migration.",
    ]);
    return r;
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    await db.query(MIGRATION);
    // Finitions du 24/10 (relecture transverse 2, point 4) : le retour refuse tant qu'une migration plus récente du plan
    // de conformité est inscrite (la base de la CI les inscrit toutes). Retirées de l'historique, dans la transaction
    // du fichier, annulée à la fin.
    await db.query("delete from supabase_migrations.schema_migrations where left(version, 14) > $1 and left(version, 14) <= '20261024140000'", [VERSION]);
    client = await compte("cgu-client");
    autre = await compte("cgu-autre");
    superviseur = await compte("cgu-superviseur");
    await db.query("insert into public.memberships (account_id, organization_id, role, status) values ($1, null, 'super_admin', 'active')", [superviseur]);
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
  });
  afterEach(async () => {
    await db.query("reset role");
    await db.query("rollback to savepoint cas");
  });

  it("la migration rejouée ne change rien, et la base calcule l'empreinte comme le code (UTF-8, insécables comprises)", async () => {
    await db.query(MIGRATION);
    const texte = "<h1>Conditions générales d’utilisation</h1><p>Article 1 : « Éditeur » — 30 %</p>";
    const { rows: [{ h }] } = await db.query<{ h: string }>("select encode(sha256(convert_to($1, 'UTF8')), 'hex') as h", [texte]);
    expect(h).toBe(sha256Hex(texte));
  });

  it("versions : la clé de service archive ; même texte, rien à faire ; autre texte, refus consigné sans valeurs d'identité", async () => {
    await serviceRole();
    expect(await archiver("<p>Texte A</p>")).toMatchObject({ statut: "archivee", empreinte_sha256: sha256Hex("<p>Texte A</p>") });
    expect(await archiver("<p>Texte A</p>")).toMatchObject({ statut: "deja_archivee" });
    const divergente = await archiver("<p>Texte B</p>", "essai-1", { email: "autre@example.com" });
    expect(divergente).toMatchObject({
      statut: "empreinte_differente",
      empreinte_sha256: sha256Hex("<p>Texte A</p>"),
      empreinte_publiee: sha256Hex("<p>Texte B</p>"),
      champs_identite_modifies: ["email"],
    });
    await proprietaire();
    const { rows } = await db.query("select texte_html, empreinte_sha256 from public.versions_conditions where version = 'essai-1'");
    expect(rows).toEqual([{ texte_html: "<p>Texte A</p>", empreinte_sha256: sha256Hex("<p>Texte A</p>") }]);
    const { rows: [journal] } = await db.query<{ details: Record<string, unknown> }>(
      "select details from public.tech_log where evenement = 'conditions_version_divergente' order by created_at desc limit 1"
    );
    expect(journal.details).toMatchObject({ document: "conditions_clients", version: "essai-1", champs_identite_modifies: ["email"] });
    expect(JSON.stringify(journal.details)).not.toContain("example.com");
  });

  it("M2 : seule la présentation diffère (classes, styles) : pas de divergence, ni journal ni alerte ; un mot changé, si", async () => {
    await serviceRole();
    const archive = '<section class="loc-carte space-y-2"><p class="a">Texte A</p></section>';
    expect(await archiver(archive)).toMatchObject({ statut: "archivee" });
    const restylee = '<section class="loc-carte space-y-3"><p class="b" style="color:red">Texte A</p></section>';
    expect(await archiver(restylee)).toMatchObject({
      statut: "presentation_differente",
      empreinte_sha256: sha256Hex(archive),
      empreinte_publiee: sha256Hex(restylee),
    });
    const changee = '<section class="loc-carte space-y-3"><p class="b">Texte B</p></section>';
    expect(await archiver(changee)).toMatchObject({ statut: "empreinte_differente" });
    await proprietaire();
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.tech_log where evenement = 'conditions_version_divergente' and details->>'version' = 'essai-1'"
    );
    expect(rows[0].n).toBe(1);
    expect((await db.query("select texte_html from public.versions_conditions where version = 'essai-1'")).rows).toEqual([{ texte_html: archive }]);
  });

  it("M2 : la base retire la présentation comme la garde du code (formeDeReference)", async () => {
    const page = readFileSync("tests/fixtures/conditions-next-start.html", "utf8");
    const extraction = extraireTexteContractuel(page, "conditions_clients");
    if (!extraction.ok) throw new Error("texte contractuel introuvable");
    const { rows: [{ forme }] } = await db.query<{ forme: string }>("select public.versions_conditions_sans_presentation($1) as forme", [extraction.html]);
    expect(forme).toBe(formeDeReference(extraction.html));
    expect(forme).not.toContain('class="');
  });

  it("versions : une empreinte qui n'est pas celle du texte est refusée, par la fonction comme par l'insertion directe", async () => {
    await serviceRole();
    expect(await echec(ARCHIVER, ["conditions_clients", "essai-2", "2026-11-01", "technique", "<p>X</p>", "{}", "0".repeat(64), "Résumé"]))
      .toMatch(/^22023 Empreinte SHA-256 différente/);
    expect(await echec(
      `insert into public.versions_conditions (document, version, date_effet, nature, texte_html, identite_editeur, empreinte_sha256, resume_modifications)
       values ('conditions_clients', 'essai-2', '2026-11-01', 'technique', '<p>X</p>', '{}', $1, 'Résumé')`, ["0".repeat(64)]
    )).toMatch(/^22023 Empreinte SHA-256 différente/);
    expect(await echec(ARCHIVER, ["regles_invites", "essai-2", "2026-11-01", "technique", "<p>X</p>", "{}", sha256Hex("<p>X</p>"), "Résumé"]))
      .toMatch(/^23514/);
  });

  it("versions : ajout seul, même pour le propriétaire de la table (ni UPDATE, ni DELETE, ni TRUNCATE)", async () => {
    await serviceRole();
    await archiver("<p>Texte A</p>");
    await proprietaire();
    expect(await echec("update public.versions_conditions set resume_modifications = 'autre' where version = 'essai-1'"))
      .toMatch(/^42501 Une version archivée des conditions ne se modifie ni ne se supprime/);
    expect(await echec("delete from public.versions_conditions where version = 'essai-1'"))
      .toMatch(/^42501 Une version archivée des conditions ne se modifie ni ne se supprime/);
    expect(await echec("truncate public.versions_conditions")).toMatch(/^42501/);
    await serviceRole();
    expect(await echec("update public.versions_conditions set resume_modifications = 'autre'")).toMatch(/^42501/);
    expect(await echec("delete from public.versions_conditions")).toMatch(/^42501/);
  });

  it("versions : anon et authenticated lisent, n'écrivent pas et n'appellent pas l'archivage", async () => {
    await serviceRole();
    await archiver("<p>Texte A</p>");
    await anon();
    expect((await db.query("select version from public.versions_conditions where version = 'essai-1'")).rows).toHaveLength(1);
    expect(await echec(ARCHIVER, ["conditions_clients", "essai-3", "2026-11-01", "technique", "<p>X</p>", "{}", sha256Hex("<p>X</p>"), "R"]))
      .toMatch(/^42501/);
    expect(await echec("insert into public.versions_conditions (document, version, date_effet, nature, texte_html, identite_editeur, empreinte_sha256, resume_modifications) values ('conditions_clients','x','2026-11-01','technique','<p>x</p>','{}',null,'r')"))
      .toMatch(/^42501/);
    await session(client);
    expect((await db.query("select version from public.versions_conditions where version = 'essai-1'")).rows).toHaveLength(1);
    expect(await echec(ARCHIVER, ["conditions_clients", "essai-3", "2026-11-01", "technique", "<p>X</p>", "{}", sha256Hex("<p>X</p>"), "R"]))
      .toMatch(/^42501/);
    await session(superviseur);
    expect(await echec(ARCHIVER, ["conditions_clients", "essai-3", "2026-11-01", "technique", "<p>X</p>", "{}", sha256Hex("<p>X</p>"), "R"]))
      .toMatch(/^42501/);
  });

  it("accepter_cgu : les appels existants enregistrent les conditions clients ; le document se choisit ; l'inconnu est refusé", async () => {
    await session(client);
    expect(await echec("select public.accepter_cgu(p_version => 'v-essai', p_source => 'compte')")).toBe("");
    expect(await echec("select public.accepter_cgu('v-essai', 'espace_proprietaire')")).toBe("");
    expect(await echec("select public.accepter_cgu(p_version => 'v-essai', p_document => 'conditions_artisans')")).toBe("");
    expect(await echec("select public.accepter_cgu(p_version => 'v-essai', p_source => 'compte', p_document => 'regles_invites')")).toBe("");
    expect(await echec("select public.accepter_cgu(p_version => 'v-essai', p_document => 'autre')")).toMatch(/^22023 Document des conditions invalide/);
    expect(await echec("select public.accepter_cgu(p_version => 'v-essai', p_source => 'espace_proprietaire', p_document => 'conditions_artisans')"))
      .toMatch(/^22023/);
    const { rows } = await db.query("select source, document from public.acceptations_cgu where account_id = $1 order by created_at, document", [client]);
    expect(rows).toEqual(expect.arrayContaining([
      { source: "compte", document: "conditions_clients" },
      { source: "espace_proprietaire", document: "conditions_clients" },
      { source: "compte", document: "conditions_artisans" },
      { source: "compte", document: "regles_invites" },
    ]));
    expect(rows).toHaveLength(4);
    await anon();
    expect(await echec("select public.accepter_cgu('v-essai')")).toMatch(/^42501/);
  });

  it("une version inconnue s'accepte toujours (inscription comprise) ; l'empreinte vient de l'archive, jamais de l'appelant", async () => {
    // Inscription : le déclencheur de auth.users consigne la version déclarée, archivée ou non.
    const inscrit = await compte("cgu-inscrit", { cgu_version: "version-jamais-archivee" });
    const { rows: [inscription] } = await db.query(
      "select version, source, document, empreinte_sha256 from public.acceptations_cgu where account_id = $1", [inscrit]
    );
    expect(inscription).toEqual({ version: "version-jamais-archivee", source: "inscription", document: "conditions_clients", empreinte_sha256: null });
    await session(client);
    await db.query("select public.accepter_cgu('essai-1')");
    await serviceRole();
    await archiver("<p>Texte A</p>");
    await session(client);
    await db.query("select public.accepter_cgu('essai-1')");
    await proprietaire();
    // Même le propriétaire ne choisit pas l'empreinte : la base la remplace par celle de l'archive (ou la laisse nulle).
    await db.query("insert into public.acceptations_cgu (account_id, version, source, empreinte_sha256) values ($1, 'essai-1', 'compte', $2)", [client, "f".repeat(64)]);
    await db.query("insert into public.acceptations_cgu (account_id, version, source, empreinte_sha256) values ($1, 'inconnue', 'compte', $2)", [client, "f".repeat(64)]);
    const { rows } = await db.query<{ version: string; empreinte_sha256: string | null }>(
      "select version, empreinte_sha256 from public.acceptations_cgu where account_id = $1 order by created_at, id", [client]
    );
    expect(rows.map((r) => [r.version, r.empreinte_sha256])).toEqual(expect.arrayContaining([
      ["essai-1", null],
      ["essai-1", sha256Hex("<p>Texte A</p>")],
      ["inconnue", null],
    ]));
    expect(rows.filter((r) => r.empreinte_sha256 === "f".repeat(64))).toHaveLength(0);
  });

  it("acceptations_sans_version_archivee : super-administrateur avec second facteur seulement ; invités hors contrôle", async () => {
    await session(client);
    await db.query("select public.accepter_cgu('essai-1')");
    await db.query("select public.accepter_cgu('essai-sans-archive')");
    await db.query("select public.accepter_cgu(p_version => 'essai-invites', p_document => 'regles_invites')");
    await serviceRole();
    await archiver("<p>Texte A</p>");
    await session(superviseur);
    const { rows } = await db.query<{ document: string; version: string; acceptations: string }>(
      "select document, version, acceptations from public.acceptations_sans_version_archivee()"
    );
    expect(rows).toContainEqual({ document: "conditions_clients", version: "essai-sans-archive", acceptations: "1" });
    expect(rows.find((r) => r.version === "essai-1")).toBeUndefined();
    expect(rows.find((r) => r.version === "essai-invites")).toBeUndefined();
    await session(superviseur, "aal1");
    expect(await echec("select * from public.acceptations_sans_version_archivee()")).toMatch(/^42501 Accès refusé/);
    await session(client);
    expect(await echec("select * from public.acceptations_sans_version_archivee()")).toMatch(/^42501 Accès refusé/);
    await anon();
    expect(await echec("select * from public.acceptations_sans_version_archivee()")).toMatch(/^42501/);
  });

  const INSERER_ARCHIVE = `insert into public.archives_comptes
      (account_id_origine, organisation_id_origine, email, stripe_customer_id, acceptations, debut_abonnement, fin_dernier_abonnement_paye, factures)
    values ($1, $2, 'ferme@example.invalid', 'cus_essai', '[{"version":"2026-09-30"}]', $3::date, $4::date, $5::jsonb)
    returning id, preuve_conservee_jusqu_au::text as preuve, factures_conservees_jusqu_au::text as factures_jusqu_au`;

  it("archives : échéances calculées par la base, preuve 10 ans après la fin payée, factures 6 ans après la plus récente", async () => {
    await serviceRole();
    const { rows: [a] } = await db.query(INSERER_ARCHIVE, [
      autre, null, "2026-01-31", "2026-10-31", JSON.stringify([{ numero: "F-1", emise_le: "2026-01-31" }, { numero: "F-2", emise_le: "2026-09-30" }]),
    ]);
    expect(a).toMatchObject({ preuve: "2036-10-31", factures_jusqu_au: "2032-09-30" });
    expect(await echec(INSERER_ARCHIVE, [autre, null, null, null, "[]"])).toMatch(/^23502/);
    expect(await echec(INSERER_ARCHIVE, [client, null, null, "2026-10-31", JSON.stringify([{ numero: "F-3" }])]))
      .toMatch(/^22023 Chaque facture archivée porte sa date d'émission/);
    // Une archive par compte et par organisation, organisation absente comprise.
    expect(await echec(INSERER_ARCHIVE, [autre, null, null, "2026-10-31", "[]"])).toMatch(/^23505/);
  });

  it("archives : lecture réservée au super-administrateur permanent avec second facteur ; anon ne lit rien", async () => {
    await serviceRole();
    await db.query(INSERER_ARCHIVE, [autre, null, null, "2026-10-31", "[]"]);
    await anon();
    expect(await echec("select id from public.archives_comptes")).toMatch(/^42501/);
    await session(autre);
    expect((await db.query("select id from public.archives_comptes")).rows).toHaveLength(0);
    expect(await echec("insert into public.archives_comptes (account_id_origine, fin_dernier_abonnement_paye) values ($1, '2026-10-31')", [autre]))
      .toMatch(/^42501/);
    await session(superviseur, "aal1");
    expect((await db.query("select id from public.archives_comptes")).rows).toHaveLength(0);
    await session(superviseur);
    expect((await db.query("select email from public.archives_comptes where account_id_origine = $1", [autre])).rows).toEqual([{ email: "ferme@example.invalid" }]);
    expect(await echec("update public.archives_comptes set email = null")).toMatch(/^42501/);
  });

  it("archives : ni modification, ni suppression avant terme, ni vidage — même pour la clé de service et le propriétaire", async () => {
    await serviceRole();
    const { rows: [a] } = await db.query<{ id: string }>(INSERER_ARCHIVE, [autre, null, null, "2026-10-31", JSON.stringify([{ emise_le: "2026-10-01" }])]);
    expect(await echec("update public.archives_comptes set email = 'x@example.invalid' where id = $1", [a.id])).toMatch(/^42501 Une archive de compte ne se modifie pas/);
    expect(await echec("update public.archives_comptes set factures = '[]' where id = $1", [a.id])).toMatch(/^42501 Seules les factures arrivées au terme/);
    expect(await echec("update public.archives_comptes set preuve_conservee_jusqu_au = '2000-01-01' where id = $1", [a.id])).toMatch(/^42501/);
    expect(await echec("delete from public.archives_comptes where id = $1", [a.id])).toMatch(/^42501 Une archive de compte ne se supprime qu'au terme/);
    await proprietaire();
    expect(await echec("delete from public.archives_comptes where id = $1", [a.id])).toMatch(/^42501/);
    expect(await echec("truncate public.archives_comptes")).toMatch(/^42501 Les archives de comptes ne se vident pas/);
  });

  it("M4 : la date de purge est celle de la base, et ne se touche pas sans retrait de facture", async () => {
    await serviceRole();
    const { rows: [a] } = await db.query<{ id: string }>(INSERER_ARCHIVE, [
      autre, null, "2012-01-01", "2026-10-31", JSON.stringify([{ numero: "F-2012", emise_le: "2012-01-31" }, { numero: "F-2026", emise_le: "2026-10-01" }]),
    ]);
    // Sans retrait de facture, la date de purge ne se modifie pas.
    expect(await echec("update public.archives_comptes set factures_purgees_le = '2000-01-01' where id = $1", [a.id])).toMatch(/^42501/);
    // Avec un retrait légitime, la date posée par l'appelant est remplacée par l'heure de la base.
    expect(await echec(
      "update public.archives_comptes set factures = $2::jsonb, factures_purgees_le = '2000-01-01' where id = $1",
      [a.id, JSON.stringify([{ numero: "F-2026", emise_le: "2026-10-01" }])]
    )).toBe("");
    const { rows: [l] } = await db.query<{ ok: boolean }>("select factures_purgees_le = now() as ok from public.archives_comptes where id = $1", [a.id]);
    expect(l.ok).toBe(true);
  });

  it("M4 : une facture en double compte pour deux — ni retrait d'une copie avant terme, ni copie ajoutée", async () => {
    await serviceRole();
    const facture = { numero: "F-2026", emise_le: "2026-10-01" };
    const { rows: [a] } = await db.query<{ id: string }>(INSERER_ARCHIVE, [autre, null, null, "2026-10-31", JSON.stringify([facture, facture])]);
    expect(await echec("update public.archives_comptes set factures = $2::jsonb where id = $1", [a.id, JSON.stringify([facture])]))
      .toMatch(/^42501 Seules les factures arrivées au terme/);
    expect(await echec("update public.archives_comptes set factures = $2::jsonb where id = $1", [a.id, JSON.stringify([facture, facture, facture])]))
      .toMatch(/^42501 Seules les factures arrivées au terme/);
    // Une copie échue d'une facture en double se retire, l'autre aussi : chacune à son terme.
    const vieille = { numero: "F-2012", emise_le: "2012-01-31" };
    const { rows: [b] } = await db.query<{ id: string }>(INSERER_ARCHIVE, [client, null, null, "2026-10-31", JSON.stringify([vieille, vieille, facture])]);
    expect(await echec("update public.archives_comptes set factures = $2::jsonb where id = $1", [b.id, JSON.stringify([vieille, facture])])).toBe("");
  });

  it("archives : la purge retire chaque facture à ses six ans, puis la ligne au terme de la preuve ; réservée à la clé de service", async () => {
    await serviceRole();
    // Fin payée en 2014 : preuve jusqu'au 31/01/2024, échue. Une facture de 2012 (échue), une de 2021 (pas encore).
    const { rows: [encore] } = await db.query<{ id: string }>(INSERER_ARCHIVE, [
      autre, null, "2012-01-01", "2014-01-31", JSON.stringify([{ numero: "F-2012", emise_le: "2012-01-31" }, { numero: "F-2021", emise_le: "2021-01-31" }]),
    ]);
    // Tout est échu : factures de 2013, preuve jusqu'au 31/01/2024.
    const { rows: [echue] } = await db.query<{ id: string }>(INSERER_ARCHIVE, [
      client, null, "2012-01-01", "2014-01-31", JSON.stringify([{ numero: "F-2013", emise_le: "2013-06-30" }]),
    ]);
    // Rien d'échu.
    const { rows: [recente] } = await db.query<{ id: string }>(INSERER_ARCHIVE, [superviseur, null, "2026-01-01", "2026-10-31", JSON.stringify([{ emise_le: "2026-10-01" }])]);
    const { rows: [{ bilan }] } = await db.query("select public.purger_archives_comptes() as bilan");
    expect(bilan).toEqual({ archives_comptes_factures_retirees: 2, archives_comptes_supprimees: 1 });
    const { rows } = await db.query<{ id: string; factures: unknown[]; purge: boolean }>(
      "select id, factures, factures_purgees_le is not null as purge from public.archives_comptes where id = any($1)", [[encore.id, echue.id, recente.id]]
    );
    expect(rows.find((r) => r.id === echue.id)).toBeUndefined();
    expect(rows.find((r) => r.id === encore.id)).toMatchObject({ factures: [{ numero: "F-2021", emise_le: "2021-01-31" }], purge: true });
    expect(rows.find((r) => r.id === recente.id)).toMatchObject({ factures: [{ emise_le: "2026-10-01" }], purge: false });
    // Rejouée, elle ne retire rien de plus.
    expect((await db.query("select public.purger_archives_comptes() as bilan")).rows[0].bilan)
      .toEqual({ archives_comptes_factures_retirees: 0, archives_comptes_supprimees: 0 });
    await session(superviseur);
    expect(await echec("select public.purger_archives_comptes()")).toMatch(/^42501/);
  });

  it("retour : tables vides retirées, accepter_cgu rendue au texte exact du 27/09, rejeu sans effet, puis marche avant", async () => {
    await db.query(RETOUR);
    const { rows: fonctions } = await db.query<{ args: string; src: string }>(
      "select pg_get_function_identity_arguments(oid) as args, prosrc as src from pg_proc where proname = 'accepter_cgu' and pronamespace = 'public'::regnamespace"
    );
    expect(fonctions.map((f) => f.args)).toEqual(["p_version text, p_source text"]);
    const corps = /create or replace function public\.accepter_cgu[\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(ORIGINE_CGU)?.[1];
    expect(corps).toBeTruthy();
    expect(fonctions[0].src).toBe(corps);
    const { rows: [objets] } = await db.query(`select to_regclass('public.versions_conditions') as v, to_regclass('public.archives_comptes') as a,
      to_regprocedure('public.acceptations_sans_version_archivee()') as c, to_regprocedure('public.purger_archives_comptes()') as p`);
    expect(objets).toEqual({ v: null, a: null, c: null, p: null });
    // Les colonnes des acceptations restent : elles portent des acceptations déjà enregistrées.
    const { rows: colonnes } = await db.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'acceptations_cgu' and column_name in ('document', 'empreinte_sha256') order by 1");
    expect(colonnes.map((c) => c.column_name)).toEqual(["document", "empreinte_sha256"]);
    await session(client);
    expect(await echec("select public.accepter_cgu(p_version => 'v-retour', p_source => 'compte')")).toBe("");
    await proprietaire();
    await db.query(RETOUR);
    await db.query(MIGRATION);
    expect((await db.query("select pg_get_function_identity_arguments(oid) as args from pg_proc where proname = 'accepter_cgu'")).rows)
      .toEqual([{ args: "p_version text, p_source text, p_document text" }]);
    await serviceRole();
    expect(await archiver("<p>Texte A</p>")).toMatchObject({ statut: "archivee" });
  });

  it("retour : une table qui porte des preuves est conservée telle quelle", async () => {
    await serviceRole();
    await archiver("<p>Texte A</p>");
    await db.query(INSERER_ARCHIVE, [autre, null, null, "2026-10-31", "[]"]);
    await proprietaire();
    await db.query(RETOUR);
    expect((await db.query("select count(*)::int as n from public.versions_conditions")).rows[0].n).toBe(1);
    expect((await db.query("select count(*)::int as n from public.archives_comptes")).rows[0].n).toBe(1);
    expect(await echec("delete from public.versions_conditions")).toMatch(/^42501/);
    expect(await echec("delete from public.archives_comptes")).toMatch(/^42501/);
    await db.query(MIGRATION);
    await serviceRole();
    expect(await archiver("<p>Texte A</p>")).toMatchObject({ statut: "deja_archivee" });
  });
});
