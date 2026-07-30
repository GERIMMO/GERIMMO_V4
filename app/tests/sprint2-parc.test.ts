/**
 * Tests d'intégration Sprint 2 — parc : biens, lots, détentions, diagnostics,
 * clé de répartition, machine à états, alertes d'expiration.
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
      'test-s2-' || gen_random_uuid() || '@test.local',
      'x', now(), '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb, now(), now(), '', '', '', '', ''
    ) returning id
  `);
  return id;
}

// Un échec attendu avorterait toute la transaction du test : on l'isole dans
// un savepoint pour pouvoir continuer après l'erreur.
async function attendreEchec(
  db: Client,
  motif: RegExp,
  sql: string,
  params: unknown[] = []
) {
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

describe.skipIf(!DB_URL)("Sprint 2 — le parc : biens, lots, diagnostics", () => {
  let db: Client;
  let orgA: string;
  let orgB: string;
  let adminA: string;
  let agentA: string;
  let adminB: string;
  let proprietaire: string;

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
      values ('S2 Alpha', 'active'), ('S2 Beta', 'active')
      returning id, name
    `);
    orgA = orgs.rows.find((o) => o.name === "S2 Alpha")!.id;
    orgB = orgs.rows.find((o) => o.name === "S2 Beta")!.id;

    adminA = await creerUtilisateur(db);
    agentA = await creerUtilisateur(db);
    adminB = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values
       ($1, $2, 'admin_agence'), ($3, $2, 'agent'), ($4, $5, 'admin_agence')`,
      [adminA, orgA, agentA, adminB, orgB]
    );
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.persons (organization_id, nom, prenom)
       values ($1, 'Martin', 'Paul') returning id`,
      [orgA]
    );
    proprietaire = id;
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  // Crée un bien complet (via le RPC, comme l'app) en tant qu'agent d'Alpha
  async function creerBien(type = "appartement"): Promise<{ bien: string; lot: string }> {
    await simuler(db, agentA);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot(
         $1, '12 rue des Tests', $2::public.bien_type,
         '12 rue des Tests', null, '75001', 'Paris', 1990, false, 45.5, 2) as id`,
      [orgA, type]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id = $1`, [bien]);
    return { bien, lot };
  }

  async function detenirA100(lot: string) {
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part)
       values ($1, $2, $3, 100)`,
      [lot, orgA, proprietaire]
    );
  }

  async function deposerDiagnosticsValides(bien: string, lot: string) {
    await db.query(
      `insert into public.diagnostics (organization_id, lot_id, type, date_realisation, date_expiration)
       values ($1, $2, 'dpe', current_date, current_date + 365)`,
      [orgA, lot]
    );
    await db.query(
      `insert into public.diagnostics (organization_id, bien_id, type, date_realisation, date_expiration)
       values ($1, $2, 'erp', current_date, current_date + 180)`,
      [orgA, bien]
    );
  }

  it("créer un bien crée son lot unique en brouillon (RM-0.1.2)", async () => {
    const { bien } = await creerBien();
    const lots = await db.query(
      `select nom, etat, surface_m2 from public.lots where bien_id = $1`,
      [bien]
    );
    expect(lots.rows).toHaveLength(1);
    expect(lots.rows[0].nom).toBe("Lot unique");
    expect(lots.rows[0].etat).toBe("brouillon");
    expect(Number(lots.rows[0].surface_m2)).toBe(45.5);
  });

  it("le parc est isolé par agence (RM-A1.7 étendue au module 0)", async () => {
    const { bien, lot } = await creerBien();
    await detenirA100(lot);

    await simuler(db, adminB);
    const vue = await db.query(
      `select
         (select count(*) from public.biens where id = $1) as biens,
         (select count(*) from public.lots where bien_id = $1) as lots,
         (select count(*) from public.detentions where lot_id = $2) as detentions`,
      [bien, lot]
    );
    expect(Number(vue.rows[0].biens)).toBe(0);
    expect(Number(vue.rows[0].lots)).toBe(0);
    expect(Number(vue.rows[0].detentions)).toBe(0);

    // Écriture croisée refusée : l'admin de Beta ne crée rien chez Alpha
    await attendreEchec(
      db,
      /row-level security/,
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1, 'Intrusion', 'maison', '1 rue X', '75001', 'Paris')`,
      [orgA]
    );

    // Rattachement inter-agences bloqué par FK composite (revue S2) : une
    // détention ou un diagnostic de Beta ne peut pas viser un lot d'Alpha,
    // même avec un organization_id valide pour l'attaquant
    await db.query("reset role");
    const {
      rows: [{ id: persB }],
    } = await db.query(
      `insert into public.persons (organization_id, nom) values ($1, 'Durand') returning id`,
      [orgB]
    );
    await simuler(db, adminB);
    await attendreEchec(
      db,
      /foreign key/,
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part)
       values ($1, $2, $3, 100)`,
      [lot, orgB, persB]
    );
    await attendreEchec(
      db,
      /foreign key/,
      `insert into public.diagnostics (organization_id, lot_id, type, date_realisation)
       values ($1, $2, 'dpe', current_date)`,
      [orgB, lot]
    );
  });

  it("la somme des quote-parts actives ne dépasse jamais 100 % (RM-0.2.1) et ne se supprime pas (RM-0.2.3)", async () => {
    const { lot } = await creerBien();
    await simuler(db, agentA);
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part)
       values ($1, $2, $3, 60)`,
      [lot, orgA, proprietaire]
    );
    await attendreEchec(
      db,
      /100/,
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part)
       values ($1, $2, $3, 50)`,
      [lot, orgA, proprietaire]
    );

    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part)
       values ($1, $2, $3, 40)`,
      [lot, orgA, proprietaire]
    );

    // Jamais de DELETE : privilège révoqué pour les clients
    await attendreEchec(
      db,
      /permission denied/,
      `delete from public.detentions where lot_id = $1`,
      [lot]
    );
  });

  it("démo du sprint : DPE expiré = mise en location bloquée ; le dépôt d'un DPE valide lève seul le blocage (RM-0.7.3, RM-0.8.5)", async () => {
    const { bien, lot } = await creerBien();
    await detenirA100(lot);
    // ERP valide, mais DPE expiré
    await db.query(
      `insert into public.diagnostics (organization_id, bien_id, type, date_realisation, date_expiration)
       values ($1, $2, 'erp', current_date, current_date + 180)`,
      [orgA, bien]
    );
    const {
      rows: [{ id: dpeExpire }],
    } = await db.query(
      `insert into public.diagnostics (organization_id, lot_id, type, date_realisation, date_expiration)
       values ($1, $2, 'dpe', current_date - 400, current_date - 10) returning id`,
      [orgA, lot]
    );

    const blocages = await db.query(
      `select unnest(public.lot_blocages_location($1)) as blocage`,
      [lot]
    );
    expect(blocages.rows.map((r) => r.blocage).join(" ")).toMatch(/DPE/);
    await attendreEchec(
      db,
      /DPE/,
      `update public.lots set etat = 'disponible' where id = $1`,
      [lot]
    );

    // Dépôt du remplaçant : l'ancien est archivé, le blocage tombe, le lot passe
    await db.query(
      `insert into public.diagnostics (organization_id, lot_id, type, date_realisation, date_expiration)
       values ($1, $2, 'dpe', current_date, current_date + 3650)`,
      [orgA, lot]
    );
    const ancien = await db.query(
      `select archived_at from public.diagnostics where id = $1`,
      [dpeExpire]
    );
    expect(ancien.rows[0].archived_at).not.toBeNull();

    await db.query(`update public.lots set etat = 'disponible' where id = $1`, [lot]);
    const etat = await db.query(`select etat from public.lots where id = $1`, [lot]);
    expect(etat.rows[0].etat).toBe("disponible");
  });

  it("machine à états : transitions interdites refusées, verrouillage du lot loué (RM-0.5.1), réactivation admin seul (RM-0.9.4)", async () => {
    const { bien, lot } = await creerBien();
    await detenirA100(lot);
    await deposerDiagnosticsValides(bien, lot);

    // brouillon → loué : interdit (il faut passer par disponible)
    await attendreEchec(
      db,
      /Transition interdite/,
      `update public.lots set etat = 'loue' where id = $1`,
      [lot]
    );

    await db.query(`update public.lots set etat = 'disponible' where id = $1`, [lot]);
    await db.query(`update public.lots set etat = 'loue' where id = $1`, [lot]);

    // Lot loué : surface verrouillée (avenant au bail requis)
    await attendreEchec(
      db,
      /verrouillées/,
      `update public.lots set surface_m2 = 50 where id = $1`,
      [lot]
    );
    // Adresse du bien verrouillée aussi
    await attendreEchec(
      db,
      /verrouillée/,
      `update public.biens set address_line1 = 'Ailleurs' where id = $1`,
      [bien]
    );

    // loué → préavis → disponible, puis archivage
    await db.query(`update public.lots set etat = 'preavis' where id = $1`, [lot]);
    await db.query(`update public.lots set etat = 'disponible' where id = $1`, [lot]);
    await db.query(`update public.lots set etat = 'archive' where id = $1`, [lot]);

    // Réactivation : refusée à l'agent, réservée à l'admin de l'agence
    await attendreEchec(
      db,
      /admin/,
      `update public.lots set etat = 'brouillon' where id = $1`,
      [lot]
    );
    await simuler(db, adminA);
    await db.query(`update public.lots set etat = 'brouillon' where id = $1`, [lot]);
    const etat = await db.query(`select etat from public.lots where id = $1`, [lot]);
    expect(etat.rows[0].etat).toBe("brouillon");
  });

  it("découpage : héritage des propriétaires (RM-0.3.6), clé invalidée (RM-0.3.3), lot loué non redécoupable (RM-0.3.8)", async () => {
    const { bien, lot } = await creerBien();
    await detenirA100(lot);

    await db.query(
      `select public.decouper_bien($1, $2::jsonb)`,
      [bien, JSON.stringify([{ nom: "Lot 2 — RDC gauche", surface_m2: "20" }])]
    );
    const lots = await db.query(
      `select id, nom, etat from public.lots where bien_id = $1 order by created_at`,
      [bien]
    );
    expect(lots.rows).toHaveLength(2);
    const nouveau = lots.rows[1];
    // Le nouveau lot hérite du propriétaire actif du lot d'origine
    const heritage = await db.query(
      `select person_id, quote_part from public.detentions where lot_id = $1 and date_fin is null`,
      [nouveau.id]
    );
    expect(heritage.rows).toHaveLength(1);
    expect(heritage.rows[0].person_id).toBe(proprietaire);
    expect(Number(heritage.rows[0].quote_part)).toBe(100);

    // Multi-lots sans clé valide : mise en location bloquée
    const blocages = await db.query(
      `select unnest(public.lot_blocages_location($1)) as blocage`,
      [lot]
    );
    expect(blocages.rows.map((r) => r.blocage).join(" ")).toMatch(/Clé de répartition/);

    // Clé fausse (99 %) rejetée, clé juste validée (RM-0.4.1)
    await attendreEchec(
      db,
      /100/,
      `select public.valider_cle_repartition($1, 'surface', $2::jsonb)`,
      [
        bien,
        JSON.stringify([
          { lot_id: lot, pourcentage: 60 },
          { lot_id: nouveau.id, pourcentage: 39 },
        ]),
      ]
    );
    const {
      rows: [{ valider_cle_repartition: cle }],
    } = await db.query(`select public.valider_cle_repartition($1, 'surface', $2::jsonb)`, [
      bien,
      JSON.stringify([
        { lot_id: lot, pourcentage: 69.45 },
        { lot_id: nouveau.id, pourcentage: 30.55 },
      ]),
    ]);

    // Immuabilité (RM-0.4.4) : ni les lignes ni l'en-tête (mode, date d'effet)
    // d'une clé ne se modifient — seule invalidated_at est accessible (revue S2)
    await attendreEchec(
      db,
      /permission denied/,
      `update public.cle_repartition_lignes set pourcentage = 50 where cle_id = $1`,
      [cle]
    );
    await attendreEchec(
      db,
      /permission denied/,
      `update public.cles_repartition set mode = 'tantiemes' where id = $1`,
      [cle]
    );

    // Lot d'origine loué : le bien ne se redécoupe pas
    await deposerDiagnosticsValides(bien, lot);
    await db.query(`update public.lots set etat = 'disponible' where id = $1`, [lot]);
    await db.query(`update public.lots set etat = 'loue' where id = $1`, [lot]);
    await attendreEchec(
      db,
      /loué/,
      `select public.decouper_bien($1, $2::jsonb)`,
      [bien, JSON.stringify([{ nom: "Lot 3" }])]
    );
  });

  it("alertes d'expiration : J-90/J-30/J+0, une par diagnostic et par seuil, refusées à un compte d'agence", async () => {
    const { bien, lot } = await creerBien();
    // Trois diagnostics : expiré (J+0), sous 30 j, sous 90 j
    await db.query(
      `insert into public.diagnostics (organization_id, lot_id, type, date_realisation, date_expiration)
       values ($1, $2, 'dpe', current_date - 400, current_date - 1)`,
      [orgA, lot]
    );
    await db.query(
      `insert into public.diagnostics (organization_id, bien_id, type, date_realisation, date_expiration)
       values ($1, $2, 'erp', current_date, current_date + 20)`,
      [orgA, bien]
    );
    await db.query(
      `insert into public.diagnostics (organization_id, bien_id, type, date_realisation, date_expiration)
       values ($1, $2, 'termites', current_date, current_date + 80)`,
      [orgA, bien]
    );

    // Un compte d'agence ne déclenche pas la génération (réservée cron/SA)
    await simuler(db, agentA);
    await attendreEchec(db, /super admin/, `select public.generer_alertes_diagnostics()`);

    // Le cron (pas de session) génère : 3 alertes, aux bons seuils
    await simuler(db, null, "postgres");
    const {
      rows: [{ generer_alertes_diagnostics: crees }],
    } = await db.query(`select public.generer_alertes_diagnostics()`);
    expect(Number(crees)).toBe(3);

    const alertes = await db.query(
      `select criticite, details->>'seuil' as seuil from public.alerts
       where organization_id = $1 and type = 'diagnostic_expiration' order by seuil`,
      [orgA]
    );
    expect(alertes.rows).toEqual([
      { criticite: "informative", seuil: "J-90" },
      { criticite: "normale", seuil: "J-30" },
      { criticite: "critique", seuil: "J+0" },
    ]);

    // Idempotence : une seconde passe ne crée rien
    const {
      rows: [{ generer_alertes_diagnostics: seconde }],
    } = await db.query(`select public.generer_alertes_diagnostics()`);
    expect(Number(seconde)).toBe(0);
  });
});

if (!DB_URL) {
  console.warn(
    "⚠ SUPABASE_DB_URL absente : tests Sprint 2 ignorés. " +
      "Renseignez-la dans app/.env.local pour les exécuter."
  );
}
