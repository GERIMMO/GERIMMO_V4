/**
 * Tests d'intégration — « Mes documents » locataire (recette 26/08).
 * Vérifie côté base : mes_pieces_locataire (dont la coexistence attestation
 * validée + attestation en cours de vérification), mon_document_locataire,
 * log_document_access élargi au locataire, chemins_pieces_locataire, et la
 * non-régression du bail signé (mon_bail_locataire). Nécessite SUPABASE_DB_URL.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

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

async function creerCompte(db: Client, org: string, role: string, nom: string) {
  const {
    rows: [{ id: uid }],
  } = await db.query(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-docs-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  await db.query(
    `insert into public.memberships (account_id, organization_id, role) values ($1,$2,$3)`,
    [uid, org, role]
  );
  const {
    rows: [{ id: personne }],
  } = await db.query(
    `insert into public.persons (organization_id, account_id, nom) values ($1,$2,$3) returning id`,
    [org, uid, nom]
  );
  return { compte: uid as string, personne: personne as string };
}

// Une fiche document directe (hors flux de dépôt), rattachée à rien
async function insererDocument(
  db: Client,
  org: string,
  type: string,
  titre: string,
  chemin: string
) {
  await db.query("reset role");
  const {
    rows: [{ id }],
  } = await db.query(
    `insert into public.documents (organization_id, type, titre, storage_path,
       mime_type, taille_octets, empreinte)
     values ($1, $2::public.document_type, $3, $4, 'application/pdf', 1234,
             'emp-' || gen_random_uuid())
     returning id`,
    [org, type, titre, chemin]
  );
  return id as string;
}

describe.skipIf(!DB_URL)("Mes documents locataire (recette 26/08)", () => {
  let db: Client;
  let orgA: string;
  let compteLo: string;
  let compteAgent: string;

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
      `insert into public.organizations (name, status) values ('DOCS Alpha','active') returning id`
    );
    orgA = org;
    ({ compte: compteLo } = await creerCompte(db, orgA, "locataire", "Occupant"));
    ({ compte: compteAgent } = await creerCompte(db, orgA, "agent", "Agent"));
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  async function deposerAttestation(expireDansJours: number) {
    const {
      rows: [{ doc }],
    } = await db.query(
      `select public.deposer_mon_attestation(
         $1, $1::uuid::text || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 1234,
         'emp-' || gen_random_uuid(), 'MAIF', current_date + $2::int) as doc`,
      [orgA, expireDansJours]
    );
    return doc as string;
  }

  it("la validée reste visible pendant la vérification du renouvellement", async () => {
    // Dépôt initial : une seule pièce, en cours de vérification
    await simuler(db, compteLo);
    const doc1 = await deposerAttestation(100);
    let pieces = await db.query(
      `select document_id, verifie_le from public.mes_pieces_locataire($1)
       where type = 'attestation_assurance'`,
      [orgA]
    );
    expect(pieces.rows).toHaveLength(1);
    expect(pieces.rows[0].verifie_le).toBeNull();

    // L'agence valide : toujours une seule pièce, validée
    await simuler(db, compteAgent);
    await db.query(`select public.valider_attestation($1, $2)`, [orgA, doc1]);
    await simuler(db, compteLo);
    pieces = await db.query(
      `select document_id, verifie_le from public.mes_pieces_locataire($1)
       where type = 'attestation_assurance'`,
      [orgA]
    );
    expect(pieces.rows).toHaveLength(1);
    expect(pieces.rows[0].verifie_le).not.toBeNull();

    // Renouvellement : LES DEUX pièces coexistent — la validée en vigueur et
    // la nouvelle en cours de vérification (besoin de recette du 26/08)
    const doc2 = await deposerAttestation(400);
    pieces = await db.query(
      `select document_id, verifie_le from public.mes_pieces_locataire($1)
       where type = 'attestation_assurance' order by verifie_le nulls first`,
      [orgA]
    );
    expect(pieces.rows).toHaveLength(2);
    expect(pieces.rows.map((r) => r.document_id).sort()).toEqual([doc1, doc2].sort());
    expect(pieces.rows[0].verifie_le).toBeNull(); // doc2 en vérification
    expect(pieces.rows[1].verifie_le).not.toBeNull(); // doc1 validée, en vigueur

    // Validation du renouvellement : l'ancienne s'efface, une seule reste
    await simuler(db, compteAgent);
    await db.query(`select public.valider_attestation($1, $2)`, [orgA, doc2]);
    await simuler(db, compteLo);
    pieces = await db.query(
      `select document_id, verifie_le from public.mes_pieces_locataire($1)
       where type = 'attestation_assurance'`,
      [orgA]
    );
    expect(pieces.rows).toHaveLength(1);
    expect(pieces.rows[0].document_id).toBe(doc2);
    expect(pieces.rows[0].verifie_le).not.toBeNull();
  });

  it("le bail signé apparaît dans mes pièces et se consulte (non-régression 26/08)", async () => {
    // Un lot, un bail actif porté par le locataire, un bail signé déposé
    await simuler(db, compteAgent);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'7 rue des Documents','appartement'::public.bien_type,
         '7 rue des Documents', null, '75001','Paris',1990,false,50,3) as id`,
      [orgA]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id = $1`, [bien]);
    const cheminBail = `${orgA}/bail-signe-test.pdf`;
    const docBail = await insererDocument(db, orgA, "bail", "Bail signé", cheminBail);
    const {
      rows: [{ id: personneLo }],
    } = await db.query(
      `select id from public.persons where organization_id = $1 and account_id = $2`,
      [orgA, compteLo]
    );
    await db.query(
      `insert into public.baux (organization_id, lot_id, etat, locataire_principal, document_signe)
       values ($1,$2,'actif',$3,$4)`,
      [orgA, lot, personneLo, docBail]
    );

    await simuler(db, compteLo);
    // mes_pieces_locataire expose le bail signé…
    const pieces = await db.query(
      `select document_id, source from public.mes_pieces_locataire($1) where type = 'bail'`,
      [orgA]
    );
    expect(pieces.rows).toHaveLength(1);
    expect(pieces.rows[0]).toMatchObject({ document_id: docBail, source: "bail" });
    // …mon_bail_locataire aussi (correctif 4.7.1)…
    const bail = await db.query(`select document_signe from public.mon_bail_locataire($1)`, [orgA]);
    expect(bail.rows[0].document_signe).toBe(docBail);
    // …la route de fichier a ses métadonnées…
    const meta = await db.query(
      `select storage_path from public.mon_document_locataire($1, $2)`,
      [orgA, docBail]
    );
    expect(meta.rows[0].storage_path).toBe(cheminBail);
    // …et la lecture storage connaît le chemin
    const chemins = await db.query(`select * from public.chemins_pieces_locataire()`);
    expect(chemins.rows.map((r) => r.chemins_pieces_locataire)).toContain(cheminBail);
  });

  it("la trace d'accès accepte le locataire pour SA pièce, la refuse pour autrui", async () => {
    await simuler(db, compteLo);
    const doc1 = await deposerAttestation(100);
    // Sa propre pièce : la trace passe et s'enregistre
    await db.query(`select public.log_document_access($1, 'consultation')`, [doc1]);
    await db.query("reset role");
    const traces = await db.query(
      `select account_id from public.acces_pieces_log where document_id = $1`,
      [doc1]
    );
    expect(traces.rows.map((r) => r.account_id)).toContain(compteLo);

    // La pièce d'un autre locataire : métadonnées vides, trace refusée
    const { compte: compteLo2 } = await creerCompte(db, orgA, "locataire", "Voisin");
    await simuler(db, compteLo2);
    const meta = await db.query(`select * from public.mon_document_locataire($1, $2)`, [
      orgA,
      doc1,
    ]);
    expect(meta.rows).toHaveLength(0);
    await expect(
      db.query(`select public.log_document_access($1, 'consultation')`, [doc1])
    ).rejects.toThrow(/acces refuse/);
    // La transaction est cassée par l'exception : le rollback d'afterEach nettoie
  });

  it("le type pilote seul les droits : une pièce « Agence seule » rattachée à la fiche reste invisible", async () => {
    // Un gérant rattache un courrier à la fiche du locataire : métadonnées,
    // fichier et trace doivent rester agence seule (revue 26/08, finding 1)
    const courrier = await insererDocument(
      db,
      orgA,
      "courrier",
      "Courrier interne",
      `${orgA}/zz-courrier.pdf`
    );
    const {
      rows: [{ id: personneLo }],
    } = await db.query(
      `select id from public.persons where organization_id = $1 and account_id = $2`,
      [orgA, compteLo]
    );
    await db.query(
      `insert into public.document_liens (document_id, organization_id, entite, entite_id)
       values ($1, $2, 'personne', $3)`,
      [courrier, orgA, personneLo]
    );

    await simuler(db, compteLo);
    const pieces = await db.query(
      `select document_id from public.mes_pieces_locataire($1)`,
      [orgA]
    );
    expect(pieces.rows.map((r) => r.document_id)).not.toContain(courrier);
    const meta = await db.query(`select * from public.mon_document_locataire($1, $2)`, [
      orgA,
      courrier,
    ]);
    expect(meta.rows).toHaveLength(0);
    const chemins = await db.query(`select * from public.chemins_pieces_locataire()`);
    expect(chemins.rows.map((r) => r.chemins_pieces_locataire)).not.toContain(
      `${orgA}/zz-courrier.pdf`
    );
    await expect(
      db.query(`select public.log_document_access($1, 'consultation')`, [courrier])
    ).rejects.toThrow(/acces refuse/);
  });

  it("un lien ne rattache jamais un document d'une autre agence (trigger)", async () => {
    await db.query("reset role");
    const {
      rows: [{ id: orgB }],
    } = await db.query(
      `insert into public.organizations (name, status) values ('DOCS Beta','active') returning id`
    );
    const { personne: personneB } = await creerCompte(db, orgB, "locataire", "Étranger");
    const docA = await insererDocument(db, orgA, "justificatif", "Pièce A", `${orgA}/zz-a.pdf`);
    // Lien forgé org B → document d'org A : refusé au trigger (revue 26/08,
    // finding 2 — la policy seule ne verrouillait pas l'agence du document)
    await expect(
      db.query(
        `insert into public.document_liens (document_id, organization_id, entite, entite_id)
         values ($1, $2, 'personne', $3)`,
        [docA, orgB, personneB]
      )
    ).rejects.toThrow(/même agence/);
  });

  it("une version remplacée ne se valide plus (historique conservé)", async () => {
    await simuler(db, compteLo);
    const doc1 = await deposerAttestation(100);
    await deposerAttestation(400); // remplace doc1
    await simuler(db, compteAgent);
    await expect(
      db.query(`select public.valider_attestation($1, $2)`, [orgA, doc1])
    ).rejects.toThrow(/plus récente/);
  });

  it("le règlement de copropriété du bail est une pièce du locataire (sprint « Alertes & documents »)", async () => {
    await simuler(db, compteAgent);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'9 rue du Règlement','appartement'::public.bien_type,
         '9 rue du Règlement', null, '75001','Paris',1990,false,50,3) as id`,
      [orgA]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id = $1`, [bien]);
    const cheminBail = `${orgA}/bail-copro-test.pdf`;
    const cheminReglement = `${orgA}/reglement-copro-test.pdf`;
    const docBail = await insererDocument(db, orgA, "bail", "Bail signé", cheminBail);
    const docReglement = await insererDocument(db, orgA, "reglement_copropriete", "Règlement", cheminReglement);
    const {
      rows: [{ id: personneLo }],
    } = await db.query(
      `select id from public.persons where organization_id = $1 and account_id = $2`,
      [orgA, compteLo]
    );
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, etat, locataire_principal, document_signe, reglement_copropriete)
       values ($1,$2,'actif',$3,$4,$5) returning id`,
      [orgA, lot, personneLo, docBail, docReglement]
    );

    await simuler(db, compteLo);
    const pieces = await db.query(
      `select document_id, type, source from public.mes_pieces_locataire($1) where source = 'bail' order by type`,
      [orgA]
    );
    expect(pieces.rows).toEqual([
      { document_id: docBail, type: "bail", source: "bail" },
      { document_id: docReglement, type: "reglement_copropriete", source: "bail" },
    ]);
    const meta = await db.query(`select storage_path from public.mon_document_locataire($1, $2)`, [orgA, docReglement]);
    expect(meta.rows[0].storage_path).toBe(cheminReglement);
    const chemins = await db.query(`select * from public.chemins_pieces_locataire()`);
    expect(chemins.rows.map((r) => r.chemins_pieces_locataire)).toContain(cheminReglement);
    await db.query(`select public.log_document_access($1, 'consultation')`, [docReglement]);

    // Bail terminé : les pièces du bail ne sont plus exposées
    await db.query("reset role");
    await db.query(`update public.baux set etat='termine' where id=$1`, [bail]);
    await simuler(db, compteLo);
    const apres = await db.query(`select * from public.mon_document_locataire($1, $2)`, [orgA, docReglement]);
    expect(apres.rows).toHaveLength(0);
  });
});
