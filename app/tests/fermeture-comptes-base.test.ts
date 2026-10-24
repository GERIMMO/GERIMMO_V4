/**
 * Plan de conformité du 23/10/2026, lot 1E (R14, R15, R49, R51) : migration 20261024130000_fermeture_comptes.sql et son
 * retour arrière.
 *
 * Sans base : conventions du fichier (rejouable sans transaction interne, `search_path = ''`, fermeture à anon, aucune
 * colonne `organization_id` dans les tables nouvelles, retour nommé et atomique, manifeste, LISEZ-MOI, classement en série).
 *
 * Sur une vraie base (SUPABASE_DB_URL), dans une transaction annulée à la fin, la migration rejouée d'abord :
 *  · garde de suppression : un compte payant sans archive ne se supprime pas ; un compte qui n'a jamais payé part en
 *    cascade ;
 *  · fermeture : seul titulaire, tout l'espace est effacé (fichiers en file, archive de la preuve, journal d'audit gardé
 *    et détaché) ; plusieurs gérants, seule l'adhésion part ; `persons.account_id` mis à null chez un autre propriétaire,
 *    prévenu par une alerte ; repli sur la neutralisation quand une référence subsiste, puis suppression définitive quand
 *    elle disparaît ; idempotence ; réapplication après restauration (registre en base ou relevé avant restauration) ;
 *  · gardes : date, gel, simulation, sauvegarde du jour, arrêt d'urgence, souscription vivante, signature en cours,
 *    compte de supervision ; droits (rôles de l'API, super-administrateur avec et sans second facteur) ; abonnement payé
 *    en cours (fin de période ou J+14, remboursement réservé à la clé de service) ;
 *  · inactivité : règle inactive sans version, J-60 puis J-15, date annoncée jamais avancée, fermeture une fois les deux
 *    avertissements consignés, une connexion annule, un compte qui n'a pas accepté la version désignée est exclu,
 *    locataire compris ;
 *  · export complet : titulaire et second facteur (ou mot de passe récent) exigés, une demande à la fois, données de
 *    l'organisation sans jetons, téléchargement journalisé (audit et pièces sensibles), suppression après 7 jours ;
 *  · retour arrière : objets retirés, tables non vides conservées, rejeu sans effet, marche avant.
 * Rejoue la migration et son retour, et suspend des déclencheurs pendant l'effacement (DDL) : classé en série.
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { transactionsInterdites } from "../scripts/verifier-transactions-migration.mjs";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const VERSION = "20261024130000";
const NOM = `${VERSION}_fermeture_comptes`;
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");

describe("fermeture des comptes — fichiers (sans base)", () => {
  it("la migration est rejouable sans transaction interne, sans jour de Paris nommé, et ferme les fonctions à anon", () => {
    expect(transactionsInterdites(MIGRATION)).toEqual([]);
    const code = MIGRATION.replace(/--.*$/gm, "");
    expect(code).not.toContain("aujourdhui_paris");
    expect(code.match(/security definer/g)?.length).toBe(code.match(/security definer\s+set search_path = ''/g)?.length);
    expect(code.trim().endsWith("select public.fermer_fonctions_a_anon();")).toBe(true);
    expect(MIGRATION).toContain(`supabase/retours-arriere/${NOM}.retour.sql`);
    // Les tables nouvelles ne portent pas `organization_id` : la garde de lecture seule des abonnements ne s'y pose pas.
    for (const bloc of code.match(/create table if not exists public\.[a-z_]+ \([\s\S]*?\n\);/g) ?? []) {
      expect(bloc).not.toMatch(/^\s+organization_id\b/m);
    }
    // La tâche de nuit appelle la procédure, qui valide chaque fermeture à part (relecture du 24/10, M8).
    expect(code).toContain("select cron.schedule('fermetures-comptes', '20 3 * * *', $$call public.fermetures_comptes_nuit()$$);");
    expect(code).toContain("revoke all on procedure public.fermetures_comptes_nuit() from public, anon, authenticated, service_role;");
  });

  it("le retour est une seule instruction DO atomique, qui retire sa version d'historique", () => {
    expect(RETOUR.replace(/--.*$/gm, "").trim()).toMatch(/^do \$retour_atomique\$[\s\S]*\$retour_atomique\$;$/);
    expect(RETOUR).toContain(`delete from supabase_migrations.schema_migrations where version = '${VERSION}'`);
  });

  it("manifeste, procédure de retour et classement en série", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261024090000_versions_conditions_et_archives_comptes.sql"));
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/fermeture-comptes-base.test.ts"');
  });
});

describe.skipIf(!url)("fermeture des comptes, inactivité, export complet (avec base)", () => {
  let db: Client;
  let superviseur = "";

  async function compte(prefixe: string, version: string | null = "2026-09-30", ilYa = "0 days"): Promise<string> {
    await proprietaire();
    const { rows: [{ id }] } = await db.query<{ id: string }>(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         $1 || '-' || gen_random_uuid() || '@example.invalid', 'x', now(), '{}'::jsonb,
         case when $2::text is null then '{}'::jsonb else jsonb_build_object('cgu_version', $2::text) end,
         now() - $3::interval, now(), now() - $3::interval, '', '', '', '', '')
       returning id`,
      [prefixe, version, ilYa]
    );
    return id;
  }
  async function espace(titulaire: string, nom = "Espace d'essai"): Promise<string> {
    await proprietaire();
    const { rows: [{ id }] } = await db.query<{ id: string }>(
      "insert into public.organizations (name, status, type) values ($1, 'active', 'proprietaire_direct') returning id", [nom]);
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'proprietaire_direct')", [titulaire, id]);
    return id;
  }
  /** Un espace garni : bien et lot, bail et locataire, document avec son fichier, alerte, journal d'audit. */
  async function garnir(org: string, titulaire: string) {
    await session(titulaire);
    const { rows: [{ id: bien }] } = await db.query<{ id: string }>(
      "select public.creer_bien_avec_lot($1,'2 rue Fermeture','appartement'::public.bien_type,'2 rue Fermeture',null,'75002','Paris',1990,false,40,2) as id", [org]);
    await proprietaire();
    const { rows: [{ id: lot }] } = await db.query<{ id: string }>("select id from public.lots where bien_id = $1", [bien]);
    const { rows: [{ id: loc }] } = await db.query<{ id: string }>(
      "insert into public.persons (organization_id, nom, email) values ($1, 'Locataire', 'locataire@example.invalid') returning id", [org]);
    await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, charges, etat, date_debut, jour_echeance)
       values ($1, $2, $3, 700, 50, 'actif', (date_trunc('month', current_date) - interval '3 months')::date, 1)`, [org, lot, loc]);
    await db.query(
      `insert into public.documents (organization_id, type, titre, mime_type, taille_octets, empreinte, storage_path)
       values ($1, 'piece_identite', 'Pièce', 'application/pdf', 10, repeat('a', 64), $2)`, [org, `${org}/pieces/piece.pdf`]);
    await db.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [`${org}/pieces/piece.pdf`]);
    await db.query("insert into public.alerts (organization_id, titre) values ($1, 'Alerte d''essai')", [org]);
    await db.query("insert into public.audit_log (account_id, organization_id, action) values (null, $1, 'essai_fermeture')", [org]);
    const { rows: [{ id: bail }] } = await db.query<{ id: string }>("select id from public.baux where lot_id = $1", [lot]);
    const { rows: [{ id: document }] } = await db.query<{ id: string }>("select id from public.documents where organization_id = $1", [org]);
    return { bien, lot, loc, bail, document };
  }
  /** Ce que les gardes d'état figent : état des lieux signé, encaissement, circuit de signature terminé, colocataire, message. */
  async function garnirFige(org: string, titulaire: string) {
    const base = await garnir(org, titulaire);
    await proprietaire();
    await db.query("insert into public.bail_personnes (organization_id, bail_id, person_id, role) values ($1, $2, $3, 'colocataire')", [org, base.bail, base.loc]);
    const { rows: [{ id: edl }] } = await db.query<{ id: string }>(
      "insert into public.etats_des_lieux (organization_id, bail_id, type) values ($1, $2, 'entree') returning id", [org, base.bail]);
    await db.query("insert into public.edl_lignes (organization_id, edl_id, libelle) values ($1, $2, 'Séjour')", [org, edl]);
    await db.query("update public.etats_des_lieux set etat = 'signe' where id = $1", [edl]);
    await db.query("insert into public.encaissements (organization_id, bail_id, montant) values ($1, $2, 750)", [org, base.bail]);
    await db.query(
      `insert into public.bail_signature_circuits (organization_id, bail_id, document_id, created_by, etat, environnement, empreinte,
         pdf_hash, signataires, prestataire, modele, cible_id, external_request_id)
       values ($1, $2, $3, $4, 'termine', 'sandbox', repeat('b', 64), repeat('c', 64), '[{"r":1},{"r":2}]', 'zoho', 'bail', $2, $5)`,
      [org, base.bail, base.document, titulaire, `zoho-essai-${org.slice(0, 8)}`]);
    await db.query("insert into public.messages (organization_id, person_id, auteur, texte) values ($1, $2, 'gerant', 'Bonjour')", [org, base.loc]);
    return base;
  }
  async function payer(org: string, statut = "canceled", finIlYa = "2 days") {
    await proprietaire();
    await db.query(
      `insert into public.abonnements (organization_id, stripe_customer_id, stripe_subscription_id, stripe_statut,
         premiere_facture_payee, periode_debut, periode_fin, montant_periode_cents)
       values ($1, 'cus_' || substr(md5(random()::text), 1, 12), 'sub_' || substr(md5(random()::text), 1, 12), $2, true,
               now() - $3::interval - interval '1 month', now() - $3::interval, 1200)`, [org, statut, finIlYa]);
    await db.query(
      `insert into public.abonnement_evenements (stripe_event_id, type, charge, traite_le, recu_le)
       select 'evt_' || substr(md5(random()::text), 1, 12), 'invoice.paid',
              jsonb_build_object('objet', 'in_' || substr(md5(random()::text), 1, 12), 'client', a.stripe_customer_id),
              now() - interval '40 days', now() - interval '40 days'
         from public.abonnements a where a.organization_id = $1`, [org]);
  }
  async function session(id: string, aal = "aal2", amr: unknown[] = []) {
    await db.query("reset role");
    await db.query(
      "select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated', 'aal', $2::text, 'amr', $3::json)::text, true)",
      [id, aal, JSON.stringify(amr)]);
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
  /** Le propriétaire des fonctions, sans jeton : comme pg_cron. */
  async function proprietaire() {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', '', true)");
  }
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
  async function un<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
    return (await db.query(sql, params)).rows[0] as T;
  }
  async function nombre(sql: string, params: unknown[] = []): Promise<number> {
    await proprietaire();
    return Number((await un<{ n: string }>(sql, params)).n);
  }
  async function sauvegardeDuJour() {
    await proprietaire();
    await db.query("insert into public.tech_log (account_id, evenement, details) values (null, 'tache_sauvegarde', '{\"echecs\":0}')");
  }
  /** La demande « Données personnelles — Fermer mon compte » du compte (support privé, hors espace). */
  async function demandeFermeture(account: string, titre = "Données personnelles — Fermer mon compte"): Promise<string> {
    await proprietaire();
    const { rows: [{ id }] } = await db.query<{ id: string }>(
      `insert into public.retours_utilisateurs (auteur_id, cle_envoi, nature, titre, description)
       values ($1, gen_random_uuid(), 'question', $2, 'Je souhaite fermer mon compte Gerimmo.') returning id`, [account, titre]);
    return id;
  }
  /**
   * Programmée par le propriétaire des fonctions (procédure interne : seule à pouvoir le faire sans demande rattachée,
   * relecture du 24/10, M6), avancée à aujourd'hui (jour de Paris). La clé de service et le superviseur passent par une
   * demande : voir les cas « droits » et « demande exigée ».
   */
  async function programmer(account: string, choix: string | null = null): Promise<string> {
    await proprietaire();
    const { r } = await un<{ r: { id: string } }>(
      "select public.programmer_fermeture_compte($1, 'super_admin', $2) as r", [account, choix]);
    await db.query("update public.fermetures_comptes set effacement_prevu_le = (now() at time zone 'Europe/Paris')::date where id = $1", [r.id]);
    return r.id;
  }
  async function executer(id: string): Promise<Record<string, unknown>> {
    await proprietaire();
    return (await un<{ r: Record<string, unknown> }>("select public.executer_fermeture_compte($1) as r", [id])).r;
  }
  async function quotidienne(): Promise<Record<string, number>> {
    await proprietaire();
    return (await un<{ r: Record<string, number> }>("select public.fermetures_comptes_quotidiennes() as r")).r;
  }
  async function fermeture(id: string) {
    await proprietaire();
    return un<Record<string, any>>("select * from public.fermetures_comptes where id = $1", [id]); // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    await db.query(MIGRATION);
    superviseur = await compte("fc-superviseur");
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
    await db.query("rollback to savepoint cas");
    await db.query("reset role");
  });

  // ── Garde de suppression ───────────────────────────────────────────────────────────────────────────────────────

  it("garde : un compte payant sans archive ne se supprime pas ; un compte qui n'a jamais payé part en cascade", async () => {
    await db.query(MIGRATION);
    const payant = await compte("fc-payant");
    const org = await espace(payant);
    await payer(org);
    expect(await echec("delete from auth.users where id = $1", [payant])).toMatch(/^42501 .*preuve du contrat payé/);
    const gratuit = await compte("fc-gratuit");
    await espace(gratuit);
    await db.query("delete from public.memberships where account_id = $1", [gratuit]);
    expect(await echec("delete from auth.users where id = $1", [gratuit])).toBe("");
    expect(await nombre("select count(*) n from public.acceptations_cgu where account_id = $1", [gratuit])).toBe(0);
  });

  // ── Fermeture ─────────────────────────────────────────────────────────────────────────────────────────────────

  it("seul titulaire : tout l'espace est effacé, fichiers en file, preuve archivée, audit gardé et détaché, compte supprimé", async () => {
    const titulaire = await compte("fc-titulaire");
    const org = await espace(titulaire);
    const { loc } = await garnir(org, titulaire);
    await payer(org);
    await sauvegardeDuJour();
    const id = await programmer(titulaire);
    const f0 = await fermeture(id);
    expect(f0.bilan_simulation).toMatchObject({ mode_prevu: "suppression", archive_requise: [org] });
    expect(f0.bilan_simulation.organisations_effacees[0]).toMatchObject({ organisation: org, baux: 1, documents: 1, fichiers: 1 });
    const etat = await executer(id);
    expect(etat).toMatchObject({ etat: "executee", bilan: { mode: "suppression", archives: 1, organisations_effacees: [org], fichiers_en_file: 1, controle_adresse: 0 } });
    for (const [table, colonne] of [["organizations", "id"], ["biens", "organization_id"], ["lots", "organization_id"], ["baux", "organization_id"],
      ["persons", "organization_id"], ["documents", "organization_id"], ["alerts", "organization_id"], ["abonnements", "organization_id"]]) {
      expect(await nombre(`select count(*) n from public.${table} where ${colonne} = $1`, [org]), table).toBe(0);
    }
    expect(await nombre("select count(*) n from public.persons where id = $1", [loc])).toBe(0);
    expect(await nombre("select count(*) n from public.purge_fichiers where storage_path = $1 and deleted_at is null", [`${org}/pieces/piece.pdf`])).toBe(1);
    expect(await nombre("select count(*) n from auth.users where id = $1", [titulaire])).toBe(0);
    // La preuve : acceptations, client Stripe, factures (six ans) et preuve (dix ans) calculées par la base.
    const archive = await un<Record<string, any>>("select * from public.archives_comptes where account_id_origine = $1", [titulaire]); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(archive.organisation_id_origine).toBe(org);
    expect(archive.acceptations).toHaveLength(1);
    expect(archive.factures).toHaveLength(1);
    expect(archive.stripe_customer_id).toMatch(/^cus_/);
    // Le journal d'audit de l'espace reste, détaché ; la fermeture est tracée sans compte rattaché.
    expect(await nombre("select count(*) n from public.audit_log where action = 'essai_fermeture' and organization_id is null and details->>'organisation_effacee' = $1", [org])).toBe(1);
    expect(await nombre("select count(*) n from public.audit_log where action = 'compte_ferme' and account_id is null and details->>'fermeture_id' = $1", [id])).toBe(1);
    expect(await nombre("select count(*) n from public.effacements_a_reappliquer where fermeture_id = $1 and $2 = any(organisations_effacees)", [id, org])).toBe(1);
    const f = await fermeture(id);
    expect(f).toMatchObject({ statut: "executee", mode_effacement: "suppression", tentatives: 1 });
    expect(f.adresse_courriel).toMatch(/@example\.invalid$/); // effacée par l'application une fois le courriel parti
    // Idempotence : rien de plus au passage suivant ni au rappel direct.
    expect(await executer(id)).toEqual({ etat: "deja_executee" });
    expect(await quotidienne()).toMatchObject({ executees: 0, echecs: 0 });
  });

  it("espace figé (état des lieux signé, circuit terminé, encaissement) : effacé, gardes rétablies, demande Zoho relevée", async () => {
    const titulaire = await compte("fc-fige");
    const org = await espace(titulaire);
    await garnirFige(org, titulaire);
    await sauvegardeDuJour();
    const id = await programmer(titulaire);
    expect((await fermeture(id)).bilan_simulation.organisations_effacees[0]).toMatchObject({ demandes_zoho: 1 });
    const etat = await executer(id);
    expect(etat).toMatchObject({ etat: "executee", bilan: { mode: "suppression", demandes_zoho: [`zoho-essai-${org.slice(0, 8)}`] } });
    for (const table of ["etats_des_lieux", "edl_lignes", "encaissements", "ecritures", "bail_signature_circuits", "messages", "bail_personnes"]) {
      expect(await nombre(`select count(*) n from public.${table} where organization_id = $1`, [org]), table).toBe(0);
    }
    // Les gardes d'état suspendues pendant l'effacement sont rétablies.
    const { rows } = await db.query<{ tgname: string; tgenabled: string }>(
      "select tgname, tgenabled from pg_trigger where tgname in ('edl_lignes_fige_trg', 'devis_signature_verrou', 'postes_appel_non_fige_trg', 'chambres_caracteristiques') order by 1");
    expect(rows.map((r) => r.tgenabled)).toEqual(["O", "O", "O", "O"]);
  });

  it("plusieurs gérants : seule l'adhésion part, l'espace reste ; un locataire n'efface jamais l'espace du propriétaire", async () => {
    const titulaire = await compte("fc-titulaire2");
    const associe = await compte("fc-associe");
    const org = await espace(titulaire);
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'admin_agence')", [associe, org]);
    await sauvegardeDuJour();
    const id = await programmer(titulaire);
    expect((await fermeture(id)).bilan_simulation).toMatchObject({ organisations_effacees: [], adhesions_retirees: 1 });
    expect(await executer(id)).toMatchObject({ etat: "executee", bilan: { organisations_effacees: [], adhesions_retirees: 1 } });
    expect(await nombre("select count(*) n from public.organizations where id = $1", [org])).toBe(1);
    expect(await nombre("select count(*) n from public.memberships where organization_id = $1", [org])).toBe(1);
    // Le propriétaire est seul gérant ; son locataire ferme : l'espace reste.
    const bailleur = await compte("fc-bailleur");
    const locataire = await compte("fc-locataire");
    const org2 = await espace(bailleur);
    await db.query("delete from public.memberships where account_id = $1 and organization_id <> $2", [bailleur, org2]);
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'locataire')", [locataire, org2]);
    const id2 = await programmer(locataire);
    expect(await executer(id2)).toMatchObject({ etat: "executee" });
    expect(await nombre("select count(*) n from public.organizations where id = $1", [org2])).toBe(1);
  });

  it("dossier d'un autre propriétaire : le lien au compte est retiré, la fiche reste, le propriétaire est prévenu", async () => {
    const bailleur = await compte("fc-bailleur3");
    const locataire = await compte("fc-locataire3");
    const org = await espace(bailleur);
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'locataire')", [locataire, org]);
    const { rows: [{ id: fiche }] } = await db.query<{ id: string }>(
      "insert into public.persons (organization_id, nom, account_id) values ($1, 'Locataire relié', $2) returning id", [org, locataire]);
    await sauvegardeDuJour();
    const id = await programmer(locataire);
    expect((await fermeture(id)).bilan_simulation).toMatchObject({ dossiers_tiers: 1, proprietaires_prevenus: 1 });
    expect(await executer(id)).toMatchObject({ etat: "executee", bilan: { dossiers_tiers_detaches: 1, proprietaires_prevenus: 1 } });
    expect(await un("select account_id, nom from public.persons where id = $1", [fiche])).toEqual({ account_id: null, nom: "Locataire relié" });
    const alerte = await un<{ titre: string; details: { personnes: string[] } }>(
      "select titre, details from public.alerts where organization_id = $1 and type = 'compte_ferme'", [org]);
    expect(alerte.titre).toBe("Un compte relié à votre dossier a été fermé");
    expect(alerte.details.personnes).toEqual([fiche]);
    expect(JSON.stringify(alerte.details)).not.toContain("example.invalid");
  });

  it("repli : une référence subsiste (demande de droits), le compte est neutralisé ; supprimé ensuite quand elle disparaît", async () => {
    const demandeur = await compte("fc-demandeur");
    await espace(demandeur);
    const { rows: [{ id: demande }] } = await db.query<{ id: string }>(
      `insert into public.retours_utilisateurs (auteur_id, cle_envoi, nature, titre, description)
       values ($1, gen_random_uuid(), 'question', 'Données personnelles — Fermer mon compte', 'Je souhaite fermer mon compte Gerimmo.') returning id`, [demandeur]);
    await sauvegardeDuJour();
    await serviceRole();
    const { r } = await un<{ r: { id: string } }>("select public.programmer_fermeture_compte($1, 'titulaire', null, $2) as r", [demandeur, demande]);
    await proprietaire();
    await db.query("update public.fermetures_comptes set effacement_prevu_le = (now() at time zone 'Europe/Paris')::date where id = $1", [r.id]);
    expect((await fermeture(r.id)).bilan_simulation).toMatchObject({ mode_prevu: "neutralisation", references_restantes: { "public.retours_utilisateurs.auteur_id": 1 } });
    expect(await executer(r.id)).toMatchObject({ etat: "executee", bilan: { mode: "neutralisation", blocage: "retours_utilisateurs_auteur_id_fkey", controle_adresse: 0 } });
    const neutre = await un<Record<string, unknown>>(
      `select u.email, u.encrypted_password, u.raw_user_meta_data, u.banned_until > now() + interval '50 years' as bloque,
              a.email as compte_email, a.efface_le is not null as efface
         from auth.users u join public.accounts a on a.id = u.id where u.id = $1`, [demandeur]);
    expect(neutre).toEqual({ email: `efface-${demandeur}@compte-supprime.invalid`, encrypted_password: "", raw_user_meta_data: {},
      bloque: true, compte_email: `efface-${demandeur}@compte-supprime.invalid`, efface: true });
    expect(await nombre("select count(*) n from public.memberships where account_id = $1", [demandeur])).toBe(0);
    // La demande (trace, durée propre) reste ; quand elle disparaît, le passage suivant supprime le compte.
    expect(await quotidienne()).toMatchObject({ neutralises_supprimes: 0 });
    await db.query("delete from public.retours_utilisateurs where id = $1", [demande]);
    expect(await quotidienne()).toMatchObject({ neutralises_supprimes: 1 });
    expect(await nombre("select count(*) n from auth.users where id = $1", [demandeur])).toBe(0);
    expect((await fermeture(r.id)).mode_effacement).toBe("suppression");
  });

  it("artisan : registres privés, zones et métiers effacés ; fiche supprimée, ou détachée si un dossier la cite encore", async () => {
    const libre = await compte("fc-artisan-libre");
    await proprietaire();
    const { rows: [{ id: fiche }] } = await db.query<{ id: string }>(
      `insert into public.artisans (account_id, raison_sociale, siret, telephone, email)
       values ($1, 'Plomberie libre', lpad((floor(random() * 1e13))::bigint::text, 14, '1'), '0600000000', 'artisan@example.invalid') returning id`, [libre]);
    await db.query("insert into public.artisan_zones (artisan_id, code_postal) values ($1, '75001')", [fiche]);
    await db.query("insert into public.artisan_metiers (artisan_id, metier) values ($1, 'plomberie')", [fiche]);
    await db.query("insert into public.artisan_clients (artisan_id, nom, type, adresse) values ($1, 'Client privé', 'particulier', '1 rue Privée')", [fiche]);
    await db.query("insert into storage.objects (bucket_id, name) values ('artisan-prive', $1)", [`${fiche}/justificatif.pdf`]);
    await sauvegardeDuJour();
    const id = await programmer(libre);
    expect((await fermeture(id)).bilan_simulation).toMatchObject({ artisan: fiche });
    expect(await executer(id)).toMatchObject({
      etat: "executee",
      bilan: { mode: "suppression", artisan: { id: fiche, fiche: "supprimee" },
               fichiers_hors_documents: [{ compartiment: "artisan-prive", chemin: `${fiche}/justificatif.pdf` }] },
    });
    for (const table of ["artisans", "artisan_zones", "artisan_metiers", "artisan_clients"]) {
      expect(await nombre(`select count(*) n from public.${table} where ${table === "artisans" ? "id" : "artisan_id"} = $1`, [fiche]), table).toBe(0);
    }
    // Une contestation déposée par l'artisan (support) cite la fiche et le compte : fiche détachée et retirée du réseau,
    // compte neutralisé.
    const cite = await compte("fc-artisan-cite");
    await proprietaire();
    const { rows: [{ id: fiche2 }] } = await db.query<{ id: string }>(
      `insert into public.artisans (account_id, raison_sociale, siret, telephone, email)
       values ($1, 'Plomberie citée', lpad((floor(random() * 1e13))::bigint::text, 14, '2'), '0600000001', 'artisan2@example.invalid') returning id`, [cite]);
    await db.query(
      `insert into public.retours_utilisateurs (auteur_id, cle_envoi, artisan_id, nature, titre, description)
       values ($1, gen_random_uuid(), $2, 'contestation', 'Contestation d''une évaluation', 'Je conteste cette évaluation de mon intervention.')`, [cite, fiche2]);
    const id2 = await programmer(cite);
    expect(await executer(id2)).toMatchObject({ etat: "executee", bilan: { mode: "neutralisation", artisan: { id: fiche2, fiche: "detachee" } } });
    expect(await un("select account_id, visibilite, email from public.artisans where id = $1", [fiche2])).toEqual({ account_id: null, visibilite: "privee", email: null });
  });

  it("réapplication après restauration : registre en base, puis registre relevé avant une sauvegarde plus ancienne", async () => {
    const titulaire = await compte("fc-restaure");
    const org = await espace(titulaire, "Espace restauré");
    await sauvegardeDuJour();
    const id = await programmer(titulaire);
    expect(await executer(id)).toMatchObject({ etat: "executee" });
    const registre = (await db.query("select fermeture_id, account_id_origine, organisations_effacees, artisan_id_origine, executee_le from public.effacements_a_reappliquer where fermeture_id = $1", [id])).rows;
    // « Restauration » : le compte et l'espace reviennent avec leurs identifiants.
    const restaurer = async () => {
      await db.query(
        `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
           confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
         values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, 'x', '{}', '{}', now(), now(), '', '', '', '', '')`,
        [titulaire, `restaure-${titulaire}@example.invalid`]);
      await db.query("insert into public.organizations (id, name, status, type) values ($1, 'Espace restauré', 'active', 'proprietaire_direct')", [org]);
      await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'proprietaire_direct')", [titulaire, org]);
    };
    await restaurer();
    expect((await un<{ r: Record<string, number> }>("select public.reappliquer_effacements() as r")).r).toMatchObject({ reappliques: 1 });
    expect(await nombre("select count(*) n from public.organizations where id = $1", [org])).toBe(0);
    expect(await nombre("select count(*) n from auth.users where id = $1", [titulaire])).toBe(0);
    // Sauvegarde plus ancienne que la fermeture : ni la ligne de fermeture ni le registre n'y sont.
    await db.query("delete from public.effacements_a_reappliquer where fermeture_id = $1", [id]);
    await db.query("delete from public.fermetures_comptes where id = $1", [id]);
    await restaurer();
    expect((await un<{ r: Record<string, number> }>("select public.reappliquer_effacements($1::jsonb) as r", [JSON.stringify(registre)])).r)
      .toMatchObject({ reappliques: 1, registre_ajoute: 1 });
    expect(await nombre("select count(*) n from public.organizations where id = $1", [org])).toBe(0);
    expect(await nombre("select count(*) n from auth.users where id = $1", [titulaire])).toBe(0);
    // Réservée à la procédure de restauration (propriétaire des fonctions).
    await serviceRole();
    expect(await echec("select public.reappliquer_effacements()")).toMatch(/^42501/);
  });

  it("gardes : date, gel, simulation, sauvegarde du jour, arrêt d'urgence, souscription vivante, signature en cours", async () => {
    const titulaire = await compte("fc-gardes");
    const org = await espace(titulaire);
    const id = await programmer(titulaire);
    expect(await executer(id)).toEqual({ etat: "sauvegarde_manquante" });
    await sauvegardeDuJour();
    await db.query("update public.fermetures_comptes set effacement_prevu_le = effacement_prevu_le + 1 where id = $1", [id]);
    expect(await executer(id)).toEqual({ etat: "pas_encore" });
    await db.query("update public.fermetures_comptes set effacement_prevu_le = effacement_prevu_le - 1 where id = $1", [id]);
    await session(superviseur);
    await db.query("select public.geler_fermeture_compte($1, 'Litige en cours sur une facture')", [id]);
    expect(await executer(id)).toEqual({ etat: "gelee" });
    await session(superviseur);
    await db.query("select public.geler_fermeture_compte($1, null)", [id]);
    await db.query("reset role");
    await db.query("update public.fermetures_comptes set bilan_simulation = null where id = $1", [id]);
    expect(await executer(id)).toEqual({ etat: "simulation_manquante" });
    await serviceRole();
    await db.query("select public.simuler_fermeture_compte($1, $2)", [titulaire, id]);
    await proprietaire();
    await db.query("insert into public.supervision_arrets (cle, arrete, motif, auteur) values ('purge', true, 'Essai de contrôle', $1) on conflict (cle) do update set arrete = true", [superviseur]);
    expect(await executer(id)).toEqual({ etat: "arret_en_cours" });
    expect(await quotidienne()).toEqual({ arret_en_cours: true });
    await db.query("update public.supervision_arrets set arrete = false where cle = 'purge'");
    await db.query(
      `insert into public.abonnements (organization_id, stripe_customer_id, stripe_subscription_id, stripe_statut, periode_fin)
       values ($1, 'cus_gardes1', 'sub_gardes1', 'trialing', now() + interval '5 days')`, [org]);
    expect(await executer(id)).toEqual({ etat: "souscription_active" });
    await db.query("update public.abonnements set stripe_statut = 'canceled' where organization_id = $1", [org]);
    const { bail, document } = await garnir(org, titulaire);
    expect(await echec(
      `insert into public.bail_signature_circuits (organization_id, bail_id, document_id, created_by, etat, environnement, empreinte,
         pdf_hash, signataires, prestataire, modele, cible_id)
       values ($1, $2, $3, $4, 'en_cours', 'sandbox', repeat('b', 64), repeat('c', 64), '[{"r":1},{"r":2}]', 'zoho', 'bail', $2)`,
      [org, bail, document, titulaire])).toBe("");
    expect(await executer(id)).toEqual({ etat: "signature_en_cours" });
    await db.query("update public.bail_signature_circuits set etat = 'annule' where organization_id = $1", [org]);
    expect(await executer(id)).toMatchObject({ etat: "executee" });
  });

  it("droits : ni anon, ni un compte ordinaire, ni un superviseur sans second facteur ; exécution réservée à pg_cron", async () => {
    const cible = await compte("fc-droits");
    await espace(cible);
    const demande = await demandeFermeture(cible);
    for (const role of ["anon", "authenticated", "service_role"]) {
      const { rows } = await db.query<{ f: string; peut: boolean }>(
        `select f, has_function_privilege($1, f, 'EXECUTE') as peut from unnest(array[
           'public.executer_fermeture_compte(uuid)', 'public.fermetures_comptes_quotidiennes()', 'public.reappliquer_effacements(jsonb)',
           'public.effacer_compte_ferme(uuid, uuid)', 'public.effacer_organisation_fermeture(uuid, uuid)', 'public.gardes_effacement(boolean)',
           'public.archiver_compte_ferme(uuid)', 'public.archiver_preuve_compte(uuid, uuid)', 'public.executer_fermeture_isolee(uuid)',
           'public.lignes_lisibles_par(regclass, text, uuid, uuid)']) f`, [role]);
      expect(rows.filter((r) => r.peut), role).toEqual([]);
      // La procédure de nuit (pg_cron) : aucun rôle de l'API.
      expect((await un<{ p: boolean }>("select has_function_privilege($1, 'public.fermetures_comptes_nuit()', 'EXECUTE') as p", [role])).p, role).toBe(false);
    }
    await anon();
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin', null, $2)", [cible, demande])).toMatch(/^42501/);
    expect(await echec("select * from public.fermetures_comptes")).toMatch(/^42501/);
    await session(cible);
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin', null, $2)", [cible, demande])).toMatch(/^42501 Accès refusé/);
    expect(await echec("select public.simuler_fermeture_compte($1)", [cible])).toMatch(/^42501 Accès refusé/);
    await session(superviseur, "aal1");
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin', null, $2)", [cible, demande])).toMatch(/^42501 Accès refusé/);
    await session(superviseur);
    expect(await echec("select public.programmer_fermeture_compte($1, 'inactivite')", [cible])).toMatch(/^42501 La fermeture pour inactivité/);
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin', null, $2, null, '{\"montant_cents\":1}'::jsonb)", [cible, demande]))
      .toMatch(/^42501 Remboursement fourni hors du traitement/);
    const { r } = await un<{ r: { id: string; effacement_prevu_le: string } }>("select public.programmer_fermeture_compte($1, 'super_admin', null, $2) as r", [cible, demande]);
    expect((await un<{ n: string }>("select count(*) n from public.fermetures_comptes where id = $1 and programmee_par = $2", [r.id, superviseur])).n).toBe("1");
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin', null, $2)", [cible, demande])).toMatch(/^23505 Une fermeture est déjà programmée/);
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin')", [superviseur])).toMatch(/^42501 Un compte de supervision/);
    expect(await echec("select public.annuler_fermeture_compte($1, 'non')", [r.id])).toMatch(/^22023/);
    expect((await un<{ r: { id: string } }>("select public.annuler_fermeture_compte($1, 'Le titulaire a changé d''avis') as r", [r.id])).r.id).toBe(r.id);
    // Un compte ordinaire ne lit rien de ces tables ; le superviseur permanent les lit.
    await session(cible);
    expect((await db.query("select * from public.fermetures_comptes")).rows).toEqual([]);
    await session(superviseur);
    expect((await db.query("select statut from public.fermetures_comptes where id = $1", [r.id])).rows).toEqual([{ statut: "annulee" }]);
  });

  it("abonnement payé en cours : choix exigé ; fin de période (le lendemain) ou J+14 ; remboursement réservé à J+14", async () => {
    const titulaire = await compte("fc-abonne");
    const org = await espace(titulaire);
    await db.query(
      `insert into public.abonnements (organization_id, stripe_customer_id, stripe_subscription_id, stripe_statut, premiere_facture_payee, periode_debut, periode_fin)
       values ($1, 'cus_abonne1', 'sub_abonne1', 'active', true, now() - interval '10 days', '2026-12-15 10:00:00+00')`, [org]);
    const demande = await demandeFermeture(titulaire);
    await serviceRole();
    expect(await echec("select public.programmer_fermeture_compte($1, 'titulaire', null, $2)", [titulaire, demande])).toMatch(/^22023 Abonnement payé en cours/);
    expect(await echec("select public.programmer_fermeture_compte($1, 'titulaire', 'fin_periode', $2, null, '{\"facture\":\"in_x1\",\"montant_cents\":100}'::jsonb)", [titulaire, demande]))
      .toMatch(/^22023 Remboursement au prorata réservé/);
    await db.query("savepoint choix");
    const fin = (await un<{ r: Record<string, any> }>("select public.programmer_fermeture_compte($1, 'titulaire', 'fin_periode', $2) as r", [titulaire, demande])).r; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(fin).toMatchObject({ choix: "fin_periode", effacement_prevu_le: "2026-12-16", abonnement: { payee_en_cours: true, stripe_subscription_id: "sub_abonne1" } });
    await db.query("rollback to savepoint choix");
    const j14 = (await un<{ r: Record<string, any> }>( // eslint-disable-line @typescript-eslint/no-explicit-any
      "select public.programmer_fermeture_compte($1, 'titulaire', 'j14_prorata', $2, null, '{\"facture\":\"in_abonne1\",\"montant_cents\":420}'::jsonb) as r", [titulaire, demande])).r;
    const attendu = await un<{ d: string }>("select to_char((now() at time zone 'Europe/Paris')::date + 14, 'YYYY-MM-DD') as d");
    expect(j14).toMatchObject({ choix: "j14_prorata", effacement_prevu_le: attendu.d });
    expect(await fermeture(j14.id)).toMatchObject({ remboursement_prevu_cents: "420", stripe_facture_id: "in_abonne1" });
  });

  it("suites : la clé de service lit les fermetures exécutées sans courriel, avec les échéances de l'archive, puis les solde", async () => {
    const titulaire = await compte("fc-suites");
    const org = await espace(titulaire, "Espace des suites");
    await payer(org);
    await sauvegardeDuJour();
    const id = await programmer(titulaire);
    await executer(id);
    await serviceRole();
    const { rows } = await db.query("select * from public.fermetures_suites_a_faire(10) where id = $1", [id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].adresse_courriel).toMatch(/^fc-suites-.*@example\.invalid$/);
    expect(rows[0].archives[0].preuve_conservee_jusqu_au).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Le nom de l'espace sert au seul courriel : jamais au journal d'audit, retiré de la ligne dès l'envoi.
    expect(rows[0].bilan_execution.organisations_noms).toEqual(["Espace des suites"]);
    expect(await nombre("select count(*) n from public.audit_log where action = 'compte_ferme' and details::text like '%Espace des suites%'")).toBe(0);
    await serviceRole();
    await db.query("select public.fermeture_suites_faites($1, null, null, true)", [id]);
    expect((await db.query("select * from public.fermetures_suites_a_faire(10) where id = $1", [id])).rows).toEqual([]);
    expect(await fermeture(id)).toMatchObject({ adresse_courriel: null });
    expect((await fermeture(id)).courriel_envoye_le).not.toBeNull();
    expect((await fermeture(id)).bilan_execution).not.toHaveProperty("organisations_noms");
    await session(superviseur);
    expect(await echec("select * from public.fermetures_suites_a_faire(10)")).toMatch(/^42501/);
  });

  // ── Inactivité ────────────────────────────────────────────────────────────────────────────────────────────────

  async function prevenir(version: string | null): Promise<Record<string, any>[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
    await serviceRole();
    return (await db.query("select * from public.comptes_inactifs_a_prevenir($1, 1000)", [version])).rows;
  }

  it("inactivité : règle inactive sans version ; J-60 puis J-15 ; fermeture à la date annoncée ; une connexion annule", async () => {
    const dormeur = await compte("fc-dormeur", "2026-11-15", "22 months 2 days");
    const org = await espace(dormeur, "Espace dormant");
    await db.query("update public.organizations set created_at = now() - interval '23 months' where id = $1", [org]);
    const ancien = await compte("fc-ancien", "2026-09-30", "22 months 2 days");
    await espace(ancien);
    expect(await prevenir(null)).toEqual([]);
    const lus = (await prevenir("2026-11-15")).filter((r) => [dormeur, ancien].includes(r.account_id));
    // Seul le compte qui a accepté la version désignée est visé.
    expect(lus).toHaveLength(1);
    const j60 = lus[0];
    expect(j60).toMatchObject({ account_id: dormeur, etape: "j60", nature: "organisation", organisation: "Espace dormant" });
    const plancher = await un<{ d: Date }>("select (now() at time zone 'Europe/Paris')::date + 60 as d");
    expect(new Date(j60.suppression_le).getTime()).toBeGreaterThanOrEqual(plancher.d.getTime());
    await db.query("select public.avertissement_inactivite_envoye($1, 'j60', $2, $3)", [dormeur, j60.derniere_activite_le, j60.suppression_le]);
    expect((await prevenir("2026-11-15")).filter((r) => r.account_id === dormeur)).toEqual([]);
    // Un rappel J-15 n'avance jamais la date annoncée (il peut la reculer, s'il part en retard : cas R2-11).
    expect(await echec("select public.avertissement_inactivite_envoye($1, 'j15', $2, ($3::date - 1))", [dormeur, j60.derniere_activite_le, j60.suppression_le]))
      .toMatch(/^22023/);
    // Quarante-six jours plus tard (avertissement et date annoncée reculés d'autant) : le rappel J-15.
    await proprietaire();
    await db.query(`update public.avertissements_inactivite set envoye_le = envoye_le - interval '46 days',
                      suppression_prevue_le = (now() at time zone 'Europe/Paris')::date + 14 where account_id = $1`, [dormeur]);
    const j15 = (await prevenir("2026-11-15")).filter((r) => r.account_id === dormeur);
    expect(j15).toHaveLength(1);
    expect(j15[0].etape).toBe("j15");
    await db.query("select public.avertissement_inactivite_envoye($1, 'j15', $2, $3)", [dormeur, j15[0].derniere_activite_le, j15[0].suppression_le]);
    // Date annoncée pas encore atteinte : rien n'est programmé.
    await sauvegardeDuJour();
    expect(await quotidienne()).toMatchObject({ programmees: 0 });
    // La date annoncée arrive, le rappel est vieux de quinze jours : programmée et exécutée dans le même passage.
    await proprietaire();
    await db.query(`update public.avertissements_inactivite set envoye_le = envoye_le - interval '15 days',
                      suppression_prevue_le = (now() at time zone 'Europe/Paris')::date where account_id = $1`, [dormeur]);
    expect(await quotidienne()).toMatchObject({ programmees: 1, executees: 1 });
    expect(await nombre("select count(*) n from public.organizations where id = $1", [org])).toBe(0);
    expect(await nombre("select count(*) n from public.fermetures_comptes where account_id = $1 and origine = 'inactivite' and statut = 'executee'", [dormeur])).toBe(1);
  });

  it("inactivité : une connexion après les avertissements annule la suppression ; un abonnement en cours exclut le compte", async () => {
    const dormeur = await compte("fc-reveil", "2026-11-15", "23 months 20 days");
    const org = await espace(dormeur);
    await db.query("update public.organizations set created_at = now() - interval '24 months' where id = $1", [org]);
    const [j60] = (await prevenir("2026-11-15")).filter((r) => r.account_id === dormeur);
    expect(j60.etape).toBe("j60");
    await db.query("select public.avertissement_inactivite_envoye($1, 'j60', $2, $3)", [dormeur, j60.derniere_activite_le, j60.suppression_le]);
    await db.query("select public.avertissement_inactivite_envoye($1, 'j15', $2, $3)", [dormeur, j60.derniere_activite_le, j60.suppression_le]);
    await proprietaire();
    await db.query(`update public.avertissements_inactivite set envoye_le = now() - interval '61 days',
                      suppression_prevue_le = (now() at time zone 'Europe/Paris')::date where account_id = $1`, [dormeur]);
    // Programmée par le passage, puis le titulaire se connecte avant l'exécution : annulée.
    await sauvegardeDuJour();
    await db.query("insert into public.supervision_arrets (cle, arrete, motif, auteur) values ('global', false, 'Essai de contrôle', $1) on conflict (cle) do nothing", [superviseur]);
    await serviceRole();
    await db.query("select public.programmer_fermeture_compte($1, 'inactivite', null, null, null, null, (now() at time zone 'Europe/Paris')::date, $2)", [dormeur, j60.derniere_activite_le]);
    await proprietaire();
    await db.query("update auth.users set last_sign_in_at = now() where id = $1", [dormeur]);
    expect(await quotidienne()).toMatchObject({ executees: 0, en_attente: 1 });
    const f = await un<{ statut: string; annulation_motif: string }>("select statut, annulation_motif from public.fermetures_comptes where account_id = $1", [dormeur]);
    expect(f.statut).toBe("annulee");
    expect(f.annulation_motif).toMatch(/connexion/);
    expect(await nombre("select count(*) n from public.organizations where id = $1", [org])).toBe(1);
    // Un nouveau cycle : plus aucun avertissement avant vingt-deux mois.
    expect((await prevenir("2026-11-15")).filter((r) => r.account_id === dormeur)).toEqual([]);
    // Abonnement vivant : jamais visé.
    const abonne = await compte("fc-abonne-dormeur", "2026-11-15", "23 months");
    const org2 = await espace(abonne);
    await db.query("update public.organizations set created_at = now() - interval '24 months' where id = $1", [org2]);
    await db.query("insert into public.abonnements (organization_id, stripe_customer_id, stripe_subscription_id, stripe_statut) values ($1, 'cus_dormeur', 'sub_dormeur', 'active')", [org2]);
    expect((await prevenir("2026-11-15")).filter((r) => r.account_id === abonne)).toEqual([]);
  });

  it("inactivité : un locataire sans connexion est prévenu pour son seul compte (nature personnelle)", async () => {
    const bailleur = await compte("fc-bailleur-actif", "2026-11-15");
    const org = await espace(bailleur);
    const locataire = await compte("fc-locataire-dormeur", "2026-11-15", "22 months 5 days");
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'locataire')", [locataire, org]);
    const lus = await prevenir("2026-11-15");
    expect(lus.filter((r) => r.account_id === bailleur)).toEqual([]);
    expect(lus.filter((r) => r.account_id === locataire)).toMatchObject([{ etape: "j60", nature: "personnel", organisation: null }]);
    await session(locataire);
    expect(await echec("select * from public.comptes_inactifs_a_prevenir('2026-11-15')")).toMatch(/^42501/);
  });

  // ── Export complet ────────────────────────────────────────────────────────────────────────────────────────────

  it("export : titulaire et second facteur (ou mot de passe récent) exigés ; une demande à la fois", async () => {
    const titulaire = await compte("fc-export");
    const org = await espace(titulaire);
    const invite = await compte("fc-export-invite");
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'locataire')", [invite, org]);
    await session(invite);
    expect(await echec("select public.demander_export_complet($1)", [org])).toMatch(/^42501 Réservé au titulaire/);
    await session(titulaire, "aal1");
    expect(await echec("select public.demander_export_complet($1)", [org])).toMatch(/^42501 Confirmez votre identité/);
    const ancien = Math.floor(Date.now() / 1000) - 3600;
    await session(titulaire, "aal1", [{ method: "password", timestamp: ancien }]);
    expect(await echec("select public.demander_export_complet($1)", [org])).toMatch(/^42501/);
    await session(titulaire, "aal1", [{ method: "password", timestamp: Math.floor(Date.now() / 1000) - 60 }]);
    const { id } = await un<{ id: string }>("select public.demander_export_complet($1) as id", [org]);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await echec("select public.demander_export_complet($1)", [org])).toMatch(/^23505 Une archive est déjà en préparation/);
    expect(await nombre("select count(*) n from public.audit_log where action = 'export_complet_demande' and organization_id = $1", [org])).toBe(1);
  });

  it("export : données de l'organisation sans jetons, compte et acceptations ; téléchargement journalisé ; suppression à 7 jours", async () => {
    const titulaire = await compte("fc-export2");
    const org = await espace(titulaire);
    await garnir(org, titulaire);
    await session(titulaire);
    const { id } = await un<{ id: string }>("select public.demander_export_complet($1) as id", [org]);
    await serviceRole();
    const { donnees } = await un<{ donnees: Record<string, Record<string, unknown>[]> }>("select public.export_complet_donnees($1, $2) as donnees", [org, titulaire]);
    expect(Object.keys(donnees)).toEqual(expect.arrayContaining(["organizations", "biens", "lots", "baux", "persons", "documents", "memberships"]));
    expect(donnees).not.toHaveProperty("audit_log");
    expect(JSON.stringify(donnees)).not.toMatch(/"[a-z_]*(jeton|token|secret|verrou)[a-z_]*":/i);
    const { cpt } = await un<{ cpt: { compte: { id: string }; acceptations_conditions: unknown[] } }>("select public.export_complet_compte($1) as cpt", [titulaire]);
    expect(cpt.compte.id).toBe(titulaire);
    expect(cpt.acceptations_conditions).toHaveLength(1);
    expect((await un<{ ok: boolean }>("select public.prendre_export_complet($1) as ok", [id])).ok).toBe(true);
    expect((await un<{ ok: boolean }>("select public.prendre_export_complet($1) as ok", [id])).ok).toBe(false);
    const piece = await un<{ id: string }>("select id from public.documents where organization_id = $1 and type = 'piece_identite'", [org]);
    await db.query("select public.terminer_export_complet($1, $2, 1234, $3, 1, 7, array[$4]::uuid[])", [id, `${org}/${id}.zip`, "b".repeat(64), piece.id]);
    await db.query("select public.export_complet_telecharge($1, $2)", [id, titulaire]);
    expect(await echec("select public.export_complet_telecharge($1, $2)", [id, superviseur])).toMatch(/^P0002/);
    expect(await nombre("select count(*) n from public.acces_pieces_log where document_id = $1 and account_id = $2 and action = 'telechargement'", [piece.id, titulaire])).toBe(1);
    expect(await nombre("select count(*) n from public.audit_log where action = 'export_complet_telecharge' and account_id = $1", [titulaire])).toBe(1);
    await session(titulaire);
    expect((await db.query("select statut from public.exports_complets where id = $1", [id])).rows).toEqual([{ statut: "pret" }]);
    await proprietaire();
    await db.query("update public.exports_complets set expire_le = now() - interval '1 minute' where id = $1", [id]);
    await serviceRole();
    expect((await db.query("select * from public.exports_complets_a_supprimer(10) where id = $1", [id])).rows).toHaveLength(1);
    await db.query("select public.export_complet_supprime($1)", [id]);
    expect(await nombre("select count(*) n from public.exports_complets where id = $1 and statut = 'expire' and chemin is null", [id])).toBe(1);
  });

  it("export : fichiers de l'espace (chemin, taille) ; export de l'artisan étendu à ses données de plateforme, journalisé", async () => {
    const titulaire = await compte("fc-fichiers");
    const org = await espace(titulaire);
    await garnir(org, titulaire);
    await serviceRole();
    expect((await db.query("select * from public.export_complet_fichiers($1)", [org])).rows).toEqual([{ chemin: `${org}/pieces/piece.pdf`, taille: "0" }]);
    await session(titulaire);
    expect(await echec("select * from public.export_complet_fichiers($1)", [org])).toMatch(/^42501/);
    expect(await echec("select public.export_artisan_plateforme()")).toMatch(/^42501 Réservé à un compte d'artisan/);
    const artisan = await compte("fc-artisan-export");
    await proprietaire();
    const { rows: [{ id: fiche }] } = await db.query<{ id: string }>(
      `insert into public.artisans (account_id, raison_sociale, siret, telephone)
       values ($1, 'Électricité export', lpad((floor(random() * 1e13))::bigint::text, 14, '3'), '0600000002') returning id`, [artisan]);
    await db.query("insert into public.artisan_zones (artisan_id, code_postal) values ($1, '75011')", [fiche]);
    await session(artisan);
    const { x } = await un<{ x: Record<string, any> }>("select public.export_artisan_plateforme() as x"); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(x.fiche).toMatchObject({ id: fiche, raison_sociale: "Électricité export" });
    expect(x.fiche).not.toHaveProperty("account_id");
    expect(x.artisan_zones).toEqual([expect.objectContaining({ code_postal: "75011" })]);
    expect(x.acceptations_conditions).toHaveLength(1);
    expect(await nombre("select count(*) n from public.audit_log where action = 'export_artisan' and account_id = $1", [artisan])).toBe(1);
  });

  // ── Relectures adverses du 24/10 (destruction, sécurité, parcours) ─────────────────────────────────────────────

  /** Un artisan avec son compte et sa fiche. */
  async function artisanAvecCompte(prefixe: string, chiffre: string): Promise<{ compte: string; fiche: string }> {
    const c = await compte(prefixe);
    await proprietaire();
    const { rows: [{ id }] } = await db.query<{ id: string }>(
      `insert into public.artisans (account_id, raison_sociale, siret, telephone)
       values ($1, $2, lpad((floor(random() * 1e13))::bigint::text, 14, $3), '0600000009') returning id`, [c, `Artisan ${prefixe}`, chiffre]);
    return { compte: c, fiche: id };
  }
  /** Une facture d'artisan déposée dans l'espace, et le règlement que l'artisan a déclaré dans son registre privé. */
  async function factureEtReglement(org: string, art: { compte: string; fiche: string }, ref: string) {
    await proprietaire();
    await db.query("set local session_replication_role = replica");
    const { rows: [{ id: doc }] } = await db.query<{ id: string }>(
      `insert into public.documents (organization_id, type, titre, mime_type, taille_octets, empreinte, storage_path)
       values ($1, 'autre', 'Facture artisan', 'application/pdf', 10, encode(sha256(convert_to($2, 'UTF8')), 'hex'), $2) returning id`, [org, `${org}/factures/${ref}.pdf`]);
    const { rows: [{ id: facture }] } = await db.query<{ id: string }>(
      `insert into public.intervention_factures (organization_id, intervention_id, artisan_id, numero, montant_ttc_cents, document_id)
       values ($1, gen_random_uuid(), $2, $3, 12000, $4) returning id`, [org, art.fiche, `F-${ref}`, doc]);
    const { rows: [{ id: piece }] } = await db.query<{ id: string }>(
      `insert into public.artisan_pieces_privees (artisan_id, storage_path, nom, mime, taille, sha256, created_by)
       values ($1, $2, 'preuve.pdf', 'application/pdf', 10, repeat('b', 64), $3) returning id`, [art.fiche, `${art.fiche}/${ref}.pdf`, art.compte]);
    const { rows: [{ id: reglement }] } = await db.query<{ id: string }>(
      `insert into public.artisan_reglements (artisan_id, facture_gerimmo_id, montant_cents, date_reglement, moyen, reference, preuve_id, auteur)
       values ($1, $2, 12000, current_date, 'virement', $3, $4, $5) returning id`, [art.fiche, facture, `REGLEMENT-PRIVE-${ref}`, piece, art.compte]);
    await db.query("set local session_replication_role = origin");
    return { facture, reglement };
  }
  /** Une sollicitation de l'espace, son devis et la préparation privée de l'artisan (PDF dans `devis-preparations`). */
  async function preparationDevis(org: string, art: { fiche: string }) {
    await proprietaire();
    await db.query("set local session_replication_role = replica");
    const { rows: [{ id: soll }] } = await db.query<{ id: string }>(
      `insert into public.incident_sollicitations (organization_id, consultation_id, incident_id, artisan_id)
       values ($1, gen_random_uuid(), gen_random_uuid(), $2) returning id`, [org, art.fiche]);
    const { rows: [{ id: devis }] } = await db.query<{ id: string }>(
      `insert into public.incident_devis (organization_id, sollicitation_id, incident_id, artisan_id, montant_ttc_cents, description, valide_jusqu_au)
       values ($1, $2, gen_random_uuid(), $3, 50000, 'Remplacement du chauffe-eau', current_date + 30) returning id`, [org, soll, art.fiche]);
    const chemin = `${art.fiche}/${soll}.pdf`;
    await db.query(
      `insert into public.artisan_devis_preparations (sollicitation_id, artisan_id, devis_id, saisie, pdf_bucket, pdf_path)
       values ($1, $2, $3, '{"note":"brouillon privé de l''artisan"}', 'devis-preparations', $4)`, [soll, art.fiche, devis, chemin]);
    await db.query("set local session_replication_role = origin");
    return { soll, devis, chemin };
  }
  /** Une question au support, déposée depuis l'espace par un de ses membres. */
  async function question(auteur: string, org: string, nature = "question", titre = "Exercice de mes droits"): Promise<string> {
    await session(auteur);
    const { id } = await un<{ id: string }>(
      "select public.soumettre_retour(gen_random_uuid(), $2, $3, 'Je demande la copie des données que Gerimmo détient sur moi', $4, '/', $1, 'navigation') as id",
      [org, nature, titre, nature === "bug" ? "Que la page se charge normalement" : null]);
    await proprietaire();
    return id;
  }
  /**
   * Les lignes exportées qu'une session du compte lit vraiment (RLS et droits de la table), table par table : rend les
   * tables où l'export en contient plus que la session n'en lit. Une table qu'elle ne peut pas lire du tout compte zéro.
   */
  async function ecartsDeLecture(compteId: string, donnees: Record<string, unknown>) {
    const ecarts: Record<string, { exportees: number; lisibles: number }> = {};
    for (const [cle, lignes] of Object.entries(donnees)) {
      if (!Array.isArray(lignes) || lignes.length === 0 || typeof lignes[0] !== "object") continue;
      const table = cle.split("__")[0];
      await proprietaire();
      const { rows: [{ existe, cles }] } = await db.query<{ existe: boolean; cles: string[] | null }>(
        `select to_regclass('public.' || quote_ident($1)) is not null as existe,
                (select array_agg(a.attname::text order by k.ord)
                   from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum, ord)
                   join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
                  where i.indrelid = to_regclass('public.' || quote_ident($1)) and i.indisprimary) as cles`, [table]);
      if (!existe) continue;
      const pk = cles ?? Object.keys(lignes[0] as object);
      await session(compteId, "aal1");
      await db.query("savepoint lecture");
      let lisibles = 0;
      try {
        lisibles = Number((await un<{ n: string }>(
          `select count(*) n from public.${table} t where exists (select 1 from jsonb_array_elements($1::jsonb) e
             where to_jsonb(t) @> (select jsonb_object_agg(k, e -> k) from unnest($2::text[]) k))`, [JSON.stringify(lignes), pk])).n);
        await db.query("release savepoint lecture");
      } catch {
        await db.query("rollback to savepoint lecture");
      }
      if (lisibles !== lignes.length) ecarts[cle] = { exportees: lignes.length, lisibles };
    }
    await proprietaire();
    return ecarts;
  }
  /** Un abonnement Stripe de l'espace. */
  async function abonnement(org: string, statut: string, debut: string, fin: string, payee = true) {
    await proprietaire();
    await db.query(
      `insert into public.abonnements (organization_id, stripe_customer_id, stripe_subscription_id, stripe_statut,
         premiere_facture_payee, periode_debut, periode_fin, montant_periode_cents)
       values ($1, 'cus_' || substr(md5(random()::text), 1, 12), 'sub_' || substr(md5(random()::text), 1, 12), $2, $3,
               now() + $4::interval, now() + $5::interval, 1200)`, [org, statut, payee, debut, fin]);
  }
  /** Les deux avertissements d'inactivité consignés pour la dernière activité du compte. */
  async function avertir(account: string, suppressionDans: string, j60IlYa = "61 days", j15IlYa = "16 days") {
    await proprietaire();
    await db.query(
      `insert into public.avertissements_inactivite (account_id, etape, derniere_activite_le, suppression_prevue_le, envoye_le)
       select $1, e.etape, (select derniere_activite_le from public.activite_compte($1)),
              ((now() at time zone 'Europe/Paris')::date + $2::interval)::date,
              now() - case e.etape when 'j60' then $3::interval else $4::interval end
         from (values ('j60'), ('j15')) e(etape)`, [account, suppressionDans, j60IlYa, j15IlYa]);
  }

  it("B1 : fermeture d'un propriétaire : le règlement de l'artisan reste (facture détachée), la demande d'un locataire aussi, avec son historique", async () => {
    const titulaire = await compte("fc-b1");
    const org = await espace(titulaire);
    const art = await artisanAvecCompte("fc-b1-artisan", "4");
    const { reglement } = await factureEtReglement(org, art, "B1");
    const locataire = await compte("fc-b1-locataire");
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'locataire')", [locataire, org]);
    const sa = await question(locataire, org);
    await db.query("insert into public.retours_historique (retour_id, acteur_id, evenement, message) values ($1, $2, 'reponse', 'Réponse du support à la demande')", [sa, superviseur]);
    const historique = await nombre("select count(*) n from public.retours_historique where retour_id = $1", [sa]);
    // Le signalement du titulaire lui-même, depuis son espace : effacé avec lui.
    const sien = await question(titulaire, org, "bug", "Un écran se fige");
    await sauvegardeDuJour();
    const id = await programmer(titulaire);
    expect(await executer(id)).toMatchObject({ etat: "executee", bilan: { organisations_effacees: [org] } });
    expect(await nombre("select count(*) n from public.organizations where id = $1", [org])).toBe(0);
    expect(await nombre("select count(*) n from public.artisan_reglements where id = $1", [reglement]), "règlement de l'artisan").toBe(1);
    expect(await nombre("select count(*) n from public.retours_utilisateurs where id = $1", [sa]), "demande du locataire").toBe(1);
    const r = await un<{ facture_gerimmo_id: string | null; facture_gerimmo_effacee: Record<string, unknown> | null; reference: string }>(
      "select facture_gerimmo_id, facture_gerimmo_effacee, reference from public.artisan_reglements where id = $1", [reglement]);
    expect(r).toMatchObject({ facture_gerimmo_id: null, reference: "REGLEMENT-PRIVE-B1", facture_gerimmo_effacee: { numero: "F-B1", montant_ttc_cents: 12000 } });
    expect(await un("select organization_id, auteur_id from public.retours_utilisateurs where id = $1", [sa])).toEqual({ organization_id: null, auteur_id: locataire });
    expect(await nombre("select count(*) n from public.retours_historique where retour_id = $1", [sa])).toBe(historique);
    expect(await nombre("select count(*) n from public.retours_utilisateurs where id = $1", [sien])).toBe(0);
  });

  it("B2 : l'archive complète ne contient aucune ligne qu'une session du titulaire ne lirait pas", async () => {
    const titulaire = await compte("fc-b2");
    const org = await espace(titulaire);
    await garnirFige(org, titulaire);
    const art = await artisanAvecCompte("fc-b2-artisan", "5");
    await factureEtReglement(org, art, "B2");
    await preparationDevis(org, art);
    const locataire = await compte("fc-b2-locataire");
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'locataire')", [locataire, org]);
    const sa = await question(locataire, org, "question", "Ce que mon bailleur conserve");
    await db.query("insert into public.retours_historique (retour_id, acteur_id, evenement, message) values ($1, $2, 'reponse', 'Réponse du support au locataire')", [sa, superviseur]);
    const idee = await question(titulaire, org, "idee", "Une idée pour les quittances");
    await db.query("set local session_replication_role = replica");
    await db.query(
      `insert into public.signature_consommations (circuit_id, mois_paris, demi_credits)
       select id, date_trunc('month', current_date)::date, 11 from public.bail_signature_circuits where organization_id = $1`, [org]);
    await db.query(
      `insert into public.signature_suivi_actions (circuit_id, cle, etat)
       select id, 'j7', 'confirme' from public.bail_signature_circuits where organization_id = $1`, [org]);
    await db.query("set local session_replication_role = origin");
    await serviceRole();
    const { d } = await un<{ d: Record<string, Record<string, unknown>[]> }>("select public.export_complet_donnees($1, $2) as d", [org, titulaire]);
    expect(Object.keys(d)).toEqual(expect.arrayContaining(["organizations", "biens", "lots", "baux", "persons", "documents", "memberships", "retours_utilisateurs"]));
    for (const privee of ["artisan_reglements", "artisan_devis_preparations", "signature_consommations", "signature_suivi_actions"]) {
      expect(d, privee).not.toHaveProperty(privee);
    }
    expect(d.retours_utilisateurs.map((r) => r.id)).toEqual([idee]);
    expect(JSON.stringify(d)).not.toContain("REGLEMENT-PRIVE-B2");
    expect(JSON.stringify(d)).not.toContain("Réponse du support au locataire");
    expect(JSON.stringify(d)).not.toContain(sa);
    expect(await ecartsDeLecture(titulaire, d)).toEqual({});
  });

  it("I1 : fermeture d'un artisan : la fiche créée par une agence ou inscrite au carnet d'un propriétaire est détachée, carnets et liste noire restent", async () => {
    const admin = await compte("fc-i1-agence");
    const { rows: [{ id: agence }] } = await db.query<{ id: string }>("insert into public.organizations (name, status, type) values ('Agence I1', 'active', 'agence') returning id");
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'admin_agence')", [admin, agence]);
    const autre = await compte("fc-i1-autre");
    const autreOrg = await espace(autre);
    const art = await artisanAvecCompte("fc-i1-artisan", "7");
    await db.query("update public.artisans set cree_par_organization_id = $2 where id = $1", [art.fiche, agence]);
    await db.query(
      `insert into public.artisan_agences (organization_id, artisan_id, statut, blacklist_le, blacklist_motif, blacklist_par)
       values ($1, $2, 'desactive', now(), 'Malfaçon chantier rue X, litige en cours', $3)`, [autreOrg, art.fiche, autre]);
    await db.query("insert into public.artisan_agences (organization_id, artisan_id) values ($1, $2)", [agence, art.fiche]);
    // Une fiche créée par l'artisan lui-même, mais inscrite au carnet d'un propriétaire : détachée aussi.
    const art2 = await artisanAvecCompte("fc-i1-artisan2", "8");
    await db.query("insert into public.artisan_agences (organization_id, artisan_id) values ($1, $2)", [autreOrg, art2.fiche]);
    await sauvegardeDuJour();
    const id = await programmer(art.compte);
    expect(await executer(id)).toMatchObject({ etat: "executee", bilan: { artisan: { id: art.fiche, fiche: "detachee" } } });
    expect(await un("select account_id, email, visibilite from public.artisans where id = $1", [art.fiche])).toEqual({ account_id: null, email: null, visibilite: "privee" });
    expect(await nombre("select count(*) n from public.artisan_agences where artisan_id = $1", [art.fiche])).toBe(2);
    expect(await nombre("select count(*) n from public.artisan_agences where artisan_id = $1 and blacklist_motif is not null", [art.fiche])).toBe(1);
    const id2 = await programmer(art2.compte);
    expect(await executer(id2)).toMatchObject({ etat: "executee", bilan: { artisan: { id: art2.fiche, fiche: "detachee" } } });
    expect(await nombre("select count(*) n from public.artisan_agences where artisan_id = $1", [art2.fiche])).toBe(1);
  });

  it("I2 : deux espaces : la souscription vivante est retenue et garde l'exécution ; deux souscriptions vivantes : programmation refusée", async () => {
    const a = await compte("fc-i2");
    const x1 = await espace(a, "Premier espace");
    // Un compte n'a qu'un espace de propriétaire : le second est une agence dont il est seul administrateur.
    const { rows: [{ id: x2 }] } = await db.query<{ id: string }>("insert into public.organizations (name, status, type) values ('Second espace', 'active', 'agence') returning id");
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'admin_agence')", [a, x2]);
    await abonnement(x1, "canceled", "-10 days", "20 days");
    await abonnement(x2, "active", "-10 days", "5 days");
    await serviceRole();
    const { b } = await un<{ b: { abonnement: Record<string, unknown> } }>("select public.simuler_fermeture_compte($1) as b", [a]);
    expect(b.abonnement).toMatchObject({ organisation: x2, vivante: true, payee_en_cours: true, souscriptions_vivantes: 1 });
    await proprietaire();
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin')", [a])).toMatch(/^22023 Abonnement payé en cours/);
    const { r } = await un<{ r: { id: string } }>("select public.programmer_fermeture_compte($1, 'super_admin', 'fin_periode') as r", [a]);
    await db.query("update public.fermetures_comptes set effacement_prevu_le = (now() at time zone 'Europe/Paris')::date where id = $1", [r.id]);
    await sauvegardeDuJour();
    expect(await executer(r.id)).toEqual({ etat: "souscription_active" });
    expect(await nombre("select count(*) n from public.organizations where id in ($1, $2)", [x1, x2])).toBe(2);
    await db.query("select public.annuler_fermeture_compte($1, 'Essai de la relecture')", [r.id]);
    await db.query("update public.abonnements set stripe_statut = 'active' where organization_id = $1", [x1]);
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin', 'fin_periode')", [a])).toMatch(/^22023 .*plusieurs souscriptions/);
  });

  it("I3 : le périmètre a grandi depuis le bilan enregistré : l'exécution refuse (bilan_change) et n'efface rien", async () => {
    const a = await compte("fc-i3-a");
    const b = await compte("fc-i3-b");
    const org = await espace(a);
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'agent')", [b, org]);
    await sauvegardeDuJour();
    const id = await programmer(a);
    expect((await fermeture(id)).bilan_simulation).toMatchObject({ organisations_effacees: [], adhesions_retirees: 1 });
    await db.query("update public.memberships set status = 'inactive' where account_id = $1 and organization_id = $2", [b, org]);
    expect(await executer(id)).toEqual({ etat: "bilan_change" });
    expect(await nombre("select count(*) n from public.organizations where id = $1", [org])).toBe(1);
    const f = await fermeture(id);
    expect(f.statut).toBe("programmee");
    expect(f.derniere_erreur).toMatch(/^Bilan changé/);
  });

  it("I4 : le titulaire payant quitte l'espace : sa preuve est archivée au retrait de l'adhésion ; fermeture et suppression directe la gardent", async () => {
    const a = await compte("fc-i4-a");
    const b = await compte("fc-i4-b");
    const org = await espace(a);
    await payer(org);
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'proprietaire_direct')", [b, org]);
    await db.query("select set_config('gerimmo.systeme', 'on', true)");
    await db.query("delete from public.memberships where account_id = $1 and organization_id = $2", [a, org]);
    await db.query("select set_config('gerimmo.systeme', '', true)");
    expect(await nombre("select count(*) n from public.archives_comptes where account_id_origine = $1 and organisation_id_origine = $2", [a, org])).toBe(1);
    await sauvegardeDuJour();
    const id = await programmer(a);
    expect(await executer(id)).toMatchObject({ etat: "executee" });
    const archive = await un<{ acceptations: unknown[] }>("select acceptations from public.archives_comptes where account_id_origine = $1", [a]);
    expect(archive.acceptations).toHaveLength(1);
    // Hors procédure : un titulaire payant détaché puis supprimé directement garde sa preuve.
    const c = await compte("fc-i4-c");
    const org2 = await espace(c);
    await payer(org2);
    await db.query("select set_config('gerimmo.systeme', 'on', true)");
    await db.query("delete from public.memberships where account_id = $1", [c]);
    await db.query("select set_config('gerimmo.systeme', '', true)");
    expect(await echec("delete from auth.users where id = $1", [c])).toBe("");
    expect(await nombre("select count(*) n from public.archives_comptes where account_id_origine = $1 and organisation_id_origine = $2", [c, org2])).toBe(1);
  });

  it("I5 : après une restauration, la fermeture redevient exécutée avec son remboursement et son courriel : rien n'est redemandé", async () => {
    const a = await compte("fc-i5");
    const org = await espace(a);
    await abonnement(org, "active", "-10 days", "20 days");
    const { r } = await un<{ r: { id: string } }>(
      "select public.programmer_fermeture_compte($1, 'super_admin', 'j14_prorata', null, null, $2::jsonb) as r",
      [a, JSON.stringify({ facture: "in_I5essai", montant_cents: 650 })]);
    await db.query("update public.fermetures_comptes set effacement_prevu_le = (now() at time zone 'Europe/Paris')::date where id = $1", [r.id]);
    await db.query("update public.abonnements set stripe_statut = 'canceled' where organization_id = $1", [org]);
    await sauvegardeDuJour();
    await db.query("savepoint sauvegarde_nuit");
    expect(await executer(r.id)).toMatchObject({ etat: "executee" });
    await serviceRole();
    await db.query("select public.fermeture_remboursement_fait($1, $2::jsonb)", [r.id, JSON.stringify([{ facture: "in_I5essai", remboursement: "re_I5essai", montant_cents: 650 }])]);
    await db.query("select public.fermeture_suites_faites($1, null, null, true)", [r.id]);
    await proprietaire();
    const registre = (await un<{ r: Record<string, unknown>[] }>("select jsonb_agg(to_jsonb(e)) r from public.effacements_a_reappliquer e where fermeture_id = $1", [r.id])).r;
    expect(registre[0]).toMatchObject({ remboursement_cents: 650 });
    expect(registre[0].rembourse_le).not.toBeNull();
    expect(registre[0].courriel_envoye_le).not.toBeNull();
    await db.query("rollback to savepoint sauvegarde_nuit");
    expect((await fermeture(r.id)).statut).toBe("programmee");
    await un("select public.reappliquer_effacements($1::jsonb) as r", [JSON.stringify(registre)]);
    const f = await fermeture(r.id);
    expect(f).toMatchObject({ statut: "executee", remboursement_cents: "650", adresse_courriel: null });
    expect(f.rembourse_le).not.toBeNull();
    expect(f.courriel_envoye_le).not.toBeNull();
    expect(await quotidienne()).toMatchObject({ executees: 0 });
    await serviceRole();
    expect((await db.query("select id from public.fermetures_suites_a_faire(20) where id = $1", [r.id])).rows).toEqual([]);
    expect((await db.query("select id from public.fermetures_remboursements_dus(20) where id = $1", [r.id])).rows).toEqual([]);
  });

  it("I7 : J+14 refusé quand la période payée finit avant ; remboursement dû dès l'arrêt chez Stripe, même gelée ou annulée après", async () => {
    const a = await compte("fc-i7");
    const org = await espace(a);
    await abonnement(org, "active", "-20 days", "5 days");
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin', 'j14_prorata')", [a])).toMatch(/^22023 .*fin de la période payée/);
    await db.query("update public.abonnements set periode_fin = now() + interval '40 days' where organization_id = $1", [org]);
    const { r } = await un<{ r: { id: string } }>(
      "select public.programmer_fermeture_compte($1, 'super_admin', 'j14_prorata', null, null, $2::jsonb) as r",
      [a, JSON.stringify({ montant_cents: 900, factures: [{ facture: "in_I7a", montant_cents: 600 }, { facture: "in_I7b", montant_cents: 300 }] })]);
    expect(await fermeture(r.id)).toMatchObject({ remboursement_prevu_cents: "900", stripe_facture_id: "in_I7a",
      remboursement_repartition: [{ facture: "in_I7a", montant_cents: 600 }, { facture: "in_I7b", montant_cents: 300 }] });
    const dus = async () => { await serviceRole(); return (await db.query("select id, remboursement_prevu_cents from public.fermetures_remboursements_dus(20) where id = $1", [r.id])).rows; };
    // Avant l'arrêt chez Stripe (minuit du quatorzième jour) : rien n'est dû.
    expect(await dus()).toEqual([]);
    // Gelée au-delà de la date d'arrêt : la souscription s'est arrêtée, le remboursement est dû sans attendre l'effacement.
    await proprietaire();
    await db.query("update public.fermetures_comptes set effacement_prevu_le = (now() at time zone 'Europe/Paris')::date where id = $1", [r.id]);
    await db.query("select public.geler_fermeture_compte($1, 'Litige en cours sur une facture')", [r.id]);
    expect(await dus()).toEqual([{ id: r.id, remboursement_prevu_cents: "900" }]);
    // Annulée après l'arrêt : toujours dû.
    await proprietaire();
    await db.query("select public.annuler_fermeture_compte($1, 'Le titulaire garde ses données')", [r.id]);
    expect(await dus()).toHaveLength(1);
    // Soldé : plus rien.
    await db.query("select public.fermeture_remboursement_fait($1, $2::jsonb)", [r.id, JSON.stringify([{ facture: "in_I7a", remboursement: "re_1", montant_cents: 600 }, { facture: "in_I7b", remboursement: "re_2", montant_cents: 300 }])]);
    expect(await dus()).toEqual([]);
    expect(await fermeture(r.id)).toMatchObject({ remboursement_cents: "900" });
  });

  it("I8 : parrain ou filleul effacé : le parrainage est détaché, l'avantage de l'autre client reste ; rien ne bloque", async () => {
    const x = await compte("fc-i8-parrain");
    const orgX = await espace(x);
    const y = await compte("fc-i8-filleul");
    const orgY = await espace(y);
    const { rows: [{ id: par }] } = await db.query<{ id: string }>(
      "insert into public.parrainages (parrain_organization_id, filleul_organization_id, code) values ($1, $2, 'I8CODE') returning id", [orgX, orgY]);
    await db.query("insert into public.avantages_parrainage (parrainage_id, beneficiaire_organization_id, nature, jours, etat) values ($1, $2, 'essai_filleul', 30, 'applique')", [par, orgY]);
    await db.query("insert into public.avantages_parrainage (parrainage_id, beneficiaire_organization_id, nature, jours, etat) values ($1, $2, 'essai_parrain', 30, 'a_appliquer')", [par, orgX]);
    await sauvegardeDuJour();
    expect(await executer(await programmer(x))).toMatchObject({ etat: "executee", bilan: { organisations_effacees: [orgX] } });
    expect(await un("select parrain_organization_id, filleul_organization_id from public.parrainages where id = $1", [par])).toEqual({ parrain_organization_id: null, filleul_organization_id: orgY });
    expect(await nombre("select count(*) n from public.avantages_parrainage where beneficiaire_organization_id = $1", [orgY])).toBe(1);
    // Le filleul ferme à son tour : le parrainage, sans plus personne, part avec ses avantages.
    expect(await executer(await programmer(y))).toMatchObject({ etat: "executee", bilan: { organisations_effacees: [orgY] } });
    expect(await nombre("select count(*) n from public.parrainages where id = $1", [par])).toBe(0);
  });

  it("I9 : l'export de l'artisan ne contient aucune ligne que sa session ne lirait pas (mémo d'invitation, liste noire)", async () => {
    const owner = await compte("fc-i9-owner");
    const org = await espace(owner);
    const art = await artisanAvecCompte("fc-i9-artisan", "6");
    await db.query(
      "insert into public.invitations_artisans (organization_id, email, nom_memo, etat, cree_par, artisan_id) values ($1, 'i9@example.invalid', 'Jean le serrurier, cher et lent', 'acceptee', $2, $3)",
      [org, owner, art.fiche]);
    await db.query(
      "insert into public.artisan_agences (organization_id, artisan_id, statut, blacklist_le, blacklist_motif, blacklist_par) values ($1, $2, 'desactive', now(), 'Retards répétés, ne plus solliciter', $3)",
      [org, art.fiche, owner]);
    await db.query("insert into public.artisan_zones (artisan_id, code_postal) values ($1, '75012')", [art.fiche]);
    await session(art.compte);
    const { x } = await un<{ x: Record<string, unknown> }>("select public.export_artisan_plateforme() as x");
    expect(JSON.stringify(x)).not.toContain("cher et lent");
    expect(JSON.stringify(x)).not.toContain("Retards répétés");
    expect(x).not.toHaveProperty("invitations_artisans");
    expect(x).not.toHaveProperty("artisan_agences");
    expect(x.artisan_zones).toEqual([expect.objectContaining({ code_postal: "75012" })]);
    expect(await ecartsDeLecture(art.compte, x)).toEqual({});
  });

  it("M1 : les PDF des préparations de devis (compartiment devis-preparations) passent dans les suites, pour un espace effacé comme pour un artisan", async () => {
    const owner = await compte("fc-m1-owner");
    const org = await espace(owner);
    const art = await artisanAvecCompte("fc-m1-artisan", "3");
    const p1 = await preparationDevis(org, art);
    await sauvegardeDuJour();
    const etat = await executer(await programmer(owner)) as { bilan: { fichiers_hors_documents: unknown[] } };
    expect(etat.bilan.fichiers_hors_documents).toContainEqual({ compartiment: "devis-preparations", chemin: p1.chemin });
    const owner2 = await compte("fc-m1-owner2");
    const org2 = await espace(owner2);
    const p2 = await preparationDevis(org2, art);
    const etat2 = await executer(await programmer(art.compte)) as { bilan: { fichiers_hors_documents: unknown[] } };
    expect(etat2.bilan.fichiers_hors_documents).toContainEqual({ compartiment: "devis-preparations", chemin: p2.chemin });
  });

  it("M2 : l'adresse du courriel de fin est celle du compte au moment de l'exécution", async () => {
    const a = await compte("fc-m2");
    await espace(a);
    await sauvegardeDuJour();
    const id = await programmer(a);
    const nouvelle = `fc-m2-nouvelle-${a}@example.invalid`;
    await db.query("update auth.users set email = $2 where id = $1", [a, nouvelle]);
    await db.query("update public.accounts set email = $2 where id = $1", [a, nouvelle]);
    expect(await executer(id)).toMatchObject({ etat: "executee", bilan: { controle_adresse: 0 } });
    expect((await fermeture(id)).adresse_courriel).toBe(nouvelle);
  });

  it("M3 : le contrôle relève les entrées du journal de connexion de GoTrue qui portent encore l'adresse", async () => {
    await proprietaire();
    await db.query(`create table if not exists auth.audit_log_entries (instance_id uuid, id uuid primary key, payload json,
                      created_at timestamptz, ip_address varchar(64) not null default '')`);
    const a = await compte("fc-m3");
    await espace(a);
    const { email } = await un<{ email: string }>("select email from public.accounts where id = $1", [a]);
    await db.query(
      "insert into auth.audit_log_entries (instance_id, id, payload, created_at) values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), json_build_object('actor_id', $1::text, 'actor_username', $2::text, 'action', 'login'), now())",
      [a, email]);
    await sauvegardeDuJour();
    expect(await executer(await programmer(a))).toMatchObject({ etat: "executee", bilan: { controle_adresse: 0, controle_journal_connexions: 1 } });
  });

  it("M4 : la connexion récente d'un membre de l'espace (locataire) le garde en vie : aucun avertissement", async () => {
    const dormeur = await compte("fc-m4", "2026-11-15", "23 months");
    const org = await espace(dormeur);
    await db.query("update public.organizations set created_at = now() - interval '24 months' where id = $1", [org]);
    expect((await prevenir("2026-11-15")).filter((r) => r.account_id === dormeur)).toHaveLength(1);
    const locataire = await compte("fc-m4-locataire", "2026-11-15");
    await proprietaire();
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'locataire')", [locataire, org]);
    expect((await prevenir("2026-11-15")).filter((r) => r.account_id === dormeur)).toEqual([]);
  });

  it("M5 : fermeture pour inactivité refusée sans les deux avertissements consignés, ou avant la date annoncée", async () => {
    const dormeur = await compte("fc-m5", "2026-11-15", "25 months");
    const org = await espace(dormeur);
    await db.query("update public.organizations set created_at = now() - interval '26 months' where id = $1", [org]);
    const { act } = await un<{ act: string }>("select derniere_activite_le as act from public.activite_compte($1)", [dormeur]);
    const programmerInactif = (jour: string) =>
      echec("select public.programmer_fermeture_compte($1, 'inactivite', null, null, null, null, ((now() at time zone 'Europe/Paris')::date + $2::interval)::date, $3)", [dormeur, jour, act]);
    await serviceRole();
    expect(await programmerInactif("0 days")).toMatch(/^22023 .*avertissements/);
    await avertir(dormeur, "10 days");
    await serviceRole();
    expect(await programmerInactif("0 days")).toMatch(/^22023 .*date annoncée/);
    expect(await programmerInactif("10 days")).toBe("");
  });

  it("M6 : une demande « Fermer mon compte » ou « effacement » du compte est exigée de la clé de service comme du superviseur", async () => {
    const a = await compte("fc-m6");
    await espace(a);
    const rectification = await demandeFermeture(a, "Données personnelles — Corriger mes données");
    await serviceRole();
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin')", [a])).toMatch(/^22023 Demande de fermeture requise/);
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin', null, $2)", [a, rectification])).toMatch(/^22023 Demande inconnue/);
    await session(superviseur);
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin')", [a])).toMatch(/^22023 Demande de fermeture requise/);
    const effacement = await demandeFermeture(a, "Données personnelles — Demander l’effacement de mes données");
    await serviceRole();
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin', null, $2)", [a, effacement])).toBe("");
  });

  it("M7 : le retour refuse tant qu'une fermeture programmée a posé un arrêt chez Stripe", async () => {
    const a = await compte("fc-m7");
    const org = await espace(a);
    await abonnement(org, "active", "-10 days", "40 days");
    const id = await programmer(a, "fin_periode");
    expect(await echec(RETOUR)).toMatch(/fermeture.*programmée.*Stripe/);
    await db.query("select public.annuler_fermeture_compte($1, 'Avant le retour de la migration')", [id]);
    expect(await echec(RETOUR)).toBe("");
    await db.query(MIGRATION);
  });

  it("R2-3 : titulaire et agent inactifs : leurs fermetures effacent l'espace, aucun espace orphelin", async () => {
    const t = await compte("fc-r3-titulaire", "2026-09-30", "25 months");
    const g = await compte("fc-r3-agent", "2026-09-30", "25 months");
    const { rows: [{ id: org }] } = await db.query<{ id: string }>(
      "insert into public.organizations (name, status, type, created_at) values ('Agence orpheline', 'active', 'agence', now() - interval '26 months') returning id");
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'admin_agence')", [t, org]);
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'agent')", [g, org]);
    await db.query("insert into public.persons (organization_id, nom, email) values ($1, 'Locataire tiers', 'tiers@example.invalid')", [org]);
    await avertir(t, "-1 days");
    await avertir(g, "-1 days");
    // Ordre le plus défavorable : la fermeture du titulaire passe la première (l'agent est encore là).
    await serviceRole();
    const { act } = await (async () => { await proprietaire(); return un<{ act: string }>("select derniere_activite_le as act from public.activite_compte($1)", [t]); })();
    await serviceRole();
    await db.query("select public.programmer_fermeture_compte($1, 'inactivite', null, null, null, null, (now() at time zone 'Europe/Paris')::date, $2)", [t, act]);
    await proprietaire();
    await db.query("update public.fermetures_comptes set programmee_le = now() - interval '1 hour' where account_id = $1", [t]);
    await sauvegardeDuJour();
    expect(await quotidienne()).toMatchObject({ programmees: 1, executees: 2, echecs: 0 });
    expect(await nombre("select count(*) n from public.organizations where id = $1", [org])).toBe(0);
    expect(await nombre("select count(*) n from public.persons where organization_id = $1", [org])).toBe(0);
  });

  it("R2-4 : fermeture pour inactivité : l'alerte du propriétaire tiers ne parle d'aucune demande", async () => {
    const bailleur = await compte("fc-r4-bailleur");
    const orgB = await espace(bailleur);
    const p = await compte("fc-r4-locataire", "2026-09-30", "25 months");
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'locataire')", [p, orgB]);
    await db.query("insert into public.persons (organization_id, nom, account_id) values ($1, 'Locataire endormi', $2)", [orgB, p]);
    await avertir(p, "-1 days");
    await sauvegardeDuJour();
    expect(await quotidienne()).toMatchObject({ executees: 1 });
    const alerte = await un<{ message: string }>("select details->>'message' as message from public.alerts where organization_id = $1 and type = 'compte_ferme'", [orgB]);
    expect(alerte.message).not.toMatch(/demande/);
    expect(alerte.message).toMatch(/sans connexion/);
  });

  it("R2-5 : noms d'espace retirés aussi du bilan de simulation ; trace purgée trois ans après ; client Stripe supprimé au terme des factures", async () => {
    const a = await compte("fc-r5");
    await espace(a, "Jeanne Martin-Dupont");
    await sauvegardeDuJour();
    const id = await programmer(a);
    await executer(id);
    await serviceRole();
    await db.query("select public.fermeture_suites_faites($1, null, null, true)", [id]);
    expect(JSON.stringify(await fermeture(id))).not.toContain("Jeanne Martin-Dupont");
    // Trois ans après l'exécution : la trace part (et son registre avec elle).
    await proprietaire();
    await db.query("update public.fermetures_comptes set executee_le = now() - interval '37 months' where id = $1", [id]);
    await db.query("update public.effacements_a_reappliquer set executee_le = now() - interval '37 months' where fermeture_id = $1", [id]);
    expect(await quotidienne()).toMatchObject({ traces_purgees: 1 });
    expect(await nombre("select count(*) n from public.fermetures_comptes where id = $1", [id])).toBe(0);
    // Le client Stripe d'une archive dont les factures ont passé leurs six ans.
    await db.query(
      `insert into public.archives_comptes (account_id_origine, organisation_id_origine, stripe_customer_id, fin_dernier_abonnement_paye, factures)
       values (gen_random_uuid(), gen_random_uuid(), 'cus_terme_r5', '2019-01-01', '[{"stripe_facture":"in_r5","emise_le":"2019-01-01"}]')`);
    await serviceRole();
    expect((await db.query("select stripe_customer_id from public.clients_stripe_au_terme(50)")).rows).toContainEqual({ stripe_customer_id: "cus_terme_r5" });
    await db.query("select public.client_stripe_supprime('cus_terme_r5')");
    expect((await db.query("select stripe_customer_id from public.clients_stripe_au_terme(50)")).rows).not.toContainEqual({ stripe_customer_id: "cus_terme_r5" });
  });

  it("R2-10 : titulaire qui laisse un agent et une souscription en cours : refus ; l'avertissement dit qui est titulaire", async () => {
    const t = await compte("fc-r10-titulaire");
    const g = await compte("fc-r10-agent");
    const org = await espace(t);
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'agent')", [g, org]);
    await abonnement(org, "trialing", "-5 days", "20 days", false);
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin')", [t])).toMatch(/^22023 .*souscription en cours/);
    await serviceRole();
    expect((await un<{ b: { souscriptions_laissees: string[] } }>("select public.simuler_fermeture_compte($1) as b", [t])).b.souscriptions_laissees).toEqual([org]);
    // Inactivité : le titulaire reçoit le lien de l'archive, l'agent non.
    const t2 = await compte("fc-r10-t2", "2026-11-15", "22 months 3 days");
    const g2 = await compte("fc-r10-g2", "2026-11-15", "22 months 3 days");
    await proprietaire();
    const { rows: [{ id: org2 }] } = await db.query<{ id: string }>(
      "insert into public.organizations (name, status, type, created_at) values ('Agence dormante', 'active', 'agence', now() - interval '23 months') returning id");
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'admin_agence')", [t2, org2]);
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'agent')", [g2, org2]);
    const lus = await prevenir("2026-11-15");
    expect(lus.filter((r) => r.account_id === t2)).toMatchObject([{ etape: "j60", nature: "organisation", titulaire: true }]);
    expect(lus.filter((r) => r.account_id === g2)).toMatchObject([{ etape: "j60", nature: "organisation", titulaire: false }]);
  });

  it("R2-6 / R2-11 : un artisan est prévenu comme artisan ; un rappel J-15 en retard recule la date à quinze jours, jamais dans le passé", async () => {
    const art = await artisanAvecCompte("fc-r11-artisan", "2");
    await proprietaire();
    await db.query("update auth.users set last_sign_in_at = now() - interval '25 months', created_at = now() - interval '25 months', raw_user_meta_data = '{\"cgu_version\":\"2026-11-15\"}' where id = $1", [art.compte]);
    await db.query("insert into public.acceptations_cgu (account_id, version, source, document) values ($1, '2026-11-15', 'inscription', 'conditions_artisans') on conflict do nothing", [art.compte]);
    const [j60] = (await prevenir("2026-11-15")).filter((r) => r.account_id === art.compte);
    expect(j60).toMatchObject({ etape: "j60", nature: "artisan" });
    // L'avertissement J-60 est parti, mais la tâche s'est arrêtée : la date annoncée est passée de deux jours.
    await db.query("select public.avertissement_inactivite_envoye($1, 'j60', $2, $3)", [art.compte, j60.derniere_activite_le, j60.suppression_le]);
    await proprietaire();
    await db.query(`update public.avertissements_inactivite set envoye_le = now() - interval '70 days',
                      suppression_prevue_le = (now() at time zone 'Europe/Paris')::date - 2 where account_id = $1`, [art.compte]);
    const [j15] = (await prevenir("2026-11-15")).filter((r) => r.account_id === art.compte);
    const attendu = await un<{ d: Date }>("select (now() at time zone 'Europe/Paris')::date + 15 as d");
    expect(j15.etape).toBe("j15");
    expect(new Date(j15.suppression_le).getTime()).toBe(attendu.d.getTime());
    expect(await echec("select public.avertissement_inactivite_envoye($1, 'j15', $2, $3)", [art.compte, j15.derniere_activite_le, j15.suppression_le])).toBe("");
    await sauvegardeDuJour();
    expect(await quotidienne()).toMatchObject({ programmees: 0 });
  });

  // ── Retour arrière ────────────────────────────────────────────────────────────────────────────────────────────

  it("retour : objets retirés, tables vides supprimées, rejeu sans effet, puis marche avant", async () => {
    await proprietaire();
    await db.query("delete from public.effacements_a_reappliquer");
    await db.query("delete from public.fermetures_comptes");
    await db.query("delete from public.avertissements_inactivite");
    await db.query("delete from public.exports_complets");
    await db.query(RETOUR);
    expect(await un("select to_regclass('public.fermetures_comptes') f, to_regclass('public.exports_complets') x, to_regprocedure('public.executer_fermeture_compte(uuid)') e")).toEqual({ f: null, x: null, e: null });
    expect(await nombre("select count(*) n from cron.job where jobname = 'fermetures-comptes'")).toBe(0);
    expect(await nombre("select count(*) n from public.supervision_taches_arret where tache = 'fermetures-comptes'")).toBe(0);
    expect(await nombre("select count(*) n from pg_trigger where tgname = 'accounts_garde_archive'")).toBe(0);
    await db.query(RETOUR);
    await db.query(MIGRATION);
    expect(await nombre("select count(*) n from cron.job where jobname = 'fermetures-comptes'")).toBe(1);
  });

  it("retour : une table qui porte des données est conservée", async () => {
    const titulaire = await compte("fc-retour");
    await espace(titulaire);
    await programmer(titulaire);
    await proprietaire();
    await db.query(RETOUR);
    expect(await un("select to_regclass('public.fermetures_comptes') f")).toEqual({ f: "fermetures_comptes" });
    await db.query(MIGRATION);
  });
});

// Relecture du 24/10 (M8) : la tâche de nuit appelle une PROCÉDURE qui valide chaque fermeture à part. Les gardes d'état
// suspendues (`alter table … disable trigger`) posent un verrou de table, tenu jusqu'à la fin de la transaction : avec une
// seule transaction pour toute la nuit, les écritures sur les états des lieux et les devis attendaient la dernière
// fermeture. Ce cas s'exécute HORS transaction (comme pg_cron), sur la base préparée par les migrations, et efface ensuite
// ce qu'il a créé.
describe.skipIf(!url)("procédure de nuit des fermetures (hors transaction, comme pg_cron)", () => {
  it("la tâche appelle la procédure ; chaque fermeture est validée à part, gardes rétablies entre deux", async () => {
    const c = new Client({ connectionString: url });
    await c.connect();
    const comptes: string[] = [];
    let sauvegarde: string | null = null;
    try {
      const { rows: [job] } = await c.query<{ command: string }>("select command from cron.job where jobname = 'fermetures-comptes'");
      expect(job.command).toBe("call public.fermetures_comptes_nuit()");
      for (const prefixe of ["fc-nuit-a", "fc-nuit-b"]) {
        const { rows: [{ id }] } = await c.query<{ id: string }>(
          `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
             raw_user_meta_data, created_at, updated_at, last_sign_in_at, confirmation_token, recovery_token, email_change,
             email_change_token_new, email_change_token_current)
           values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
             $1 || '-' || gen_random_uuid() || '@example.invalid', 'x', now(), '{}', '{}', now(), now(), now(), '', '', '', '', '')
           returning id`, [prefixe]);
        comptes.push(id);
        const { rows: [{ id: org }] } = await c.query<{ id: string }>(
          "insert into public.organizations (name, status, type) values ('Espace de la nuit', 'active', 'proprietaire_direct') returning id");
        await c.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'proprietaire_direct')", [id, org]);
        const { rows: [{ r }] } = await c.query<{ r: { id: string } }>("select public.programmer_fermeture_compte($1, 'super_admin') as r", [id]);
        await c.query("update public.fermetures_comptes set effacement_prevu_le = (now() at time zone 'Europe/Paris')::date where id = $1", [r.id]);
      }
      sauvegarde = (await c.query<{ id: string }>(
        "insert into public.tech_log (account_id, evenement, details) values (null, 'tache_sauvegarde', '{\"echecs\":0}') returning id")).rows[0].id;
      await c.query("call public.fermetures_comptes_nuit()");
      const { rows } = await c.query<{ statut: string }>("select statut from public.fermetures_comptes where account_id = any($1::uuid[])", [comptes]);
      expect(rows.map((l) => l.statut)).toEqual(["executee", "executee"]);
      const { rows: gardes } = await c.query<{ tgenabled: string }>(
        "select tgenabled from pg_trigger where tgname in ('edl_lignes_fige_trg', 'devis_signature_verrou', 'postes_appel_non_fige_trg', 'chambres_caracteristiques')");
      expect(gardes.map((g) => g.tgenabled)).toEqual(["O", "O", "O", "O"]);
      // Un appel dans une transaction ouverte est refusé (aucune validation partielle à l'insu de l'appelant).
      await c.query("begin");
      await expect(c.query("call public.fermetures_comptes_nuit()")).rejects.toThrow();
      await c.query("rollback");
    } finally {
      await c.query("rollback").catch(() => {});
      await c.query("delete from public.fermetures_comptes where account_id = any($1::uuid[])", [comptes]);
      if (sauvegarde) await c.query("delete from public.tech_log where id = $1", [sauvegarde]);
      await c.query("delete from auth.users where id = any($1::uuid[])", [comptes]).catch(() => {});
      await c.end();
    }
  });
});
