/**
 * Tests d'intégration — retours de recette du 22/08.
 *
 * 1. Mandat vide : plus aucun changement d'état sans ligne active (la garde
 *    en base attrape les mandats créés avant la garde applicative du 21/08).
 * 2. EDL créé avant la déclaration des pièces (scénario 4.5.3) : la grille se
 *    régénère depuis les pièces déclarées après coup.
 *
 * Directement contre Postgres (pattern sprint3-mandat.test.ts) : rôles
 * simulés, transaction annulée à la fin. Nécessite SUPABASE_DB_URL.
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
      'test-r2208-' || gen_random_uuid() || '@test.local',
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

describe.skipIf(!DB_URL)("Recette 22/08 — mandat vide figé, grille d'EDL régénérable", () => {
  let db: Client;
  let orgA: string;
  let agentA: string;
  let proprietaire: string;
  let locataire: string;

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
      `insert into public.organizations (name, status) values ('R2208 Alpha', 'active') returning id`
    );
    orgA = org;
    agentA = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'agent')`,
      [agentA, orgA]
    );
    const personnes = await db.query(
      `insert into public.persons (organization_id, nom, prenom)
       values ($1, 'Mandant', 'Marc'), ($1, 'Locataire', 'Lucie') returning id, nom`,
      [orgA]
    );
    proprietaire = personnes.rows.find((p) => p.nom === "Mandant")!.id;
    locataire = personnes.rows.find((p) => p.nom === "Locataire")!.id;
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  // Bien + lot unique détenu à 100 % par `person`
  async function lotDetenuPar(person: string): Promise<string> {
    await simuler(db, agentA);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot(
         $1, '2 rue de la Recette', 'appartement'::public.bien_type,
         '2 rue de la Recette', null, '91000', 'Évry', 1995, false, 45, 3) as id`,
      [orgA]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id = $1`, [bien]);
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part)
       values ($1, $2, $3, 100)`,
      [lot, orgA, person]
    );
    return lot;
  }

  it("un mandat sans lot ni taux ne change plus d'état — quel que soit son état de départ", async () => {
    await simuler(db, agentA);
    // Mandat vide hérité, dans chaque état encore vivant de la chaîne
    const suivants: Record<string, string> = {
      brouillon: "a_signer",
      a_signer: "actif",
      actif: "preavis",
      preavis: "resilie",
    };
    for (const [etat, suivant] of Object.entries(suivants)) {
      const {
        rows: [{ id: mandat }],
      } = await db.query(
        `insert into public.mandats (organization_id, person_id, etat)
         values ($1, $2, $3) returning id`,
        [orgA, proprietaire, etat]
      );
      await attendreEchec(
        db,
        /sans lot ni taux/,
        `update public.mandats set etat = $2 where id = $1`,
        [mandat, suivant]
      );
    }
  });

  it("un mandat composé (lot + taux) avance normalement jusqu'à la résiliation", async () => {
    const lot = await lotDetenuPar(proprietaire);
    await simuler(db, agentA);
    const {
      rows: [{ id: mandat }],
    } = await db.query(
      `insert into public.mandats (organization_id, person_id, etat)
       values ($1, $2, 'brouillon') returning id`,
      [orgA, proprietaire]
    );
    await db.query(
      `insert into public.mandat_lignes (organization_id, mandat_id, lot_id, taux_honoraires)
       values ($1, $2, $3, 7)`,
      [orgA, mandat, lot]
    );
    for (const etat of ["a_signer", "actif", "preavis", "resilie"]) {
      await db.query(`update public.mandats set etat = $2 where id = $1`, [mandat, etat]);
    }
    const { rows } = await db.query(`select etat from public.mandats where id = $1`, [mandat]);
    expect(rows[0].etat).toBe("resilie");
  });

  it("4.5.3 — un EDL créé avant les pièces se régénère depuis les pièces déclarées après coup", async () => {
    const lot = await lotDetenuPar(proprietaire);
    await simuler(db, agentA);

    // Bail brouillon puis EDL d'entrée AVANT toute déclaration de pièces
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal)
       values ($1, $2, $3) returning id`,
      [orgA, lot, locataire]
    );
    const {
      rows: [{ id: edl }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type)
       values ($1, $2, 'entree') returning id`,
      [orgA, bail]
    );
    await db.query(`select public.generer_grille_edl($1)`, [edl]);

    // Grille générique : aucune ligne rattachée à une pièce
    const generiques = await db.query(
      `select count(*)::int as n from public.edl_lignes where edl_id = $1 and categorie = 'piece'`,
      [edl]
    );
    expect(generiques.rows[0].n).toBe(0);

    // Les pièces arrivent APRÈS (fiche du lot → « Proposer les pièces »)
    await db.query(
      `insert into public.lot_pieces (lot_id, organization_id, nom, ordre) values
       ($1, $2, 'Entrée', 0), ($1, $2, 'Séjour', 1), ($1, $2, 'Cuisine', 2)`,
      [lot, orgA]
    );

    // Régénération (le bouton de l'écran EDL appelle cette RPC)
    const {
      rows: [{ n: creees }],
    } = await db.query(`select public.generer_grille_edl($1) as n`, [edl]);
    expect(Number(creees)).toBe(21); // 3 pièces × 7 éléments

    const parPiece = await db.query(
      `select count(distinct piece)::int as n from public.edl_lignes
       where edl_id = $1 and categorie = 'piece'`,
      [edl]
    );
    expect(parPiece.rows[0].n).toBe(3);
  });

  it("la régénération reste interdite sur un EDL signé", async () => {
    const lot = await lotDetenuPar(proprietaire);
    await simuler(db, agentA);
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal)
       values ($1, $2, $3) returning id`,
      [orgA, lot, locataire]
    );
    const {
      rows: [{ id: edl }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type)
       values ($1, $2, 'entree') returning id`,
      [orgA, bail]
    );
    await db.query(`select public.generer_grille_edl($1)`, [edl]);
    await db.query(`update public.edl_lignes set etat = 'bon' where edl_id = $1`, [edl]);
    await db.query(`select public.signer_edl($1)`, [edl]);
    await attendreEchec(db, /ne se régénère pas/, `select public.generer_grille_edl($1)`, [edl]);
  });
});
