/**
 * Audit final du 27/10/2026, relecture du 28/10 (PUB-01) — le second facteur activé protège aussi les DONNÉES.
 *
 * Le sas /securite ne gardait que les écrans : avec le mot de passe seul, un jeton aal1 obtenu par l'API publique lisait
 * et écrivait tout ce que la RLS ouvre au titulaire. Migration 20261028100000 : politique restrictive « second_facteur »
 * (niveau_assurance_suffisant()) sur toutes les tables de public sous RLS et sur storage.objects, même condition dans
 * les portes communes des fonctions SECURITY DEFINER. Un compte sans facteur, une session aal2 et la supervision ne
 * changent pas.
 *
 * Transaction annulée à chaque test. Nécessite SUPABASE_DB_URL (sinon ignoré).
 */
import { randomUUID } from "node:crypto";
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("second facteur exigé par la base (PUB-01)", () => {
  let db: Client;
  let org = "", titulaire = "", sansFacteur = "", superviseur = "", personne = "";

  const agir = async (compte: string, aal: string) => {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated', 'aal', $2::text)::text, true)`, [compte, aal]);
    await db.query("set local role authenticated");
  };
  const essai = async (sql: string, params: unknown[] = []) => {
    await db.query("savepoint essai");
    try { const r = await db.query(sql, params); await db.query("release savepoint essai"); return r; }
    catch (e) { await db.query("rollback to savepoint essai"); throw e; }
  };
  const compte = async () => {
    const id = randomUUID();
    await db.query(`insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
                    values ($1, 'authenticated', 'authenticated', $2, 'x', now(), '{}', '{}')`, [id, `${id}@test.local`]);
    return id;
  };

  beforeAll(async () => { db = new Client({ connectionString: DB_URL }); await db.connect(); });
  beforeEach(async () => {
    await db.query("reset role; begin; select set_config('request.jwt.claims', '{}', true)");
    [titulaire, sansFacteur, superviseur] = [await compte(), await compte(), await compte()];
    org = (await db.query(`insert into public.organizations (name, type, status, address_line1, postal_code, city, email_contact)
                           values ('TEST PUB-01', 'proprietaire_direct', 'active', '1 rue Test', '75001', 'Paris', 'pub01@test.local') returning id`)).rows[0].id;
    for (const id of [titulaire, sansFacteur]) await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'proprietaire_direct')", [id, org]);
    await db.query("insert into public.memberships (account_id, role) values ($1, 'super_admin')", [superviseur]);
    personne = (await db.query("insert into public.persons (organization_id, nom, prenom) values ($1, 'TEST', 'Locataire') returning id", [org])).rows[0].id;
    // Le titulaire et le superviseur ont un facteur vérifié ; l'autre gestionnaire n'en a pas.
    for (const id of [titulaire, superviseur]) await db.query("insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status) values (gen_random_uuid(), $1, 'TEST', 'totp', 'verified')", [id]);
  });
  afterEach(async () => { await db.query("rollback; reset role"); });
  afterAll(async () => { await db?.end(); });

  it("la politique restrictive est posée sur toutes les tables de public sous RLS et sur storage.objects", async () => {
    const { rows: [r] } = await db.query(`
      select count(*) filter (where c.relrowsecurity) as rls,
             count(*) filter (where c.relrowsecurity and exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'second_facteur' and not p.polpermissive)) as gardees
        from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')`);
    expect(Number(r.gardees)).toBe(Number(r.rls));
    expect(Number(r.rls)).toBeGreaterThan(100);
    expect((await db.query("select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'second_facteur' and not polpermissive")).rows).toHaveLength(1);
  });

  it("jeton aal1 d'un compte à facteur : aucune ligne, aucune écriture, aucune porte SECURITY DEFINER ; ses rôles restent lisibles", async () => {
    await agir(titulaire, "aal1");
    expect((await essai("select id from public.persons where organization_id = $1", [org])).rows).toHaveLength(0);
    expect((await essai("select id from public.organizations where id = $1", [org])).rows).toHaveLength(0);
    expect((await essai("update public.organizations set telephone = '0102030405' where id = $1", [org])).rowCount).toBe(0);
    await expect(essai("insert into public.persons (organization_id, nom) values ($1, 'INTRUS')", [org])).rejects.toMatchObject({ code: "42501" });
    expect((await essai("select public.org_ids_avec_roles(array['proprietaire_direct']::public.membership_role[]) o")).rows).toHaveLength(0);
    expect((await essai("select public.has_org_role($1, array['proprietaire_direct']::public.membership_role[]) h", [org])).rows[0].h).toBe(false);
    await expect(essai("select * from public.parcours_demarrage($1)", [org])).rejects.toThrow(/Accès refusé/);
    // Le proxy et la page du sas lisent les rôles du compte avant le code.
    expect((await essai("select role from public.memberships where account_id = $1", [titulaire])).rows.map((r) => r.role)).toEqual(["proprietaire_direct"]);
    expect((await essai("select public.niveau_assurance_suffisant() n")).rows[0].n).toBe(false);
  });

  // Les fonctions SECURITY DEFINER contournent la RLS : l'identité y est neutralisée (uid_second_facteur), jamais NULL —
  // NULL vaut « tâche du système » dans plusieurs d'entre elles.
  it("fonctions SECURITY DEFINER en aal1 avec facteur : ni données du titulaire, ni passage pour une tâche du système", async () => {
    await db.query("reset role");
    const locataire = await compte();
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'locataire')", [locataire, org]);
    await db.query("update public.persons set account_id = $1 where id = $2", [locataire, personne]);
    await db.query("insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status) values (gen_random_uuid(), $1, 'TEST', 'totp', 'verified')", [locataire]);
    await agir(locataire, "aal2");
    expect((await essai("select * from public.mon_espace_locataire($1)", [org])).rows).toHaveLength(1);
    await agir(locataire, "aal1");
    expect((await essai("select * from public.mon_espace_locataire($1)", [org])).rows).toHaveLength(0);
    expect((await essai("select public.uid_second_facteur() u")).rows[0].u).toBe("00000000-0000-0000-0000-000000000000");
    await expect(essai("select public.generer_alertes_assurance()")).rejects.toThrow(/reserve au cron/);
    // Seule exception : la session courante, lue par le proxy avant le code.
    const { rows } = await db.query(`select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and p.prorettype <> 'trigger'::regtype and has_function_privilege('authenticated', p.oid, 'EXECUTE') and p.prosrc like '%auth.uid()%' order by 1`);
    expect(rows.map((r) => r.proname)).toEqual(["ma_session_active", "niveau_assurance_suffisant", "uid_second_facteur"]);
  });

  it("le même compte en aal2, un compte sans facteur en aal1 : inchangés", async () => {
    for (const [id, aal] of [[titulaire, "aal2"], [sansFacteur, "aal1"]] as const) {
      await agir(id, aal);
      expect((await essai("select id from public.persons where id = $1", [personne])).rows).toHaveLength(1);
      expect((await essai("update public.organizations set telephone = '0102030405' where id = $1", [org])).rowCount).toBe(1);
      expect((await essai("select public.has_org_role($1, array['proprietaire_direct']::public.membership_role[]) h", [org])).rows[0].h).toBe(true);
    }
  });

  it("la supervision en aal2 lit toujours ; en aal1 elle ne lit rien (règle d'avant)", async () => {
    await agir(superviseur, "aal2");
    expect((await essai("select public.is_super_admin() s")).rows[0].s).toBe(true);
    expect((await essai("select id from public.organizations where id = $1", [org])).rows).toHaveLength(1);
    await agir(superviseur, "aal1");
    expect((await essai("select id from public.organizations where id = $1", [org])).rows).toHaveLength(0);
  });

  it("anon et le service ne sont pas concernés", async () => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
    await db.query("set local role service_role");
    expect((await essai("select id from public.persons where id = $1", [personne])).rows).toHaveLength(1);
    await db.query("reset role");
  });
});
