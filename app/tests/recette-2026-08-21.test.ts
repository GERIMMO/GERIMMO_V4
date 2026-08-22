/**
 * Tests d'intégration — passe recette du 21/08 : mandat sans lot bloqué,
 * cycle de l'attestation d'assurance (versionnage, alerte, validation),
 * alerte EDL contextualisée. Nécessite SUPABASE_DB_URL. Transaction annulée.
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
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-r21-'||gen_random_uuid()||'@test.local','x', now(),
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

describe.skipIf(!DB_URL)("Recette 21/08 — attestation et alertes", () => {
  let db: Client;
  let orgA: string;
  let agentA: string;
  let compteLocataire: string;
  let personne: string;

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
      rows: [{ id }],
    } = await db.query(
      `insert into public.organizations (name, status) values ('R21 Alpha','active') returning id`
    );
    orgA = id;
    agentA = await creerUtilisateur(db);
    compteLocataire = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1,$2,'agent'), ($3,$2,'locataire')`,
      [agentA, orgA, compteLocataire]
    );
    const {
      rows: [{ id: pid }],
    } = await db.query(
      `insert into public.persons (organization_id, nom, prenom, account_id)
       values ($1,'Recette','Léa',$2) returning id`,
      [orgA, compteLocataire]
    );
    personne = pid;
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  async function deposerAttestation(chemin: string, empreinte: string): Promise<string> {
    await simuler(db, compteLocataire);
    const {
      rows: [{ id }],
    } = await db.query(
      `select public.deposer_mon_attestation($1, $2, 'application/pdf', 1000, $3,
         'Attestation', current_date + 300) as id`,
      [orgA, `${orgA}/${chemin}`, empreinte]
    );
    return id;
  }

  it("le dépôt notifie l'agence, versionne, et la validation solde l'alerte", async () => {
    const v1 = await deposerAttestation("att-1.pdf", "r21-e1");
    await db.query("reset role");
    // « Votre agence est notifiée » est vrai : une alerte à vérifier existe
    const {
      rows: [alerte1],
    } = await db.query(
      `select statut from public.alerts
       where organization_id = $1 and type = 'attestation_a_verifier'
         and details->>'document_id' = $2`,
      [orgA, v1]
    );
    expect(alerte1.statut).toBe("ouverte");

    // Renouvellement : la v2 remplace la v1 (versionnée, plus indépendante)
    const v2 = await deposerAttestation("att-2.pdf", "r21-e2");
    await db.query("reset role");
    const {
      rows: [doc2],
    } = await db.query(`select remplace_id from public.documents where id = $1`, [v2]);
    expect(doc2.remplace_id).toBe(v1);

    // L'agent valide la v2 — la v1 remplacée est refusée
    await simuler(db, agentA);
    await attendreEchec(
      db,
      /version plus récente/,
      `select public.valider_attestation($1,$2)`,
      [orgA, v1]
    );
    await db.query(`select public.valider_attestation($1,$2)`, [orgA, v2]);
    await attendreEchec(db, /déjà validée/, `select public.valider_attestation($1,$2)`, [
      orgA,
      v2,
    ]);

    await db.query("reset role");
    const {
      rows: [doc2apres],
    } = await db.query(`select verifie_le, verifie_par from public.documents where id = $1`, [v2]);
    expect(doc2apres.verifie_le).not.toBeNull();
    expect(doc2apres.verifie_par).toBe(agentA);
    const {
      rows: [alerte2],
    } = await db.query(
      `select statut, closed_action from public.alerts
       where details->>'document_id' = $1 and type = 'attestation_a_verifier'`,
      [v2]
    );
    expect(alerte2.statut).toBe("fermee");
    expect(alerte2.closed_action).toMatch(/validée/);
  });

  it("le dossier expose l'échéance et la vérification, côté agence comme côté locataire", async () => {
    const doc = await deposerAttestation("att-3.pdf", "r21-e3");

    await simuler(db, compteLocataire);
    const { rows: miennes } = await db.query(
      `select document_id, expire_le, verifie_le from public.mon_dossier_locataire($1)`,
      [orgA]
    );
    const mienne = miennes.find((p) => p.document_id === doc)!;
    expect(mienne.expire_le).not.toBeNull();
    expect(mienne.verifie_le).toBeNull();

    await simuler(db, agentA);
    const { rows: dossier } = await db.query(
      `select document_id, expire_le, verifie_le from public.dossier_personne($1)`,
      [personne]
    );
    const piece = dossier.find((p) => p.document_id === doc)!;
    expect(piece.expire_le).not.toBeNull();
  });

  it("le cron des alertes d'expiration d'assurance est planifié", async () => {
    await db.query("reset role");
    const { rows } = await db.query(
      `select count(*)::int as n from cron.job where jobname = 'alertes-assurance-quotidiennes'`
    );
    expect(rows[0].n).toBe(1);
  });
});

describe.skipIf(!DB_URL)("Recette 21/08 — alerte EDL contextualisée", () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("begin");
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  it("le titre de l'alerte EDL porte le lot et le locataire", async () => {
    const {
      rows: [{ id: org }],
    } = await db.query(
      `insert into public.organizations (name, status) values ('R21 EDL','active') returning id`
    );
    const agent = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'agent')`,
      [agent, org]
    );
    const {
      rows: [{ id: locataire }],
    } = await db.query(
      `insert into public.persons (organization_id, nom, prenom) values ($1,'Martin','Jules') returning id`,
      [org]
    );
    const {
      rows: [{ id: proprietaire }],
    } = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Bailleur') returning id`,
      [org]
    );

    await simuler(db, agent);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'3 rue Recette','appartement'::public.bien_type,
         '3 rue Recette', null, '75001','Paris',1990,false,50,3) as id`,
      [org]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id, nom from public.lots where bien_id = $1`, [bien]);
    await db.query("reset role");
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`,
      [lot, org, proprietaire]
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
    const {
      rows: [{ id: doc }],
    } = await db.query(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
       values ($1,'bail','Bail signé', $1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',1000,'r21-'||gen_random_uuid())
       returning id`,
      [org]
    );
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, etat, locataire_principal, document_signe, loyer_hc)
       values ($1,$2,'brouillon',$3,$4,800) returning id`,
      [org, lot, locataire, doc]
    );

    await simuler(db, agent);
    await db.query(`select public.activer_bail($1)`, [bail]);
    await db.query("reset role");

    const {
      rows: [alerte],
    } = await db.query(
      `select titre, details from public.alerts
       where organization_id = $1 and type = 'edl_entree' and details->>'bail_id' = $2`,
      [org, bail]
    );
    // Le titre nomme le lot et le locataire (recette 21/08)
    expect(alerte.titre).toMatch(/Jules Martin/);
    expect(alerte.details.libelle).toMatch(/Jules Martin/);
    expect(alerte.details.person_id).toBe(locataire);
  });
});
