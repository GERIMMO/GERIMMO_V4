/**
 * Tests d'intégration — revue du 23/08.
 *
 * 1. EDL signé figé jusqu'aux compteurs et clés (M1).
 * 2. Grille d'EDL de sortie : miroir de l'entrée signée, même si des pièces
 *    ont été déclarées entre-temps (M3 — le comparatif reste alignable).
 * 3. Requalification d'un incident qualifié : répond à la contestation et
 *    solde l'alerte « contestée » (R2).
 * 4. Mandat vide hors brouillon : avancée interdite, retour en brouillon
 *    permis (B-1 — plus d'impasse).
 * 5. Le colocataire voit son bail (M2 — mon_bail/mon_echeancier).
 *
 * Directement contre Postgres (pattern des recettes précédentes) : rôles
 * simulés, transaction annulée. Nécessite SUPABASE_DB_URL.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });

const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

async function creerUtilisateur(db: Client): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query(`
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated',
      'test-r2308-' || gen_random_uuid() || '@test.local',
      'x', now(), '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb, now(), now(), '', '', '', '', ''
    ) returning id
  `);
  return id;
}

async function attendreEchec(db: Client, motif: RegExp, sql: string, params: unknown[] = []) {
  await db.query("savepoint echec_attendu");
  await expect(db.query(sql, params)).rejects.toThrow(motif);
  await db.query("rollback to savepoint echec_attendu");
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

describe.skipIf(!DB_URL)("Revue 23/08 — EDL figé, sortie miroir, requalification, mandat vide", () => {
  let db: Client;
  let orgA: string;
  let agentA: string;
  let colocUser: string;
  let proprietaire: string;
  let locataire: string;
  let coloc: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("begin");
    const {
      rows: [{ id: org }],
    } = await db.query(
      `insert into public.organizations (name, status) values ('R2308 Alpha', 'active') returning id`
    );
    orgA = org;
    agentA = await creerUtilisateur(db);
    colocUser = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1, $2, 'agent'), ($3, $2, 'locataire')`,
      [agentA, orgA, colocUser]
    );
    const personnes = await db.query(
      `insert into public.persons (organization_id, nom, prenom)
       values ($1, 'Mandant', 'Rex'), ($1, 'Principal', 'Léa') returning id, nom`,
      [orgA]
    );
    proprietaire = personnes.rows.find((p) => p.nom === "Mandant")!.id;
    locataire = personnes.rows.find((p) => p.nom === "Principal")!.id;
    const {
      rows: [{ id: fiche }],
    } = await db.query(
      `insert into public.persons (organization_id, nom, prenom, account_id)
       values ($1, 'Coloc', 'Max', $2) returning id`,
      [orgA, colocUser]
    );
    coloc = fiche;
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  // Bien + lot + bail actif avec colocataire
  async function bailActif(): Promise<{ lot: string; bail: string }> {
    await simuler(db, agentA);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1, '5 rue Revue', 'appartement'::public.bien_type,
         '5 rue Revue', null, '91000', 'Évry', 1990, false, 50, 3) as id`,
      [orgA]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id = $1`, [bien]);
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part)
       values ($1, $2, $3, 100)`,
      [lot, orgA, proprietaire]
    );
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, charges)
       values ($1, $2, $3, 700, 80) returning id`,
      [orgA, lot, locataire]
    );
    await db.query(
      `insert into public.bail_personnes (organization_id, bail_id, person_id, role)
       values ($1, $2, $3, 'colocataire')`,
      [orgA, bail, coloc]
    );
    await db.query(`update public.baux set etat='actif', date_debut=current_date where id=$1`, [
      bail,
    ]);
    return { lot, bail };
  }

  it("un EDL signé est figé jusqu'aux compteurs et clés", async () => {
    const { bail } = await bailActif();
    await simuler(db, agentA);
    const {
      rows: [{ id: edl }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type)
       values ($1, $2, 'entree') returning id`,
      [orgA, bail]
    );
    await db.query(`select public.generer_grille_edl($1)`, [edl]);
    // Avant signature : compteur accepté
    await db.query(
      `insert into public.edl_compteurs (edl_id, organization_id, type, releve) values ($1,$2,'Eau froide',123)`,
      [edl, orgA]
    );
    await db.query(`update public.edl_lignes set etat='bon' where edl_id=$1`, [edl]);
    await db.query(`select public.signer_edl($1)`, [edl]);
    // Après signature : tout est figé
    await attendreEchec(
      db,
      /figé/,
      `insert into public.edl_compteurs (edl_id, organization_id, type, releve) values ($1,$2,'Gaz',42)`,
      [edl, orgA]
    );
    await attendreEchec(db, /figé/, `delete from public.edl_compteurs where edl_id=$1`, [edl]);
    await attendreEchec(
      db,
      /figé/,
      `insert into public.edl_cles (edl_id, organization_id, libelle) values ($1,$2,'Badge')`,
      [edl, orgA]
    );
  });

  it("la grille de SORTIE reflète l'entrée signée, même avec des pièces déclarées après", async () => {
    const { lot, bail } = await bailActif();
    await simuler(db, agentA);
    const {
      rows: [{ id: entree }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type)
       values ($1, $2, 'entree') returning id`,
      [orgA, bail]
    );
    await db.query(`select public.generer_grille_edl($1)`, [entree]); // générique (pas de pièces)
    await db.query(`update public.edl_lignes set etat='bon' where edl_id=$1`, [entree]);
    await db.query(`select public.signer_edl($1)`, [entree]);

    // Les pièces arrivent APRÈS l'entrée
    await db.query(
      `insert into public.lot_pieces (lot_id, organization_id, nom, ordre)
       values ($1, $2, 'Séjour', 0), ($1, $2, 'Cuisine', 1)`,
      [lot, orgA]
    );
    const {
      rows: [{ id: sortie }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type)
       values ($1, $2, 'sortie') returning id`,
      [orgA, bail]
    );
    await db.query(`select public.generer_grille_edl($1)`, [sortie]);

    // Chaque ligne de la sortie a son homologue exact dans l'entrée : le
    // comparatif (jointure piece+libelle+categorie) reste alignable.
    const { rows } = await db.query(
      `select
         (select count(*)::int from public.edl_lignes where edl_id=$2) as total,
         (select count(*)::int from public.edl_lignes s where s.edl_id=$2
            and exists (select 1 from public.edl_lignes e where e.edl_id=$1
              and e.categorie=s.categorie and coalesce(e.piece,'')=coalesce(s.piece,'')
              and e.libelle=s.libelle)) as alignees`,
      [entree, sortie]
    );
    expect(rows[0].total).toBeGreaterThan(0);
    expect(rows[0].alignees).toBe(rows[0].total);
  });

  it("un incident qualifié se REqualifie : la contestation est soldée, l'imputation répond", async () => {
    const { lot } = await bailActif();
    await simuler(db, agentA);
    const {
      rows: [{ id: incident }],
    } = await db.query(
      `select public.ouvrir_incident_agence($1, $2, 'plomberie_joint', 'Fuite test revue', 'Cuisine', null, 'normale') as id`,
      [orgA, lot]
    );
    await db.query(
      `select public.qualifier_incident($1, $2, 'locataire', 'Justification initiale.')`,
      [orgA, incident]
    );
    // Contestation posée (comme la RPC locataire le ferait) + son alerte
    await db.query("reset role");
    await db.query(
      `update public.incidents set imputation_contestee_le=now(), imputation_contestation='Je conteste.' where id=$1`,
      [incident]
    );
    await db.query(
      `insert into public.alerts (organization_id, type, criticite, titre, details)
       values ($1, 'incident_conteste', 'normale', 'Contestée — test', jsonb_build_object('incident_id', $2::uuid))`,
      [orgA, incident]
    );
    await simuler(db, agentA);
    await db.query(
      `select public.qualifier_incident($1, $2, 'proprietaire', 'Après examen : vétusté — charge propriétaire.')`,
      [orgA, incident]
    );
    const { rows } = await db.query(
      `select i.imputation::text, i.imputation_contestee_le,
         (select count(*)::int from public.alerts a where a.organization_id=$1
            and a.statut='ouverte' and a.details->>'incident_id'=$2::text) as alertes
       from public.incidents i where i.id=$2`,
      [orgA, incident]
    );
    expect(rows[0].imputation).toBe("proprietaire");
    expect(rows[0].imputation_contestee_le).toBeNull();
    expect(rows[0].alertes).toBe(0);
  });

  it("mandat vide hors brouillon : l'avancée est refusée, le retour en brouillon passe", async () => {
    await simuler(db, agentA);
    const {
      rows: [{ id: mandat }],
    } = await db.query(
      `insert into public.mandats (organization_id, person_id, etat)
       values ($1, $2, 'a_signer') returning id`,
      [orgA, proprietaire]
    );
    await attendreEchec(
      db,
      /sans lot ni taux/,
      `update public.mandats set etat='actif' where id=$1`,
      [mandat]
    );
    await db.query(`update public.mandats set etat='brouillon' where id=$1`, [mandat]);
    const { rows } = await db.query(`select etat from public.mandats where id=$1`, [mandat]);
    expect(rows[0].etat).toBe("brouillon");
  });

  it("le colocataire voit son bail (mon_bail_locataire)", async () => {
    await bailActif();
    await simuler(db, colocUser);
    const { rows } = await db.query(`select * from public.mon_bail_locataire($1)`, [orgA]);
    expect(rows.length).toBe(1);
    expect(Number(rows[0].loyer_hc)).toBe(700);
  });
});
