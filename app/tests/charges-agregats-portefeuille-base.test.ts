/**
 * Audit du 23/10/2026, A03 (P1, cloisonnement) — deux agrégats de charges SECURITY DEFINER ignoraient le portefeuille.
 *
 * `charges_recuperables_exercice(lot, exercice)` et `provisions_charges_annee(bail, année)` contrôlaient l'appartenance à
 * l'agence (20260910130000), pas le portefeuille : un agent restreint lisait le total des charges d'un lot confié à un
 * collègue, que les politiques RESTRICTIVES de lecture lui cachent. La migration 20261023161500 y ajoute le contrôle de
 * ces politiques (`lot_hors_portefeuille`, `bail_hors_portefeuille`) ; le refus garde la forme existante : 0.
 *
 * Une seule transaction pour tout le fichier, annulée à la fin ; la migration (et son retour) y sont joués, d'où le
 * classement en série (vitest.config.ts). Nécessite SUPABASE_DB_URL.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const NOM = "20261023161500_charges_agregats_portefeuille";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
const EXERCICE = 2025;

describe.skipIf(!url)("agrégats de charges : appartenance ET portefeuille (A03)", () => {
  let db: Client;
  let orgA: string;
  let admin: string;
  let agent: string;
  let collegue: string;
  let etranger: string;
  /** Lot et bail confiés à l'agent (son portefeuille). */
  let lotAgent: string;
  let bailAgent: string;
  /** Lot et bail confiés au collègue : hors du portefeuille de l'agent. */
  let lotCollegue: string;
  let bailCollegue: string;
  let justificatif: string;

  async function compte(prefixe: string): Promise<string> {
    const { rows: [{ id, email }] } = await db.query<{ id: string; email: string }>(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         $1 || '-' || gen_random_uuid() || '@example.invalid', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now(),
         '', '', '', '', '')
       returning id, email`,
      [prefixe]
    );
    await db.query("insert into public.accounts (id, email) values ($1, $2) on conflict (id) do nothing", [id, email]);
    return id;
  }

  /** Un lot du bien, confié par mandat à `titulaire`, loué par un bail de l'exercice, avec ses appels. */
  async function lotConfie(org: string, bien: string, mandant: string, titulaire: string, nom: string) {
    const { rows: [lot] } = await db.query<{ id: string }>(
      `insert into public.lots (organization_id, bien_id, nom, etat) values ($1, $2, $3, 'loue'::public.lot_etat) returning id`,
      [org, bien, nom]
    );
    await db.query(
      "insert into public.detentions (organization_id, lot_id, person_id, quote_part) values ($1, $2, $3, 100)",
      [org, lot.id, mandant]
    );
    const { rows: [md] } = await db.query<{ id: string }>(
      `insert into public.mandats (organization_id, person_id, etat, date_debut, agent_account_id)
       values ($1, $2, 'brouillon'::public.mandat_etat, date '2025-01-01', $3) returning id`,
      [org, mandant, titulaire]
    );
    await db.query(
      `insert into public.mandat_lignes (organization_id, mandat_id, lot_id, taux_honoraires, date_debut)
       values ($1, $2, $3, 7, date '2025-01-01')`,
      [org, md.id, lot.id]
    );
    const { rows: [bail] } = await db.query<{ id: string }>(
      `insert into public.baux (organization_id, lot_id, type, etat, loyer_hc, charges, date_debut, jour_echeance)
       values ($1, $2, 'nu'::public.bail_type, 'actif'::public.bail_etat, 700, 100, date '2025-01-01', 5) returning id`,
      [org, lot.id]
    );
    // Deux appels de loyer de l'exercice : 100 € de provisions chacun.
    await db.query(
      `insert into public.appels_loyer (organization_id, bail_id, periode, date_echeance, loyer_hc, charges, montant_du)
       values ($1, $2, date '2025-01-01', date '2025-01-05', 700, 100, 800),
              ($1, $2, date '2025-02-01', date '2025-02-05', 700, 100, 800)`,
      [org, bail.id]
    );
    // Appel de charges de copropriété ventilé : 700 € récupérables, 300 € non récupérables.
    const { rows: [appel] } = await db.query<{ id: string }>(
      `insert into public.appels_charges (organization_id, lot_id, exercice, total, statut)
       values ($1, $2, $3, 1000, 'ventile') returning id`,
      [org, lot.id, EXERCICE]
    );
    await db.query(
      `insert into public.appel_charges_postes (organization_id, appel_id, libelle, montant, nature)
       values ($1, $2, 'Eau froide', 700, 'recuperable'), ($1, $2, 'Honoraires du syndic', 300, 'non_recuperable')`,
      [org, appel.id]
    );
    return { lot: lot.id, bail: bail.id };
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    const { rows: [a] } = await db.query<{ id: string }>(
      `insert into public.organizations (name, status, type)
       values ('Cabinet A03', 'active'::public.organization_status, 'agence'::public.organization_type) returning id`
    );
    orgA = a.id;
    const { rows: [b] } = await db.query<{ id: string }>(
      `insert into public.organizations (name, status, type)
       values ('Autre cabinet A03', 'active'::public.organization_status, 'agence'::public.organization_type) returning id`
    );
    admin = await compte("a03-admin");
    agent = await compte("a03-agent");
    collegue = await compte("a03-collegue");
    etranger = await compte("a03-etranger");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1, $2, 'admin_agence'), ($3, $2, 'agent'), ($4, $2, 'agent'), ($5, $6, 'admin_agence')`,
      [admin, orgA, agent, collegue, etranger, b.id]
    );
    const { rows: [mandant] } = await db.query<{ id: string }>(
      "insert into public.persons (organization_id, nom) values ($1, 'Bailleur A03') returning id",
      [orgA]
    );
    const { rows: [bien] } = await db.query<{ id: string }>(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city, copropriete)
       values ($1, 'Immeuble A03', 'appartement'::public.bien_type, '3 rue A', '75003', 'Paris', true) returning id`,
      [orgA]
    );
    ({ lot: lotAgent, bail: bailAgent } = await lotConfie(orgA, bien.id, mandant.id, agent, "Lot de l'agent"));
    ({ lot: lotCollegue, bail: bailCollegue } = await lotConfie(orgA, bien.id, mandant.id, collegue, "Lot du collègue"));
    const { rows: [doc] } = await db.query<{ id: string }>(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
       values ($1, 'justificatif', 'Décompte', $1::uuid::text || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 10,
               'e-' || gen_random_uuid()) returning id`,
      [orgA]
    );
    justificatif = doc.id;
    // La base de test peut précéder la migration : on la joue ici, dans la transaction du fichier.
    await db.query(migration);
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
  });
  afterEach(async () => {
    await db.query("rollback to savepoint cas");
    await db.query("reset role");
  });

  async function session(id: string) {
    await db.query("reset role");
    await db.query(
      "select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)",
      [id]
    );
    await db.query("set local role authenticated");
  }
  const charges = async (lot: string) =>
    Number((await db.query("select public.charges_recuperables_exercice($1, $2) as v", [lot, EXERCICE])).rows[0].v);
  const provisions = async (bail: string) =>
    Number((await db.query("select public.provisions_charges_annee($1, $2) as v", [bail, EXERCICE])).rows[0].v);

  it("agent restreint, lot et bail HORS de son portefeuille : refus (0), comme ses politiques de lecture", async () => {
    await session(agent);
    expect(await charges(lotCollegue)).toBe(0);
    expect(await provisions(bailCollegue)).toBe(0);
    // Ce que le RLS lui montre de ce lot : rien — la fonction ne dit plus autre chose.
    expect((await db.query("select id from public.appels_charges where lot_id = $1", [lotCollegue])).rows).toHaveLength(0);
    expect((await db.query("select id from public.appels_loyer where bail_id = $1", [bailCollegue])).rows).toHaveLength(0);
  });

  it("agent restreint, lot et bail DE son portefeuille : les totaux lui sont rendus", async () => {
    await session(agent);
    expect(await charges(lotAgent)).toBe(700);
    expect(await provisions(bailAgent)).toBe(200);
  });

  it("le collègue, symétriquement : son lot oui, celui de l'agent non", async () => {
    await session(collegue);
    expect(await charges(lotCollegue)).toBe(700);
    expect(await provisions(bailCollegue)).toBe(200);
    expect(await charges(lotAgent)).toBe(0);
    expect(await provisions(bailAgent)).toBe(0);
  });

  it("gestionnaire non restreint (administrateur de l'agence) : accès conservé à tous les lots", async () => {
    await session(admin);
    expect(await charges(lotAgent)).toBe(700);
    expect(await charges(lotCollegue)).toBe(700);
    expect(await provisions(bailAgent)).toBe(200);
    expect(await provisions(bailCollegue)).toBe(200);
  });

  it("compte d'une autre agence : toujours refusé (0)", async () => {
    await session(etranger);
    for (const lot of [lotAgent, lotCollegue]) expect(await charges(lot)).toBe(0);
    for (const bail of [bailAgent, bailCollegue]) expect(await provisions(bail)).toBe(0);
  });

  it("régularisation (seule appelante) : l'agent régularise son bail sur les vrais montants, pas celui du collègue", async () => {
    await session(agent);
    const ecart = await db.query("select public.regulariser_charges($1, $2, 0, $3, null) as v", [bailAgent, EXERCICE, justificatif]);
    expect(Number(ecart.rows[0].v)).toBe(200 - 700);
    const { rows: [reg] } = await db.query(
      "select provisions, charges_reelles from public.regularisations_charges where bail_id = $1 and annee = $2",
      [bailAgent, EXERCICE]
    );
    expect([Number(reg.provisions), Number(reg.charges_reelles)]).toEqual([200, 700]);
    await db.query("savepoint hors_portefeuille");
    await expect(
      db.query("select public.regulariser_charges($1, $2, 0, $3, null)", [bailCollegue, EXERCICE, justificatif])
    ).rejects.toThrow(/hors de votre portefeuille/);
    await db.query("rollback to savepoint hors_portefeuille");
  });

  it("même signature, SECURITY DEFINER, search_path vide ; ni public ni anon, authenticated et service_role", async () => {
    const { rows } = await db.query(
      `select p.oid::regprocedure::text as signature, p.prosecdef, p.proconfig, p.provolatile,
              pg_get_function_result(p.oid) as retour,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authentifie,
              has_function_privilege('service_role', p.oid, 'execute') as service,
              exists (select 1 from aclexplode(p.proacl) x where x.grantee = 0) as public
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('charges_recuperables_exercice', 'provisions_charges_annee')
       order by 1`
    );
    expect(rows).toEqual([
      { signature: "charges_recuperables_exercice(uuid,integer)", prosecdef: true, proconfig: ['search_path=""'],
        provolatile: "s", retour: "numeric", anon: false, authentifie: true, service: true, public: false },
      { signature: "provisions_charges_annee(uuid,integer)", prosecdef: true, proconfig: ['search_path=""'],
        provolatile: "s", retour: "numeric", anon: false, authentifie: true, service: true, public: false },
    ]);
  });

  it("avant / après : le retour rouvre la faille, la migration rejouée (deux fois) la referme", async () => {
    await db.query(retour);
    await session(agent);
    // Le défaut A03, rejoué : le texte de 20260910130000 laisse l'agent lire le lot du collègue.
    expect(await charges(lotCollegue)).toBe(700);
    expect(await provisions(bailCollegue)).toBe(200);
    await db.query("reset role");
    await db.query(migration);
    await db.query(migration);
    await session(agent);
    expect(await charges(lotCollegue)).toBe(0);
    expect(await provisions(bailCollegue)).toBe(0);
    expect(await charges(lotAgent)).toBe(700);
  });
});
