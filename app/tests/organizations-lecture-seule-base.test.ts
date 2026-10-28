/**
 * Audit final du 27/10/2026 (DRT-V01) — la fiche de l'organisation suit la lecture seule.
 *
 * `refuser_ecriture_si_fermee` garde les tables qui portent `organization_id`, pas `organizations` : pendant la
 * suspension, l'administrateur modifiait encore IBAN, adresse d'expédition et envois automatiques par l'API.
 * Migration 20261028100000_organizations_lecture_seule.sql : un déclencheur propre à la table refuse la mise à jour
 * d'un gestionnaire quand l'écriture est fermée ; le service (gerimmo.systeme) et la supervision passent.
 *
 * Transaction annulée à la fin. Nécessite SUPABASE_DB_URL (sinon ignoré).
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const MIGRATION = "20261028100000_organizations_lecture_seule";

describe("fiche de l'organisation en lecture seule (fichiers)", () => {
  it("la migration est rejouable, ferme ses fonctions, figure une fois au manifeste et a son retour", () => {
    const sql = readFileSync(`supabase/migrations/${MIGRATION}.sql`, "utf8");
    expect(sql).toContain("create or replace function public.organizations_refuser_ecriture_si_fermee()");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("drop trigger if exists abonnement_organizations on public.organizations;");
    expect(sql).toContain("revoke all on function public.organizations_refuser_ecriture_si_fermee() from public, anon, authenticated;");
    expect(sql.trim().endsWith("select public.fermer_fonctions_a_anon();")).toBe(true);
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${MIGRATION}.sql`)).toHaveLength(1);
    const retour = readFileSync(`supabase/retours-arriere/${MIGRATION}.retour.sql`, "utf8");
    expect(retour).toContain("drop trigger if exists abonnement_organizations on public.organizations;");
    expect(retour).toContain("drop function if exists public.organizations_refuser_ecriture_si_fermee();");
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    expect(lisezMoi).toContain(`${MIGRATION}.retour.sql`);
    // abonnement_appliquer cite aujourdhui_paris() : le retour est en tête de la chaîne « Ordre complet ».
    expect(lisezMoi).toMatch(/Ordre complet si tout doit être défait :\n`20261028100000`/);
    expect(sql).toContain("public.aujourdhui_paris()");
  });
});

describe.skipIf(!DB_URL)("fiche de l'organisation en lecture seule (base)", () => {
  let db: Client;
  let org = "", gestionnaire = "", superviseur = "";

  const agir = async (compte: string, aal = "aal1") => {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated', 'aal', $2::text)::text, true)`,
      [compte, aal],
    );
    await db.query("set local role authenticated");
  };
  const service = async () => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', '{}', true)");
    await db.query("select set_config('gerimmo.systeme', 'on', true)");
  };
  const essai = async (sql: string, params: unknown[] = []) => {
    await db.query("savepoint essai");
    try {
      const r = await db.query(sql, params);
      await db.query("release savepoint essai");
      return r;
    } catch (e) {
      await db.query("rollback to savepoint essai");
      throw e;
    }
  };
  const iban = async () => (await db.query("select iban from public.organizations where id = $1", [org])).rows[0].iban as string | null;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  beforeEach(async () => {
    await db.query("reset role; begin; select set_config('request.jwt.claims', '{}', true)");
    gestionnaire = randomUUID();
    superviseur = randomUUID();
    for (const id of [gestionnaire, superviseur]) {
      await db.query(
        `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
         values ($1, 'authenticated', 'authenticated', $2, 'x', now(), '{}', '{}')`,
        [id, `${id}@test.local`],
      );
    }
    org = (
      await db.query(
        `insert into public.organizations (name, type, status, address_line1, postal_code, city, email_contact)
         values ('TEST DRT-V01', 'agence', 'active', '1 rue Test', '75001', 'Paris', 'drtv01@test.local') returning id`,
      )
    ).rows[0].id;
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'admin_agence')", [gestionnaire, org]);
    await db.query("insert into public.memberships (account_id, role) values ($1, 'super_admin')", [superviseur]);
  });
  afterEach(async () => {
    await db.query("rollback; reset role");
  });
  afterAll(async () => {
    await db?.end();
  });

  it("le déclencheur est posé sur organizations et sa fonction fermée à anon et authenticated", async () => {
    const { rows } = await db.query(
      `select tgname from pg_trigger where tgrelid = 'public.organizations'::regclass and tgname = 'abonnement_organizations'`,
    );
    expect(rows).toHaveLength(1);
    const droits = await db.query(
      `select has_function_privilege('anon', 'public.organizations_refuser_ecriture_si_fermee()', 'execute') as anonyme,
              has_function_privilege('authenticated', 'public.organizations_refuser_ecriture_si_fermee()', 'execute') as compte`,
    );
    expect(droits.rows[0]).toEqual({ anonyme: false, compte: false });
  });

  it("écriture ouverte : l'administrateur modifie sa fiche ; suspendue par la supervision : refus 23514, rien n'est réécrit", async () => {
    await agir(gestionnaire);
    await essai("update public.organizations set iban = 'FR7630006000011234567890189' where id = $1", [org]);
    expect(await iban()).toBe("FR7630006000011234567890189");

    // La supervision suspend (son geste, par la fonction prévue), ce qui ferme l'écriture.
    await agir(superviseur, "aal2");
    expect((await essai("select public.controler_organisation($1, 'suspendre', null, 'TEST DRT-V01') r", [org])).rows[0].r).toBe("suspendue");
    await db.query("reset role");
    expect((await db.query("select public.org_ecriture_ouverte($1) o", [org])).rows[0].o).toBe(false);

    await agir(gestionnaire);
    await expect(
      essai("update public.organizations set iban = 'FR7630006000011234567890190', quittances_envoi_auto = true where id = $1", [org]),
    ).rejects.toMatchObject({ code: "23514", message: expect.stringMatching(/lecture seule/) });
    await expect(essai("update public.organizations set email_expediteur = 'af@example.com' where id = $1", [org])).rejects.toMatchObject({ code: "23514" });
    expect(await iban()).toBe("FR7630006000011234567890189");
  });

  it("pendant la suspension, le service et la supervision passent, et la réactivation rouvre la fiche", async () => {
    await agir(superviseur, "aal2");
    await essai("select public.controler_organisation($1, 'suspendre', null, 'TEST DRT-V01') r", [org]);

    // Le service (tâches, Stripe) : réglage local de sa transaction.
    await service();
    await essai("update public.organizations set code_parrainage = 'DRTV0100' where id = $1", [org]);
    expect((await db.query("select code_parrainage from public.organizations where id = $1", [org])).rows[0].code_parrainage).toBe("DRTV0100");

    // La supervision réactive : son geste passe la garde, et l'administrateur écrit de nouveau.
    await agir(superviseur, "aal2");
    expect((await essai("select public.controler_organisation($1, 'reactiver', null, 'TEST DRT-V01 fin') r", [org])).rows[0].r).toBe("active");
    await agir(gestionnaire);
    await essai("update public.organizations set iban = 'FR7630006000011234567890189' where id = $1", [org]);
    expect(await iban()).toBe("FR7630006000011234567890189");
  });

  // DRT-04 : la suspension par la supervision se distingue de l'impayé, pour les seuls gestionnaires de l'organisation.
  it("org_suspendue_par_supervision : vrai après suspendre, faux après réactiver, faux pour l'impayé et hors de l'organisation", async () => {
    const lire = async (compte: string) => {
      await agir(compte);
      return (await essai("select public.org_suspendue_par_supervision($1) s", [org])).rows[0].s as boolean;
    };
    expect(await lire(gestionnaire)).toBe(false);
    await agir(superviseur, "aal2");
    await essai("select public.controler_organisation($1, 'suspendre', null, 'TEST DRT-04') r", [org]);
    expect(await lire(gestionnaire)).toBe(true);
    // Un compte étranger à l'organisation n'apprend rien.
    const etranger = randomUUID();
    await db.query("reset role");
    await db.query(
      `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
       values ($1, 'authenticated', 'authenticated', $2, 'x', now(), '{}', '{}')`, [etranger, `${etranger}@test.local`]);
    expect(await lire(etranger)).toBe(false);
    // Une seule transaction pour tout le test : now() ne bouge pas. Le geste précédent est daté une minute plus tôt,
    // comme il le serait entre deux requêtes réelles.
    await db.query("reset role");
    await db.query("update public.audit_log set created_at = created_at - interval '1 minute' where organization_id = $1", [org]);
    await agir(superviseur, "aal2");
    await essai("select public.controler_organisation($1, 'reactiver', null, 'TEST DRT-04 fin') r", [org]);
    expect(await lire(gestionnaire)).toBe(false);
    // L'impayé pose aussi « suspendue » (abonnement_appliquer) : sans geste de supervision, ce n'est pas une suspension par Gerimmo.
    await service();
    await essai("update public.organizations set status = 'suspendue' where id = $1", [org]);
    expect(await lire(gestionnaire)).toBe(false);
    await db.query("reset role");
    const droits = await db.query(`select has_function_privilege('anon', 'public.org_suspendue_par_supervision(uuid)', 'execute') as a`);
    expect(droits.rows[0].a).toBe(false);
  });

  // Décision déléguée du dirigeant (relecture du 28/10) : un événement Stripe ne lève jamais une suspension de la supervision.
  it("abonnement_appliquer : Stripe « active » ne lève pas une suspension de la supervision, mais lève celle de l'impayé", async () => {
    await db.query("reset role");
    await db.query("insert into public.abonnements (organization_id, stripe_customer_id) values ($1, 'cus_test_drt04')", [org]);
    const appliquer = async () => {
      await db.query("reset role");
      await essai("select public.abonnement_appliquer('cus_test_drt04', 'sub_test', 'active', 1, now() + interval '1 month', false)");
      return (await db.query("select status from public.organizations where id = $1", [org])).rows[0].status as string;
    };
    await agir(superviseur, "aal2");
    await essai("select public.controler_organisation($1, 'suspendre', null, 'TEST DRT-04 Stripe') r", [org]);
    expect(await appliquer()).toBe("suspendue");
    expect((await db.query("select details->>'motif' m from public.audit_log where organization_id = $1 and action = 'abonnement_statut_retenu'", [org])).rows[0]?.m).toBe("suspension_supervision");
    // Réactivée par la supervision, puis suspendue pour impayé (service) : Stripe rouvre comme avant.
    await db.query("update public.audit_log set created_at = created_at - interval '1 minute' where organization_id = $1", [org]);
    await agir(superviseur, "aal2");
    await essai("select public.controler_organisation($1, 'reactiver', null, 'TEST DRT-04 Stripe fin') r", [org]);
    await service();
    await essai("update public.organizations set status = 'suspendue' where id = $1", [org]);
    expect(await appliquer()).toBe("active");
  });

  it("la migration se rejoue sans erreur et son retour retire le déclencheur et la fonction", async () => {
    await db.query("reset role");
    await db.query(readFileSync(`supabase/migrations/${MIGRATION}.sql`, "utf8"));
    expect((await db.query("select count(*)::int n from pg_trigger where tgname = 'abonnement_organizations'")).rows[0].n).toBe(1);
    // Le retour, sans son enveloppe de transaction (la transaction du test en tient lieu).
    const retour = readFileSync(`supabase/retours-arriere/${MIGRATION}.retour.sql`, "utf8")
      .split("\n")
      .filter((l) => !/^(begin|commit);$/.test(l.trim()) && !/^set local lock_timeout/.test(l.trim()))
      .join("\n");
    await db.query(retour);
    expect((await db.query("select count(*)::int n from pg_trigger where tgname = 'abonnement_organizations'")).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from pg_proc where proname in ('organizations_refuser_ecriture_si_fermee', 'org_suspendue_par_supervision', 'suspension_par_supervision', 'niveau_assurance_suffisant', 'poser_gardes_second_facteur', 'exiger_second_facteur')")).rows[0].n).toBe(0);
    // La garde centrale de l'API est retirée de la configuration de PostgREST ; la fermeture à anon et la demande
    // d'archive retrouvent leur texte d'avant.
    const preRequete = "select count(*)::int n from pg_db_role_setting r, unnest(r.setconfig) s where r.setrole = to_regrole('authenticator') and s like 'pgrst.db_pre_request=%'";
    expect((await db.query(preRequete)).rows[0].n).toBe(0);
    expect((await db.query("select prosrc from pg_proc where proname = 'fermer_fonctions_a_anon'")).rows[0].prosrc).toContain("array[]::text[]");
    expect((await db.query("select prosrc from pg_proc where proname = 'demander_export_complet'")).rows[0].prosrc).not.toContain("niveau_assurance_suffisant");
    expect((await db.query("select count(*)::int n from pg_policy where polname = 'second_facteur'")).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from pg_proc where prosrc like '%uid_second_facteur()%'")).rows[0].n).toBe(0);
    // abonnement_appliquer a retrouvé son texte d'avant (sans la garde de la supervision).
    expect((await db.query("select prosrc from pg_proc where proname = 'abonnement_appliquer'")).rows[0].prosrc).not.toContain("suspension_par_supervision");
    // Et la marche avant se rejoue à l'identique.
    await db.query(readFileSync(`supabase/migrations/${MIGRATION}.sql`, "utf8"));
    expect((await db.query("select count(*)::int n from pg_trigger where tgname = 'abonnement_organizations'")).rows[0].n).toBe(1);
    expect((await db.query(preRequete.replace("count(*)::int n", "s"))).rows.map((r) => r.s)).toEqual(["pgrst.db_pre_request=public.exiger_second_facteur"]);
  });
});
