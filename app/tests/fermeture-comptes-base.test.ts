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
    expect(code).toContain("select cron.schedule('fermetures-comptes', '20 3 * * *', $$select public.fermetures_comptes_quotidiennes()$$);");
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
  /** Programmée par la clé de service, avancée à aujourd'hui (jour de Paris). */
  async function programmer(account: string, choix: string | null = null): Promise<string> {
    await serviceRole();
    const { r } = await un<{ r: { id: string } }>(
      "select public.programmer_fermeture_compte($1, 'super_admin', $2) as r", [account, choix]);
    await proprietaire();
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
    for (const role of ["anon", "authenticated", "service_role"]) {
      const { rows } = await db.query<{ f: string; peut: boolean }>(
        `select f, has_function_privilege($1, f, 'EXECUTE') as peut from unnest(array[
           'public.executer_fermeture_compte(uuid)', 'public.fermetures_comptes_quotidiennes()', 'public.reappliquer_effacements(jsonb)',
           'public.effacer_compte_ferme(uuid, uuid)', 'public.effacer_organisation_fermeture(uuid)', 'public.gardes_effacement(boolean)',
           'public.archiver_compte_ferme(uuid)']) f`, [role]);
      expect(rows.filter((r) => r.peut), role).toEqual([]);
    }
    await anon();
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin')", [cible])).toMatch(/^42501/);
    expect(await echec("select * from public.fermetures_comptes")).toMatch(/^42501/);
    await session(cible);
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin')", [cible])).toMatch(/^42501 Accès refusé/);
    expect(await echec("select public.simuler_fermeture_compte($1)", [cible])).toMatch(/^42501 Accès refusé/);
    await session(superviseur, "aal1");
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin')", [cible])).toMatch(/^42501 Accès refusé/);
    await session(superviseur);
    expect(await echec("select public.programmer_fermeture_compte($1, 'inactivite')", [cible])).toMatch(/^42501 La fermeture pour inactivité/);
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin', null, null, null, '{\"montant_cents\":1}'::jsonb)", [cible]))
      .toMatch(/^42501 Remboursement fourni hors du traitement/);
    const { r } = await un<{ r: { id: string; effacement_prevu_le: string } }>("select public.programmer_fermeture_compte($1, 'super_admin') as r", [cible]);
    expect((await un<{ n: string }>("select count(*) n from public.fermetures_comptes where id = $1 and programmee_par = $2", [r.id, superviseur])).n).toBe("1");
    expect(await echec("select public.programmer_fermeture_compte($1, 'super_admin')", [cible])).toMatch(/^23505 Une fermeture est déjà programmée/);
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
    await serviceRole();
    expect(await echec("select public.programmer_fermeture_compte($1, 'titulaire')", [titulaire])).toMatch(/^22023 Abonnement payé en cours/);
    expect(await echec("select public.programmer_fermeture_compte($1, 'titulaire', 'fin_periode', null, null, '{\"facture\":\"in_x1\",\"montant_cents\":100}'::jsonb)", [titulaire]))
      .toMatch(/^22023 Remboursement au prorata réservé/);
    await db.query("savepoint choix");
    const fin = (await un<{ r: Record<string, any> }>("select public.programmer_fermeture_compte($1, 'titulaire', 'fin_periode') as r", [titulaire])).r; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(fin).toMatchObject({ choix: "fin_periode", effacement_prevu_le: "2026-12-16", abonnement: { payee_en_cours: true, stripe_subscription_id: "sub_abonne1" } });
    await db.query("rollback to savepoint choix");
    const j14 = (await un<{ r: Record<string, any> }>( // eslint-disable-line @typescript-eslint/no-explicit-any
      "select public.programmer_fermeture_compte($1, 'titulaire', 'j14_prorata', null, null, '{\"facture\":\"in_abonne1\",\"montant_cents\":420}'::jsonb) as r", [titulaire])).r;
    const attendu = await un<{ d: string }>("select to_char((now() at time zone 'Europe/Paris')::date + 14, 'YYYY-MM-DD') as d");
    expect(j14).toMatchObject({ choix: "j14_prorata", effacement_prevu_le: attendu.d });
    expect(await fermeture(j14.id)).toMatchObject({ remboursement_prevu_cents: "420", stripe_facture_id: "in_abonne1" });
  });

  it("suites : la clé de service lit les fermetures exécutées sans courriel, avec les échéances de l'archive, puis les solde", async () => {
    const titulaire = await compte("fc-suites");
    const org = await espace(titulaire);
    await payer(org);
    await sauvegardeDuJour();
    const id = await programmer(titulaire);
    await executer(id);
    await serviceRole();
    const { rows } = await db.query("select * from public.fermetures_suites_a_faire(10) where id = $1", [id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].adresse_courriel).toMatch(/^fc-suites-.*@example\.invalid$/);
    expect(rows[0].archives[0].preuve_conservee_jusqu_au).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await db.query("select public.fermeture_suites_faites($1, null, null, true)", [id]);
    expect((await db.query("select * from public.fermetures_suites_a_faire(10) where id = $1", [id])).rows).toEqual([]);
    expect(await fermeture(id)).toMatchObject({ adresse_courriel: null });
    expect((await fermeture(id)).courriel_envoye_le).not.toBeNull();
    await session(titulaire === superviseur ? superviseur : superviseur);
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
    expect(await echec("select public.avertissement_inactivite_envoye($1, 'j15', $2, ($3::date + 1))", [dormeur, j60.derniere_activite_le, j60.suppression_le]))
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
    const { donnees } = await un<{ donnees: Record<string, Record<string, unknown>[]> }>("select public.export_complet_donnees($1) as donnees", [org]);
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
