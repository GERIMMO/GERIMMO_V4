/**
 * Tests des correctifs issus de l'audit code vs référentiel (2026-08-01) :
 * prorata de SORTIE (surfacturation du dernier mois), comparatif d'EDL sur
 * lots multi-pièces (produit cartésien), élément amorti (RM-2.4.5), plafond
 * de dépôt d'une colocation meublée (RM-2.1.2).
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;

async function creerUtilisateur(db: Client): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-cc-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
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

describe.skipIf(!DB_URL)("Correctifs d'audit", () => {
  let db: Client;
  let orgA: string;
  let gerant: string;
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
    } = await db.query(`insert into public.organizations (name, status) values ('CC Audit','active') returning id`);
    orgA = org;
    gerant = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, orgA]
    );
    const pers = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Prop'),($1,'Loc') returning id, nom`,
      [orgA]
    );
    proprietaire = pers.rows.find((p) => p.nom === "Prop")!.id;
    locataire = pers.rows.find((p) => p.nom === "Loc")!.id;
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  async function lot(meuble = false): Promise<string> {
    await simuler(db, gerant);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'Audit','appartement'::public.bien_type,'9 rue Audit',null,'75001','Paris',1990,false,45,2) as id`,
      [orgA]
    );
    const {
      rows: [{ id: l }],
    } = await db.query(`select id from public.lots where bien_id=$1`, [bien]);
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`,
      [l, orgA, proprietaire]
    );
    if (meuble) await db.query(`update public.lots set meuble=true where id=$1`, [l]);
    return l;
  }

  it("prorata de SORTIE : le dernier mois n'est pas facturé en plein", async () => {
    const l = await lot();
    // Bail du 1er janvier au 10 avril 2025 → avril = 10/30 jours
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat, loyer_hc, charges,
         date_debut, date_fin)
       values ($1,$2,$3,'termine',600,0,'2025-01-01','2025-04-10') returning id`,
      [orgA, l, locataire]
    );
    await db.query(`select public.generer_appels_loyer($1)`, [bail]);
    const r = await db.query(
      `select periode, montant_du, prorata from public.appels_loyer
       where bail_id=$1 order by periode`,
      [bail]
    );
    expect(r.rows).toHaveLength(4); // janvier → avril
    // Mois pleins
    expect(Number(r.rows[0].montant_du)).toBe(600);
    expect(r.rows[0].prorata).toBe(false);
    // Avril : 10 jours sur 30 → 600 * 0.3333 = 200
    const avril = r.rows[3];
    expect(avril.prorata).toBe(true);
    expect(Number(avril.montant_du)).toBeCloseTo(200, 0);
  });

  it("prorata d'entrée ET de sortie dans le même mois", async () => {
    const l = await lot();
    // Du 11 au 20 juin 2025 → 10 jours sur 30
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat, loyer_hc, charges,
         date_debut, date_fin)
       values ($1,$2,$3,'termine',900,0,'2025-06-11','2025-06-20') returning id`,
      [orgA, l, locataire]
    );
    await db.query(`select public.generer_appels_loyer($1)`, [bail]);
    const r = await db.query(`select montant_du from public.appels_loyer where bail_id=$1`, [bail]);
    expect(r.rows).toHaveLength(1);
    expect(Number(r.rows[0].montant_du)).toBeCloseTo(300, 0); // 900 * 10/30
  });

  it("comparatif d'EDL : pas de produit cartésien sur un lot multi-pièces", async () => {
    const l = await lot();
    // Deux pièces → les mêmes libellés (Sols, Murs…) existent dans chacune
    await db.query(
      `insert into public.lot_pieces (organization_id, lot_id, nom, ordre)
       values ($1,$2,'Séjour',1),($1,$2,'Chambre',2)`,
      [orgA, l]
    );
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat) values ($1,$2,$3,'actif') returning id`,
      [orgA, l, locataire]
    );
    const edls: string[] = [];
    for (const type of ["entree", "sortie"]) {
      const {
        rows: [{ id: edl }],
      } = await db.query(
        `insert into public.etats_des_lieux (organization_id, bail_id, type) values ($1,$2,$3) returning id`,
        [orgA, bail, type]
      );
      await db.query(`select public.generer_grille_edl($1)`, [edl]);
      await db.query(`update public.edl_lignes set etat='bon'::public.etat_element where edl_id=$1`, [edl]);
      edls.push(edl);
    }
    // Une seule dégradation : les Sols de la Chambre
    await db.query(
      `update public.edl_lignes set etat='mauvais' where edl_id=$1 and libelle='Sols' and piece='Chambre'`,
      [edls[1]]
    );
    await db.query(`select public.signer_edl($1)`, [edls[0]]);
    await db.query(`select public.signer_edl($1)`, [edls[1]]);

    const lignes = await db.query(`select piece, libelle, ecart from public.comparatif_edl($1)`, [bail]);
    const nbLignesEntree = await db.query(
      `select count(*)::int as n from public.edl_lignes where edl_id=$1`,
      [edls[0]]
    );
    // Autant de lignes comparées que de lignes d'EDL : aucun doublon
    expect(lignes.rows.length).toBe(nbLignesEntree.rows[0].n);
    const ecarts = lignes.rows.filter((r) => r.ecart);
    expect(ecarts).toHaveLength(1);
    expect(ecarts[0].piece).toBe("Chambre");
    expect(ecarts[0].libelle).toBe("Sols");
  });

  it("retenue : un élément entièrement amorti est refusé (RM-2.4.5)", async () => {
    const l = await lot();
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat, depot_garantie, loyer_hc)
       values ($1,$2,$3,'termine',700,700) returning id`,
      [orgA, l, locataire]
    );
    // EDL d'entrée signé (sinon aucune retenue possible)
    const {
      rows: [{ id: edl }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type) values ($1,$2,'entree') returning id`,
      [orgA, bail]
    );
    await db.query(`select public.generer_grille_edl($1)`, [edl]);
    await db.query(`update public.edl_lignes set etat='bon'::public.etat_element where edl_id=$1`, [edl]);
    await db.query(`select public.signer_edl($1)`, [edl]);

    const {
      rows: [{ id: rst }],
    } = await db.query(`select public.demarrer_restitution($1,current_date,true) as id`, [bail]);
    // Peinture de 7 ans d'âge sur une durée de vie de 7 ans : amortie
    await attendreEchec(
      db,
      /amorti/,
      `select public.ajouter_retenue($1,'Peinture',900,7,7,null)`,
      [rst]
    );
    // 8 ans aussi
    await attendreEchec(
      db,
      /amorti/,
      `select public.ajouter_retenue($1,'Peinture',900,7,8,null)`,
      [rst]
    );
    // Sans justificatif mais non amortie : acceptée ET tracée
    const {
      rows: [{ montant }],
    } = await db.query(`select public.ajouter_retenue($1,'Peinture',900,7,3,null) as montant`, [rst]);
    expect(Number(montant)).toBeCloseTo(514.29, 2);
    const t = await db.query(
      `select sans_justificatif from public.retenues where restitution_id=$1`,
      [rst]
    );
    expect(t.rows[0].sans_justificatif).toBe(true);
    const al = await db.query(
      `select count(*)::int as n from public.alerts
       where organization_id=$1 and type='retenue_sans_justificatif'`,
      [orgA]
    );
    expect(al.rows[0].n).toBe(1);
  });

  it("plafond du dépôt : une colocation d'un lot MEUBLÉ ouvre 2 mois (RM-2.1.2)", async () => {
    const l = await lot(true); // lot meublé
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat, type, loyer_hc, depot_garantie)
       values ($1,$2,$3,'actif','colocation',700,1400) returning id`,
      [orgA, l, locataire]
    );
    // 1400 = 2 mois : accepté car le logement est meublé
    const {
      rows: [{ cumul }],
    } = await db.query(
      `select public.encaisser_depot($1,1400,current_date,'virement',null,null) as cumul`,
      [bail]
    );
    expect(Number(cumul)).toBe(1400);
  });
});
