/**
 * Audit sécurité du 29/09 — une vérification par correction de base
 * (migration 20260929110000_audit_securite).
 *
 * Chaque bloc rejoue la preuve du relevé et vérifie qu'elle échoue désormais,
 * puis que le chemin légitime fonctionne toujours. Nécessite SUPABASE_DB_URL
 * (base locale). Transaction annulée.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Audit sécurité du 29/09", () => {
  let db: Client;
  let orgA: string;
  let orgB: string;
  let adminA: string;
  let agentA: string;
  let adminB: string;
  let lotA: string;
  let personneA: string;

  async function utilisateur(): Promise<string> {
    const { rows: [{ id }] } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
         email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1, 'x', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '')
       returning id`,
      [`audit29-${crypto.randomUUID()}@test.local`]
    );
    return id;
  }

  async function agir(compte: string | null, role = "authenticated") {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      compte ? JSON.stringify({ sub: compte, role }) : JSON.stringify({ role }),
    ]);
    await db.query(`set local role ${role}`);
  }

  async function postgres() {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  }

  async function echec(sql: string, params: unknown[] = []): Promise<string> {
    await db.query("savepoint e");
    try {
      await db.query(sql, params);
      await db.query("release savepoint e");
      return "";
    } catch (e) {
      await db.query("rollback to savepoint e");
      return e instanceof Error ? e.message : String(e);
    }
  }

  const un = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await db.query(sql, params)).rows[0] as T;

  // Un document de l'agence A rattaché à un lot : hors du portefeuille d'un
  // agent sans mandat. Posé sans déclencheurs (fixture).
  async function documentA(type: string): Promise<string> {
    await postgres();
    await db.query("set local session_replication_role = replica");
    const doc = (await un<{ id: string }>(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
       values ($1,$2,'Pièce audit',$1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',10,'audit29-'||gen_random_uuid())
       returning id`, [orgA, type])).id;
    await db.query(
      `insert into public.document_liens (document_id, organization_id, entite, entite_id)
       values ($1,$2,'lot',$3),($1,$2,'personne',$4)`, [doc, orgA, lotA, personneA]);
    await db.query("set local session_replication_role = origin");
    return doc;
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("begin");
    orgA = (await un<{ id: string }>(`insert into public.organizations (name, status) values ('Audit29 A','active') returning id`)).id;
    orgB = (await un<{ id: string }>(`insert into public.organizations (name, status) values ('Audit29 B','active') returning id`)).id;
    [adminA, agentA, adminB] = [await utilisateur(), await utilisateur(), await utilisateur()];
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1,$4,'admin_agence'),($2,$4,'agent'),($3,$5,'admin_agence')`,
      [adminA, agentA, adminB, orgA, orgB]
    );
    await db.query("set local session_replication_role = replica");
    const bien = (await un<{ id: string }>(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Audit29','appartement','1 rue Audit','75001','Paris') returning id`, [orgA])).id;
    lotA = (await un<{ id: string }>(
      `insert into public.lots (organization_id, bien_id, nom, etat) values ($1,$2,'Lot audit29','loue') returning id`, [orgA, bien])).id;
    personneA = (await un<{ id: string }>(
      `insert into public.persons (organization_id, nom, email) values ($1,'Personne audit29','p29@test.local') returning id`, [orgA])).id;
    await db.query("set local session_replication_role = origin");
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  // ── 1. demandes_devis ──────────────────────────────────────────────────────
  it("demandes_devis : le formulaire public ne pose ni created_at, ni traitee_le, ni id", async () => {
    await agir(null, "anon");
    expect(await echec(
      `insert into public.demandes_devis (nom, email, created_at) values ('X','x29@test.local', now() - interval '2 hours')`))
      .toMatch(/permission denied/);
    expect(await echec(
      `insert into public.demandes_devis (nom, email, traitee_le) values ('X','x29@test.local', now())`))
      .toMatch(/permission denied/);
    expect(await echec(
      `insert into public.demandes_devis (id, nom, email) values (gen_random_uuid(),'X','x29@test.local')`))
      .toMatch(/permission denied/);
    // Le chemin du formulaire (actions/devis.ts) fonctionne toujours.
    expect(await echec(
      `insert into public.demandes_devis (nom, email, agence, telephone, nb_lots, message)
       values ('Audit 29','Audit29@Test.local','Agence','0102030405','10','Bonjour')`)).toBe("");
    await agir(adminA);
    expect(await echec(
      `insert into public.demandes_devis (nom, email, created_at) values ('X','y29@test.local', now() - interval '2 hours')`))
      .toMatch(/permission denied/);
    await postgres();
    const ligne = await un<{ email: string; recente: boolean; traitee_le: string | null }>(
      `select email, created_at > now() - interval '1 minute' as recente, traitee_le
         from public.demandes_devis where email = 'audit29@test.local'`);
    expect(ligne).toEqual({ email: "audit29@test.local", recente: true, traitee_le: null });
  });

  it("demandes_devis : le déclencheur force l'horodatage — les plafonds ne s'antidatent plus", async () => {
    // Même un rôle qui aurait le droit de colonne ne contourne pas le plafond.
    await postgres();
    for (let i = 0; i < 3; i++) {
      await db.query(
        `insert into public.demandes_devis (nom, email, message, created_at, traitee_le)
         values ('X','plafond29@test.local',$1, now() - interval '3 hours', now())`, [`message ${i}`]);
    }
    const { rows } = await db.query(
      `select created_at > now() - interval '1 minute' as recente, traitee_le from public.demandes_devis
        where email = 'plafond29@test.local'`);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.recente && r.traitee_le === null)).toBe(true);
    expect(await echec(
      `insert into public.demandes_devis (nom, email, message, created_at) values ('X','plafond29@test.local','quatrième', now() - interval '3 hours')`))
      .toMatch(/déjà bien reçu/);
  });

  // ── 2. ecritures ───────────────────────────────────────────────────────────
  it("ecritures : la saisie libre ne pose plus systeme ni les liens réservés aux fonctions", async () => {
    await postgres();
    await db.query("set local session_replication_role = replica");
    const mandatA = (await un<{ id: string }>(
      `insert into public.mandats (organization_id, person_id, etat) values ($1,$2,'actif') returning id`, [orgA, personneA])).id;
    await db.query("set local session_replication_role = origin");
    await agir(adminA);
    const base = `insert into public.ecritures (organization_id, categorie, sens, montant`;
    for (const [colonne, valeur] of [
      ["systeme", "true"],
      ["mandat_id", `'${mandatA}'`],
      ["encaissement_id", "gen_random_uuid()"],
      ["depot_encaissement_id", "gen_random_uuid()"],
      ["contre_ecriture_de", "gen_random_uuid()"],
      ["bail_id", "gen_random_uuid()"],
      ["created_at", "now() - interval '1 year'"],
    ]) {
      expect(await echec(`${base}, ${colonne}) values ($1,'travaux','depense',10, ${valeur})`, [orgA]), colonne)
        .toMatch(/permission denied/);
    }
    // Le formulaire « Ajouter une écriture » (actions/compta.ts) fonctionne toujours.
    expect(await echec(
      `insert into public.ecritures (organization_id, categorie, sens, montant, date_piece, date_imputation, libelle, lot_id)
       values ($1,'travaux','depense',10,current_date,current_date,'Audit 29',$2)`, [orgA, lotA])).toBe("");
    await postgres();
    const ligne = await un<{ systeme: boolean }>(`select systeme from public.ecritures where libelle = 'Audit 29'`);
    expect(ligne.systeme).toBe(false);
  });

  it("ecritures : le mandat et l'encaissement de dépôt liés sont de la même organisation", async () => {
    await postgres();
    await db.query("set local session_replication_role = replica");
    const personneB = (await un<{ id: string }>(
      `insert into public.persons (organization_id, nom, email) values ($1,'Mandant B','b29@test.local') returning id`, [orgB])).id;
    const mandatB = (await un<{ id: string }>(
      `insert into public.mandats (organization_id, person_id, etat) values ($1,$2,'actif') returning id`, [orgB, personneB])).id;
    const mandatA = (await un<{ id: string }>(
      `insert into public.mandats (organization_id, person_id, etat) values ($1,$2,'actif') returning id`, [orgA, personneA])).id;
    await db.query("set local session_replication_role = origin");
    expect(await echec(
      `insert into public.ecritures (organization_id, categorie, sens, montant, mandat_id)
       values ($1,'honoraires','recette',10,$2)`, [orgA, mandatB])).toMatch(/ecritures_mandat_meme_org_fk/);
    expect(await echec(
      `insert into public.ecritures (organization_id, categorie, sens, montant, mandat_id)
       values ($1,'honoraires','recette',10,$2)`, [orgA, mandatA])).toBe("");
    const { rows } = await db.query(
      `select conname from pg_constraint where conrelid = 'public.ecritures'::regclass
        and conname in ('ecritures_mandat_meme_org_fk','ecritures_depot_meme_org_fk') order by 1`);
    expect(rows.map((r) => r.conname)).toEqual(["ecritures_depot_meme_org_fk", "ecritures_mandat_meme_org_fk"]);
  });

  // ── 4. Portefeuille de l'agent restreint ───────────────────────────────────
  it("partager_document_locataire : l'agent restreint ne partage pas un document hors portefeuille", async () => {
    const doc = await documentA("courrier");
    await agir(agentA);
    expect(await echec(`select public.partager_document_locataire($1,$2,true)`, [orgA, doc])).toMatch(/hors de votre portefeuille/);
    await postgres();
    expect((await un<{ partage_le: string | null }>(`select partage_le from public.documents where id=$1`, [doc])).partage_le).toBeNull();
    await agir(adminA);
    expect(await echec(`select public.partager_document_locataire($1,$2,true)`, [orgA, doc])).toBe("");
  });

  it("valider_attestation : l'agent restreint ne valide pas une attestation hors portefeuille", async () => {
    const doc = await documentA("attestation_assurance");
    await agir(agentA);
    expect(await echec(`select public.valider_attestation($1,$2)`, [orgA, doc])).toMatch(/hors de votre portefeuille/);
    await agir(adminA);
    expect(await echec(`select public.valider_attestation($1,$2)`, [orgA, doc])).toBe("");
    await postgres();
    expect((await un<{ v: boolean }>(`select verifie_le is not null as v from public.documents where id=$1`, [doc])).v).toBe(true);
  });

  it("envoyer_pour_signature et log_document_access : même règle de portefeuille", async () => {
    const doc = await documentA("courrier");
    await agir(agentA);
    expect(await echec(`select public.envoyer_pour_signature($1,$2,$3)`, [orgA, doc, personneA])).toMatch(/hors de votre portefeuille/);
    expect(await echec(`select public.log_document_access($1,'consultation')`, [doc])).toMatch(/acces refuse/);
    await agir(adminA);
    expect(await echec(`select public.log_document_access($1,'consultation')`, [doc])).toBe("");
    // L'admin passe la garde de portefeuille ; la suite des contrôles métier s'applique.
    expect(await echec(`select public.envoyer_pour_signature($1,$2,$3)`, [orgA, doc, personneA])).toMatch(/espace locataire actif/);
  });

  it("l'agent retrouve ses propres dépôts (document_deja_visible_agent)", async () => {
    const doc = await documentA("courrier");
    await postgres();
    await db.query(`update public.documents set deposited_by = $2 where id = $1`, [doc, agentA]);
    await agir(agentA);
    expect(await echec(`select public.partager_document_locataire($1,$2,true)`, [orgA, doc])).toBe("");
  });

  // ── 5. Plus d'oracle d'existence ───────────────────────────────────────────
  it("document_dans_portefeuille / alerte_dans_portefeuille : faux pour qui n'est pas membre", async () => {
    const doc = await documentA("courrier");
    await agir(adminB);
    expect((await un<{ r: boolean }>(`select public.document_dans_portefeuille($1,$2) as r`, [orgA, doc])).r).toBe(false);
    expect((await un<{ r: boolean }>(`select public.alerte_dans_portefeuille($1,'{}'::jsonb) as r`, [orgA])).r).toBe(false);
    // Les membres gardent la sémantique des politiques RLS.
    await agir(adminA);
    expect((await un<{ r: boolean }>(`select public.document_dans_portefeuille($1,$2) as r`, [orgA, doc])).r).toBe(true);
    expect((await un<{ r: boolean }>(`select public.alerte_dans_portefeuille($1,'{}'::jsonb) as r`, [orgA])).r).toBe(true);
    await agir(agentA);
    expect((await un<{ r: boolean }>(`select public.document_dans_portefeuille($1,$2) as r`, [orgA, doc])).r).toBe(false);
    // Le document reste invisible à l'agent par la RLS, visible à l'admin.
    expect((await db.query(`select id from public.documents where id=$1`, [doc])).rowCount).toBe(0);
    await agir(adminA);
    expect((await db.query(`select id from public.documents where id=$1`, [doc])).rowCount).toBe(1);
  });
});
