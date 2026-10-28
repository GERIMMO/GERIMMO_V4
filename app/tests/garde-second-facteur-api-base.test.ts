/**
 * Audit final, seconde relecture du 28/10/2026 (PUB-01) — la garde CENTRALE du second facteur devant l'API.
 *
 * La politique restrictive « second_facteur » ne garde que les tables : les fonctions SECURITY DEFINER contournent la
 * RLS, et plus de deux cents d'entre elles reconnaissent l'appelant par auth.uid(). Avec le mot de passe seul, un jeton
 * aal1 lisait l'échéancier du locataire, ses quittances, l'export de l'artisan, et créait un encaissement. Migration
 * 20261028100000 : exiger_second_facteur(), fonction de pré-requête de PostgREST (`pgrst.db_pre_request` du rôle
 * authenticator), refuse toute requête REST, RPC et GraphQL d'un compte à facteur resté en aal1, sauf ce que le sas lit
 * pour décider (ses adhésions, sa session).
 *
 * Ce fichier tient : (1) l'inventaire — tant qu'une fonction SECURITY DEFINER exécutable par authenticated reconnaît
 * l'appelant par son jeton, la garde doit être configurée ; (2) la configuration elle-même ; (3) la décision de la
 * garde pour chaque fonction de l'inventaire, une table, GraphQL, la liste blanche, aal2, un compte sans facteur, anon
 * et le service ; (4) la preuve récente de demander_export_complet. Le rejeu par l'API du banc est dans
 * garde-second-facteur-api-banc.test.ts.
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

const GARDE = "public.exiger_second_facteur";

describe.skipIf(!DB_URL)("garde centrale du second facteur devant l'API (PUB-01, seconde relecture)", () => {
  let db: Client;
  let org = "", titulaire = "", sansFacteur = "", nonVerifie = "";

  const compte = async () => {
    const id = randomUUID();
    await db.query(`insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
                    values ($1, 'authenticated', 'authenticated', $2, 'x', now(), '{}', '{}')`, [id, `${id}@test.local`]);
    return id;
  };
  /** Une requête de l'API telle que PostgREST la prépare : identité, rôle, méthode et chemin, puis la pré-requête. */
  const requete = async (claims: Record<string, unknown> | null, methode: string, chemin: string) => {
    await db.query("savepoint essai");
    try {
      await db.query("reset role");
      await db.query("select set_config('request.jwt.claims', $1, true), set_config('request.method', $2, true), set_config('request.path', $3, true)",
        [JSON.stringify(claims ?? { role: "anon" }), methode, chemin]);
      await db.query(`set local role ${claims?.role === "authenticated" || claims?.role === "service_role" ? claims.role : "anon"}`);
      await db.query(`select ${GARDE}()`);
      await db.query("release savepoint essai");
      return "passe";
    } catch (e) {
      await db.query("rollback to savepoint essai");
      const err = e as { code?: string; message?: string };
      return `${err.code} ${err.message}`;
    }
  };
  const jeton = (sub: string, aal: string) => ({ sub, role: "authenticated", aal });
  const refus = /^42501 Second facteur requis/;

  beforeAll(async () => { db = new Client({ connectionString: DB_URL }); await db.connect(); });
  beforeEach(async () => {
    await db.query("reset role; begin; select set_config('request.jwt.claims', '{}', true)");
    [titulaire, sansFacteur, nonVerifie] = [await compte(), await compte(), await compte()];
    org = (await db.query(`insert into public.organizations (name, type, status, address_line1, postal_code, city, email_contact)
                           values ('TEST PUB-01 garde', 'proprietaire_direct', 'active', '1 rue Test', '75001', 'Paris', 'garde@test.local') returning id`)).rows[0].id;
    for (const id of [titulaire, sansFacteur, nonVerifie]) await db.query("insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'proprietaire_direct')", [id, org]);
    await db.query("insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status) values (gen_random_uuid(), $1, 'TEST', 'totp', 'verified')", [titulaire]);
    // Un facteur commencé mais jamais vérifié ne protège rien : le compte reste « sans facteur ».
    await db.query("insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status) values (gen_random_uuid(), $1, 'TEST', 'totp', 'unverified')", [nonVerifie]);
  });
  afterEach(async () => { await db.query("rollback; reset role"); });
  afterAll(async () => { await db?.end(); });

  const inventaire = async () => (await db.query<{ proname: string }>(`
    select distinct p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prokind = 'f'
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
       and p.prosrc ~ '(auth\\.(uid|jwt)|uid_second_facteur)\\(\\)'
     order by p.proname`)).rows.map((r) => r.proname);
  const preRequeteConfiguree = async () => (await db.query<{ valeur: string }>(`
    select substr(s, length('pgrst.db_pre_request=') + 1) as valeur
      from pg_db_role_setting r, unnest(r.setconfig) s
     where r.setrole = to_regrole('authenticator') and r.setdatabase in (0, (select oid from pg_database where datname = current_database()))
       and s like 'pgrst.db_pre_request=%' order by r.setdatabase desc limit 1`)).rows[0]?.valeur ?? null;

  it("inventaire : des fonctions SECURITY DEFINER reconnaissent l'appelant par son jeton ⇒ la garde centrale est configurée", async () => {
    const fonctions = await inventaire();
    // Plus de deux cents au 28/10 (mon_echeancier_locataire, quittance_document, declarer_reception_loyer…) : tant qu'il
    // en reste une, l'API doit passer par la garde. Une nouvelle fonction n'a rien à faire pour être couverte.
    expect(fonctions.length).toBeGreaterThan(100);
    for (const f of ["mon_echeancier_locataire", "quittance_detail", "quittance_document", "export_artisan_plateforme", "declarer_reception_loyer", "demander_export_complet"]) {
      expect(fonctions, f).toContain(f);
    }
    expect(await preRequeteConfiguree(),
      `${fonctions.length} fonctions SECURITY DEFINER exécutables par authenticated reconnaissent l'appelant par auth.uid()/auth.jwt() : ` +
      "sans `alter role authenticator set pgrst.db_pre_request = 'public.exiger_second_facteur'`, un jeton aal1 d'un compte à second facteur les appelle.",
    ).toBe(GARDE);
    // Et la fonction configurée existe dans CETTE base : PostgREST échouerait sur chaque requête sinon.
    expect((await db.query("select to_regprocedure($1) is not null as presente", [`${GARDE}()`])).rows[0].presente).toBe(true);
  });

  it("configuration : le rôle de PostgREST appelle la garde ; elle est SECURITY DEFINER, sans search_path, ouverte à tous les rôles de l'API", async () => {
    expect((await db.query("select to_regrole('authenticator') is not null as present")).rows[0].present).toBe(true);
    expect(await preRequeteConfiguree()).toBe(GARDE);
    const { rows } = await db.query(`
      select p.prosecdef, p.provolatile, p.proconfig, format_type(p.prorettype, null) as retour,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as authentifie,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as service
        from pg_proc p where p.oid = 'public.exiger_second_facteur()'::regprocedure`);
    expect(rows[0]).toMatchObject({ prosecdef: true, provolatile: "s", retour: "void", anon: true, authentifie: true, service: true });
    expect(rows[0].proconfig).toEqual(['search_path=""']);
  });

  it("aal1 avec facteur vérifié : chaque fonction de l'inventaire, une table, GraphQL et toute écriture sont refusés (403)", async () => {
    const fonctions = await inventaire();
    const passent: string[] = [];
    // ma_session_active, seule fonction de la liste blanche (cas suivant), est lue par le proxy avant le code.
    expect(fonctions).toContain("ma_session_active");
    for (const f of fonctions.filter((nom) => nom !== "ma_session_active")) {
      const r = await requete(jeton(titulaire, "aal1"), "POST", `/rpc/${f}`);
      if (!refus.test(r)) passent.push(`${f} : ${r}`);
    }
    expect(passent).toEqual([]);
    for (const [methode, chemin] of [["GET", "/persons"], ["GET", "/quittances"], ["PATCH", "/organizations"], ["POST", "/encaissements"],
      ["POST", "/rpc/graphql"], ["PATCH", "/memberships"], ["DELETE", "/memberships"], ["GET", "/rpc/mon_echeancier_locataire"]]) {
      expect(await requete(jeton(titulaire, "aal1"), methode, chemin), `${methode} ${chemin}`).toMatch(refus);
    }
  });

  it("aal1 avec facteur : seuls passent la lecture des adhésions et de la session, dont le sas a besoin avant le code", async () => {
    for (const [methode, chemin] of [["GET", "/memberships"], ["HEAD", "/memberships"], ["POST", "/rpc/ma_session_active"], ["GET", "/rpc/ma_session_active"]]) {
      expect(await requete(jeton(titulaire, "aal1"), methode, chemin), `${methode} ${chemin}`).toBe("passe");
    }
    // Le préfixe de la passerelle ne change rien ; un chemin voisin n'est pas dans la liste.
    expect(await requete(jeton(titulaire, "aal1"), "GET", "/rest/v1/memberships")).toBe("passe");
    expect(await requete(jeton(titulaire, "aal1"), "GET", "/memberships_x")).toMatch(refus);
    expect(await requete(jeton(titulaire, "aal1"), "POST", "/rpc/ma_session_active_x")).toMatch(refus);
  });

  it("inchangés : le même compte en aal2, un compte sans facteur, un facteur non vérifié, anon, le service", async () => {
    for (const claims of [jeton(titulaire, "aal2"), jeton(sansFacteur, "aal1"), jeton(nonVerifie, "aal1"), null, { role: "service_role" }]) {
      for (const [methode, chemin] of [["POST", "/rpc/declarer_reception_loyer"], ["GET", "/persons"], ["POST", "/rpc/graphql"]]) {
        expect(await requete(claims, methode, chemin), `${JSON.stringify(claims)} ${methode} ${chemin}`).toBe("passe");
      }
    }
  });

  it("une seule lecture indexée des facteurs, et aucune pour aal2 ou anon", async () => {
    const plan = (await db.query("explain select 1 from auth.mfa_factors f where f.user_id = $1 and f.status = 'verified'", [titulaire])).rows
      .map((r) => r["QUERY PLAN"]).join("\n");
    // La table du banc est minuscule : le planificateur peut préférer la lecture séquentielle ; l'index doit exister.
    expect((await db.query("select count(*)::int n from pg_index i where i.indrelid = 'auth.mfa_factors'::regclass and (select attname from pg_attribute where attrelid = i.indrelid and attnum = i.indkey[0]) = 'user_id'")).rows[0].n).toBeGreaterThan(0);
    expect(plan).toMatch(/mfa_factors/);
    const src = (await db.query("select prosrc from pg_proc where oid = 'public.exiger_second_facteur()'::regprocedure")).rows[0].prosrc as string;
    // Le jeton aal2 et l'absence d'identité sortent avant toute lecture.
    expect(src.indexOf("'aal2'")).toBeLessThan(src.indexOf("auth.mfa_factors"));
    expect(src.match(/auth\.mfa_factors/g)).toHaveLength(1);
  });

  it("les archives rejouent les politiques de lecture sans la garde de session : un compte à facteur y retrouve ses lignes", async () => {
    await db.query("insert into public.persons (organization_id, nom, prenom) values ($1, 'TEST', 'Archive')", [org]);
    for (const compteId of [titulaire, sansFacteur]) {
      const { rows } = await db.query("select jsonb_array_length(public.lignes_lisibles_par('public.persons'::regclass, $1, $2, $3)) n", ["$T.organization_id = $1", org, compteId]);
      expect(rows[0].n, compteId === titulaire ? "compte à facteur" : "compte sans facteur").toBe(1);
    }
  });

  it("demander_export_complet : pour un compte à facteur, le mot de passe récent ne suffit plus ; sans facteur, inchangé", async () => {
    const appel = async (sub: string, aal: string) => {
      await db.query("savepoint essai");
      try {
        await db.query("reset role");
        const amr = [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }];
        await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role: "authenticated", aal, amr })]);
        await db.query("set local role authenticated");
        const r = await db.query("select public.demander_export_complet($1) id", [org]);
        await db.query("rollback to savepoint essai");
        return r.rows[0].id ? "cree" : "rien";
      } catch (e) {
        await db.query("rollback to savepoint essai");
        return `${(e as { code?: string }).code} ${(e as Error).message}`;
      }
    };
    expect(await appel(titulaire, "aal1")).toMatch(/^42501 Confirmez votre identité avec le code de votre application/);
    expect(await appel(titulaire, "aal2")).toBe("cree");
    expect(await appel(sansFacteur, "aal1")).toBe("cree");
  });
});
