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
  let adminA: string;
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
    adminA = await creerUtilisateur(db);
    agentA = await creerUtilisateur(db);
    compteLocataire = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1,$2,'admin_agence'), ($3,$2,'agent'), ($4,$2,'locataire')`,
      [adminA, orgA, agentA, compteLocataire]
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

  // Le parc est constitué par l'ADMIN d'agence, qui confie ensuite le mandat à
  // l'agent : le lot entre dans SON portefeuille (RM-18.1.3), et avec lui le
  // bail et le locataire qui l'occupe. Le titulaire n'est posé que par le
  // responsable de l'agence (RM-18.1.4) — d'où l'écriture sous identité admin.
  async function confierLocataireAuPortefeuille(): Promise<void> {
    await simuler(db, adminA);
    const {
      rows: [{ id: proprietaire }],
    } = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Bailleur') returning id`,
      [orgA]
    );
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'7 rue Recette','appartement'::public.bien_type,
         '7 rue Recette', null, '75001','Paris',1990,false,50,3) as id`,
      [orgA]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id = $1`, [bien]);
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`,
      [lot, orgA, proprietaire]
    );
    const {
      rows: [{ id: mandat }],
    } = await db.query(
      `insert into public.mandats (organization_id, person_id, etat, agent_account_id)
       values ($1,$2,'actif',$3) returning id`,
      [orgA, proprietaire, agentA]
    );
    await db.query(
      `insert into public.mandat_lignes (organization_id, mandat_id, lot_id, taux_honoraires)
       values ($1,$2,$3,7)`,
      [orgA, mandat, lot]
    );
    await db.query(
      `insert into public.baux (organization_id, lot_id, etat, locataire_principal, loyer_hc, date_debut)
       values ($1,$2,'brouillon',$3,800,current_date)`,
      [orgA, lot, personne]
    );
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
    // Côté agence, le dossier est celui d'une personne du portefeuille de
    // l'agent : le locataire occupe un lot d'un mandat dont il est titulaire.
    await confierLocataireAuPortefeuille();
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

describe.skipIf(!DB_URL)("Recette 21/08 — EDL d'entrée (règle revue le 29/08, puis le 30/08)", () => {
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

  // 21/08 : l'alerte EDL d'entrée devait nommer le lot et le locataire.
  // 29/08 : l'alerte est retirée — l'EDL d'entrée signé conditionne la
  // validation du bail. Le scénario vérifie la nouvelle règle.
  // Règle en vigueur : celle du 2026-08-30 (migration 20260830120000), qui a
  // REVU celle du 29/08. L'EDL d'entrée n'est plus un prérequis d'activation :
  // sans lui le bail s'active quand même et une alerte « edl_entree » liée au
  // bail le rappelle, fermée d'elle-même à la signature. Voir le callout
  // « Activation du bail — tranché et livré le 2026-08-30 » de wiki/concepts/Bail.md.
  // (La règle de restitution, elle, ne bouge pas : sans EDL d'entrée signé,
  // aucune retenue possible à la sortie — RM-2.4.3.)
  it("sans EDL d'entrée signé le bail s'active mais porte une alerte ; signé, il s'active sans alerte", async () => {
    const {
      rows: [{ id: org }],
    } = await db.query(
      `insert into public.organizations (name, status) values ('R21 EDL','active') returning id`
    );
    const admin = await creerUtilisateur(db);
    const agent = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1,$2,'admin_agence'), ($3,$2,'agent')`,
      [admin, org, agent]
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

    // Le parc est constitué par l'ADMIN d'agence, qui confie le mandat à
    // l'agent (RM-18.1.3/4) : le lot entre alors dans SON portefeuille et
    // l'agent peut y mener la mise en location.
    await simuler(db, admin);
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
      rows: [{ id: mandat }],
    } = await db.query(
      `insert into public.mandats (organization_id, person_id, etat, agent_account_id)
       values ($1,$2,'actif',$3) returning id`,
      [org, proprietaire, agent]
    );
    await db.query(
      `insert into public.mandat_lignes (organization_id, mandat_id, lot_id, taux_honoraires)
       values ($1,$2,$3,7)`,
      [org, mandat, lot]
    );
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
      `insert into public.baux (organization_id, lot_id, etat, locataire_principal, document_signe, loyer_hc, date_debut)
       values ($1,$2,'brouillon',$3,$4,800,current_date) returning id`,
      [org, lot, locataire, doc]
    );

    await simuler(db, agent);
    // Sans EDL d'entrée signé : l'activation passe, mais elle laisse une trace
    // — l'alerte edl_entree rattachée au bail. On annule ensuite ce chemin pour
    // rejouer le nominal (EDL signé d'abord) sur le même bail.
    await db.query("savepoint edl");
    await db.query(`select public.activer_bail($1)`, [bail]);
    const sansEdl = await db.query(
      `select b.etat,
              (select count(*)::int from public.alerts a
                where a.organization_id = $1 and a.type = 'edl_entree'
                  and a.details->>'bail_id' = $2::uuid::text) as alertes
         from public.baux b where b.id = $2::uuid`,
      [org, bail]
    );
    expect(sansEdl.rows[0].etat).toBe("actif");
    expect(sansEdl.rows[0].alertes).toBe(1);
    await db.query("rollback to savepoint edl");

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
    await db.query("reset role");

    const etat = await db.query(`select etat from public.baux where id=$1`, [bail]);
    expect(etat.rows[0].etat).toBe("actif");
    const {
      rows: [{ n }],
    } = await db.query(
      `select count(*)::int as n from public.alerts
       where organization_id = $1 and type = 'edl_entree' and details->>'bail_id' = $2`,
      [org, bail]
    );
    expect(n).toBe(0);
  });
});
