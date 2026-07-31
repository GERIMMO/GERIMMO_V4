/**
 * Tests d'intégration Sprint 1 — GED, alertes, journaux, purge de rétention.
 * Directement contre Postgres (comme socle.test.ts) : simulation des rôles
 * par set_config + set local role, transaction annulée à la fin.
 *
 * Nécessite SUPABASE_DB_URL. Sans elle, tests ignorés avec avertissement.
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
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated',
      'test-s1-' || gen_random_uuid() || '@test.local',
      'x', now(), '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb, now(), now(), '', '', '', '', ''
    ) returning id
  `);
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

describe.skipIf(!DB_URL)("Sprint 1 — GED, alertes, rétention", () => {
  let db: Client;
  let orgA: string;
  let orgB: string;
  let agentA: string;
  let locataireA: string;
  let adminB: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("begin");
    const orgs = await db.query(`
      insert into public.organizations (name, status)
      values ('S1 Alpha', 'active'), ('S1 Beta', 'active')
      returning id, name
    `);
    orgA = orgs.rows.find((o) => o.name === "S1 Alpha")!.id;
    orgB = orgs.rows.find((o) => o.name === "S1 Beta")!.id;

    agentA = await creerUtilisateur(db);
    locataireA = await creerUtilisateur(db);
    adminB = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values
       ($1, $2, 'agent'), ($3, $2, 'locataire'), ($4, $5, 'admin_agence')`,
      [agentA, orgA, locataireA, adminB, orgB]
    );
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  async function insererDocument(
    org: string,
    type: string,
    titre: string,
    referenceDate = "current_date"
  ): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.documents
         (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte, retention_reference_date)
       values ($1, $2::public.document_type, $3, $1::uuid::text || '/' || gen_random_uuid() || '.pdf',
               'application/pdf', 1000, 'e-' || gen_random_uuid(), ${referenceDate})
       returning id`,
      [org, type, titre]
    );
    return id;
  }

  it("un gérant ne voit que les documents et alertes de son agence ; un locataire, aucun", async () => {
    const docA = await insererDocument(orgA, "courrier", "Doc Alpha");
    const docB = await insererDocument(orgB, "courrier", "Doc Beta");
    await db.query(
      `insert into public.alerts (organization_id, titre) values ($1, 'Alerte Alpha'), ($2, 'Alerte Beta')`,
      [orgA, orgB]
    );

    await simuler(db, agentA);
    const vue = await db.query(
      `select
         (select count(*) from public.documents where id = $1) as doc_a,
         (select count(*) from public.documents where id = $2) as doc_b,
         (select count(*) from public.alerts where organization_id = $3) as alertes_a,
         (select count(*) from public.alerts where organization_id = $4) as alertes_b`,
      [docA, docB, orgA, orgB]
    );
    expect(Number(vue.rows[0].doc_a)).toBe(1);
    expect(Number(vue.rows[0].doc_b)).toBe(0);
    expect(Number(vue.rows[0].alertes_a)).toBe(1);
    expect(Number(vue.rows[0].alertes_b)).toBe(0);

    // Le locataire membre de la même agence ne voit RIEN de la GED (S1)
    await simuler(db, locataireA);
    const vueLocataire = await db.query(
      `select
         (select count(*) from public.documents where organization_id = $1) as docs,
         (select count(*) from public.alerts where organization_id = $1) as alertes`,
      [orgA]
    );
    expect(Number(vueLocataire.rows[0].docs)).toBe(0);
    expect(Number(vueLocataire.rows[0].alertes)).toBe(0);

    // L'anonyme : rien, nulle part
    await simuler(db, null, "anon");
    await expect(
      db.query(`select count(*) from public.documents`)
    ).rejects.toThrow();
  });

  it("un gérant ne peut pas écrire un document chez une autre agence", async () => {
    await simuler(db, agentA);
    await expect(
      db.query(
        `insert into public.documents
           (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
         values ($1, 'courrier', 'Intrusion', $1 || '/x.pdf', 'application/pdf', 10, 'intrusion')`,
        [orgB]
      )
    ).rejects.toThrow();
  });

  it("l'empreinte bloque le dépôt du même contenu deux fois (anti-doublon)", async () => {
    await db.query(
      `insert into public.documents
         (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
       values ($1, 'courrier', 'Original', $1::uuid::text || '/a.pdf', 'application/pdf', 10, 'meme-empreinte')`,
      [orgA]
    );
    await expect(
      db.query(
        `insert into public.documents
           (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
         values ($1, 'courrier', 'Copie', $1::uuid::text || '/b.pdf', 'application/pdf', 10, 'meme-empreinte')`,
        [orgA]
      )
    ).rejects.toThrow(/documents_empreinte_unique/);
  });

  it("log_document_access trace pour un gérant et refuse un locataire (journal d'accès)", async () => {
    const docA = await insererDocument(orgA, "piece_identite", "CNI");

    await simuler(db, agentA);
    await db.query(`select public.log_document_access($1, 'consultation')`, [docA]);
    await db.query(`select public.log_document_access($1, 'telechargement')`, [docA]);

    // Le locataire n'a pas accès à la GED : la trace est refusée
    // (savepoints : une erreur attendue avorterait sinon toute la transaction)
    await simuler(db, locataireA);
    await db.query("savepoint acces_refuse");
    await expect(
      db.query(`select public.log_document_access($1, 'consultation')`, [docA])
    ).rejects.toThrow(/acces refuse/);
    await db.query("rollback to savepoint acces_refuse");

    // L'écriture directe dans le journal est impossible côté client
    await db.query("savepoint ecriture_directe");
    await expect(
      db.query(
        `insert into public.acces_pieces_log (organization_id, account_id, document_id, action)
         values ($1, $2, $3, 'consultation')`,
        [orgA, locataireA, docA]
      )
    ).rejects.toThrow();
    await db.query("rollback to savepoint ecriture_directe");

    await db.query("reset role");
    const { rows } = await db.query(
      `select action, account_id from public.acces_pieces_log where document_id = $1 order by created_at`,
      [docA]
    );
    expect(rows.map((r) => r.action)).toEqual(["consultation", "telechargement"]);
    expect(rows.every((r) => r.account_id === agentA)).toBe(true);
  });

  it("la purge applique les règles : document échu purgé, témoin intact, journaux nettoyés", async () => {
    // Document de test (durée 0 => échu immédiatement) + quittance témoin
    const docTest = await insererDocument(orgA, "document_test", "À purger");
    const docTemoin = await insererDocument(orgA, "quittance", "Témoin");
    await db.query(
      `insert into public.document_liens (document_id, organization_id, entite, entite_id)
       values ($1, $2, 'organisation', $2)`,
      [docTest, orgA]
    );
    // Journal technique : une entrée fraîche, une vieille de 7 mois
    await db.query(
      `insert into public.tech_log (evenement, created_at) values
       ('recent', now()), ('ancien', now() - interval '7 months')`
    );
    // Alerte fermée il y a 13 mois (règle : 1 an) et alerte ouverte ancienne
    await db.query(
      `insert into public.alerts (organization_id, titre, statut, closed_at, created_at) values
       ($1, 'Vieille traitée', 'fermee', now() - interval '13 months', now() - interval '14 months'),
       ($1, 'Vieille ouverte', 'ouverte', null, now() - interval '14 months')`,
      [orgA]
    );

    const {
      rows: [{ resultat }],
    } = await db.query(`select public.appliquer_retention() as resultat`);
    expect(resultat.documents_purges).toBe(1);

    // Le document échu est une trace neutre : plus de fichier, de titre, d'empreinte, de liens
    const { rows: apres } = await db.query(
      `select purged_at, storage_path, titre, empreinte,
         (select count(*) from public.document_liens where document_id = $1) as liens
       from public.documents where id = $1`,
      [docTest]
    );
    expect(apres[0].purged_at).not.toBeNull();
    expect(apres[0].storage_path).toBeNull();
    expect(apres[0].titre).toBeNull();
    expect(apres[0].empreinte).toBeNull();
    expect(Number(apres[0].liens)).toBe(0);

    // Le fichier attend sa suppression physique en file
    const { rows: file } = await db.query(
      `select count(*) as n from public.purge_fichiers where deleted_at is null`
    );
    expect(Number(file[0].n)).toBeGreaterThanOrEqual(1);

    // La purge est elle-même tracée dans le journal d'audit
    const { rows: audit } = await db.query(
      `select count(*) as n from public.audit_log
       where action = 'purge_retention' and details->>'document_id' = $1::text`,
      [docTest]
    );
    expect(Number(audit[0].n)).toBe(1);

    // Le témoin est intact
    const { rows: temoin } = await db.query(
      `select purged_at from public.documents where id = $1`,
      [docTemoin]
    );
    expect(temoin[0].purged_at).toBeNull();

    // Journal technique : l'ancien est parti, le récent reste
    const { rows: tech } = await db.query(
      `select evenement from public.tech_log where evenement in ('recent', 'ancien')`
    );
    expect(tech.map((t) => t.evenement)).toEqual(["recent"]);

    // Alertes : la vieille traitée est purgée, la vieille ouverte reste
    const { rows: alertes } = await db.query(
      `select titre from public.alerts where organization_id = $1 order by titre`,
      [orgA]
    );
    expect(alertes.map((a) => a.titre)).toEqual(["Vieille ouverte"]);
  });

  it("appliquer_retention est refusée à un utilisateur non super admin", async () => {
    await simuler(db, agentA);
    await expect(
      db.query(`select public.appliquer_retention()`)
    ).rejects.toThrow(/reserve au super admin/);
  });

  it("les règles de conservation sont lisibles par un gérant mais pas modifiables", async () => {
    await simuler(db, agentA);
    const { rows } = await db.query(
      `select count(*) as n from public.retention_rules where actif`
    );
    expect(Number(rows[0].n)).toBeGreaterThanOrEqual(17);

    const modification = await db.query(
      `update public.retention_rules set duree_mois = 1 where data_type = 'journal:audit_log' returning id`
    );
    expect(modification.rowCount).toBe(0); // la RLS ne matche aucune ligne
  });

  it("log_tech écrit le journal technique, inaccessible en lecture aux non-SA", async () => {
    await simuler(db, agentA);
    await db.query(
      `select public.log_tech('changement_mot_de_passe', '{}'::jsonb)`
    );
    const { rows } = await db.query(`select count(*) as n from public.tech_log`);
    expect(Number(rows[0].n)).toBe(0); // écrit mais invisible pour lui

    await db.query("reset role");
    const { rows: brut } = await db.query(
      `select account_id from public.tech_log where evenement = 'changement_mot_de_passe'`
    );
    expect(brut.some((r) => r.account_id === agentA)).toBe(true);
  });

  it("org_membres_gerants liste les gérants pour un membre, refuse l'extérieur", async () => {
    await simuler(db, agentA);
    const { rows: membres } = await db.query(
      `select * from public.org_membres_gerants($1)`,
      [orgA]
    );
    expect(membres.map((m) => m.account_id)).toEqual([agentA]); // le locataire n'y figure pas

    const { rows: exterieur } = await db.query(
      `select * from public.org_membres_gerants($1)`,
      [orgB]
    );
    expect(exterieur).toHaveLength(0);
  });
});

if (!DB_URL) {
  console.warn(
    "⚠ SUPABASE_DB_URL absente : tests d'intégration Sprint 1 ignorés."
  );
}
