/**
 * UNE PIÈCE DÉJÀ RANGÉE JUSTIFIE UNE RETENUE, DANS LA BASE — décision du dirigeant du 24/11/2026 (Q49), reprise du
 * lot D3 (B1).
 *
 * Un même devis doit pouvoir justifier plusieurs retenues, et l'état des lieux de sortie déjà rangé doit pouvoir
 * servir de justificatif : l'écran rattache la pièce existante par `justifier_retenue` et `ajouter_retenue`. La
 * migration 20261124200000 pose le garde-fou de ce rattachement. Ce que ces tests tiennent, sous les vrais rôles :
 *  1. un même document justifie deux retenues, sans copie ; l'état des lieux de sortie du bail aussi ;
 *  2. jamais une pièce d'un autre espace, ni une pièce purgée, ni un identifiant inconnu (même message) — par
 *     `justifier_retenue` comme par `ajouter_retenue`, qui l'acceptait avant ;
 *  3. jamais une pièce rangée dans le dossier d'un autre bail ;
 *  4. un agent limité à son portefeuille ne rattache pas une pièce qu'il ne peut pas lire ;
 *  5. un compte d'un autre espace, un visiteur, une écriture directe : refusés ;
 *  6. la migration se rejoue ; son retour retire le déclencheur et sa fonction, sans toucher aux données.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261124200000_justificatif_retenue_piece_existante";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("pièce existante d'une retenue — manifeste, retour et droits écrits (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé et son test en série", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261124190000_reperes_fiscaux_source.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/justificatif-retenue-piece-existante-base.test.ts"');
  });

  it("additive : aucune fonction existante réécrite, aucun droit ouvert, aucune règle de lecture touchée, aucune donnée écrite", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql.match(/create or replace function public\.(\w+)/g)).toEqual(["create or replace function public.garde_justificatif_retenue"]);
    expect(sql).not.toMatch(/\bgrant\b/i);
    expect(sql).not.toMatch(/\bpolicy\b|row level security/i);
    expect(sql).toContain("revoke all on function public.garde_justificatif_retenue() from public, anon, authenticated, service_role;");
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
    expect(sql.replace(/\$\$[\s\S]*?\$\$/g, "")).not.toMatch(/insert into|update public\.|delete from/i);
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(retour).not.toMatch(/delete from public\.|drop table|truncate/i);
  });
});

describe.skipIf(!url)("pièce existante d'une retenue (avec base)", () => {
  let db: Client;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });

  // Le dossier fictif de chaque test : une agence A (administrateur, agent limité à son portefeuille), un espace B.
  let orgA: string, orgB: string, admin: string, agent: string, adminB: string;
  let bail1: string, bail2: string, restitution: string, retenue1: string, retenue2: string;
  let devis: string, edlSortie: string, pieceAutreBail: string, pieceAutreEspace: string, piecePurgee: string, pieceDeLAgent: string;

  async function compte(): Promise<string> {
    const { rows: [{ id }] } = await db.query<{ id: string }>(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        'test-piece-retenue-'||gen_random_uuid()||'@test.local', 'x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '')
      returning id`);
    return id;
  }
  async function simuler(qui: string | "anon") {
    await db.query("reset role");
    const claims = qui === "anon" ? { role: "anon" } : { sub: qui, role: "authenticated" };
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await db.query(`set local role ${qui === "anon" ? "anon" : "authenticated"}`);
  }
  const refus = async (sql: string, args: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, args); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  /** Une fiche de document vivante, rangée dans l'espace (comme tout dépôt), et dans un bail si `bail` est donné. */
  async function document(org: string, type: string, titre: string, par: string, bail?: string): Promise<string> {
    const { rows: [{ id }] } = await db.query<{ id: string }>(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte, deposited_by)
       values ($1::uuid, $2::public.document_type, $3, $1::uuid::text || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 1000, gen_random_uuid()::text, $4) returning id`,
      [org, type, titre, par]);
    await db.query("insert into public.document_liens (document_id, organization_id, entite, entite_id) values ($1, $2, 'organisation', $2)", [id, org]);
    if (bail) await db.query("insert into public.document_liens (document_id, organization_id, entite, entite_id) values ($1, $2, 'bail', $3)", [id, org, bail]);
    return id;
  }
  async function bailTermine(org: string, nom: string): Promise<{ bail: string; lot: string }> {
    const { rows: [{ id: bien }] } = await db.query<{ id: string }>("insert into public.biens (organization_id, nom, type, address_line1, postal_code, city) values ($1, $2, 'appartement', '1 rue du Test', '75001', 'Paris') returning id", [org, nom]);
    const { rows: [{ id: lot }] } = await db.query<{ id: string }>("insert into public.lots (organization_id, bien_id, nom, etat) values ($1, $2, $3, 'disponible') returning id", [org, bien, nom]);
    const { rows: [{ id: locataire }] } = await db.query<{ id: string }>("insert into public.persons (organization_id, nom, prenom) values ($1, $2, 'Locataire') returning id", [org, nom]);
    const { rows: [{ id: bail }] } = await db.query<{ id: string }>(
      `insert into public.baux (organization_id, lot_id, type, etat, date_debut, date_fin, date_sortie_reelle, loyer_hc, charges, depot_garantie, jour_echeance, locataire_principal, charges_mode, paiement_echeance)
       values ($1, $2, 'nu', 'termine', current_date - 400, current_date - 10, current_date - 10, 600, 40, 600, 5, $3, 'provision', 'echoir') returning id`, [org, lot, locataire]);
    return { bail, lot };
  }
  /** Un mandat actif sur le lot ; `titulaire` : l'agent dont c'est le portefeuille (écrit en administration, comme tests/fixtures/mandat.ts). */
  async function mandat(org: string, lot: string, titulaire: string | null) {
    await db.query("set session_replication_role = replica");
    try {
      const { rows: [{ id: mandant }] } = await db.query<{ id: string }>("insert into public.persons (organization_id, nom, prenom) values ($1, 'Mandant', 'Banc') returning id", [org]);
      const { rows: [{ id }] } = await db.query<{ id: string }>("insert into public.mandats (organization_id, person_id, etat, date_debut, agent_account_id) values ($1, $2, 'actif', current_date, $3) returning id", [org, mandant, titulaire]);
      await db.query("insert into public.mandat_lignes (organization_id, mandat_id, lot_id, date_debut) values ($1, $2, $3, current_date)", [org, id, lot]);
    } finally { await db.query("set session_replication_role = origin"); }
  }
  const pieceDe = async (retenue: string) => {
    await db.query("reset role");
    return (await db.query<{ piece: string | null; sans: boolean }>("select justificatif_document piece, sans_justificatif sans from public.retenues where id = $1", [retenue])).rows[0];
  };
  const nombreDeDocuments = async () => { await db.query("reset role"); return (await db.query<{ n: number }>("select count(*)::int n from public.documents where organization_id = any($1)", [[orgA, orgB]])).rows[0].n; };

  beforeEach(async () => {
    await db.query("begin");
    const org = async (nom: string, type: string) => (await db.query<{ id: string }>("insert into public.organizations (name, type, status) values ($1, $2, 'active') returning id", [nom, type])).rows[0].id;
    orgA = await org("Test pièce retenue A", "agence"); orgB = await org("Test pièce retenue B", "proprietaire_direct");
    admin = await compte(); agent = await compte(); adminB = await compte();
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'admin_agence'), ($3, $2, 'agent'), ($4, $5, 'proprietaire_direct')", [admin, orgA, agent, adminB, orgB]);
    const un = await bailTermine(orgA, "Test pièce retenue, bail 1"), deux = await bailTermine(orgA, "Test pièce retenue, bail 2");
    bail1 = un.bail; bail2 = deux.bail;
    await mandat(orgA, un.lot, agent);   // dans le portefeuille de l'agent
    await mandat(orgA, deux.lot, null);  // hors de son portefeuille
    restitution = (await db.query<{ id: string }>("insert into public.restitutions (organization_id, bail_id, date_remise_cles, delai_mois, depot, impayes, statut) values ($1, $2, current_date - 10, 2, 600, 0, 'en_cours') returning id", [orgA, bail1])).rows[0].id;
    const retenue = async (libelle: string) => (await db.query<{ id: string }>("insert into public.retenues (organization_id, restitution_id, libelle, cout, montant_retenu, sans_justificatif) values ($1, $2, $3, 150, 150, true) returning id", [orgA, restitution, libelle])).rows[0].id;
    retenue1 = await retenue("Peinture du séjour"); retenue2 = await retenue("Peinture de la chambre");
    devis = await document(orgA, "devis", "Devis unique pour deux réparations", admin);
    edlSortie = await document(orgA, "etat_des_lieux", "État des lieux de sortie", admin, bail1);
    pieceAutreBail = await document(orgA, "etat_des_lieux", "État des lieux d'un autre locataire", admin, bail2);
    pieceDeLAgent = await document(orgA, "devis", "Devis déposé par l'agent", agent);
    pieceAutreEspace = await document(orgB, "devis", "Devis d'un autre espace", adminB);
    piecePurgee = await document(orgA, "devis", "Devis purgé", admin);
    await db.query("update public.documents set purged_at = now() where id = $1", [piecePurgee]);
  });
  afterEach(async () => { await db.query("rollback"); });

  const JUSTIFIER = "select public.justifier_retenue($1, $2)";
  const AJOUTER = "select public.ajouter_retenue($1, 'Remplacement d''une vitre', 80, null, null, $2)";

  it("un même devis justifie deux retenues, sans copie ; l'état des lieux de sortie du bail aussi ; une retenue s'ajoute avec une pièce existante", async () => {
    const avant = await nombreDeDocuments();
    await simuler(admin);
    await db.query(JUSTIFIER, [retenue1, devis]);
    await db.query(JUSTIFIER, [retenue2, devis]);
    expect(await pieceDe(retenue1)).toEqual({ piece: devis, sans: false });
    expect(await pieceDe(retenue2)).toEqual({ piece: devis, sans: false });
    await simuler(admin);
    await db.query(AJOUTER, [restitution, edlSortie]);
    await db.query("reset role");
    expect((await db.query("select justificatif_document piece from public.retenues where restitution_id = $1 and libelle = 'Remplacement d''une vitre'", [restitution])).rows).toEqual([{ piece: edlSortie }]);
    expect(await nombreDeDocuments()).toBe(avant);
    // Une retenue déjà justifiée ne change pas de pièce par ce geste (règle d'avant, gardée).
    await simuler(admin);
    expect(await refus(JUSTIFIER, [retenue1, edlSortie])).toMatch(/déjà un justificatif/);
  });

  it("jamais une pièce d'un autre espace, purgée ou inconnue : même refus par les deux fonctions, rien n'est écrit", async () => {
    await simuler(admin);
    for (const piece of [pieceAutreEspace, piecePurgee, "00000000-0000-4000-8000-000000000000"]) {
      expect(await refus(JUSTIFIER, [retenue1, piece]), piece).toMatch(/^Justificatif introuvable$/);
      // Avant la migration, `ajouter_retenue` acceptait ces trois identifiants.
      expect(await refus(AJOUTER, [restitution, piece]), piece).toMatch(/^Justificatif introuvable$/);
    }
    expect(await pieceDe(retenue1)).toEqual({ piece: null, sans: true });
    expect((await db.query("select count(*)::int n from public.retenues where restitution_id = $1", [restitution])).rows[0].n).toBe(2);
  });

  it("jamais une pièce rangée dans le dossier d'un autre bail (lien de dossier ou contrat signé) ; rangée aussi dans ce bail, elle est admise", async () => {
    await simuler(admin);
    expect(await refus(JUSTIFIER, [retenue1, pieceAutreBail])).toMatch(/rangée dans le dossier d'un autre bail/);
    expect(await refus(AJOUTER, [restitution, pieceAutreBail])).toMatch(/rangée dans le dossier d'un autre bail/);
    await db.query("reset role");
    const contrat = await document(orgA, "bail", "Contrat signé de l'autre bail", admin);
    await db.query("update public.baux set document_signe = $1 where id = $2", [contrat, bail2]);
    await simuler(admin);
    expect(await refus(JUSTIFIER, [retenue1, contrat])).toMatch(/rangée dans le dossier d'un autre bail/);
    expect(await pieceDe(retenue1)).toEqual({ piece: null, sans: true });
    // La même pièce, rangée aussi dans le bail de la retenue (une pièce commune aux deux dossiers), est admise.
    await db.query("insert into public.document_liens (document_id, organization_id, entite, entite_id) values ($1, $2, 'bail', $3)", [pieceAutreBail, orgA, bail1]);
    await simuler(admin);
    await db.query(JUSTIFIER, [retenue1, pieceAutreBail]);
    expect(await pieceDe(retenue1)).toEqual({ piece: pieceAutreBail, sans: false });
  });

  it("un agent limité à son portefeuille ne rattache que ce qu'il peut lire", async () => {
    // Ce que l'agent lit vraiment, sous les règles de lecture de `documents` : sa pièce et celles de son bail.
    await simuler(agent);
    const lisibles = (await db.query<{ id: string }>("select id from public.documents where id = any($1)", [[devis, edlSortie, pieceAutreBail, pieceDeLAgent]])).rows.map((r) => r.id).sort();
    expect(lisibles).toEqual([edlSortie, pieceDeLAgent].sort());
    // Le devis déposé par l'administrateur, rangé nulle part dans son portefeuille : il ne le lit pas, il ne le rattache pas.
    expect(await refus(JUSTIFIER, [retenue1, devis])).toMatch(/^Justificatif introuvable$/);
    expect(await refus(AJOUTER, [restitution, devis])).toMatch(/^Justificatif introuvable$/);
    // La pièce d'un bail hors de son portefeuille : même refus, sans dire qu'elle existe.
    expect(await refus(JUSTIFIER, [retenue1, pieceAutreBail])).toMatch(/^Justificatif introuvable$/);
    expect(await pieceDe(retenue1)).toEqual({ piece: null, sans: true });
    // Ce qu'il lit, il le rattache : sa propre pièce, et l'état des lieux du bail de son portefeuille.
    await simuler(agent);
    await db.query(JUSTIFIER, [retenue1, pieceDeLAgent]);
    await db.query(JUSTIFIER, [retenue2, edlSortie]);
    expect(await pieceDe(retenue1)).toEqual({ piece: pieceDeLAgent, sans: false });
    expect(await pieceDe(retenue2)).toEqual({ piece: edlSortie, sans: false });
  });

  it("un compte d'un autre espace, un visiteur et une écriture directe sont refusés", async () => {
    await simuler(adminB);
    expect(await refus(JUSTIFIER, [retenue1, pieceAutreEspace])).toMatch(/Retenue introuvable|Accès refusé/);
    expect(await refus(JUSTIFIER, [retenue1, devis])).toMatch(/Retenue introuvable|Accès refusé/);
    expect(await refus(AJOUTER, [restitution, pieceAutreEspace])).toMatch(/Restitution introuvable|Accès refusé/);
    await simuler("anon");
    expect(await refus(JUSTIFIER, [retenue1, devis])).toMatch(/permission denied/);
    expect(await refus(AJOUTER, [restitution, devis])).toMatch(/permission denied/);
    // Sans passer par les fonctions : la table ne s'écrit pas directement, et le garde-fou ne s'appelle pas.
    await simuler(admin);
    await db.query("savepoint direct");
    const directe = await db.query("update public.retenues set justificatif_document = $1 where id = $2", [pieceAutreEspace, retenue1]).then((r) => r.rowCount, (e: Error) => e.message);
    await db.query("rollback to savepoint direct");
    expect(directe === 0 || /permission denied/.test(String(directe)), String(directe)).toBe(true);
    expect(await refus("select public.garde_justificatif_retenue()")).toMatch(/permission denied/);
    expect(await pieceDe(retenue1)).toEqual({ piece: null, sans: true });
  });

  it("la migration se rejoue ; son retour retire le déclencheur et sa fonction sans toucher aux données, et se rejoue", async () => {
    await db.query("reset role");
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const etat = async () => (await db.query<{ f: string; e: string; d: string; declencheurs: number }>(`
      select p.proname f, md5(pg_get_functiondef(p.oid)) e, coalesce(p.proacl::text,'') d,
             (select count(*)::int from pg_trigger t where t.tgrelid = 'public.retenues'::regclass and t.tgname = 'retenues_justificatif_admis') declencheurs
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname = 'garde_justificatif_retenue'`)).rows;
    const autres = async () => (await db.query<{ f: string; e: string }>(`
      select p.proname f, md5(pg_get_functiondef(p.oid)) e from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname in ('justifier_retenue', 'ajouter_retenue', 'justifier_retenue_avec_piece', 'ajouter_retenue_avec_justificatif') order by 1`)).rows;
    // Seconde reprise du lot D3 (24/11) : la migration 20261124220000 réécrit `garde_justificatif_retenue` (contrôle
    // étendu) et `justifier_retenue` (pièce purgée). Ce test tient 20261124200000 seule : on défait d'abord cette
    // réécriture (son retour rend les deux textes d'avant), sinon « rejouer ne change rien » comparerait deux textes.
    await db.query(readFileSync("supabase/retours-arriere/20261124220000_justificatif_retenue_dossier_du_bail.retour.sql", "utf8"));
    const avec = await etat(), fonctionsDAvant = await autres();
    expect(avec).toHaveLength(1);
    expect(avec[0].declencheurs).toBe(1);
    expect(avec[0].d).not.toMatch(/anon|authenticated|service_role/);
    await db.query(migration);
    await db.query(migration);
    expect(await etat()).toEqual(avec);

    await simuler(admin);
    await db.query(JUSTIFIER, [retenue1, devis]);
    await db.query("reset role");
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261124200000','justificatif_retenue_piece_existante') on conflict do nothing");
    const documents = await nombreDeDocuments();
    await db.query(retour);
    await db.query(retour);
    expect(await etat()).toEqual([]);
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261124200000'")).rows[0].n).toBe(0);
    expect(await autres()).toEqual(fonctionsDAvant);
    expect(await pieceDe(retenue1)).toEqual({ piece: devis, sans: false });
    expect(await nombreDeDocuments()).toBe(documents);
    // Sans le garde-fou, l'état d'avant revient (c'est ce que le LISEZ-MOI annonce) : la pièce d'un autre espace passe.
    await simuler(admin);
    expect(await refus(AJOUTER, [restitution, pieceAutreEspace])).toBe("");

    await db.query("reset role");
    await db.query(migration);
    expect(await etat()).toEqual(avec);
    await simuler(admin);
    expect(await refus(AJOUTER, [restitution, pieceAutreEspace])).toMatch(/^Justificatif introuvable$/);
  });
});
