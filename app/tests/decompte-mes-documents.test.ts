/**
 * Décision D36 (SOR-05), option C — la pièce « décompte » dans « Mes documents »
 * du locataire sortant, côté base : une fois le décompte mis à disposition
 * (partager_document_locataire, geste que l'envoi déclenche), le locataire dont
 * le bail est terminé — adhésion devenue « inactive » — le lit dans ses pièces,
 * peut l'ouvrir, et lit la restitution sur son accueil. Avant la mise à
 * disposition, et pour un autre locataire, rien ne s'ouvre.
 * Nécessite SUPABASE_DB_URL (base locale jetable).
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("D36 (C) — le décompte dans Mes documents du locataire sortant", () => {
  let db: Client;
  let org: string;
  let gerant: string;
  let sortant: string;
  let autre: string;
  let personneSortante: string;
  let bail: string;
  let decompte: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  async function compte(role: string, nom: string) {
    const {
      rows: [{ id }],
    } = await db.query(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
        'decompte-'||gen_random_uuid()||'@test.local','x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
      returning id`);
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1,$2,$3)`, [id, org, role]);
    const {
      rows: [{ id: personne }],
    } = await db.query(
      `insert into public.persons (organization_id, account_id, nom, prenom) values ($1,$2,$3,'Test') returning id`,
      [org, id, nom]
    );
    return { compte: id as string, personne: personne as string };
  }

  async function en(compteId: string) {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
      [compteId]
    );
    await db.query("set local role authenticated");
  }

  beforeEach(async () => {
    await db.query("begin");
    const {
      rows: [o],
    } = await db.query(`insert into public.organizations (name, status) values ('Décompte D36','active') returning id`);
    org = o.id;
    gerant = (await compte("admin_agence", "Gérant")).compte;
    const s = await compte("locataire", "Sortant");
    sortant = s.compte;
    personneSortante = s.personne;
    autre = (await compte("locataire", "Autre")).compte;

    const {
      rows: [b],
    } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city, zone_tendue)
       values ($1,'Bien D36','appartement'::public.bien_type,'1 rue A','75012','Paris', false) returning id`,
      [org]
    );
    const {
      rows: [l],
    } = await db.query(
      `insert into public.lots (organization_id, bien_id, nom, etat)
       values ($1,$2,'Lot D36','disponible'::public.lot_etat) returning id`,
      [org, b.id]
    );
    // Bail terminé : l'adhésion du locataire sorti est devenue « inactive » (terminer_bail)
    const {
      rows: [bl],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat, loyer_hc, charges, jour_echeance, date_debut, date_fin, date_sortie_reelle)
       values ($1,$2,$3,'termine',650,50,1,current_date - 400, current_date - 5, current_date - 5) returning id`,
      [org, l.id, personneSortante]
    );
    bail = bl.id;
    await db.query(`update public.memberships set status = 'inactive' where account_id = $1`, [sortant]);
    await db.query(
      `insert into public.restitutions (organization_id, bail_id, date_remise_cles, delai_mois, depot, impayes, trop_percu, statut, solde, date_emission, envoye_le)
       values ($1,$2,current_date - 5, 2, 650, 700, 0, 'finalise', -561.43, current_date - 1, current_date)`,
      [org, bail]
    );
    const {
      rows: [d],
    } = await db.query(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
       values ($1,'courrier','Décompte de restitution — Sortant', $1::uuid::text||'/decompte.pdf','application/pdf',1234,'emp-'||gen_random_uuid())
       returning id`,
      [org]
    );
    decompte = d.id;
    // Le PDF généré est rattaché au bail et au(x) locataire(s), comme le fait le modèle
    await db.query(
      `insert into public.document_liens (document_id, organization_id, entite, entite_id)
       values ($1,$2,'bail',$3), ($1,$2,'personne',$4)`,
      [decompte, org, bail, personneSortante]
    );
  });

  it("avant la mise à disposition, la pièce n'est pas dans Mes documents", async () => {
    await en(sortant);
    const { rows } = await db.query(`select document_id from public.mes_pieces_locataire($1)`, [org]);
    expect(rows).toEqual([]);
  });

  it("mise à disposition : le locataire sorti (adhésion inactive) lit la pièce « décompte » et peut l'ouvrir", async () => {
    await en(gerant);
    await db.query(`select public.partager_document_locataire($1, $2, true)`, [org, decompte]);

    await en(sortant);
    const { rows } = await db.query(
      `select document_id, type::text, titre from public.mes_pieces_locataire($1)`,
      [org]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ document_id: decompte, type: "courrier" });
    expect(rows[0].titre).toMatch(/^Décompte de restitution/);

    const ouverte = await db.query(`select document_id from public.mon_document_locataire($1, $2)`, [org, decompte]);
    expect(ouverte.rows).toHaveLength(1);

    // Et la restitution se lit sur l'accueil : décompte établi, créance arrêtée par la base
    const { rows: restitution } = await db.query(
      `select statut, solde::text from public.ma_restitution_locataire($1)`,
      [org]
    );
    expect(restitution).toEqual([{ statut: "finalise", solde: "-561.43" }]);
  });

  it("un autre locataire de l'organisation ne voit ni la pièce ni la restitution", async () => {
    await en(gerant);
    await db.query(`select public.partager_document_locataire($1, $2, true)`, [org, decompte]);
    await en(autre);
    expect((await db.query(`select document_id from public.mes_pieces_locataire($1)`, [org])).rows).toEqual([]);
    expect((await db.query(`select document_id from public.mon_document_locataire($1, $2)`, [org, decompte])).rows).toEqual([]);
    expect((await db.query(`select statut from public.ma_restitution_locataire($1)`, [org])).rows).toEqual([]);
  });

  it("le retrait de la mise à disposition retire la pièce, la restitution reste lisible", async () => {
    await en(gerant);
    await db.query(`select public.partager_document_locataire($1, $2, true)`, [org, decompte]);
    await db.query(`select public.partager_document_locataire($1, $2, false)`, [org, decompte]);
    await en(sortant);
    expect((await db.query(`select document_id from public.mes_pieces_locataire($1)`, [org])).rows).toEqual([]);
    expect((await db.query(`select statut from public.ma_restitution_locataire($1)`, [org])).rows).toHaveLength(1);
  });
});
