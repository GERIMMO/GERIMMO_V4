/**
 * Tests d'intégration Sprint 9a — Propriétaire direct : inscription, droits,
 * exclusivité PD/PM, et le parcours de bout en bout (bien → bail → loyer →
 * livre sans honoraires → clôture → récapitulatif fiscal).
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recapitulatifFiscal } from "../src/lib/fiscal";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

// Un compte tel que Supabase Auth le crée à l'inscription : nom et prénom
// dans les métadonnées, c'est tout — l'espace n'existe pas encore.
async function creerCompte(
  db: Client,
  meta: Record<string, string> = {},
  email = `test-s9a-${crypto.randomUUID()}@test.local`
): Promise<{ id: string; email: string }> {
  const {
    rows: [{ id }],
  } = await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      $1,'x', now(), '{"provider":"email","providers":["email"]}'::jsonb, $2::jsonb, now(), now(),'','','','','')
    returning id`,
    [email, JSON.stringify(meta)]
  );
  return { id, email };
}

async function simuler(db: Client, accountId: string | null, role = "authenticated") {
  await db.query("reset role");
  if (accountId) {
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [accountId]
    );
  } else {
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  }
  await db.query(`set local role ${role}`);
}

async function attendreEchec(db: Client, motif: RegExp, sql: string, params: unknown[] = []) {
  await db.query("savepoint e");
  await expect(db.query(sql, params)).rejects.toThrow(motif);
  await db.query("rollback to savepoint e");
}

describe.skipIf(!DB_URL)("Sprint 9a — propriétaire direct", () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db.end();
  });
  beforeEach(async () => {
    await db.query("begin");
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  // L'inscription telle que /espaces la termine : la fonction ouvre l'espace
  async function ouvrirEspace(compte: { id: string }): Promise<string> {
    await simuler(db, compte.id);
    const {
      rows: [{ org }],
    } = await db.query(`select public.initialiser_espace_proprietaire() as org`);
    return org;
  }

  it("inscription : organisation en essai 14 jours, adhésion et fiche du propriétaire — idempotente", async () => {
    const compte = await creerCompte(db, { nom: "Moreau", prenom: "Claire", espace: "proprietaire_direct" });
    const org = await ouvrirEspace(compte);

    await db.query("reset role");
    const {
      rows: [o],
    } = await db.query(`select name, type, status, essai_fin from public.organizations where id=$1`, [org]);
    expect(o.name).toBe("Parc de Claire Moreau");
    expect(o.type).toBe("proprietaire_direct");
    expect(o.status).toBe("essai");
    const {
      rows: [{ jours }],
    } = await db.query(`select (essai_fin - current_date) as jours from public.organizations where id=$1`, [org]);
    expect(Number(jours)).toBe(14);

    const { rows: adhesions } = await db.query(
      `select role, status from public.memberships where account_id=$1 and organization_id=$2`,
      [compte.id, org]
    );
    expect(adhesions).toEqual([{ role: "proprietaire_direct", status: "active" }]);
    const { rows: fiches } = await db.query(
      `select nom, prenom, email, account_id from public.persons where organization_id=$1`,
      [org]
    );
    expect(fiches).toEqual([{ nom: "Moreau", prenom: "Claire", email: compte.email, account_id: compte.id }]);

    // Un second appel (lien de confirmation recliqué, rechargement) rend le même espace
    const encore = await ouvrirEspace(compte);
    expect(encore).toBe(org);
    await db.query("reset role");
    const {
      rows: [{ n }],
    } = await db.query(`select count(*)::int as n from public.organizations where type='proprietaire_direct' and name=$1`, [o.name]);
    expect(n).toBe(1);
  });

  it("inscription : refusée sans nom, et pour un anonyme", async () => {
    const sansNom = await creerCompte(db, { prenom: "Anonyme" });
    await simuler(db, sansNom.id);
    await attendreEchec(db, /Le nom est obligatoire/, `select public.initialiser_espace_proprietaire()`);
    await simuler(db, null, "anon");
    await attendreEchec(db, /permission denied|Accès refusé/, `select public.initialiser_espace_proprietaire()`);
  });

  it("le type d'organisation reste « agence » par défaut ; seul le SA touche statut, type et essai", async () => {
    await db.query("reset role");
    const {
      rows: [{ id: agence }],
    } = await db.query(`insert into public.organizations (name) values ('Agence Test 9a') returning id`);
    const {
      rows: [{ type }],
    } = await db.query(`select type from public.organizations where id=$1`, [agence]);
    expect(type).toBe("agence");

    const compte = await creerCompte(db, { nom: "Durand" });
    const org = await ouvrirEspace(compte);
    // Le propriétaire renomme son parc (can_manage_organization sur SA propre org)…
    await db.query(`update public.organizations set name='Mon parc' where id=$1`, [org]);
    // …mais ne prolonge pas son essai ni ne s'active tout seul
    await attendreEchec(
      db,
      /Seul le super admin/,
      `update public.organizations set essai_fin = current_date + 365 where id=$1`,
      [org]
    );
    await attendreEchec(db, /Seul le super admin/, `update public.organizations set status='active' where id=$1`, [org]);
    // …et ne renomme pas une agence (can_manage_organization limité à la sienne)
    const {
      rows: [{ peut }],
    } = await db.query(`select public.can_manage_organization($1) as peut`, [agence]);
    expect(peut).toBe(false);
    const { rowCount } = await db.query(`update public.organizations set name='Piratée' where id=$1`, [agence]);
    expect(rowCount).toBe(0);
  });

  it("exclusivité PD/PM : un mandant d'agence ne s'inscrit pas en direct, et un PD ne devient pas mandant", async () => {
    await db.query("reset role");
    const {
      rows: [{ id: agence }],
    } = await db.query(`insert into public.organizations (name) values ('Agence Mandats') returning id`);
    const admin = await creerCompte(db, {});
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`, [admin.id, agence]);

    // 1. Un mandant (mandat actif) avec cette adresse → inscription refusée
    const emailMandant = `test-s9a-mandant-${crypto.randomUUID()}@test.local`;
    const {
      rows: [{ id: mandant }],
    } = await db.query(
      `insert into public.persons (organization_id, nom, email) values ($1,'Mandant',$2) returning id`,
      [agence, emailMandant]
    );
    await db.query(
      `insert into public.mandats (organization_id, person_id, etat) values ($1,$2,'actif')`,
      [agence, mandant]
    );
    const compteMandant = await creerCompte(db, { nom: "Mandant" }, emailMandant);
    await simuler(db, compteMandant.id);
    await attendreEchec(db, /exclusivité PD\/PM/, `select public.initialiser_espace_proprietaire()`);

    // 2. Un propriétaire direct existant → l'agence ne peut pas lui faire signer un mandat
    const pd = await creerCompte(db, { nom: "Direct" });
    await ouvrirEspace(pd);
    await db.query("reset role");
    const {
      rows: [{ id: fichePd }],
    } = await db.query(
      `insert into public.persons (organization_id, nom, email) values ($1,'Direct',$2) returning id`,
      [agence, pd.email]
    );
    await attendreEchec(
      db,
      /exclusivité PD\/PM/,
      `insert into public.mandats (organization_id, person_id, etat) values ($1,$2,'a_signer')`,
      [agence, fichePd]
    );
    // Un brouillon reste possible (rien n'est signé) ; c'est l'envoi en signature qui bloque
    const {
      rows: [{ id: brouillon }],
    } = await db.query(
      `insert into public.mandats (organization_id, person_id, etat) values ($1,$2,'brouillon') returning id`,
      [agence, fichePd]
    );
    await attendreEchec(db, /exclusivité PD\/PM/, `update public.mandats set etat='actif' where id=$1`, [brouillon]);
  });

  it("bout en bout : bien → locataire → bail → loyer encaissé sans honoraires → clôture → récapitulatif fiscal", async () => {
    const compte = await creerCompte(db, { nom: "Moreau", prenom: "Claire" });
    const org = await ouvrirEspace(compte);
    await simuler(db, compte.id);

    // Sa fiche porte la détention
    const {
      rows: [{ id: moi }],
    } = await db.query(`select id from public.persons where organization_id=$1 and account_id=$2`, [org, compte.id]);

    // Le bien et son lot (mêmes fonctions que l'agence)
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'12 rue des Lilas','appartement'::public.bien_type,
         '12 rue des Lilas', null, '69003','Lyon',1985,false,45,2) as id`,
      [org]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id=$1`, [bien]);
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`,
      [lot, org, moi]
    );
    await db.query(
      `insert into public.diagnostics (organization_id, lot_id, type, date_realisation, date_expiration)
       values ($1,$2,'dpe',current_date,current_date+365)`,
      [org, lot]
    );
    await db.query(
      `insert into public.diagnostics (organization_id, bien_id, type, date_realisation, date_expiration)
       values ($1,$2,'erp',current_date,current_date+180)`,
      [org, bien]
    );
    await db.query(`update public.lots set etat='disponible' where id=$1`, [lot]);

    // Le locataire : le PD crée sa fiche lui-même (droit ouvert au S9a)
    const {
      rows: [{ id: locataire }],
    } = await db.query(
      `insert into public.persons (organization_id, nom, prenom, email) values ($1,'Leblanc','Julie',$2) returning id`,
      [org, `test-s9a-loc-${crypto.randomUUID()}@test.local`]
    );

    // Le bail signé, l'EDL d'entrée, l'activation
    const {
      rows: [{ id: doc }],
    } = await db.query(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
       values ($1,'bail','Bail signé', $1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',1000,'e-'||gen_random_uuid())
       returning id`,
      [org]
    );
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, document_signe, loyer_hc, charges, jour_echeance, date_debut)
       values ($1,$2,$3,$4,650,50,5, date_trunc('month', current_date)::date) returning id`,
      [org, lot, locataire, doc]
    );
    const {
      rows: [{ id: edl }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type) values ($1,$2,'entree') returning id`,
      [org, bail]
    );
    await db.query(`select public.generer_grille_edl($1)`, [edl]);
    await db.query(`update public.edl_lignes set etat='bon' where edl_id=$1`, [edl]);
    await db.query(`select public.signer_edl($1)`, [edl]);
    await db.query(`select public.activer_bail($1)`, [bail]);

    const {
      rows: [{ etat_bail, etat_lot }],
    } = await db.query(
      `select b.etat as etat_bail, l.etat as etat_lot from public.baux b join public.lots l on l.id=b.lot_id where b.id=$1`,
      [bail]
    );
    expect(etat_bail).toBe("actif");
    expect(etat_lot).toBe("loue");

    // Le loyer du mois : appel, encaissement intégral → écriture de loyer, pas d'honoraires
    await db.query(`select public.generer_appels_loyer($1)`, [bail]);
    const {
      rows: [appel],
    } = await db.query(`select montant_du from public.appels_loyer where bail_id=$1 order by periode desc limit 1`, [bail]);
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement) values ($1,$2,$3,current_date)`,
      [org, bail, appel.montant_du]
    );
    const { rows: ecritures } = await db.query(
      `select categorie, sens, montant::numeric as montant from public.ecritures where organization_id=$1 order by categorie`,
      [org]
    );
    expect(ecritures.map((e) => e.categorie)).toEqual(["loyer"]);
    expect(ecritures[0].sens).toBe("recette");
    expect(Number(ecritures[0].montant)).toBe(Number(appel.montant_du));

    // Une dépense saisie dans son livre
    await db.query(
      `insert into public.ecritures (organization_id, lot_id, categorie, sens, montant, date_piece, date_imputation, libelle)
       values ($1,$2,'Assurance PNO','depense',180,current_date,current_date,'Prime annuelle')`,
      [org, lot]
    );

    // Il clôture le mois lui-même (recommandé, jamais imposé)
    await db.query(`select public.cloturer_mois($1, current_date)`, [org]);
    const {
      rows: [{ n }],
    } = await db.query(`select count(*)::int as n from public.clotures_comptables where organization_id=$1`, [org]);
    expect(n).toBe(1);
    // Le mois clos refuse une écriture directe ; la contre-écriture reste la voie
    await attendreEchec(
      db,
      /Mois clôturé/,
      `insert into public.ecritures (organization_id, categorie, sens, montant, date_piece, date_imputation)
       values ($1,'travaux','depense',10,current_date,current_date)`,
      [org]
    );
    await db.query(`select public.rouvrir_mois($1, current_date, 'oubli d''une facture')`, [org]);

    // Le récapitulatif fiscal lit son livre : loyers en 211, assurance en 223
    const { rows: livre } = await db.query(
      `select categorie, sens, montant, date_piece::text, contre_ecriture_de from public.ecritures where organization_id=$1`,
      [org]
    );
    const recap = recapitulatifFiscal(livre, new Date().getFullYear());
    expect(recap.totalRecettes).toBe(Number(appel.montant_du));
    expect(recap.rubriques.find((r) => r.code === "223")?.montant).toBe(180);
    expect(recap.rubriques.find((r) => r.code === "221")?.montant).toBe(0);
    expect(recap.revenuNet).toBe(Number(appel.montant_du) - 180);
  });

  it("isolation : un propriétaire direct ne voit rien d'une agence, et réciproquement", async () => {
    await db.query("reset role");
    const {
      rows: [{ id: agence }],
    } = await db.query(`insert into public.organizations (name) values ('Agence Isolée') returning id`);
    const agent = await creerCompte(db, {});
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1,$2,'agent')`, [agent.id, agence]);
    await db.query(`insert into public.persons (organization_id, nom) values ($1,'Secret Agence')`, [agence]);

    const pd = await creerCompte(db, { nom: "Isolé" });
    const org = await ouvrirEspace(pd);

    await simuler(db, pd.id);
    const { rows: vuParPd } = await db.query(`select nom from public.persons where organization_id=$1`, [agence]);
    expect(vuParPd).toEqual([]);
    await attendreEchec(
      db,
      /row-level security/,
      `insert into public.persons (organization_id, nom) values ($1,'Intrus')`,
      [agence]
    );

    await simuler(db, agent.id);
    const { rows: vuParAgent } = await db.query(`select nom from public.persons where organization_id=$1`, [org]);
    expect(vuParAgent).toEqual([]);
  });
});
