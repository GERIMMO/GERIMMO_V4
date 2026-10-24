/**
 * Plan de conformité du 23/10/2026 — lot 2 (conservation), lot 1F (prospection, R45), alertes J-30/J-15 et gel en cas
 * de litige (lot 1E) ; décision du 23/10 « éditeur non commerçant » (factures de l'archive : six ans). Migration
 * 20261024140000_conservation_et_prospection.sql et son retour arrière.
 *
 * Sans base : conventions du fichier (rejouable sans transaction interne, `search_path = ''`, fermeture à anon, retour
 * nommé, atomique, qui retire sa version ; manifeste, LISEZ-MOI, classement en série ; aucune adresse réelle).
 *
 * Sur une base locale fictive (SUPABASE_DB_URL, nom gerimmo_ci_…), dans une transaction annulée, la migration rejouée :
 *  · chaque règle du tableau du lot 2 existe avec sa durée, son déclencheur et le statut « actif au déploiement » ;
 *  · échéances : fin du bail, état des lieux de sortie, restitution finalisée ou « en cours » (12 mois au plus), gel,
 *    quittance sans bail (émission + 120 mois), « autre » rattaché à un bail (36 mois) ;
 *  · purges : pièces échues (aussi d'un compte en lecture seule), preuves de signature, pièces d'une personne sans
 *    bail (propriétaires et mandants exclus), retours (ordre groupe_id, soutiens, historique), journal d'audit 12/36
 *    mois, prospects et oppositions, comptes jamais utilisés, archives des comptes, événements Stripe, journal
 *    d'authentification ;
 *  · prospection : origine en liste fermée, préparation d'un message refusée après une opposition ;
 *  · alertes J-30 et J-15, file de leurs courriels ; gel posé, renouvelé, levé, plafonné, journalisé ;
 *  · bilan sans suppression ; droits ; retour arrière, rejeu, marche avant.
 * Rejoue la migration et son retour (DDL) : classé en série (vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { transactionsInterdites } from "../scripts/verifier-transactions-migration.mjs";

const url = process.env.SUPABASE_DB_URL;
if (url) {
  const cible = new URL(url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(cible.hostname) || !cible.pathname.startsWith("/gerimmo_ci_")) {
    throw new Error("Base locale fictive gerimmo_ci_… obligatoire.");
  }
}
const VERSION = "20261024140000";
const NOM = `${VERSION}_conservation_et_prospection`;
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
/** Le retour de la migration suivante (activation de l'inactivité, intégration des textes du 24/10). */
const RETOUR_ACTIVATION = readFileSync("supabase/retours-arriere/20261024150000_activation_inactivite_v1.retour.sql", "utf8");
const CONTACTS_2210 = readFileSync("supabase/migrations/20261022213731_conservation_preuves_et_invitations.sql", "utf8");
const SOCLE = readFileSync("supabase/migrations/20261024090000_versions_conditions_et_archives_comptes.sql", "utf8");
const VENTE = readFileSync("supabase/migrations/20261024110000_vente_et_impaye.sql", "utf8");

/** Le tableau du lot 2 (plan du 23/10), règle par règle : durée, déclencheur exact, actif au déploiement. */
const REGLES: [string, number, string, boolean][] = [
  ["document:bail", 36, "Fin du bail", true],
  ["document:etat_des_lieux", 36, "Fin du bail", true],
  ["document:courrier", 36, "Fin du bail", true],
  ["document:attestation_assurance", 36, "Fin du bail", true],
  ["document:reglement_copropriete", 36, "Fin du bail", true],
  ["document:piece_identite", 36, "Fin du dernier bail", true],
  ["document:justificatif", 36, "Fin du dernier bail", true],
  ["document:autre", 60, "Dépôt", true],
  ["document:quittance", 36, "Fin du bail", true],
  ["document:rapport_gestion", 120, "Émission", true],
  ["document:mandat", 60, "Fin du mandat", true],
  ["preuve:signature", 36, "Fin du bail", true],
  ["journal:audit_log", 12, "Action", true],
  ["journal:audit_controle_interne", 36, "Action", true],
  ["invitation:locataire", 3, "Expiration ou refus/annulation", false],
  ["invitation:artisan", 3, "Expiration ou refus/annulation", false],
  ["compte:invitation_jamais_utilisee", 3, "Expiration, refus ou annulation de la dernière invitation", false],
  ["compte:inscription_non_confirmee", 1, "Création de l'inscription", false],
  ["compte:inactif", 24, "Dernière connexion d'un membre ou fin du dernier abonnement payé", false],
  ["dossier:sans_bail", 3, "Dernier dépôt de pièce sur une personne sans bail", false],
  ["personne:fiche", 36, "Fin du dernier bail et clôture des comptes", false],
  ["message:locatif", 24, "Fin du dernier bail et clôture des comptes", false],
  ["comptable:loyers", 36, "Fin du dernier bail et clôture des comptes", false],
  ["incident:dossier", 24, "Clôture de l'incident", false],
  ["archive:preuve_contrat", 120, "Fin du dernier abonnement payé", true],
  ["archive:facture", 72, "Fin de l'exercice de la facture, à défaut fin du dernier abonnement payé", true],
  ["contrat:retractation", 120, "Date de la rétractation", true],
  ["support:demande_droits", 36, "Clôture de la demande", false],
  ["support:question_idee", 24, "Dernier échange", false],
  ["support:contestation", 36, "Clôture de la contestation", false],
  ["artisan:evaluation", 36, "Dépôt de l'évaluation", false],
  ["contact:attente", 36, "Inscription", false],
  ["contact:attente_agences", 36, "Inscription", false],
  ["contact:prospect", 36, "Dernier contact émanant du prospect", true],
  ["prospect:opposition", 36, "Opposition", true],
  ["journal:abonnement_evenements", 6, "Traitement de l'événement", true],
  ["journal:effacements_a_reappliquer", 4, "Exécution de la fermeture", true],
  // Finitions du 24/10 (relecture transverse, I6) : les preuves du contrat écrites dans le journal d'audit.
  ["journal:audit_preuve_contrat", 120, "Action", true],
  ["journal:auth_audit", 6, "Événement", false],
];

/** Les fonctions que le navigateur peut appeler ; toutes les autres ajoutées sont réservées à la clé de service. */
const OUVERTES = ["controler_envoi_prospection", "enregistrer_opposition_prospection", "geler_conservation_bail", "lire_conservation_bail",
  "inscriptions_agences_opposees"];
const RESERVEES = [
  "duree_conservation_active", "action_audit_controle_interne", "empreinte_adresse_prospection", "fin_conservation_bail",
  "echeance_conservation_bail", "echeance_conservation_document", "personne_sans_bail", "document_dossier_sans_bail",
  "echeance_dossier_sans_bail", "echeance_facture_archivee", "purger_document_conservation", "cibles_conservation_complementaire",
  "journal_auth_echus", "purger_comptes_jamais_utilises", "purger_archives_comptes", "appliquer_conservation_complementaire",
  "generer_alertes_conservation", "alertes_conservation_a_envoyer", "noter_courriel_alerte_conservation", "ecrire_gel_conservation_bail",
  "garder_gel_conservation_bail", "poser_alerte_conservation", "echeance_levee_gel_bail", "garder_dernier_contact_prospect",
  "echeance_retractation_abonnement", "action_audit_preuve_contrat",
];
/** Fonctions de déclencheur : jamais appelées directement (leur droit d'exécution n'est pas vérifié ici). */
const DECLENCHEURS = ["garder_gel_conservation_bail", "garder_dernier_contact_prospect"];

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("conservation et prospection — fichiers (sans base)", () => {
  const code = MIGRATION.replace(/--.*$/gm, "");
  it("la migration est rejouable sans transaction interne, ne nomme pas le jour de Paris, ferme les fonctions à anon", () => {
    expect(transactionsInterdites(MIGRATION)).toEqual([]);
    expect(code).not.toContain("aujourdhui_paris");
    expect(code.match(/security definer/g)?.length).toBe(code.match(/security definer\s+set search_path\s*=\s*''/g)?.length);
    expect(code.trim().endsWith("select public.fermer_fonctions_a_anon();")).toBe(true);
    expect(MIGRATION).toContain(`supabase/retours-arriere/${NOM}.retour.sql`);
    // Aucune fonction ouverte au navigateur ne touche au passage « système » (tests/abonnement-stripe.test.ts).
    for (const nom of OUVERTES) {
      const debut = MIGRATION.indexOf(`create or replace function public.${nom}(`);
      const fin = MIGRATION.indexOf("end $$;", debut);
      expect(debut, nom).toBeGreaterThan(0);
      expect(MIGRATION.slice(debut, fin), nom).not.toContain("gerimmo.systeme");
    }
    // Dépôt public : aucune adresse réelle.
    expect(MIGRATION).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  });

  it("le retour est une seule instruction DO atomique, qui retire sa version, sans adresse réelle", () => {
    expect(RETOUR.replace(/--.*$/gm, "").trim()).toMatch(/^do \$retour_atomique\$[\s\S]*\$retour_atomique\$;$/);
    expect(RETOUR).toMatch(/^-- RETOUR ARRIÈRE de /m);
    expect(RETOUR).toContain(`delete from supabase_migrations.schema_migrations where left(version, 14) = '${VERSION}'`);
    expect(transactionsInterdites(RETOUR)).toEqual([]);
    expect(RETOUR).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  });

  it("manifeste, procédure de retour et classement en série", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261024090000_versions_conditions_et_archives_comptes.sql"));
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/conservation-prospection-base.test.ts"');
  });

  it("chaque règle du tableau est écrite dans la migration avec son statut au déploiement", () => {
    for (const [type, duree, declencheur, actif] of REGLES) {
      const ligne = MIGRATION.split("\n").find((l) => l.startsWith(` ('${type}',`));
      if (!ligne) continue; // règle existante, mise à jour plus haut
      expect(ligne, type).toContain(`'${declencheur.replace(/'/g, "''")}', ${duree}, `);
      expect(ligne.trim().replace(/,$/, "").endsWith(actif ? "true)" : "false)"), type).toBe(true);
    }
  });
});

type Ligne = Record<string, unknown>;

describe.skipIf(!url)("conservation et prospection (avec base)", () => {
  let db: Client;
  let org = "", orgFermee = "", orgAutre = "", gerant = "", autreGerant = "", gerantFerme = "", superviseur = "", lot = "", lotFerme = "";

  const un = async <T = Ligne>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] as T;
  const id = async (sql: string, params: unknown[] = []) => String((await db.query(sql, params)).rows[0].id);
  const nombre = async (sql: string, params: unknown[] = []) => Number(Object.values((await db.query(sql, params)).rows[0])[0]);

  async function compte(prefixe: string): Promise<string> {
    const nouveau = await id(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change,
         email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         $1 || '-' || gen_random_uuid() || '@example.invalid', 'x', now(), now(), '{}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '')
       returning id`, [prefixe]);
    await db.query("insert into public.accounts (id, email) select id, email from auth.users where id = $1 on conflict (id) do nothing", [nouveau]);
    return nouveau;
  }
  async function session(qui: string, aal = "aal2") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated', 'aal', $2::text)::text, true)", [qui, aal]);
    await db.query("set local role authenticated");
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
  /** Le message d'une requête attendue en échec (« code message »), sans avorter la transaction ; « » si elle passe. */
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
  /** Les données de départ s'écrivent sans déclencheurs ni clés (comme le test d'audit du 27/09). */
  async function brut<T>(f: () => Promise<T>): Promise<T> {
    await db.query("savepoint brut");
    await db.query("set local session_replication_role = replica");
    try {
      const r = await f();
      await db.query("set local session_replication_role = origin");
      await db.query("release savepoint brut");
      return r;
    } catch (e) {
      await db.query("rollback to savepoint brut");
      throw e;
    }
  }
  const personne = (organisation = org, nom = "Fictive") =>
    brut(() => id("insert into public.persons (organization_id, nom, prenom) values ($1, $2, 'Personne') returning id", [organisation, nom]));
  /** Un bail ; `fin` = nombre de mois écoulés depuis la fin (null : bail en cours). */
  async function bail(finIlYa: number | null, extra: { organisation?: string; lot?: string; locataire?: string } = {}) {
    const organisation = extra.organisation ?? org;
    const locataire = extra.locataire ?? await personne(organisation);
    return brut(() => id(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat, type, date_debut, date_fin, loyer_hc, charges, updated_at)
       values ($1, $2, $3, $4::public.bail_etat, 'nu', current_date - interval '10 years',
               case when $5::int is null then null else (current_date - make_interval(months => $5::int))::date end, 500, 20,
               case when $5::int is null then now() else current_date - make_interval(months => $5::int) end)
       returning id`,
      [organisation, extra.lot ?? (organisation === orgFermee ? lotFerme : lot), locataire, finIlYa === null ? "actif" : "termine", finIlYa]));
  }
  /** Un document déposé il y a `moisDepot` mois. */
  const document = (type: string, moisDepot: number, organisation = org, titre = "Pièce fictive") => brut(() => id(
    `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte, retention_reference_date, created_at)
     values ($1::uuid, $2::public.document_type, $3, $1::uuid::text || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 100,
             repeat(md5(gen_random_uuid()::text), 2), (current_date - make_interval(months => $4::int))::date, now() - make_interval(months => $4::int))
     returning id`, [organisation, type, titre, moisDepot]));
  const lier = (doc: string, entite: string, cible: string, organisation = org) => brut(() => db.query(
    "insert into public.document_liens (document_id, organization_id, entite, entite_id) values ($1, $2, $3::public.entite_liee, $4)",
    [doc, organisation, entite, cible]));
  const echeance = async (doc: string) => (await un<{ e: string | null }>("select public.echeance_conservation_document($1)::text as e", [doc])).e;
  const dateIlYa = async (mois: number, plusMois = 0, plusJours = 0) =>
    (await un<{ d: string }>("select ((current_date - make_interval(months => $1::int)) + make_interval(months => $2::int, days => $3::int))::date::text as d", [mois, plusMois, plusJours])).d;
  const purge = async () => {
    await proprietaire();
    return (await un<{ r: { journaux: Record<string, number | null>; documents_purges: number; documents_anonymises: number } }>("select public.appliquer_retention() as r")).r;
  };
  const activer = (...types: string[]) => db.query("update public.retention_rules set actif = true where data_type = any($1)", [types]);
  const purgee = async (doc: string) => (await un<{ p: boolean }>("select purged_at is not null as p from public.documents where id = $1", [doc])).p;

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    await db.query(MIGRATION);
    // Intégration des textes du 24/10 : 20261024150000 (activation de la règle d'inactivité avec la V1) suit cette
    // migration. Ses effets sont défaits ici, dans la transaction annulée, pour éprouver 20261024140000 seule (catalogue
    // au déploiement, retour et marche avant identiques) ; son retour l'exige d'ailleurs (« jamais hors de son ordre »).
    await db.query("delete from supabase_migrations.schema_migrations where left(version, 14) > $1 and left(version, 14) <= '20261024150000'", [VERSION]);
    await db.query(RETOUR_ACTIVATION);
    // La recette a pu suspendre les tâches : levée seulement dans cette transaction annulée.
    await db.query("update public.supervision_arrets set arrete = false where cle in ('global', 'purge')");
    gerant = await compte("conservation-gerant");
    autreGerant = await compte("conservation-autre");
    gerantFerme = await compte("conservation-ferme");
    superviseur = await compte("conservation-superviseur");
    await db.query("insert into public.memberships (account_id, organization_id, role, status) values ($1, null, 'super_admin', 'active')", [superviseur]);
    org = await id("insert into public.organizations (name, type, status) values ('Conservation fictive', 'proprietaire_direct', 'active') returning id");
    orgAutre = await id("insert into public.organizations (name, type, status) values ('Autre fictive', 'proprietaire_direct', 'active') returning id");
    orgFermee = await brut(() => id("insert into public.organizations (name, type, status, code_parrainage) values ('Fermée fictive', 'proprietaire_direct', 'suspendue', 'FERMEFICT') returning id"));
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'proprietaire_direct'), ($3, $4, 'proprietaire_direct')", [gerant, org, autreGerant, orgAutre]);
    await brut(() => db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'proprietaire_direct')", [gerantFerme, orgFermee]));
    const bien = await id("insert into public.biens (organization_id, nom, type, address_line1, postal_code, city, zone_tendue) values ($1, 'Bien fictif', 'appartement', 'Rue fictive', '69001', 'Lyon', false) returning id", [org]);
    lot = await id("insert into public.lots (organization_id, bien_id, nom, etat) values ($1, $2, 'Lot fictif', 'brouillon') returning id", [org, bien]);
    const bienFerme = await brut(() => id("insert into public.biens (organization_id, nom, type, address_line1, postal_code, city, zone_tendue) values ($1, 'Bien fermé', 'appartement', 'Rue fictive', '69001', 'Lyon', false) returning id", [orgFermee]));
    lotFerme = await brut(() => id("insert into public.lots (organization_id, bien_id, nom, etat) values ($1, $2, 'Lot fermé', 'brouillon') returning id", [orgFermee, bienFerme]));
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

  // ── Catalogue ─────────────────────────────────────────────────────────────────────────────────────────────────

  it("catalogue : chaque règle du tableau existe, avec sa durée, son déclencheur et le statut actif prévu", async () => {
    const { rows } = await db.query<{ data_type: string; duree_mois: number; declencheur: string; actif: boolean; finalite: string }>(
      "select data_type, duree_mois, declencheur, actif, finalite from public.retention_rules where data_type = any($1)", [REGLES.map((r) => r[0])]);
    for (const [type, duree, declencheur, actif] of REGLES) {
      expect(rows.find((r) => r.data_type === type), type).toMatchObject({ duree_mois: duree, declencheur, actif });
    }
    const finalite = (t: string) => rows.find((r) => r.data_type === t)?.finalite;
    expect(finalite("archive:facture")).toBe("Obligation fiscale (livre des procédures fiscales, art. L. 102 B)");
    expect(finalite("document:rapport_gestion")).toBe("Obligation comptable de l'agence (commerçant, C. com. L123-22)");
    expect(finalite("journal:audit_log")).not.toMatch(/CNIL/);
  });

  it("catalogue : la migration rejouée ne change rien et n'écrase pas une durée réglée à la main", async () => {
    await db.query("update public.retention_rules set duree_mois = 48 where data_type = 'document:courrier'");
    await db.query("update public.retention_rules set duree_mois = 5 where data_type = 'contact:prospect'");
    await db.query(MIGRATION);
    expect(await nombre("select duree_mois from public.retention_rules where data_type = 'document:courrier'")).toBe(48);
    expect(await nombre("select duree_mois from public.retention_rules where data_type = 'contact:prospect'")).toBe(5);
    expect(await nombre("select count(*) from public.retention_rules where data_type = 'preuve:signature'")).toBe(1);
  });

  // ── Échéances ─────────────────────────────────────────────────────────────────────────────────────────────────

  it("échéance : 36 mois après la fin du bail ; l'état des lieux de sortie et une restitution finalisée la repoussent", async () => {
    const b = await bail(10);
    const doc = await document("bail", 120);
    await lier(doc, "bail", b);
    expect(await echeance(doc)).toBe(await dateIlYa(10, 36));
    await brut(() => db.query("insert into public.etats_des_lieux (organization_id, bail_id, type, etat, date_edl) values ($1, $2, 'sortie', 'signe', current_date - interval '8 months')", [org, b]));
    expect(await echeance(doc)).toBe(await dateIlYa(8, 36));
    await brut(() => db.query("insert into public.restitutions (organization_id, bail_id, date_remise_cles, delai_mois, statut, date_emission) values ($1, $2, current_date - interval '8 months', 1, 'finalise', current_date - interval '6 months')", [org, b]));
    expect(await echeance(doc)).toBe(await dateIlYa(6, 36));
  });

  it("échéance : une restitution « en cours » retient le compteur douze mois au plus après la fin du bail", async () => {
    const b = await bail(30);
    const doc = await document("etat_des_lieux", 120);
    await lier(doc, "bail", b);
    await brut(() => db.query("insert into public.restitutions (organization_id, bail_id, date_remise_cles, delai_mois, statut) values ($1, $2, current_date - interval '30 months', 2, 'en_cours')", [org, b]));
    expect(await echeance(doc)).toBe(await dateIlYa(30, 48));
  });

  it("échéance : un bail en cours ne purge rien ; le gel repousse l'échéance au lendemain de sa fin", async () => {
    const actif = await bail(null);
    const enCours = await document("courrier", 100);
    await lier(enCours, "bail", actif);
    expect(await echeance(enCours)).toBeNull();
    const b = await bail(40);
    const doc = await document("courrier", 100);
    await lier(doc, "bail", b);
    expect(await echeance(doc)).toBe(await dateIlYa(40, 36));
    await brut(() => db.query("update public.baux set conservation_gelee_jusqu_au = current_date + 200, conservation_gelee_motif = 'Litige fictif en cours' where id = $1", [b]));
    expect(await echeance(doc)).toBe(await dateIlYa(0, 0, 201));
  });

  it("échéance : quittance sans bail à émission + 120 mois, avec bail à 36 mois de la fin ; « autre » rattaché à un bail à 36 mois", async () => {
    const seule = await document("quittance", 50);
    expect(await echeance(seule)).toBe(await dateIlYa(50, 120));
    const b = await bail(37);
    const quittance = await document("quittance", 100);
    await lier(quittance, "bail", b);
    expect(await echeance(quittance)).toBe(await dateIlYa(37, 36));
    const autre = await document("autre", 50);
    expect(await echeance(autre)).toBe(await dateIlYa(50, 60));
    await lier(autre, "bail", b);
    expect(await echeance(autre)).toBe(await dateIlYa(37, 36));
  });

  // ── Purges ────────────────────────────────────────────────────────────────────────────────────────────────────

  it("purge : la pièce échue d'un bail part (anonymisée), le gel la retient ; la pièce d'un compte en lecture seule part aussi", async () => {
    const b = await bail(37);
    const doc = await document("bail", 61);
    await lier(doc, "bail", b);
    const gele = await bail(37);
    const retenu = await document("bail", 61);
    await lier(retenu, "bail", gele);
    await brut(() => db.query("update public.baux set conservation_gelee_jusqu_au = current_date + 30, conservation_gelee_motif = 'Litige fictif en cours' where id = $1", [gele]));
    const ferme = await bail(37, { organisation: orgFermee });
    const docFerme = await document("courrier", 61, orgFermee);
    await lier(docFerme, "bail", ferme, orgFermee);
    const r = await purge();
    expect(r.documents_anonymises).toBeGreaterThanOrEqual(1);
    expect(await un("select anonymise_le is not null as a, storage_path from public.documents where id = $1", [doc])).toEqual({ a: true, storage_path: null });
    expect(await purgee(retenu)).toBe(false);
    expect(await purgee(docFerme)).toBe(true);
    const trace = await un<{ details: Record<string, unknown> }>("select details from public.audit_log where action = 'purge_retention' and details ->> 'document_id' = $1", [docFerme]);
    expect(trace.details).toMatchObject({ regle: "document:courrier", sort: "suppression" });
    // Le passage « système » ne survit pas à la purge.
    expect((await un<{ s: string | null }>("select current_setting('gerimmo.systeme', true) as s")).s ?? "").not.toBe("on");
  });

  it("purge : les preuves de signature d'un bail échu partent avec leur circuit ; une pièce qui prouve un autre circuit reste", async () => {
    const b = await bail(37);
    const vivant = await bail(null);
    const [original, signe, certificat, annexe] = [await document("bail", 61), await document("bail", 61), await document("autre", 61), await document("reglement_copropriete", 61)];
    for (const d of [original, signe, certificat]) await lier(d, "bail", b);
    await lier(annexe, "bail", vivant);
    const circuit = await brut(() => id(
      `insert into public.bail_signature_circuits (organization_id, bail_id, document_id, document_signe, created_by, prestataire, environnement, empreinte, pdf_hash, signataires, annexes, etat, modele, cible_id)
       values ($1, $2, $3, $4, $5, 'zoho', 'production', repeat('a', 64), repeat('a', 64), $6, $7, 'termine', 'bail', $2) returning id`,
      [org, b, original, signe, gerant, JSON.stringify([{ preuveDocumentId: certificat, statut: "signed" }, { statut: "signed" }]), JSON.stringify([{ id: annexe }])]));
    await brut(() => db.query("insert into public.signature_consommations (circuit_id, mois_paris, demi_credits) values ($1, date_trunc('month', current_date)::date, 12)", [circuit]));
    // Règle inactive : rien.
    await db.query("update public.retention_rules set actif = false where data_type = 'preuve:signature'");
    await purge();
    expect(await nombre("select count(*) from public.bail_signature_circuits where id = $1", [circuit])).toBe(1);
    await activer("preuve:signature");
    const r = await purge();
    expect(r.journaux).toMatchObject({ preuves_signature: 1 });
    expect(await nombre("select count(*) from public.bail_signature_circuits where id = $1", [circuit])).toBe(0);
    expect(await nombre("select count(*) from public.signature_consommations where circuit_id = $1", [circuit])).toBe(0);
    expect(await purgee(original)).toBe(true);
    expect(await un("select anonyme_le is null as x from (select anonymise_le as anonyme_le from public.documents where id = $1) d", [signe])).toEqual({ x: false });
    expect(await purgee(certificat)).toBe(true);
    // L'annexe d'un bail en cours suit sa propre règle : elle reste.
    expect(await purgee(annexe)).toBe(false);
  });

  it("purge : un circuit resté ouvert sur un bail échu part une fois expiré, avec ses pièces ; ouvert et pas encore expiré, il reste", async () => {
    const circuit = async (etat: string, expire: string) => {
      const b = await bail(40);
      const avenant = await document("bail", 45);
      await lier(avenant, "bail", b);
      const c = await brut(() => id(
        `insert into public.bail_signature_circuits (organization_id, bail_id, document_id, created_by, prestataire, environnement, empreinte, pdf_hash, signataires, etat, modele, cible_id, expire_le)
         values ($1, $2, $3, $4, 'zoho', 'production', repeat('b', 64), repeat('b', 64), '[{"statut":"sent"},{"statut":"sent"}]', $5, 'avenant', $2, now() + $6::interval) returning id`,
        [org, b, avenant, gerant, etat, expire]));
      return { c, avenant };
    };
    const abandonne = await circuit("en_cours", "-39 months");
    const aVerifier = await circuit("a_verifier", "-38 months");
    const vivant = await circuit("en_cours", "10 days");
    const r = await purge();
    expect(r.journaux).toMatchObject({ preuves_signature: 2 });
    expect(await nombre("select count(*) from public.bail_signature_circuits where id = any($1)", [[abandonne.c, aVerifier.c]])).toBe(0);
    expect(await purgee(abandonne.avenant)).toBe(true);
    expect(await nombre("select count(*) from public.bail_signature_circuits where id = $1", [vivant.c])).toBe(1);
    expect(await purgee(vivant.avenant)).toBe(false);
  });

  it("échéance : une pièce d'un type « fin du bail » sans aucun bail suit les autres documents (5 ans depuis le dépôt) ; les pièces du dossier gardent la leur", async () => {
    // Page confidentialité (lot 4) : « Autres documents non rattachés à un bail | 5 ans | Dépôt ».
    const courrierDuLot = await document("courrier", 40);
    await lier(courrierDuLot, "lot", lot);
    await lier(courrierDuLot, "organisation", org);
    expect(await echeance(courrierDuLot)).toBe(await dateIlYa(40, 60));
    const identite = await document("piece_identite", 40);
    await lier(identite, "organisation", org);
    expect(await echeance(identite)).toBe(await dateIlYa(40, 36));
    await purge();
    expect(await purgee(courrierDuLot)).toBe(false);
    expect(await purgee(identite)).toBe(true);
  });

  it("purge : pièces d'une personne sans bail, trois mois après le dernier dépôt ; propriétaires, mandants et personnes du bail exclus", async () => {
    const seule = await personne();
    const ancienne = await document("piece_identite", 5);
    await lier(ancienne, "personne", seule);
    const recente = await personne();
    const vieille = await document("justificatif", 5);
    const neuve = await document("justificatif", 1);
    for (const d of [vieille, neuve]) await lier(d, "personne", recente);
    const proprietaireBien = await personne();
    const docProprio = await document("piece_identite", 5);
    await lier(docProprio, "personne", proprietaireBien);
    await brut(() => db.query("insert into public.detentions (lot_id, organization_id, person_id, quote_part, date_debut) values ($1, $2, $3, 100, current_date - 1000)", [lot, org, proprietaireBien]));
    const mandant = await personne();
    const docMandant = await document("piece_identite", 5);
    await lier(docMandant, "personne", mandant);
    await brut(() => db.query("insert into public.mandats (organization_id, person_id, etat, date_rapport, duree_mois, preavis_mois) values ($1, $2, 'actif', 5, 12, 3)", [org, mandant]));
    const garant = await personne();
    const docGarant = await document("justificatif", 5);
    await lier(docGarant, "personne", garant);
    const b = await bail(null);
    await brut(() => db.query("insert into public.bail_personnes (organization_id, bail_id, person_id, role) values ($1, $2, $3, 'garant')", [org, b, garant]));
    // Relecture du 24/10 (R41) : le dépôt de la GED rattache toujours la pièce à l'espace (lien « organisation »,
    // lib/ged-depot.ts) ; ce lien ne fait pas d'une pièce du dossier une pièce « rattachée à autre chose ».
    for (const d of [ancienne, vieille, neuve, docProprio, docMandant, docGarant]) await lier(d, "organisation", org);
    // Règle inactive : rien.
    await purge();
    expect(await purgee(ancienne)).toBe(false);
    await activer("dossier:sans_bail");
    const r = await purge();
    expect(r.journaux).toMatchObject({ pieces_sans_bail: 1 });
    expect(await purgee(ancienne)).toBe(true);
    for (const d of [vieille, neuve, docProprio, docMandant, docGarant]) expect(await purgee(d), d).toBe(false);
  });

  it("purge des retours, dans l'ordre : groupe_id d'abord, puis soutiens et historique ; un signalement regroupant part aussi", async () => {
    const auteur = await compte("retours");
    const retour = (nature: string, mois: number, groupe: string | null = null) => brut(() => id(
      `insert into public.retours_utilisateurs (auteur_id, cle_envoi, nature, titre, description, etat, groupe_id, cree_le, modifie_le)
       values ($1, gen_random_uuid(), $2, 'Retour fictif', 'Une description fictive assez longue.', 'nouveau', $3, now() - make_interval(months => $4::int), now() - make_interval(months => $4::int))
       returning id`, [auteur, nature, groupe, mois]));
    const ancienne = await retour("idee", 25);
    const recente = await retour("idee", 1, ancienne);
    await brut(() => db.query("insert into public.retours_soutiens (retour_id, account_id) values ($1, $2)", [ancienne, auteur]));
    await brut(() => db.query("insert into public.retours_historique (retour_id, acteur_id, evenement, message, cree_le) values ($1, $2, 'creation', 'Créé', now() - interval '25 months')", [ancienne, auteur]));
    const bug = await retour("bug", 7);
    const regroupe = await retour("bug", 1, bug);
    await activer("support:question_idee");
    await purge();
    expect(await nombre("select count(*) from public.retours_utilisateurs where id = any($1)", [[ancienne, bug]])).toBe(0);
    expect(await un("select groupe_id from public.retours_utilisateurs where id = $1", [recente])).toEqual({ groupe_id: null });
    expect(await un("select groupe_id from public.retours_utilisateurs where id = $1", [regroupe])).toEqual({ groupe_id: null });
    expect(await nombre("select count(*) from public.retours_soutiens where retour_id = $1", [ancienne])).toBe(0);
  });

  it("journal d'audit : 12 mois en général, 36 mois pour le contrôle interne ; le registre de support suit le contrôle interne", async () => {
    const trace = (action: string, mois: number) => id("insert into public.audit_log (action, details, created_at) values ($1, '{}', now() - make_interval(months => $2::int)) returning id", [action, mois]);
    const ordinaire = await trace("document_depose", 13);
    const traversee = await trace("traversee_espace", 13);
    const support = await trace("support_encaissement_execute", 37);
    const recent = await trace("document_depose", 11);
    await purge();
    const restants = (await db.query("select id from public.audit_log where id = any($1)", [[ordinaire, traversee, support, recent]])).rows.map((r) => r.id).sort();
    expect(restants).toEqual([traversee, recent].sort());
    expect((await un<{ f: string }>("select pg_get_functiondef('support_interne.purger_gestes_support()'::regprocedure) as f")).f).toContain("journal:audit_controle_interne");
  });

  it("journal d'audit : les accès de la supervision (consultation_…, export de coordonnées) et les preuves d'effacement gardent 36 mois", async () => {
    // Page confidentialité (lot 4) : « 1 an ; 3 ans pour les accès de la supervision et les preuves d'effacement ».
    const trace = (action: string, mois: number) => id("insert into public.audit_log (action, details, created_at) values ($1, '{}', now() - make_interval(months => $2::int)) returning id", [action, mois]);
    const bilan = async () => {
      await session(superviseur);
      const r = (await un<{ r: { categories: { categorie: string; echus: number | null }[] } }>("select public.simuler_conservation_contacts() as r")).r;
      await proprietaire();
      const echus = (c: string) => Number(r.categories.find((x) => x.categorie === c)?.echus);
      return { general: echus("journal:audit_log"), interne: echus("journal:audit_controle_interne") };
    };
    const avant = await bilan();
    const gardees: string[] = [];
    for (const action of ["consultation_organisation", "consultation_piece_artisan", "consultation_faits_direction", "liste_attente_exportee",
                          "fermeture_programmee", "fermeture_annulee", "fermeture_gelee", "fermeture_degelee", "effacements_reappliques", "compte_ferme"]) {
      gardees.push(await trace(action, 13));
    }
    const parties = [await trace("consultation_organisation", 37), await trace("fermeture_programmee", 37),
                     await trace("decision_retour", 13), await trace("conservation_gel_pose", 13)];
    const apres = await bilan();
    expect(apres.interne - avant.interne).toBe(2);
    expect(apres.general - avant.general).toBe(2);
    expect(await un("select public.action_audit_controle_interne('consultation_organisation') as a, public.action_audit_controle_interne('consultationx') as b")).toEqual({ a: true, b: false });
    await purge();
    const restants = (await db.query("select id from public.audit_log where id = any($1)", [[...gardees, ...parties]])).rows.map((r) => r.id).sort();
    expect(restants).toEqual([...gardees].sort());
  });

  it("prospection : origine en liste fermée et qualité contrôlée", async () => {
    await session(superviseur);
    const inserer = (origine: string, qualite = "professionnel") => echec(
      "insert into public.supervision_prospects (nom, email, origine, qualite, etape, prochaine_action, echeance) values ('Prospect fictif', 'prospect@example.invalid', $1, $2, 'nouveau', 'Rappeler', current_date + 7)", [origine, qualite]);
    expect(await inserer("Formulaire du site")).toMatch(/^23514 .*supervision_prospects_origine_liste/);
    expect(await inserer("formulaire", "entreprise")).toMatch(/^23514 .*supervision_prospects_qualite_check/);
    for (const o of ["formulaire", "échange direct", "recommandation"]) expect(await inserer(o), o).toBe("");
  });

  it("prospection : après une opposition, la préparation d'un message est refusée, aussi pour une nouvelle fiche de la même adresse", async () => {
    await session(superviseur);
    const fiche = (email: string) => id(
      "insert into public.supervision_prospects (nom, email, origine, qualite, etape, prochaine_action, echeance) values ('Prospect fictif', $1, 'formulaire', 'professionnel', 'nouveau', 'Rappeler', current_date + 7) returning id", [email]);
    const p = await fiche("Agence.Fictive@example.invalid");
    expect(await echec("select public.controler_envoi_prospection($1)", [p])).toBe("");
    await db.query("select public.enregistrer_opposition_prospection($1)", [p]);
    // Relecture du 24/10 : la fiche part aussitôt (il n'y a plus rien à contrôler) ; l'empreinte refuse toute fiche
    // nouvelle de la même adresse.
    expect(await echec("select public.controler_envoi_prospection($1)", [p])).toMatch(/^P0002/);
    const doublon = await fiche("  agence.fictive@EXAMPLE.invalid ");
    expect(await echec("select public.controler_envoi_prospection($1)", [doublon])).toMatch(/^42501 Opposition enregistrée/);
    await proprietaire();
    expect(await un("select origine from public.oppositions_prospection where empreinte = $1", [sha("agence.fictive@example.invalid")])).toEqual({ origine: "prospect" });
    expect(await nombre("select count(*) from public.supervision_prospects where id = $1", [p])).toBe(0);
    // Réservé à la supervision permanente avec second facteur.
    await session(superviseur, "aal1");
    expect(await echec("select public.controler_envoi_prospection($1)", [doublon])).toMatch(/^42501/);
    await session(gerant);
    expect(await echec("select public.enregistrer_opposition_prospection($1)", [p])).toMatch(/^42501/);
  });

  it("prospection : au « Stop », toutes les fiches de l'adresse partent aussitôt, registre compris ; une fiche recréée pour l'adresse part au nettoyage ; 36 mois sans contact aussi", async () => {
    await session(superviseur);
    const fiche = (email: string) => id(
      "insert into public.supervision_prospects (nom, email, origine, qualite, etape, prochaine_action, echeance) values ('Prospect fictif', $1, 'échange direct', 'professionnel', 'nouveau', 'Rappeler', current_date + 7) returning id", [email]);
    const opposee = await fiche("opposee@example.invalid");
    const memeAdresse = await fiche(" Opposee@Example.invalid");
    const ancienne = await fiche("ancienne@example.invalid");
    const recente = await fiche("recente@example.invalid");
    await db.query("select public.enregistrer_opposition_prospection($1)", [opposee]);
    await proprietaire();
    expect(await nombre("select count(*) from public.supervision_prospects where id = any($1)", [[opposee, memeAdresse]])).toBe(0);
    expect(await nombre("select count(*) from public.supervision_registre where objet = 'supervision_prospects' and objet_id = any($1)", [[opposee, memeAdresse]])).toBe(0);
    const geste = await un<{ details: Record<string, unknown> }>("select details from public.audit_log where action = 'prospect_opposition_enregistree' and account_id = $1 order by created_at desc limit 1", [superviseur]);
    expect(geste.details).toEqual({ fiches_supprimees: 2 });
    // Une fiche recréée ensuite pour l'adresse opposée : refusée à l'envoi, et supprimée au nettoyage (l'écran l'annonce).
    await session(superviseur);
    const recreee = await fiche("opposee@example.invalid");
    await proprietaire();
    await db.query("update public.supervision_prospects set dernier_contact_prospect_le = now() - interval '37 months' where id = $1", [ancienne]);
    await purge();
    const restants = (await db.query("select id from public.supervision_prospects where id = any($1)", [[recreee, ancienne, recente]])).rows.map((r) => r.id);
    expect(restants).toEqual([recente]);
    expect(await nombre("select count(*) from public.supervision_registre where objet = 'supervision_prospects' and objet_id = any($1)", [[recreee, ancienne]])).toBe(0);
    // L'empreinte de l'opposition reste 36 mois.
    expect(await nombre("select count(*) from public.oppositions_prospection where empreinte = $1", [sha("opposee@example.invalid")])).toBe(1);
    await db.query("update public.oppositions_prospection set cree_le = now() - interval '37 months' where empreinte = $1", [sha("opposee@example.invalid")]);
    await purge();
    expect(await nombre("select count(*) from public.oppositions_prospection where empreinte = $1", [sha("opposee@example.invalid")])).toBe(0);
  });

  it("prospection : « Stop » possible sur une fiche ancienne à l'origine hors liste ; la migration range l'ancienne origine des fiches nées d'une demande", async () => {
    // Fiches écrites avant la liste fermée (sans déclencheurs : le registre exige un compte connecté).
    await db.query("alter table public.supervision_prospects drop constraint supervision_prospects_origine_liste");
    const ancienne = await brut(() => id(
      "insert into public.supervision_prospects (nom, email, origine, qualite, etape, prochaine_action, echeance, auteur) values ('Prospect ancien', 'ancien@example.invalid', 'Saisie manuelle', 'professionnel', 'nouveau', 'Rappeler', current_date + 7, $1) returning id", [superviseur]));
    const demande = await id("insert into public.demandes_devis (nom, email) values ('Fictif', 'demande-ancienne@example.invalid') returning id");
    const nee = await brut(() => id(
      "insert into public.supervision_prospects (nom, email, origine, qualite, etape, prochaine_action, echeance, auteur, demande_id) values ('Prospect né d''une demande', 'nee@example.invalid', 'Formulaire de contact', 'professionnel', 'nouveau', 'Rappeler', current_date + 7, $1, $2) returning id", [superviseur, demande]));
    await db.query("alter table public.supervision_prospects add constraint supervision_prospects_origine_liste check (origine in ('formulaire', 'échange direct', 'recommandation')) not valid");
    await db.query(MIGRATION);
    expect(await un("select origine from public.supervision_prospects where id = $1", [nee])).toEqual({ origine: "formulaire" });
    expect(await un("select origine from public.supervision_prospects where id = $1", [ancienne])).toEqual({ origine: "Saisie manuelle" });
    await session(superviseur);
    expect(await echec("select public.enregistrer_opposition_prospection($1)", [ancienne])).toBe("");
    await proprietaire();
    expect(await nombre("select count(*) from public.supervision_prospects where id = $1", [ancienne])).toBe(0);
    expect(await nombre("select count(*) from public.oppositions_prospection where empreinte = $1", [sha("ancien@example.invalid")])).toBe(1);
  });

  it("prospection : le dernier contact du prospect ne se date pas dans le futur (sa conservation deviendrait illimitée)", async () => {
    await session(superviseur);
    const p = await id(
      "insert into public.supervision_prospects (nom, email, origine, qualite, etape, prochaine_action, echeance) values ('Prospect fictif', 'futur@example.invalid', 'formulaire', 'professionnel', 'nouveau', 'Rappeler', current_date + 7) returning id");
    expect(await echec("update public.supervision_prospects set dernier_contact_prospect_le = now() + interval '2 years', revision = revision + 1 where id = $1", [p])).toMatch(/^22023/);
    expect(await echec(
      "insert into public.supervision_prospects (nom, email, origine, qualite, etape, prochaine_action, echeance, dernier_contact_prospect_le) values ('Prospect fictif', 'futur2@example.invalid', 'formulaire', 'professionnel', 'nouveau', 'Rappeler', current_date + 7, now() + interval '1 year')")).toMatch(/^22023/);
    expect(await echec("update public.supervision_prospects set dernier_contact_prospect_le = now() - interval '1 year', revision = revision + 1 where id = $1", [p])).toBe("");
  });

  it("prospection : la fiche d'un particulier part avec sa demande de contact ; celle d'un professionnel reste, sans sa demande", async () => {
    const demande = () => id("insert into public.demandes_devis (nom, email, created_at) values ('Fictif', gen_random_uuid() || '@example.invalid', now() - interval '3 years') returning id");
    const [d1, d2] = [await demande(), await demande()];
    await db.query("update public.demandes_devis set created_at = now() - interval '3 years' where id = any($1)", [[d1, d2]]);
    await session(superviseur);
    const fiche = (qualite: string, d: string) => id(
      "insert into public.supervision_prospects (nom, email, origine, qualite, etape, prochaine_action, echeance, demande_id) values ('Prospect fictif', gen_random_uuid() || '@example.invalid', 'formulaire', $1, 'nouveau', 'Rappeler', current_date + 7, $2) returning id", [qualite, d]);
    const particulier = await fiche("particulier", d1);
    const professionnel = await fiche("professionnel", d2);
    await purge();
    expect(await nombre("select count(*) from public.demandes_devis where id = any($1)", [[d1, d2]])).toBe(0);
    expect(await nombre("select count(*) from public.supervision_prospects where id = $1", [particulier])).toBe(0);
    expect(await nombre("select count(*) from public.supervision_registre where objet = 'supervision_prospects' and objet_id = $1", [particulier])).toBe(0);
    expect(await un("select demande_id from public.supervision_prospects where id = $1", [professionnel])).toEqual({ demande_id: null });
  });

  it("liste d'attente des agences : depuis l'inscription ; « retirée » laisse son empreinte d'opposition ; « convertie » part trois mois après", async () => {
    const agence = (statut = "en_attente") => id(
      "insert into public.liste_attente_agences (email, agence, contact, code_postal, nb_lots, statut) values (gen_random_uuid() || '@agence.example.invalid', 'Agence fictive', 'Contact fictif', '69001', 'moins_de_50', $1) returning id", [statut]);
    const ancienne = await agence("contactee");
    await db.query("update public.liste_attente_agences set created_at = now() - interval '37 months', contactee_le = now() where id = $1", [ancienne]);
    const retiree = await agence("retiree");
    const email = (await un<{ email: string }>("select email from public.liste_attente_agences where id = $1", [retiree])).email;
    const convertie = await agence("convertie");
    // Règle inactive : l'inscription retirée part quand même (c'est l'exécution d'une demande de retrait, pas une durée),
    // son empreinte d'opposition reste ; la date de conversion est constatée ; rien d'autre ne part.
    await purge();
    expect((await db.query("select id from public.liste_attente_agences where id = any($1) order by id", [[ancienne, retiree, convertie]])).rows.map((r) => r.id))
      .toEqual([ancienne, convertie].sort());
    expect(await un("select origine from public.oppositions_prospection where empreinte = $1", [sha(email.toLowerCase())])).toEqual({ origine: "liste_attente_agences" });
    await activer("contact:attente_agences");
    await purge();
    expect((await db.query("select id from public.liste_attente_agences where id = any($1)", [[ancienne, retiree, convertie]])).rows.map((r) => r.id)).toEqual([convertie]);
    await db.query("update public.conservation_reperes set depuis = now() - interval '3 months 1 day' where objet_id = $1", [convertie]);
    await purge();
    expect(await nombre("select count(*) from public.liste_attente_agences where id = $1", [convertie])).toBe(0);
    expect(await nombre("select count(*) from public.conservation_reperes where objet_id = $1", [convertie])).toBe(0);
  });

  it("liste d'attente des agences : la console sait quelles inscriptions sont opposées (retirées, ou adresse opposée comme prospect), supervision seule", async () => {
    const agence = (email: string, statut = "en_attente") => id(
      "insert into public.liste_attente_agences (email, agence, contact, code_postal, nb_lots, statut) values ($1, 'Agence fictive', 'Contact fictif', '69001', 'moins_de_50', $2) returning id", [email, statut]);
    const libre = await agence("libre@agence.example.invalid");
    const opposee = await agence("Opposee@agence.example.invalid");
    const retiree = await agence("retiree@agence.example.invalid", "retiree");
    await db.query("insert into public.oppositions_prospection (empreinte, origine) values ($1, 'prospect')", [sha("opposee@agence.example.invalid")]);
    await session(superviseur);
    // Finitions du 24/10 (relecture transverse 3, B2) : une table à une colonne `id` (PostgREST et l'émulateur la rendent
    // de la même façon, [{"id": …}]).
    const ids = (await db.query<{ id: string }>("select x.id from public.inscriptions_agences_opposees() x")).rows.map((r) => r.id);
    expect(await un("select pg_get_function_result('public.inscriptions_agences_opposees()'::regprocedure) as r")).toEqual({ r: "TABLE(id uuid)" });
    expect(ids).toContain(opposee);
    expect(ids).toContain(retiree);
    expect(ids).not.toContain(libre);
    await session(gerant);
    expect(await echec("select * from public.inscriptions_agences_opposees()")).toMatch(/^42501/);
  });

  it("comptes jamais utilisés : persons.account_id remis à nul puis compte supprimé ; adhésion active ou clé bloquante : rien ne part", async () => {
    const neuf = async (moisCreation: number) => {
      const c = await compte("jamais");
      await db.query("update auth.users set email_confirmed_at = null, last_sign_in_at = null, created_at = now() - make_interval(months => $2::int) where id = $1", [c, moisCreation]);
      return c;
    };
    const inscrit = await neuf(2);
    const fiche = await personne();
    await brut(() => db.query("update public.persons set account_id = $1 where id = $2", [inscrit, fiche]));
    const membre = await neuf(2);
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'proprietaire_direct')", [membre, orgAutre]);
    const bloque = await neuf(2);
    await db.query("insert into public.audit_log (account_id, action) values ($1, 'trace_fictive')", [bloque]);
    const recent = await neuf(0);
    await purge();
    expect(await nombre("select count(*) from auth.users where id = $1", [inscrit])).toBe(1);
    await activer("compte:inscription_non_confirmee");
    const r = await purge();
    expect(r.journaux).toMatchObject({ comptes_supprimes: 1, comptes_bloques: 1 });
    expect(await nombre("select count(*) from auth.users where id = any($1)", [[inscrit, membre, bloque, recent]])).toBe(3);
    expect(await nombre("select count(*) from auth.users where id = $1", [inscrit])).toBe(0);
    expect(await un("select account_id from public.persons where id = $1", [fiche])).toEqual({ account_id: null });
    const traceBloquee = await un<{ details: Record<string, unknown> }>("select details from public.tech_log where evenement = 'purge_compte_bloquee' and details ->> 'compte' = $1", [bloque]);
    expect(traceBloquee.details).toMatchObject({ regle: "compte:inscription_non_confirmee", erreur: "23503" });
    expect(JSON.stringify(traceBloquee.details)).not.toContain("@");
    // Relecture du 24/10 : un compte bloqué n'est retenté qu'après sept jours ; il ne revient pas chaque nuit en tête
    // des 200 candidats (ni une ligne de tech_log par nuit).
    await purge();
    expect(await nombre("select count(*) from public.tech_log where evenement = 'purge_compte_bloquee' and details ->> 'compte' = $1", [bloque])).toBe(1);
  });

  it("comptes d'invités jamais utilisés : créés confirmés par l'invitation, supprimés avec leurs invitations échues, même la nuit où les invitations partent", async () => {
    // preparer_invitation_locataire crée le compte avec email_confirmed_at = now() (20261013101000:40-42).
    const invite = async (moisDepuisExpiration: number) => {
      const c = await compte("invite");
      await db.query("update auth.users set last_sign_in_at = null, created_at = now() - interval '9 months' where id = $1", [c]);
      const p = await personne();
      await brut(() => db.query(
        `insert into public.invitations_locataires (organization_id, person_id, account_id, email, etat, cree_par, cree_le, expire_le)
         values ($1, $2, $3, 'invite@example.invalid', 'expiree', $4, now() - interval '9 months', now() - make_interval(months => $5::int))`,
        [org, p, c, gerant, moisDepuisExpiration]));
      return c;
    };
    const comptes = async (ids: string[]) => nombre("select count(*) from auth.users where id = any($1)", [ids]);
    const vieux = await invite(4);
    const recent = await invite(2);
    // Règles inactives : rien ne part.
    await purge();
    expect(await comptes([vieux, recent])).toBe(2);
    // Seule la règle des comptes : le compte part avec son invitation échue (clé invitations_locataires.account_id).
    await activer("compte:invitation_jamais_utilisee");
    let r = await purge();
    expect(r.journaux).toMatchObject({ comptes_supprimes: 1, comptes_bloques: 0 });
    expect(await comptes([vieux])).toBe(0);
    expect(await comptes([recent])).toBe(1);
    expect(await nombre("select count(*) from public.invitations_locataires where account_id = $1", [vieux])).toBe(0);
    // Les invitations purgées la même nuit, juste avant : le compte reste « invité » (repère posé avant leur purge) et
    // part au titre de sa règle, sans dépendre de compte:inscription_non_confirmee (inactive).
    const autre = await invite(4);
    await activer("invitation:locataire");
    r = await purge();
    expect(r.journaux).toMatchObject({ invitations_locataires: 1, comptes_supprimes: 1, comptes_bloques: 0 });
    expect(await comptes([autre])).toBe(0);
    expect(await comptes([recent])).toBe(1);
  });

  it("archives des comptes : chaque facture six ans après la fin de son exercice ou, à défaut, après la fin du dernier abonnement payé", async () => {
    await db.query("set local role service_role");
    const archive = async (qui: string, fin: string, factures: unknown[]) => (await un<{ id: string; f: string; p: string }>(
      `insert into public.archives_comptes (account_id_origine, fin_dernier_abonnement_paye, factures) values ($1, $2::date, $3::jsonb)
       returning id, factures_conservees_jusqu_au::text as f, preuve_conservee_jusqu_au::text as p`, [qui, fin, JSON.stringify(factures)]));
    // Fin payée en 2021 : la facture de 2019 (six ans après son émission : 2025) reste jusqu'au 31/01/2027.
    const a = await archive(gerant, "2021-01-31", [{ numero: "F-2019", emise_le: "2019-01-31" }]);
    expect(a.f).toBe("2027-01-31");
    // Exercice connu : six ans après sa clôture ; échue.
    const b = await archive(autreGerant, "2024-01-31", [{ numero: "F-2018", emise_le: "2018-03-01", exercice_clos_le: "2018-12-31" }, { numero: "F-2023", emise_le: "2023-12-31" }]);
    expect(b.f).toBe("2030-01-31");
    expect(await echec("insert into public.archives_comptes (account_id_origine, fin_dernier_abonnement_paye, factures) values (gen_random_uuid(), '2024-01-31', '[{\"emise_le\":\"2023-01-01\",\"exercice_clos_le\":\"31/12/2023\"}]')"))
      .toMatch(/^22023/);
    // Tout échu : fin payée en 2014, preuve jusqu'au 31/01/2024.
    const c = await archive(superviseur, "2014-01-31", [{ numero: "F-2013", emise_le: "2013-06-30" }]);
    await proprietaire();
    await db.query("update public.retention_rules set actif = false where data_type in ('archive:facture', 'archive:preuve_contrat')");
    await purge();
    expect(await nombre("select count(*) from public.archives_comptes where id = any($1) and jsonb_array_length(factures) > 0", [[a.id, b.id, c.id]])).toBe(3);
    await activer("archive:facture", "archive:preuve_contrat");
    const r = await purge();
    expect(r.journaux).toMatchObject({ archives_comptes_factures_retirees: 2, archives_comptes_supprimees: 1 });
    expect(await un("select factures from public.archives_comptes where id = $1", [a.id])).toEqual({ factures: [{ numero: "F-2019", emise_le: "2019-01-31" }] });
    expect(await un("select factures from public.archives_comptes where id = $1", [b.id])).toEqual({ factures: [{ numero: "F-2023", emise_le: "2023-12-31" }] });
    expect(await nombre("select count(*) from public.archives_comptes where id = $1", [c.id])).toBe(0);
  });

  it("événements Stripe : seuls les traités de plus de six mois partent", async () => {
    const evenement = (traite: string | null, recu: string) => db.query(
      "insert into public.abonnement_evenements (stripe_event_id, type, recu_le, traite_le) values ('evt_' || md5(random()::text), 'invoice.paid', now() - $1::interval, case when $2::text is null then null else now() - $2::interval end) returning stripe_event_id",
      [recu, traite]).then((r) => String(r.rows[0].stripe_event_id));
    const vieux = await evenement("7 months", "7 months");
    const enAttente = await evenement(null, "7 months");
    const recent = await evenement("5 months", "5 months");
    await purge();
    expect((await db.query("select stripe_event_id from public.abonnement_evenements where stripe_event_id = any($1) order by 1", [[vieux, enAttente, recent]])).rows.map((r) => r.stripe_event_id))
      .toEqual([enAttente, recent].sort());
  });

  // ── Intégration du 24/10 (socle final, vente, comptes) ───────────────────────────────────────────────────────

  it("archives : la garde du socle retire une facture à l'échéance même de la purge, pas six ans après son émission", async () => {
    await proprietaire();
    const a = await un<{ id: string; f: string }>(
      `insert into public.archives_comptes (account_id_origine, fin_dernier_abonnement_paye, factures)
       values (gen_random_uuid(), (current_date - interval '1 year')::date, $1::jsonb) returning id, factures_conservees_jusqu_au::text as f`,
      [JSON.stringify([{ numero: "F-ANCIENNE", emise_le: "2019-01-31" }])]);
    // Émise il y a plus de six ans, mais l'abonnement payé a pris fin il y a un an : gardée encore cinq ans, à l'écran
    // comme par la garde (une seule échéance, celle d'echeance_facture_archivee).
    expect(a.f).toBe(await dateIlYa(12, 72));
    expect(await echec("update public.archives_comptes set factures = '[]' where id = $1", [a.id])).toMatch(/^42501 Seules les factures arrivées au terme/);
    await activer("archive:facture");
    await purge();
    expect(await nombre("select jsonb_array_length(factures) from public.archives_comptes where id = $1", [a.id])).toBe(1);
    expect(await nombre("select count(*) from public.archives_comptes where id = $1 and factures_purgees_le is null", [a.id])).toBe(1);
  });

  it("rétractations (vente) : dix ans après la déclaration, la purge passe la garde d'ajout seul ; avant ce terme, rien ne part", async () => {
    await proprietaire();
    const declaration = (ilYa: string, cle: string) => id(
      `insert into public.retractations_abonnement (organization_id, subscription_id, nature, cle, texte_declaration, declaree_le, adresse_accuse)
       values ($1, 'sub_fictif', 'abonnement', $2, 'Je renonce au contrat d''abonnement (déclaration fictive).', now() - $3::interval,
               'retractation@example.invalid')
       returning id`, [org, cle, ilYa]);
    const ancienne = await declaration("121 months", "retractation-integration-ancienne");
    const recente = await declaration("119 months", "retractation-integration-recente");
    // Finitions du 24/10 (consigne A) : une déclaration détachée d'un espace effacé suit la même échéance.
    const detachee = await id(
      `insert into public.retractations_abonnement (organization_id, subscription_id, nature, cle, texte_declaration, declaree_le, adresse_accuse)
       values (null, 'sub_fictif_detache', 'abonnement', 'retractation-integration-detachee', 'Je renonce au contrat d''abonnement (déclaration fictive).',
               now() - interval '121 months', 'retractation@example.invalid') returning id`);
    const detacheeRecente = await id(
      `insert into public.retractations_abonnement (organization_id, subscription_id, nature, cle, texte_declaration, declaree_le, adresse_accuse)
       values (null, 'sub_fictif_detache', 'abonnement', 'retractation-integration-detachee-recente', 'Je renonce au contrat d''abonnement (déclaration fictive).',
               now() - interval '3 months', 'retractation@example.invalid') returning id`);
    expect(await echec("delete from public.retractations_abonnement where id = $1", [detacheeRecente])).toMatch(/ne se supprime pas/);
    expect(await echec("delete from public.retractations_abonnement where id = $1", [recente])).toMatch(/ne se supprime pas/);
    expect(await nombre("select count(*) from public.cibles_conservation_complementaire() x where x.categorie = 'contrat:retractation' and x.id = any($1)",
      [[ancienne, recente]])).toBe(1);
    const r = await purge();
    expect(r.journaux.retractations_abonnement).toBeGreaterThanOrEqual(1);
    expect((await db.query("select id from public.retractations_abonnement where id = any($1)", [[ancienne, recente]])).rows.map((x) => x.id))
      .toEqual([recente]);
    expect((await db.query("select id from public.retractations_abonnement where id = any($1)", [[detachee, detacheeRecente]])).rows.map((x) => x.id))
      .toEqual([detacheeRecente]);
    // La règle reste la garde : réduite, elle ne fait jamais partir une déclaration de moins de dix ans.
    await db.query("update public.retention_rules set duree_mois = 12 where data_type = 'contrat:retractation'");
    expect(await echec("delete from public.retractations_abonnement where id = $1", [recente])).toMatch(/ne se supprime pas/);
    await db.query("update public.retention_rules set duree_mois = 120 where data_type = 'contrat:retractation'");
  });

  // ── Finitions du 24/10 (relectures transverses) ───────────────────────────────────────────────────────────────

  it("B2 : un paiement de facture reste au journal tant qu'un abonnement porte son client ; l'archive de la fermeture garde ses factures", async () => {
    await proprietaire();
    const espace = await id("insert into public.organizations (name, status, type) values ('Espace des factures', 'active', 'proprietaire_direct') returning id");
    const titulaire = await compte("factures-b2");
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'proprietaire_direct')", [titulaire, espace]);
    await db.query("insert into public.acceptations_cgu (account_id, version, source) values ($1, '2026-09-30', 'inscription') on conflict do nothing", [titulaire]);
    await db.query(
      `insert into public.abonnements (organization_id, stripe_customer_id, stripe_subscription_id, stripe_statut, premiere_facture_payee, periode_debut, periode_fin)
       values ($1, 'cus_b2factures', 'sub_b2factures', 'active', true, now() - interval '1 month', now() + interval '1 month')`, [espace]);
    const evt = (type: string, client: string, ilYa: string, objet: string) => db.query(
      `insert into public.abonnement_evenements (stripe_event_id, type, charge, recu_le, traite_le)
       values ('evt_' || md5(random()::text), $1, jsonb_build_object('objet', $4::text, 'client', $2::text), now() - $3::interval, now() - $3::interval)
       returning stripe_event_id`, [type, client, ilYa, objet]).then((r) => String(r.rows[0].stripe_event_id));
    const ancienne = await evt("invoice.paid", "cus_b2factures", "8 months", "in_b2_ancienne");
    const recente = await evt("invoice.paid", "cus_b2factures", "1 month", "in_b2_recente");
    const autreType = await evt("customer.subscription.updated", "cus_b2factures", "8 months", "sub_b2factures");
    const orpheline = await evt("invoice.paid", "cus_b2_sans_abonnement", "8 months", "in_b2_orpheline");
    await purge();
    expect((await db.query("select stripe_event_id from public.abonnement_evenements where stripe_event_id = any($1) order by 1", [[ancienne, recente, autreType, orpheline]])).rows.map((r) => r.stripe_event_id))
      .toEqual([ancienne, recente].sort());
    // L'archive faite à la fermeture porte les deux factures et la vraie date de début (essai de la relecture 2).
    await proprietaire();
    expect(await un("select public.archiver_preuve_compte($1, $2) as fait", [titulaire, espace])).toEqual({ fait: true });
    const archive = await un<{ factures: { stripe_facture: string }[]; debut: string }>(
      "select factures, debut_abonnement::text as debut from public.archives_comptes where account_id_origine = $1 and organisation_id_origine = $2", [titulaire, espace]);
    expect(archive.factures.map((f) => f.stripe_facture)).toEqual(["in_b2_ancienne", "in_b2_recente"]);
    expect(archive.debut).toBe(await dateIlYa(8));
    // L'espace effacé, l'archive porte les références : le journal reprend sa durée de six mois.
    await db.query("delete from public.abonnements where organization_id = $1", [espace]);
    await purge();
    expect((await db.query("select stripe_event_id from public.abonnement_evenements where stripe_event_id = any($1)", [[ancienne, recente]])).rows.map((r) => r.stripe_event_id))
      .toEqual([recente]);
  });

  it("I6 : les preuves du contrat écrites dans le journal d'audit gardent dix ans, pas douze mois", async () => {
    const trace = (action: string, mois: number) => id("insert into public.audit_log (action, details, created_at) values ($1, '{}', now() - make_interval(months => $2::int)) returning id", [action, mois]);
    const preuves = ["abonnement_commande_confirmee", "abonnement_confirmation_envoyee", "abonnement_resiliation_notifiee", "abonnement_resiliation_levee",
      "abonnement_resiliation_accusee", "relance_paiement_envoyee", "abonnement_resiliation_impaye_notifiee", "abonnement_non_reconduit_conditions",
      "abonnement_retractation", "abonnement_retractation_accusee", "signature_caution_mobile_confirme", "signature_garant_bail_mobile_repris",
      "signature_edl_confirmation_sur_place"];
    const gardees: string[] = [];
    for (const action of preuves) gardees.push(await trace(action, 13));
    const parties = [await trace("abonnement_commande_confirmee", 121), await trace("relance_paiement_envoyee", 121), await trace("document_depose", 13)];
    await session(superviseur);
    const bilan = (await un<{ r: { categories: { categorie: string; echus: number | null }[] } }>("select public.simuler_conservation_contacts() as r")).r;
    expect(Number(bilan.categories.find((c) => c.categorie === "journal:audit_preuve_contrat")?.echus)).toBeGreaterThanOrEqual(2);
    await proprietaire();
    expect(await un("select public.action_audit_preuve_contrat('abonnement_retractation') as a, public.action_audit_preuve_contrat('abonnement_retractationx') as b, public.action_audit_preuve_contrat(null) as c"))
      .toEqual({ a: true, b: false, c: false });
    const r = await purge();
    expect(r.journaux.audit_log_preuve_contrat).toBeGreaterThanOrEqual(2);
    const restants = (await db.query("select id from public.audit_log where id = any($1)", [[...gardees, ...parties]])).rows.map((x) => x.id).sort();
    expect(restants).toEqual([...gardees].sort());
  });

  it("registre des effacements à réappliquer (comptes) : purgé quatre mois après l'exécution de la fermeture", async () => {
    await proprietaire();
    const fermeture = (ilYa: string) => brut(() => id(
      `insert into public.fermetures_comptes (account_id, origine, statut, demandee_le, effacement_prevu_le, empreinte_adresse,
         executee_le, mode_effacement, bilan_execution)
       values (gen_random_uuid(), 'super_admin', 'executee', current_date - 200, current_date - 150, repeat('a', 64),
               now() - $1::interval, 'suppression', '{}'::jsonb)
       returning id`, [ilYa]));
    const vieille = await fermeture("5 months");
    const recente = await fermeture("3 months");
    await brut(() => db.query(
      `insert into public.effacements_a_reappliquer (fermeture_id, account_id_origine, executee_le)
       select id, account_id, executee_le from public.fermetures_comptes where id = any($1)`, [[vieille, recente]]));
    const r = await purge();
    expect(r.journaux.effacements_a_reappliquer).toBeGreaterThanOrEqual(1);
    expect((await db.query("select fermeture_id from public.effacements_a_reappliquer where fermeture_id = any($1)", [[vieille, recente]])).rows
      .map((x) => x.fermeture_id)).toEqual([recente]);
    // La trace de la fermeture, elle, suit le domaine comptes (trois ans).
    expect(await nombre("select count(*) from public.fermetures_comptes where id = any($1)", [[vieille, recente]])).toBe(2);
  });

  it("journal d'authentification (R64) : compté pour le bilan, purgé à six mois seulement si la règle est activée", async () => {
    await db.query("create table if not exists auth.audit_log_entries (instance_id uuid, id uuid primary key default gen_random_uuid(), payload json, created_at timestamptz, ip_address varchar(64) not null default '')");
    await db.query("insert into auth.audit_log_entries (created_at) values (now() - interval '7 months'), (now() - interval '1 month')");
    expect(await nombre("select public.journal_auth_echus(false)")).toBe(1);
    let r = await purge();
    expect(r.journaux.journal_auth).toBe(0);
    expect(await nombre("select count(*) from auth.audit_log_entries")).toBe(2);
    await activer("journal:auth_audit");
    r = await purge();
    expect(r.journaux.journal_auth).toBe(1);
    expect(await nombre("select count(*) from auth.audit_log_entries")).toBe(1);
  });

  // ── Alertes ───────────────────────────────────────────────────────────────────────────────────────────────────

  it("alertes J-30 : une par bail, texte du plan, sans doublon ; un gel la repose à la nouvelle date ; file des courriels", async () => {
    const b = await bail(36 - 1);
    // Fin il y a 35 mois : suppression dans un mois environ (≤ 30 jours après ajustement).
    await brut(() => db.query("update public.baux set date_fin = (current_date - interval '36 months' + interval '20 days')::date, updated_at = current_date - interval '36 months' + interval '20 days' where id = $1", [b]));
    const doc = await document("bail", 61, org, "Bail signé fictif");
    await lier(doc, "bail", b);
    await proprietaire();
    expect(await nombre("select public.generer_alertes_conservation()")).toBe(1);
    expect(await nombre("select public.generer_alertes_conservation()")).toBe(0);
    const alerte = await un<{ id: string; titre: string; echeance: string; details: Record<string, unknown> }>(
      "select id, titre, echeance::text, details from public.alerts where type = 'conservation_echeance' and details ->> 'bail_id' = $1", [b]);
    const date = await dateIlYa(0, 0, 20);
    expect(alerte.echeance).toBe(date);
    expect(alerte.titre).toBe(`Les pièces suivantes du bail Lot fictif · Personne Fictive seront supprimées le ${date.split("-").reverse().join("/")}, au terme de leur durée de conservation (page confidentialité) : Bail signé fictif. Téléchargez celles que vous devez conserver. Si un litige est en cours, signalez-le depuis la fiche du bail pour suspendre la suppression.`);
    // File des courriels (clé de service) : destinataires = gérants de l'espace.
    await db.query("set local role service_role");
    const file = (await db.query("select alerte_id, destinataires from public.alertes_conservation_a_envoyer(50) where alerte_id = $1", [alerte.id])).rows;
    expect(file).toHaveLength(1);
    expect(file[0].destinataires).toHaveLength(1);
    expect(await nombre("select public.noter_courriel_alerte_conservation($1, 'reserve')::int", [alerte.id])).toBe(1);
    expect(await nombre("select public.noter_courriel_alerte_conservation($1, 'reserve')::int", [alerte.id])).toBe(0);
    expect(await nombre("select public.noter_courriel_alerte_conservation($1, 'echec')::int", [alerte.id])).toBe(1);
    expect(await nombre("select count(*) from public.alertes_conservation_a_envoyer(50) where alerte_id = $1", [alerte.id])).toBe(1);
    await db.query("select public.noter_courriel_alerte_conservation($1, 'reserve')", [alerte.id]);
    await db.query("select public.noter_courriel_alerte_conservation($1, 'envoye')", [alerte.id]);
    expect(await nombre("select count(*) from public.alertes_conservation_a_envoyer(50) where alerte_id = $1", [alerte.id])).toBe(0);
    // Le gel repousse l'échéance : l'alerte de l'ancienne date se ferme d'elle-même ; une alerte à la nouvelle date part
    // avec son propre courriel (relecture du 24/10 : une alerte par bail et par date).
    await proprietaire();
    await brut(() => db.query("update public.baux set conservation_gelee_jusqu_au = current_date + 25, conservation_gelee_motif = 'Litige fictif en cours' where id = $1", [b]));
    expect(await nombre("select public.generer_alertes_conservation()")).toBe(1);
    expect(await un("select statut::text as statut, details ->> 'fermeture_auto' as auto from public.alerts where id = $1", [alerte.id])).toEqual({ statut: "fermee", auto: "true" });
    const reposee = await un<{ echeance: string; courriel: string | null }>(
      "select echeance::text, details ->> 'courriel' as courriel from public.alerts where type = 'conservation_echeance' and statut = 'ouverte' and details ->> 'bail_id' = $1", [b]);
    expect(reposee).toEqual({ echeance: await dateIlYa(0, 0, 26), courriel: null });
  });

  it("alertes J-30 : une pièce qui entre dans la fenêtre après la première alerte du bail a la sienne, à sa date, sans renvoyer la première", async () => {
    const b = await bail(35);
    await brut(() => db.query("update public.baux set date_fin = (current_date - interval '36 months' + interval '10 days')::date, updated_at = current_date - interval '36 months' + interval '10 days' where id = $1", [b]));
    const courrier = await document("courrier", 61, org, "Courrier fictif");
    await lier(courrier, "bail", b);
    const quittance = await document("quittance", 30, org, "Quittance fictive");
    await lier(quittance, "bail", b);
    // Déposée tard : son échéance suit son dépôt (36 mois), hors de la fenêtre au premier passage.
    await brut(() => db.query("update public.documents set retention_reference_date = (current_date - interval '36 months' + interval '40 days')::date where id = $1", [quittance]));
    await proprietaire();
    expect(await nombre("select public.generer_alertes_conservation()")).toBe(1);
    const premiere = await id("select id from public.alerts where type = 'conservation_echeance' and statut = 'ouverte' and details ->> 'bail_id' = $1", [b]);
    await db.query("set local role service_role");
    await db.query("select public.noter_courriel_alerte_conservation($1, 'reserve')", [premiere]);
    await db.query("select public.noter_courriel_alerte_conservation($1, 'envoye')", [premiere]);
    // Le temps passe : l'échéance de la quittance entre dans les trente jours.
    await proprietaire();
    await brut(() => db.query("update public.documents set retention_reference_date = (current_date - interval '36 months' + interval '25 days')::date where id = $1", [quittance]));
    expect(await nombre("select public.generer_alertes_conservation()")).toBe(1);
    const alertes = (await db.query("select id, titre, details ->> 'courriel' as courriel from public.alerts where type = 'conservation_echeance' and statut = 'ouverte' and details ->> 'bail_id' = $1 order by echeance", [b])).rows;
    expect(alertes).toHaveLength(2);
    expect(alertes[0]).toMatchObject({ id: premiere, courriel: "envoye" });
    expect(alertes[0].titre).toContain(" : Courrier fictif. ");
    expect(alertes[1].titre).toContain(" : Quittance fictive. ");
    expect(alertes[1].courriel).toBeNull();
  });

  it("alertes et gel : le gel ferme l'alerte du bail et la retire de la file ; la levée laisse trente jours de préavis, une seule fois", async () => {
    const b = await bail(35);
    await brut(() => db.query("update public.baux set date_fin = (current_date - interval '36 months' + interval '20 days')::date, updated_at = current_date - interval '36 months' + interval '20 days' where id = $1", [b]));
    const doc = await document("bail", 61, org, "Bail signé fictif");
    await lier(doc, "bail", b);
    await proprietaire();
    expect(await nombre("select public.generer_alertes_conservation()")).toBe(1);
    const alerte = await id("select id from public.alerts where type = 'conservation_echeance' and statut = 'ouverte' and details ->> 'bail_id' = $1", [b]);
    // Un gel posé avant l'envoi : l'alerte se ferme aussitôt et ne part pas.
    await session(gerant);
    await db.query("select public.geler_conservation_bail($1, current_date + 60, 'Contestation fictive en cours')", [b]);
    await proprietaire();
    expect(await un("select statut::text as statut from public.alerts where id = $1", [alerte])).toEqual({ statut: "fermee" });
    await db.query("set local role service_role");
    expect(await nombre("select count(*) from public.alertes_conservation_a_envoyer(50) where alerte_id = $1", [alerte])).toBe(0);
    await proprietaire();
    expect(await nombre("select public.generer_alertes_conservation()")).toBe(0);
    // Levée : l'échéance d'origine (dans vingt jours) est trop proche ; la suppression attend trente jours, prévenue.
    await session(gerant);
    const dans30 = (await un<{ d: string }>("select ((now() at time zone 'Europe/Paris')::date + 30)::text as d")).d;
    expect((await un<{ r: Record<string, unknown> }>("select public.geler_conservation_bail($1, null, null) as r", [b])).r).toMatchObject({ echeance: dans30, preavis: true });
    expect(await un("select (public.lire_conservation_bail($1) ->> 'preavis')::boolean as p", [b])).toEqual({ p: true });
    await proprietaire();
    expect(await nombre("select public.generer_alertes_conservation()")).toBe(1);
    // Une seconde levée ne repousse rien.
    await session(gerant);
    expect((await un<{ r: { echeance: string } }>("select public.geler_conservation_bail($1, null, null) as r", [b])).r.echeance).toBe(dans30);
    // Sans gel en cours, une « levée » ne crée aucun préavis (pas de délai gagné sans litige écrit).
    await proprietaire();
    const sansGel = await bail(35);
    await brut(() => db.query("update public.baux set date_fin = (current_date - interval '36 months' + interval '5 days')::date, updated_at = current_date - interval '36 months' + interval '5 days' where id = $1", [sansGel]));
    await session(gerant);
    expect((await un<{ r: { preavis: boolean } }>("select public.geler_conservation_bail($1, null, null) as r", [sansGel])).r.preavis).toBe(false);
    await proprietaire();
    expect(await un("select conservation_gelee_jusqu_au from public.baux where id = $1", [sansGel])).toEqual({ conservation_gelee_jusqu_au: null });
    // Une alerte ouverte que le gel couvre (gel écrit hors du geste) : écartée de la file, fermée à la passe suivante.
    await proprietaire();
    const ouverte = await id("select id from public.alerts where type = 'conservation_echeance' and statut = 'ouverte' and details ->> 'bail_id' = $1", [b]);
    await brut(() => db.query("update public.baux set conservation_gelee_jusqu_au = current_date + 90, conservation_gelee_motif = 'Litige fictif en cours' where id = $1", [b]));
    await db.query("set local role service_role");
    expect(await nombre("select count(*) from public.alertes_conservation_a_envoyer(50) where alerte_id = $1", [ouverte])).toBe(0);
    await proprietaire();
    await db.query("select public.generer_alertes_conservation()");
    expect(await un("select statut::text as statut from public.alerts where id = $1", [ouverte])).toEqual({ statut: "fermee" });
  });

  it("alertes J-30 : les documents rattachés à aucun bail sont annoncés aussi, par espace et par date", async () => {
    const doc = await document("autre", 60, org, "Note fictive");
    await lier(doc, "organisation", org);
    // Déposé il y a soixante mois moins douze jours : supprimé dans douze jours.
    await brut(() => db.query("update public.documents set retention_reference_date = (current_date - interval '60 months' + interval '12 days')::date where id = $1", [doc]));
    await proprietaire();
    expect(await nombre("select public.generer_alertes_conservation()")).toBe(1);
    const a = await un<{ titre: string; details: Record<string, unknown> }>(
      "select titre, details from public.alerts where type = 'conservation_documents' and organization_id = $1 and statut = 'ouverte'", [org]);
    expect(a.titre).toMatch(/^Les documents suivants, qui ne sont rattachés à aucun bail, seront supprimés le \d{2}\/\d{2}\/\d{4}, au terme de leur durée de conservation \(page confidentialité\) : Note fictive\. Téléchargez ceux que vous devez conserver\.$/);
    expect(a.details).toMatchObject({ pieces: 1 });
    await db.query("set local role service_role");
    expect(await nombre("select count(*) from public.alertes_conservation_a_envoyer(50) where type = 'conservation_documents' and organization_id = $1", [org])).toBe(1);
  });

  it("alertes J-15 : pièces d'une personne sans bail, seulement si la règle est active", async () => {
    const p = await personne(org, "Candidate");
    const doc = await document("piece_identite", 0);
    await lier(doc, "personne", p);
    await lier(doc, "organisation", org);
    await brut(() => db.query("update public.documents set created_at = now() - interval '3 months' + interval '10 days' where id = $1", [doc]));
    await proprietaire();
    await db.query("select public.generer_alertes_conservation()");
    expect(await nombre("select count(*) from public.alerts where type = 'conservation_sans_bail' and details ->> 'person_id' = $1", [p])).toBe(0);
    await activer("dossier:sans_bail");
    await db.query("select public.generer_alertes_conservation()");
    const alerte = await un<{ titre: string }>("select titre from public.alerts where type = 'conservation_sans_bail' and details ->> 'person_id' = $1", [p]);
    expect(alerte.titre).toMatch(/^Les pièces de Personne Candidate, qui n'est rattachée à aucun bail, seront supprimées le \d{2}\/\d{2}\/\d{4}\. Si cette personne est locataire ou caution d'un bail, rattachez-la au bail avant cette date\.$/);
  });

  // ── Gel ───────────────────────────────────────────────────────────────────────────────────────────────────────

  it("gel : douze mois au plus, motif écrit, journalisé ; levée journalisée ; écriture directe refusée ; autre espace refusé", async () => {
    const b = await bail(30);
    await session(gerant);
    expect(await echec("select public.geler_conservation_bail($1, ((now() at time zone 'Europe/Paris')::date + interval '12 months' + interval '1 day')::date, 'Litige fictif en cours')", [b])).toMatch(/^22023 Un gel dure douze mois au plus/);
    expect(await echec("select public.geler_conservation_bail($1, (now() at time zone 'Europe/Paris')::date, 'Litige fictif en cours')", [b])).toMatch(/^22023/);
    expect(await echec("select public.geler_conservation_bail($1, current_date + 30, 'abc')", [b])).toMatch(/^22023 Indiquez le litige/);
    const r = await un<{ r: { echeance: string } }>("select public.geler_conservation_bail($1, ((now() at time zone 'Europe/Paris')::date + interval '12 months')::date, 'Contestation du dépôt de garantie') as r", [b]);
    // Le gel se compte au jour de Paris (la fonction refuse au-delà de douze mois à partir d'aujourd'hui à Paris).
    expect(r.r.echeance).toBe((await un<{ d: string }>("select ((now() at time zone 'Europe/Paris')::date + interval '12 months' + interval '1 day')::date::text as d")).d);
    expect(await un("select (public.lire_conservation_bail($1) ->> 'gelee_jusqu_au') is not null as g", [b])).toEqual({ g: true });
    // Écriture directe : refusée sur un bail signé (contenu figé) comme sur un brouillon (garde du gel).
    expect(await echec("update public.baux set conservation_gelee_jusqu_au = current_date + 900, conservation_gelee_motif = 'Contournement fictif' where id = $1", [b])).not.toBe("");
    await proprietaire();
    const brouillon = await brut(async () => {
      const locataire = await personne();
      return id("insert into public.baux (organization_id, lot_id, locataire_principal, etat, type, loyer_hc, charges) values ($1, $2, $3, 'brouillon', 'nu', 500, 20) returning id", [org, lot, locataire]);
    });
    await session(gerant);
    expect(await echec("update public.baux set conservation_gelee_jusqu_au = current_date + 900, conservation_gelee_motif = 'Contournement fictif' where id = $1", [brouillon])).toMatch(/^42501 Le gel de la conservation se pose depuis la fiche du bail/);
    await db.query("select public.geler_conservation_bail($1, null, null)", [b]);
    await proprietaire();
    expect(await un("select conservation_gelee_jusqu_au, conservation_gelee_motif from public.baux where id = $1", [b])).toEqual({ conservation_gelee_jusqu_au: null, conservation_gelee_motif: null });
    const actions = (await db.query("select action, details ->> 'motif' as motif from public.audit_log where details ->> 'bail_id' = $1 and action like 'conservation_gel%' order by created_at, action", [b])).rows;
    expect(actions.map((a) => a.action).sort()).toEqual(["conservation_gel_leve", "conservation_gel_pose"]);
    expect(actions.find((a) => a.action === "conservation_gel_pose")?.motif).toBe("Contestation du dépôt de garantie");
    await session(autreGerant);
    expect(await echec("select public.geler_conservation_bail($1, current_date + 30, 'Litige fictif en cours')", [b])).toMatch(/^42501 Bail introuvable/);
    expect(await echec("select public.lire_conservation_bail($1)", [b])).toMatch(/^42501/);
  });

  it("gel et lecture : un agent restreint ne voit ni ne gèle un bail hors de son portefeuille", async () => {
    const b = await bail(30);
    const agent = await compte("conservation-agent");
    await brut(() => db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'agent')", [agent, org]));
    await session(agent);
    expect(await echec("select public.lire_conservation_bail($1)", [b])).toMatch(/^42501/);
    expect(await echec("select public.geler_conservation_bail($1, current_date + 30, 'Litige fictif en cours')", [b])).toMatch(/^42501/);
  });

  it("gel : permis aussi quand l'abonnement est en lecture seule (geste protecteur)", async () => {
    const b = await bail(30, { organisation: orgFermee });
    await session(gerantFerme);
    expect(await echec("select public.geler_conservation_bail($1, current_date + 60, 'Litige fictif en cours')", [b])).toBe("");
    expect((await un<{ s: string | null }>("select current_setting('gerimmo.systeme', true) as s")).s ?? "").not.toBe("on");
  });

  // ── Bilan et droits ───────────────────────────────────────────────────────────────────────────────────────────

  it("bilan sans suppression : les catégories déjà purgées chaque nuit (signalements, alertes traitées, demandes de congé) sont comptées", async () => {
    const auteur = await compte("bilan");
    await brut(() => db.query(
      `insert into public.retours_utilisateurs (auteur_id, cle_envoi, nature, titre, description, etat, cree_le, modifie_le)
       values ($1, gen_random_uuid(), 'bug', 'Retour fictif', 'Une description fictive assez longue.', 'nouveau', now() - interval '7 months', now() - interval '7 months')`, [auteur]));
    await brut(() => db.query("insert into public.alerts (organization_id, type, titre, statut, closed_at) values ($1, 'manuelle', 'Alerte fictive', 'fermee', now() - interval '13 months')", [org]));
    const b = await bail(30);
    const p = await personne();
    await brut(() => db.query("insert into public.intentions_conge (organization_id, bail_id, person_id, motif, created_at, traitee_le) values ($1, $2, $3, 'Motif fictif', now() - interval '26 months', now() - interval '25 months')", [org, b, p]));
    await session(superviseur);
    const r = (await un<{ r: { categories: { categorie: string; echus: number | null; actif: boolean }[] } }>("select public.simuler_conservation_contacts() as r")).r;
    for (const c of ["support:bug", "alerte:traitee", "contrat:intention_conge"]) {
      expect(r.categories.find((x) => x.categorie === c)?.echus, c).toBeGreaterThanOrEqual(1);
    }
    // Intégration du 24/10 : rétractations (vente) et registre des effacements (comptes) ont leur purge, donc leur
    // nombre ; ce que personne ne purge encore reste « non calculé » (compte:inactif : fermeture du domaine comptes).
    for (const c of ["contrat:retractation", "journal:effacements_a_reappliquer"]) {
      expect(typeof r.categories.find((x) => x.categorie === c)?.echus, c).toBe("number");
    }
    expect(r.categories.find((x) => x.categorie === "compte:inactif")?.echus).toBeNull();
  });

  it("bilan sans suppression : super-administrateur avec second facteur, toutes les catégories, rien de supprimé", async () => {
    const b = await bail(37);
    const doc = await document("courrier", 61);
    await lier(doc, "bail", b);
    await session(superviseur, "aal1");
    expect(await echec("select public.simuler_conservation_contacts()")).toMatch(/^42501/);
    await session(superviseur);
    const r = (await un<{ r: { categories: { categorie: string; echus: number | null; actif: boolean }[]; suppressions: number } }>("select public.simuler_conservation_contacts() as r")).r;
    expect(r.suppressions).toBe(0);
    const categories = new Map(r.categories.map((c) => [c.categorie, c]));
    for (const [type] of REGLES) expect(categories.has(type), type).toBe(true);
    expect(categories.get("document:courrier")?.echus).toBeGreaterThanOrEqual(1);
    expect(categories.get("compte:inactif")?.echus).toBeNull();
    expect(await purgee(doc)).toBe(false);
  });

  it("droits : cinq fonctions ouvertes au navigateur, les autres à la clé de service ; anon ne lit pas les oppositions", async () => {
    const { rows } = await db.query<{ proname: string; a: boolean; s: boolean }>(
      `select p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') as a, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_ok,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as s
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1)`, [[...OUVERTES, ...RESERVEES]]);
    for (const r of rows) {
      expect((r as unknown as { anon_ok: boolean }).anon_ok, r.proname).toBe(false);
      if (!DECLENCHEURS.includes(r.proname)) expect(r.a, r.proname).toBe(OUVERTES.includes(r.proname));
    }
    expect(rows).toHaveLength(OUVERTES.length + RESERVEES.length);
    await anon();
    expect(await echec("select * from public.oppositions_prospection")).toMatch(/^42501/);
    await session(gerant);
    expect(await nombre("select count(*) from public.oppositions_prospection")).toBe(0);
    expect(await echec("insert into public.oppositions_prospection (empreinte, origine) values ($1, 'prospect')", [sha("x@example.invalid")])).toMatch(/^42501/);
  });

  // ── Retour arrière ────────────────────────────────────────────────────────────────────────────────────────────

  it("retour : fonctions rendues à leur texte d'avant, catalogue d'avant, rejeu sans effet, puis marche avant identique", async () => {
    const etat = async () => (await un<{ f: string; c: string }>(
      `select (select md5(string_agg(n.nspname || '.' || p.proname || ':' || p.prosrc || coalesce(p.proacl::text, ''), '|' order by n.nspname, p.proname, p.oid))
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'support_interne')) as f,
              (select md5(string_agg(data_type || duree_mois || declencheur || finalite || actif::text || sort::text, '|' order by data_type)) from public.retention_rules) as c`));
    const apres = await etat();
    await db.query(RETOUR);
    const corps = (source: string, nom: string) => {
      const debut = source.indexOf(`create or replace function public.${nom}(`);
      return /as \$\$([\s\S]*?)\$\$;/.exec(source.slice(debut))?.[1];
    };
    const src = async (nom: string) => (await un<{ s: string }>("select prosrc as s from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace", [nom])).s;
    expect(await src("cibles_conservation_contacts")).toBe(corps(CONTACTS_2210, "cibles_conservation_contacts"));
    expect(await src("purger_contacts_echus")).toBe(corps(CONTACTS_2210, "purger_contacts_echus"));
    expect(await src("purger_archives_comptes")).toBe(corps(SOCLE, "purger_archives_comptes"));
    // Intégration du 24/10 : les deux gardes retrouvent le texte du socle final et celui de la vente.
    expect(await src("archives_comptes_garde")).toBe(corps(SOCLE, "archives_comptes_garde"));
    expect(await src("retractations_abonnement_ajout_seul")).toBe(corps(VENTE, "retractations_abonnement_ajout_seul"));
    const def = (await un<{ d: string }>("select pg_get_functiondef('public.appliquer_retention()'::regprocedure) as d")).d;
    expect(def).not.toContain("CONSERVATION_20261024");
    expect(def).toContain("public.debut_conservation_document(d.id) as debut");
    expect(await nombre("select duree_mois from public.retention_rules where data_type = 'document:bail'")).toBe(60);
    expect(await nombre("select count(*) from public.retention_rules where data_type = 'preuve:signature'")).toBe(0);
    expect(await nombre("select count(*) from pg_proc where proname = 'geler_conservation_bail'")).toBe(0);
    // Toutes les fonctions et déclencheurs ajoutés partent, ceux des relectures du 24/10 compris (purger_archives_comptes,
    // du socle, retrouve seulement son texte d'avant).
    const ajoutees = [...OUVERTES, ...RESERVEES].filter((f) => f !== "purger_archives_comptes");
    expect(await nombre("select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = any($1)", [ajoutees])).toBe(0);
    expect(await nombre("select count(*) from pg_trigger where tgname in ('baux_gel_conservation_garde', 'supervision_prospects_dernier_contact_garde')")).toBe(0);
    expect(await nombre("select count(*) from pg_constraint where conname = 'supervision_prospects_origine_liste'")).toBe(0);
    const revenu = await etat();
    await db.query(RETOUR);
    expect(await etat()).toEqual(revenu);
    await db.query(MIGRATION);
    expect(await etat()).toEqual(apres);
  });

  it("retour : une opposition enregistrée est conservée (preuve) ; les colonnes du gel et des prospects restent", async () => {
    await db.query("insert into public.oppositions_prospection (empreinte, origine) values ($1, 'prospect')", [sha("garde@example.invalid")]);
    await db.query(RETOUR);
    expect(await nombre("select count(*) from public.oppositions_prospection")).toBeGreaterThanOrEqual(1);
    expect(await nombre("select count(*) from information_schema.columns where table_schema = 'public' and ((table_name = 'baux' and column_name like 'conservation_gelee%') or (table_name = 'supervision_prospects' and column_name in ('oppose_le', 'dernier_contact_prospect_le', 'qualite')))")).toBe(5);
    await db.query(MIGRATION);
  });
});
