/**
 * Relecture adverse du 23/10/2026 — « Annonces d'un bien : correctif à moitié ».
 *
 * Le lot du 23/10 (TST-5) a fait filtrer la fiche agence d'un bien sur le jour de Paris (`aujourdhuiParis()`). Le
 * locataire, lui, lit ses annonces par `mes_annonces_locataire`, qui comparait toujours `visible_jusquau` au jour de la
 * session (`current_date`, UTC en production). Une annonce « visible jusqu'au 30/11 » quittait la fiche agence le 01/12
 * à 0 h à Paris, mais son destinataire la voyait encore jusqu'à 1 h ou 2 h : l'agence et le locataire ne voyaient plus
 * la même chose. La migration 20261023184512 fait lire la fonction au jour de Paris (`public.aujourdhui_paris()`).
 *
 * L'heure de Paris entre minuit et 2 h est reproduite en figeant `aujourdhui_paris()` au lendemain du jour de la session,
 * le temps de la transaction du fichier (annulée à la fin), comme les autres essais du jour de Paris. La migration et son
 * retour y sont joués, d'où le classement en série (vitest.config.ts). Nécessite SUPABASE_DB_URL.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const VERSION = "20261023184512";
const NOM = `${VERSION}_annonces_locataire_jour_paris`;
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");

describe("migration : l'en-tête et le retour suivent les conventions (sans base)", () => {
  it("la migration cite le jour de Paris, ferme les fonctions à anon et nomme son retour", () => {
    const code = migration.replace(/--.*$/gm, "");
    expect(code).toContain("a.visible_jusquau >= public.aujourdhui_paris()");
    expect(code).not.toMatch(/\bcurrent_date\b/);
    expect(code).toContain("set search_path = ''");
    expect(code).toContain("revoke execute on function public.mes_annonces_locataire(uuid) from public, anon;");
    expect(code).toContain("select public.fermer_fonctions_a_anon();");
    expect(migration).toContain(`supabase/retours-arriere/${NOM}.retour.sql`);
  });

  it("le retour est une seule instruction DO atomique qui retire sa version d'historique", () => {
    expect(retour.replace(/--.*$/gm, "").trim()).toMatch(/^do \$retour_atomique\$[\s\S]*\$retour_atomique\$;$/);
    expect(retour).toContain(`delete from supabase_migrations.schema_migrations where version = '${VERSION}'`);
    expect(retour).toContain("a.visible_jusquau >= current_date");
  });
});

describe.skipIf(!url)("annonces du locataire au jour de Paris (avec base)", () => {
  let db: Client;
  let org = "";
  let locataire = "";

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

  /** Les textes des annonces que lit le locataire, par la fonction, sous son identité. */
  async function luesParLeLocataire(): Promise<string[]> {
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [locataire]
    );
    await db.query("set local role authenticated");
    try {
      const { rows } = await db.query<{ texte: string }>("select texte from public.mes_annonces_locataire($1)", [org]);
      return rows.map((r) => r.texte).sort();
    } finally {
      await db.query("reset role");
    }
  }

  /** Ce que la fiche agence du bien montre (`.gte("visible_jusquau", aujourdhuiParis())`), plus les annonces d'agence. */
  async function montreesParLAgence(bien: string): Promise<string[]> {
    const { rows } = await db.query<{ texte: string }>(
      `select texte from public.annonces
        where organization_id = $1 and (bien_id is null or bien_id = $2) and visible_jusquau >= public.aujourdhui_paris()`,
      [org, bien]
    );
    return rows.map((r) => r.texte).sort();
  }

  let bien = "";

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    const { rows: [o] } = await db.query<{ id: string }>(
      `insert into public.organizations (name, status, type)
       values ('Cabinet annonces', 'active'::public.organization_status, 'agence'::public.organization_type) returning id`
    );
    org = o.id;
    const gerant = await compte("annonces-gerant");
    locataire = await compte("annonces-locataire");
    await db.query(
      "insert into public.memberships (account_id, organization_id, role) values ($1, $3, 'admin_agence'), ($2, $3, 'locataire')",
      [gerant, locataire, org]
    );
    const { rows: biens } = await db.query<{ id: string; nom: string }>(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1, 'Résidence du locataire', 'immeuble', '1 rue A', '75011', 'Paris'),
              ($1, 'Autre résidence', 'immeuble', '2 rue B', '75011', 'Paris')
       returning id, nom`,
      [org]
    );
    bien = biens.find((b) => b.nom === "Résidence du locataire")!.id;
    const autreBien = biens.find((b) => b.nom === "Autre résidence")!.id;
    const { rows: [lot] } = await db.query<{ id: string }>(
      "insert into public.lots (bien_id, organization_id, nom, etat) values ($1, $2, 'Appartement 3', 'loue') returning id",
      [bien, org]
    );
    const { rows: [bailleur] } = await db.query<{ id: string }>(
      "insert into public.persons (organization_id, nom) values ($1, 'Bailleur annonces') returning id",
      [org]
    );
    await db.query(
      "insert into public.detentions (lot_id, organization_id, person_id, quote_part, date_debut) values ($1, $2, $3, 100, current_date - 400)",
      [lot.id, org, bailleur.id]
    );
    const { rows: [personne] } = await db.query<{ id: string }>(
      "insert into public.persons (organization_id, account_id, nom, prenom) values ($1, $2, 'Locataire', 'Annonces') returning id",
      [org, locataire]
    );
    await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat, date_debut, loyer_hc, charges)
       values ($1, $2, $3, 'actif', current_date - 200, 650, 50)`,
      [org, lot.id, personne.id]
    );
    // Le jour de la session (UTC) est J ; à Paris, entre minuit et 2 h, on est déjà J + 1.
    await db.query(
      `insert into public.annonces (organization_id, bien_id, texte, visible_jusquau) values
         ($1, $2, 'échue la veille à Paris', current_date),
         ($1, $2, 'visible jusqu''à ce jour de Paris', current_date + 1),
         ($1, null, 'annonce de toute l''agence', current_date + 1),
         ($1, $3, 'annonce d''un autre bien', current_date + 5)`,
      [org, bien, autreBien]
    );
    await db.query(
      "create or replace function public.aujourdhui_paris() returns date language sql stable set search_path = '' as $$ select current_date + 1 $$"
    );
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
  });

  it("entre minuit et 2 h à Paris, le locataire ne lit plus l'annonce échue la veille", async () => {
    expect(await luesParLeLocataire()).toEqual(["annonce de toute l'agence", "visible jusqu'à ce jour de Paris"]);
  });

  it("le locataire lit, pour son bien, exactement ce que montre la fiche agence", async () => {
    expect(await luesParLeLocataire()).toEqual(await montreesParLAgence(bien));
  });

  it("la fonction lit le jour de Paris, plus le jour de la session ; droits inchangés", async () => {
    const { rows: [f] } = await db.query<{ corps: string; anon: boolean; publique: boolean; auth: boolean; service: boolean; definer: boolean }>(
      `select pg_get_functiondef(p.oid) as corps, p.prosecdef as definer,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('service_role', p.oid, 'execute') as service,
              exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       where a.grantee = 0 and a.privilege_type = 'EXECUTE') as publique
         from pg_proc p where p.oid = 'public.mes_annonces_locataire(uuid)'::regprocedure`
    );
    expect(f.corps).toContain("a.visible_jusquau >= public.aujourdhui_paris()");
    expect(f.corps).not.toMatch(/\bcurrent_date\b/);
    expect(f.corps).toContain("SET search_path TO ''");
    expect(f.definer).toBe(true);
    expect([f.anon, f.publique, f.auth, f.service]).toEqual([false, false, true, true]);
  });

  it("rejouable : jouée une seconde fois, même définition et même lecture", async () => {
    const definition = async () =>
      (await db.query<{ d: string }>("select pg_get_functiondef('public.mes_annonces_locataire(uuid)'::regprocedure) as d")).rows[0].d;
    const avant = await definition();
    await db.query(migration);
    expect(await definition()).toBe(avant);
    expect(await luesParLeLocataire()).toEqual(["annonce de toute l'agence", "visible jusqu'à ce jour de Paris"]);
  });

  it("retour : le jour de la session revient (l'annonce échue réapparaît), la version part ; réapplication", async () => {
    await db.query(
      "insert into supabase_migrations.schema_migrations (version, name) values ($1, 'annonces_locataire_jour_paris') on conflict do nothing",
      [VERSION]
    );
    await db.query(retour);
    const { rows: [f] } = await db.query<{ corps: string }>(
      "select pg_get_functiondef('public.mes_annonces_locataire(uuid)'::regprocedure) as corps"
    );
    expect(f.corps).toContain("a.visible_jusquau >= current_date");
    expect(f.corps).not.toContain("aujourdhui_paris");
    expect(await luesParLeLocataire()).toEqual([
      "annonce de toute l'agence",
      "visible jusqu'à ce jour de Paris",
      "échue la veille à Paris",
    ]);
    const { rowCount } = await db.query("select 1 from supabase_migrations.schema_migrations where version = $1", [VERSION]);
    expect(rowCount).toBe(0);
    // Retour rejoué : sans effet de plus.
    await db.query(retour);
    // Réapplication : la correction revient.
    await db.query(migration);
    expect(await luesParLeLocataire()).toEqual(["annonce de toute l'agence", "visible jusqu'à ce jour de Paris"]);
  });
});
