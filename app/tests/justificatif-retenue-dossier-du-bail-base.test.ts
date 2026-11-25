/**
 * LA PIÈCE D'UNE RETENUE NE VIENT PAS DU DOSSIER DE QUELQU'UN D'AUTRE — décision du dirigeant du 24/11/2026 (Q49),
 * seconde reprise du lot D3 (points 1, 2, 3 et 4 de la relecture).
 *
 * Avant la migration 20261124220000, la base acceptait pour une retenue du bail A : la pièce d'identité du locataire B,
 * un état des lieux rangé au seul logement B, le règlement de copropriété du bail B. Une fois le décompte finalisé, le
 * locataire A les lisait. Ce que ces tests tiennent, sous les vrais rôles :
 *  1. ces pièces sont refusées, par `justifier_retenue` comme par `ajouter_retenue`, avec un message qui dit quoi faire ;
 *  2. les cas légitimes passent toujours : un devis de l'espace pour deux retenues, l'état des lieux de sortie du bail,
 *     une pièce rangée dans les deux baux, un règlement de copropriété commun, une pièce d'un colocataire du bail ;
 *  3. après la finalisation, le locataire A ne lit aucune pièce d'un autre dossier (ses deux fonctions de lecture) ;
 *  4. une pièce purgée se remplace ; une pièce vivante ne se remplace toujours pas ;
 *  5. l'agent limité à son portefeuille ne lit toujours pas la pièce d'un collègue (aucun droit ouvert) ;
 *  6. la migration se rejoue ; son retour rend les deux textes d'avant, et se joue avant le retour de 20261124200000.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261124220000_justificatif_retenue_dossier_du_bail";
const PREMIERE_REPRISE = "20261124200000_justificatif_retenue_piece_existante";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const REFUS_PERSONNE = "Cette pièce est rangée dans le dossier d'une personne qui n'est pas partie à ce bail : elle ne peut pas justifier cette retenue. Déposez le justificatif propre à ce bail";
const REFUS_DOSSIER = "Cette pièce est rangée dans le dossier d'un autre bail ou d'un autre logement : elle ne peut pas justifier cette retenue. Déposez le justificatif propre à ce bail, ou rangez-la aussi dans le dossier de ce bail";

describe("dossier du bail d'une retenue — manifeste, retour et droits écrits (sans base)", () => {
  it("la migration est au manifeste une seule fois, après la première reprise, avec son retour listé et son test en série", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261124210000_reperes_fiscaux_ancien_reglage_sans_source.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/justificatif-retenue-dossier-du-bail-base.test.ts"');
  });

  it("deux fonctions réécrites, aucun droit ouvert, aucune règle de lecture ni de conservation touchée, aucune donnée écrite", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql.match(/create or replace function public\.(\w+)/g)).toEqual([
      "create or replace function public.garde_justificatif_retenue", "create or replace function public.justifier_retenue"]);
    expect(sql).not.toMatch(/\bgrant\b/i);
    expect(sql).not.toMatch(/\bpolicy\b|row level security/i);
    expect(sql).not.toMatch(/conservation|purger_/i); // point 3 : aucune règle de conservation
    expect(sql).toContain("revoke all on function public.garde_justificatif_retenue() from public, anon, authenticated, service_role;");
    expect(sql).toContain("revoke execute on function public.justifier_retenue(uuid, uuid) from public, anon;");
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
    expect(sql.replace(/\$\$[\s\S]*?\$\$/g, "")).not.toMatch(/insert into|update public\.|delete from/i);
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(retour).not.toMatch(/delete from public\.|drop table|truncate|\bgrant\b/i);
  });

  it("le LISEZ-MOI et la procédure de restauration disent le cas de la retenue à pièce purgée ; le retour de la première reprise dit son ordre", () => {
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    expect(lisezMoi).toContain("la réinsertion **ligne à ligne** d'une telle retenue (déclencheurs actifs) est donc refusée");
    expect(lisezMoi).toContain("`pg_restore --disable-triggers`) passe");
    expect(readFileSync("docs/sauvegarde-et-restauration.md", "utf8")).toContain("La réinsertion **ligne à ligne** d'une telle retenue, déclencheurs actifs, est refusée");
    expect(readFileSync(`supabase/retours-arriere/${PREMIERE_REPRISE}.retour.sql`, "utf8")).toContain("Se joue APRÈS le retour de 20261124220000");
  });
});

describe.skipIf(!url)("dossier du bail d'une retenue (avec base)", () => {
  let db: Client;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });

  // Le dossier fictif de chaque test : une agence, deux baux terminés (A et B), chacun avec son logement, son locataire
  // (qui a un compte) et sa restitution en cours ; un agent limité au portefeuille du logement A.
  let org: string, admin: string, agent: string, compteLocA: string, compteLocB: string;
  let A: { bail: string; lot: string; locataire: string; restitution: string }, B: typeof A;
  let rA1: string, rA2: string, rB1: string;

  async function compte(): Promise<string> {
    const { rows: [{ id }] } = await db.query<{ id: string }>(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        'test-dossier-retenue-'||gen_random_uuid()||'@test.local', 'x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '')
      returning id`);
    return id;
  }
  async function simuler(qui: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: qui, role: "authenticated" })]);
    await db.query("set local role authenticated");
  }
  const refus = async (sql: string, args: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, args); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  const lier = (doc: string, entite: string, id: string) =>
    db.query("insert into public.document_liens (document_id, organization_id, entite, entite_id) values ($1, $2, $3::public.entite_liee, $4)", [doc, org, entite, id]);
  /** Une fiche de document vivante, rangée dans l'espace (comme tout dépôt), puis dans les dossiers donnés. */
  async function document(type: string, titre: string, liens: [string, string][] = [], par = admin): Promise<string> {
    const { rows: [{ id }] } = await db.query<{ id: string }>(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte, deposited_by)
       values ($1::uuid, $2::public.document_type, $3, $1::uuid::text || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 1000, gen_random_uuid()::text, $4) returning id`,
      [org, type, titre, par]);
    await lier(id, "organisation", org);
    for (const [entite, cible] of liens) await lier(id, entite, cible);
    return id;
  }
  async function bailTermine(nom: string, compteLocataire: string) {
    const { rows: [{ id: bien }] } = await db.query<{ id: string }>("insert into public.biens (organization_id, nom, type, address_line1, postal_code, city) values ($1, $2, 'appartement', '1 rue du Test', '75001', 'Paris') returning id", [org, nom]);
    const { rows: [{ id: lot }] } = await db.query<{ id: string }>("insert into public.lots (organization_id, bien_id, nom, etat) values ($1, $2, $3, 'disponible') returning id", [org, bien, nom]);
    const { rows: [{ id: locataire }] } = await db.query<{ id: string }>("insert into public.persons (organization_id, nom, prenom, account_id) values ($1, $2, 'Locataire', $3) returning id", [org, nom, compteLocataire]);
    const { rows: [{ id: bail }] } = await db.query<{ id: string }>(
      `insert into public.baux (organization_id, lot_id, type, etat, date_debut, date_fin, date_sortie_reelle, loyer_hc, charges, depot_garantie, jour_echeance, locataire_principal, charges_mode, paiement_echeance)
       values ($1, $2, 'nu', 'termine', current_date - 400, current_date - 10, current_date - 10, 600, 40, 600, 5, $3, 'provision', 'echoir') returning id`, [org, lot, locataire]);
    const { rows: [{ id: restitution }] } = await db.query<{ id: string }>("insert into public.restitutions (organization_id, bail_id, date_remise_cles, delai_mois, depot, impayes, statut) values ($1, $2, current_date - 10, 2, 600, 0, 'en_cours') returning id", [org, bail]);
    return { bail, lot, locataire, restitution };
  }
  const retenue = async (restitution: string, libelle: string) =>
    (await db.query<{ id: string }>("insert into public.retenues (organization_id, restitution_id, libelle, cout, montant_retenu, sans_justificatif) values ($1, $2, $3, 150, 150, true) returning id", [org, restitution, libelle])).rows[0].id;
  /** Écritures d'administration du banc (mandat du portefeuille, statut de la restitution), déclencheurs coupés. */
  async function enAdministration(sql: string, args: unknown[] = []) {
    await db.query("reset role");
    await db.query("set session_replication_role = replica");
    const resultat = await db.query(sql, args);
    await db.query("set session_replication_role = origin");
    return resultat;
  }
  async function mandat(lot: string, titulaire: string | null) {
    const mandant = (await enAdministration("insert into public.persons (organization_id, nom, prenom) values ($1, 'Mandant', 'Banc') returning id", [org])).rows[0].id;
    const id = (await enAdministration("insert into public.mandats (organization_id, person_id, etat, date_debut, agent_account_id) values ($1, $2, 'actif', current_date, $3) returning id", [org, mandant, titulaire])).rows[0].id;
    await enAdministration("insert into public.mandat_lignes (organization_id, mandat_id, lot_id, date_debut) values ($1, $2, $3, current_date)", [org, id, lot]);
  }
  const pieceDe = async (r: string) => {
    await db.query("reset role");
    return (await db.query<{ piece: string | null }>("select justificatif_document piece from public.retenues where id = $1", [r])).rows[0].piece;
  };
  /** Ce que le locataire lit de ces documents : la fiche (`mon_document_locataire`) et le fichier (`chemins_pieces_locataire`). */
  async function luesPar(compteLocataire: string, pieces: Record<string, string>) {
    await db.query("reset role");
    const chemins = new Map((await db.query<{ id: string; storage_path: string }>("select id, storage_path from public.documents where id = any($1)", [Object.values(pieces)])).rows.map((d) => [d.id, d.storage_path]));
    await simuler(compteLocataire);
    const lisibles = new Set((await db.query<{ chemin: string }>("select public.chemins_pieces_locataire() chemin")).rows.map((l) => l.chemin));
    const lues: string[] = [];
    for (const [nom, id] of Object.entries(pieces)) {
      const fiche = (await db.query("select * from public.mon_document_locataire($1, $2)", [org, id])).rowCount;
      const fichier = lisibles.has(chemins.get(id) ?? "");
      if (fiche || fichier) lues.push(`${nom}${fiche ? " (fiche)" : ""}${fichier ? " (fichier)" : ""}`);
    }
    await db.query("reset role");
    return lues;
  }

  beforeEach(async () => {
    await db.query("begin");
    org = (await db.query<{ id: string }>("insert into public.organizations (name, type, status) values ('Test dossier retenue', 'agence', 'active') returning id")).rows[0].id;
    admin = await compte(); agent = await compte(); compteLocA = await compte(); compteLocB = await compte();
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'admin_agence'), ($3, $2, 'agent'), ($4, $2, 'locataire'), ($5, $2, 'locataire')", [admin, org, agent, compteLocA, compteLocB]);
    A = await bailTermine("Test dossier retenue, bail A", compteLocA);
    B = await bailTermine("Test dossier retenue, bail B", compteLocB);
    await mandat(A.lot, agent);  // dans le portefeuille de l'agent
    await mandat(B.lot, null);   // hors de son portefeuille
    rA1 = await retenue(A.restitution, "Peinture du séjour"); rA2 = await retenue(A.restitution, "Peinture de la chambre");
    rB1 = await retenue(B.restitution, "Remplacement du lavabo");
  });
  afterEach(async () => { await db.query("rollback"); });

  const JUSTIFIER = "select public.justifier_retenue($1, $2)";
  const AJOUTER = "select public.ajouter_retenue($1, 'Remplacement d''une vitre', 80, null, null, $2)";
  const DEPOSER = "select public.justifier_retenue_avec_piece($1, $2, 'application/pdf', 1000, $3)";

  /** Les pièces du dossier d'un autre (bail B, son logement, son locataire) : aucune ne doit justifier une retenue du bail A. */
  async function piecesDUnAutreDossier() {
    await db.query("reset role");
    const identiteB = await document("piece_identite", "Pièce d'identité du locataire B", [["personne", B.locataire]]);
    const edlLogementB = await document("etat_des_lieux", "État des lieux rangé au logement B", [["lot", B.lot]]);
    const dossierBailB = await document("etat_des_lieux", "État des lieux rangé au bail B", [["bail", B.bail]]);
    const reglementB = await document("reglement_copropriete", "Règlement de copropriété du bail B");
    const contratB = await document("bail", "Contrat signé du bail B");
    await db.query("update public.baux set reglement_copropriete = $1, document_signe = $2 where id = $3", [reglementB, contratB, B.bail]);
    const incidentB = (await enAdministration("insert into public.incidents (organization_id, numero, lot_id, bail_id, canal, categorie, description) values ($1, 'TEST-D3R2', $2, $3, 'agence', 'plomberie_joint', 'Fuite sous l''évier') returning id", [org, B.lot, B.bail])).rows[0].id;
    const photoIncidentB = await document("photo_incident", "Photo d'un incident du logement B", [["incident", incidentB]]);
    return { identiteB, edlLogementB, dossierBailB, reglementB, contratB, photoIncidentB };
  }

  it("point 1 : la pièce d'un autre locataire, d'un autre logement ou d'un autre bail ne justifie pas la retenue (les deux fonctions)", async () => {
    const autres = await piecesDUnAutreDossier();
    await simuler(admin);
    for (const [nom, piece] of Object.entries(autres)) {
      const attendu = nom === "identiteB" ? REFUS_PERSONNE : REFUS_DOSSIER;
      expect(await refus(JUSTIFIER, [rA1, piece]), nom).toBe(attendu);
      expect(await refus(AJOUTER, [A.restitution, piece]), nom).toBe(attendu);
    }
    expect(await pieceDe(rA1)).toBeNull();
    expect((await db.query("select count(*)::int n from public.retenues where restitution_id = $1", [A.restitution])).rows[0].n).toBe(2);
  });

  it("point 1 : même rangée exprès dans le bail A, la pièce d'identité du locataire B reste refusée", async () => {
    const { identiteB } = await piecesDUnAutreDossier();
    await lier(identiteB, "bail", A.bail);
    await simuler(admin);
    expect(await refus(JUSTIFIER, [rA1, identiteB])).toBe(REFUS_PERSONNE);
  });

  it("point 1, côté locataire : après la finalisation, le locataire A ne lit aucune pièce d'un autre dossier", async () => {
    const autres = await piecesDUnAutreDossier();
    // Le geste fautif, tenté pour chaque pièce sur une retenue du bail A (accepté avant la migration pour trois d'entre elles).
    for (const piece of Object.values(autres)) {
      const r = await retenue(A.restitution, "Retenue d'essai");
      await simuler(admin);
      await refus(JUSTIFIER, [r, piece]);
      await db.query("reset role");
    }
    await enAdministration("update public.restitutions set statut = 'finalise' where id = $1", [A.restitution]);
    expect(await luesPar(compteLocA, autres)).toEqual([]);
  });

  it("cas légitimes : un devis de l'espace pour deux retenues, l'état des lieux de sortie du bail, une pièce des deux baux, un règlement commun, la pièce d'un colocataire", async () => {
    const devis = await document("devis", "Devis unique pour deux réparations");
    const edlSortie = await document("etat_des_lieux", "État des lieux de sortie du bail A", [["bail", A.bail], ["lot", A.lot], ["personne", A.locataire]]);
    const desDeuxBaux = await document("etat_des_lieux", "Constat commun aux deux baux", [["bail", B.bail], ["lot", B.lot], ["bail", A.bail]]);
    const reglementCommun = await document("reglement_copropriete", "Règlement de la copropriété, commun aux deux baux");
    await db.query("update public.baux set reglement_copropriete = $1 where id = any($2)", [reglementCommun, [A.bail, B.bail]]);
    const colocataire = (await db.query<{ id: string }>("insert into public.persons (organization_id, nom, prenom) values ($1, 'Colocataire', 'Du bail A') returning id", [org])).rows[0].id;
    await db.query("insert into public.bail_personnes (organization_id, bail_id, person_id, role) values ($1, $2, $3, 'colocataire')", [org, A.bail, colocataire]);
    const pieceColocataire = await document("justificatif", "Attestation du colocataire", [["personne", colocataire]]);
    await simuler(admin);
    await db.query(JUSTIFIER, [rA1, devis]);
    await db.query(JUSTIFIER, [rA2, devis]);
    for (const piece of [edlSortie, desDeuxBaux, reglementCommun, pieceColocataire]) expect(await refus(AJOUTER, [A.restitution, piece]), piece).toBe("");
    expect(await pieceDe(rA1)).toBe(devis);
    expect(await pieceDe(rA2)).toBe(devis);
    // Finalisé : le locataire A lit ces pièces, qui sont celles de SES retenues.
    await enAdministration("update public.restitutions set statut = 'finalise' where id = $1", [A.restitution]);
    expect(await luesPar(compteLocA, { devis, edlSortie, desDeuxBaux })).toEqual(["devis (fiche) (fichier)", "edlSortie (fiche) (fichier)", "desDeuxBaux (fiche) (fichier)"]);
    // Le locataire B, lui, ne lit pas le devis des retenues du bail A.
    expect(await luesPar(compteLocB, { devis, edlSortie })).toEqual([]);
  });

  it("une facture déposée pour une retenue du bail B, rangée seulement dans l'espace, reste admise pour le bail A ; rangée dans le bail B, elle ne l'est plus", async () => {
    await simuler(admin);
    await db.query(DEPOSER, [rB1, `${org}/facture-b.pdf`, "empreinte-facture-b"]);
    const facture = (await pieceDe(rB1))!;
    expect((await db.query("select entite::text from public.document_liens where document_id = $1", [facture])).rows).toEqual([{ entite: "organisation" }]);
    await simuler(admin);
    await db.query(JUSTIFIER, [rA1, facture]);
    expect(await pieceDe(rA1)).toBe(facture);
    // La même facture, une fois rangée dans le dossier du bail B, ne se rattache plus à une autre retenue du bail A.
    await lier(facture, "bail", B.bail);
    await simuler(admin);
    expect(await refus(JUSTIFIER, [rA2, facture])).toBe(REFUS_DOSSIER);
  });

  it("point 4 : le refus dit l'issue pour une pièce réellement commune, et cette issue marche", async () => {
    expect(REFUS_DOSSIER).toMatch(/ou rangez-la aussi dans le dossier de ce bail$/);
    await db.query("reset role");
    const commune = await document("etat_des_lieux", "Constat rangé au logement B", [["lot", B.lot]]);
    await simuler(admin);
    expect(await refus(JUSTIFIER, [rA1, commune])).toBe(REFUS_DOSSIER);
    await db.query("insert into public.document_liens (document_id, organization_id, entite, entite_id) values ($1, $2, 'bail', $3)", [commune, org, A.bail]); // le geste de l'administrateur, sous son rôle
    await db.query(JUSTIFIER, [rA1, commune]);
    expect(await pieceDe(rA1)).toBe(commune);
  });

  it("point 3 : une pièce purgée se remplace ; une pièce vivante ne se remplace pas ; la retenue garde sa pièce purgée tant qu'on ne la remplace pas", async () => {
    const premiere = await document("devis", "Premier devis"), seconde = await document("devis", "Second devis");
    await simuler(admin);
    await db.query(JUSTIFIER, [rA1, premiere]);
    await db.query(JUSTIFIER, [rA2, premiere]);
    expect(await refus(JUSTIFIER, [rA1, seconde])).toBe("Cette retenue a déjà un justificatif");
    // La purge elle-même n'est pas de ce lot : on pose seulement son résultat (fiche gardée, fichier supprimé).
    await enAdministration("update public.documents set purged_at = now(), storage_path = null where id = $1", [premiere]);
    expect(await pieceDe(rA1)).toBe(premiere);
    await simuler(admin);
    await db.query(JUSTIFIER, [rA1, seconde]); // refusé avant la migration : « Cette retenue a déjà un justificatif »
    expect(await pieceDe(rA1)).toBe(seconde);
    expect(await pieceDe(rA2)).toBe(premiere); // l'autre retenue n'est pas touchée
    // Une pièce purgée ne se rattache toujours pas à une autre retenue (garde-fou d'avant).
    const autre = await retenue(A.restitution, "Autre retenue");
    await simuler(admin);
    expect(await refus(JUSTIFIER, [autre, premiere])).toBe("Justificatif introuvable");
  });

  it("point 2 : l'agent limité à son portefeuille ne lit pas la pièce d'un collègue, avant comme après ; la base lui répond les deux refus que l'écran explique", async () => {
    await simuler(admin);
    await db.query(DEPOSER, [rA1, `${org}/devis-admin.pdf`, "empreinte-devis-admin"]);
    const pieceDuCollegue = (await pieceDe(rA1))!;
    await simuler(agent);
    const lit = async () => (await db.query("select 1 from public.documents where id = $1 or empreinte = 'empreinte-devis-admin'", [pieceDuCollegue])).rowCount;
    expect(await lit()).toBe(0);
    expect(await refus(JUSTIFIER, [rA2, pieceDuCollegue])).toBe("Justificatif introuvable");
    // Le redépôt du même fichier : c'est ce message que l'écran traduit (« déposée par une autre personne de votre espace »).
    expect(await refus(DEPOSER, [rA2, `${org}/devis-agent.pdf`, "empreinte-devis-admin"])).toBe("Un fichier au contenu strictement identique existe déjà dans la GED");
    expect(await lit()).toBe(0);
    expect(await pieceDe(rA2)).toBeNull();
    // L'administrateur, lui, la rattache : c'est l'issue que l'écran indique à l'agent.
    await simuler(admin);
    await db.query(JUSTIFIER, [rA2, pieceDuCollegue]);
    expect(await pieceDe(rA2)).toBe(pieceDuCollegue);
  });

  it("la migration se rejoue ; son retour rend les deux textes d'avant sans toucher aux données, se rejoue, et se joue avant celui de la première reprise", async () => {
    await db.query("reset role");
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const etat = async () => (await db.query<{ f: string; e: string; d: string }>(`
      select p.proname f, md5(pg_get_functiondef(p.oid)) e, coalesce(p.proacl::text,'') d
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.proname in ('garde_justificatif_retenue', 'justifier_retenue', 'ajouter_retenue', 'justifier_retenue_avec_piece', 'mon_document_locataire', 'chemins_pieces_locataire') order by 1`)).rows;
    const declencheurs = async () => (await db.query("select 1 from pg_trigger where tgrelid = 'public.retenues'::regclass and tgname = 'retenues_justificatif_admis'")).rowCount;
    const avec = await etat();
    expect(avec).toHaveLength(6);
    expect(avec.find((f) => f.f === "garde_justificatif_retenue")!.d).not.toMatch(/anon|authenticated|service_role/);
    expect(avec.find((f) => f.f === "justifier_retenue")!.d).not.toMatch(/anon/);
    await db.query(migration);
    await db.query(migration);
    expect(await etat()).toEqual(avec);

    const autres = await piecesDUnAutreDossier();
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261124220000','justificatif_retenue_dossier_du_bail') on conflict do nothing");
    const retenuesAvant = (await db.query("select count(*)::int n from public.retenues where organization_id = $1", [org])).rows[0].n;
    await db.query(retour);
    await db.query(retour);
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261124220000'")).rows[0].n).toBe(0);
    expect(await declencheurs()).toBe(1);
    // Les deux textes d'avant : ceux que posent, rejouées seules, la migration de la première reprise et celle du 29/08.
    const apresRetour = await etat();
    expect(apresRetour.filter((f, i) => f.e !== avec[i].e).map((f) => f.f)).toEqual(["garde_justificatif_retenue", "justifier_retenue"]);
    expect(apresRetour.map((f) => f.d)).toEqual(avec.map((f) => f.d));
    await db.query(readFileSync(`supabase/migrations/${PREMIERE_REPRISE}.sql`, "utf8"));
    expect(await etat()).toEqual(apresRetour);
    const du2908 = /create or replace function public\.justifier_retenue\([\s\S]*?end \$\$;/.exec(readFileSync("supabase/migrations/20260829120000_alertes_liees_evenement_origine.sql", "utf8"))![0];
    await db.query(du2908);
    expect(await etat()).toEqual(apresRetour);
    expect((await db.query("select count(*)::int n from public.retenues where organization_id = $1", [org])).rows[0].n).toBe(retenuesAvant);
    // Le défaut revient avec lui (c'est ce que le LISEZ-MOI annonce) : la pièce d'identité du locataire B passe.
    await simuler(admin);
    expect(await refus(JUSTIFIER, [rA1, autres.identiteB])).toBe("");

    // Ordre du LISEZ-MOI : ce retour d'abord, puis celui de la première reprise ; rejoué ensuite, il ne recrée rien.
    await db.query("reset role");
    await db.query(readFileSync(`supabase/retours-arriere/${PREMIERE_REPRISE}.retour.sql`, "utf8"));
    await db.query(retour);
    expect(await declencheurs()).toBe(0);
    expect((await db.query("select to_regprocedure('public.garde_justificatif_retenue()') f")).rows[0].f).toBeNull();

    // Reposées dans l'ordre : mêmes définitions qu'au départ, et le refus revient.
    await db.query(readFileSync(`supabase/migrations/${PREMIERE_REPRISE}.sql`, "utf8"));
    await db.query(migration);
    expect(await etat()).toEqual(avec);
    expect(await declencheurs()).toBe(1);
    await simuler(admin);
    expect(await refus(JUSTIFIER, [rA2, autres.identiteB])).toBe(REFUS_PERSONNE);
  });
});
