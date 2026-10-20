/**
 * D44 (audit du 13/10, PRF-04) — « équivalence entre le rôle lu par le proxy et is_super_admin() »,
 * second facteur compris, vérifiée sur une vraie base.
 *
 * Le proxy ne peut pas appeler is_super_admin() à chaque requête (il lit déjà les adhésions actives et
 * le niveau du second facteur, rien de plus). Il décide donc avec `estSuperviseurActif(roles, niveau)`.
 *
 * Relecture : ce test ne rejoue plus sa PROPRE requête SQL. Il fait tourner `proxy()` lui-même sur une requête
 * vers /admin/brief, avec pour client Supabase un adaptateur qui TRADUIT EN SQL les filtres que le proxy pose
 * réellement (`.select("role").eq("account_id", …).eq("status", "active")`) et les exécute sous la session du
 * compte (RLS comprise). Si le proxy perd un filtre ou change de lecture, la requête exécutée change avec lui et
 * la décision diverge de `public.is_super_admin()` — celle que le layout /admin et les politiques RLS appliquent.
 * Le niveau du second facteur est la revendication `aal` du jeton, comme le lit supabase-js.
 *
 * Tout est joué dans une transaction annulée à la fin.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { verifierBaseDeTest } from "./garde-base";

const mocks = vi.hoisted(() => ({ client: vi.fn(), lectures: [] as { table: string; colonnes: string[]; filtres: [string, unknown][] }[] }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));
import { proxy } from "../src/proxy";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("D44 — le proxy et is_super_admin() décident pareil", () => {
  let db: Client;
  const comptes: Record<string, string> = {};

  async function creerCompte(nom: string) {
    const { rows: [u] } = await db.query(
      `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values (gen_random_uuid(), 'authenticated', 'authenticated', $1 || '-' || gen_random_uuid() || '@test.local', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()) returning id`,
      [nom]
    );
    comptes[nom] = u.id;
    return u.id as string;
  }

  /** Ouvre la session du compte avec ce niveau de second facteur (undefined = revendication absente). */
  async function agir(compte: string, aal: string | undefined) {
    await db.query("reset role");
    const revendications: Record<string, string> = { sub: compte, role: "authenticated" };
    if (aal !== undefined) revendications.aal = aal;
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(revendications)]);
    await db.query("set local role authenticated");
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query("begin");
    const { rows: [org] } = await db.query("insert into public.organizations (name) values ('Agence équivalence D44') returning id");
    await creerCompte("superviseur");
    await creerCompte("superviseur-suspendu");
    await creerCompte("administrateur-agence");
    await creerCompte("superviseur-et-agence");
    await creerCompte("locataire");
    await creerCompte("sans-adhesion");
    await db.query("insert into public.memberships (account_id, organization_id, role, status) values ($1, null, 'super_admin', 'active')", [comptes["superviseur"]]);
    await db.query("insert into public.memberships (account_id, organization_id, role, status) values ($1, null, 'super_admin', 'inactive')", [comptes["superviseur-suspendu"]]);
    await db.query("insert into public.memberships (account_id, organization_id, role, status) values ($1, $2, 'admin_agence', 'active')", [comptes["administrateur-agence"], org.id]);
    await db.query("insert into public.memberships (account_id, organization_id, role, status) values ($1, null, 'super_admin', 'active'), ($1, $2, 'admin_agence', 'active')", [comptes["superviseur-et-agence"], org.id]);
    await db.query("insert into public.memberships (account_id, organization_id, role, status) values ($1, $2, 'locataire', 'active')", [comptes["locataire"], org.id]);
  });
  afterEach(async () => { await db.query("rollback"); });

  const NIVEAUX: (string | undefined)[] = [undefined, "aal1", "aal2", "aal3", ""];

  /**
   * Le client Supabase du proxy, adossé à la base : `from(table).select(colonnes).eq(c, v)…` devient
   * `select colonnes from public.table where c = v and …`, exécuté sous la session ouverte par `agir`.
   * Seuls `select` et `eq` existent : toute autre méthode que le proxy y appellerait lèverait une erreur
   * (le test échoue) au lieu d'être ignorée. Les identifiants de table et de colonne sont validés.
   */
  function clientDuProxy(compte: string, aal: string | undefined) {
    const identifiant = /^[a-z_][a-z0-9_]*$/;
    return {
      from: (table: string) => {
        if (!identifiant.test(table)) throw new Error(`table inattendue : ${table}`);
        const lecture = { table, colonnes: [] as string[], filtres: [] as [string, unknown][] };
        mocks.lectures.push(lecture);
        const q = {
          select: (liste: string) => {
            lecture.colonnes = liste.split(",").map((c) => c.trim());
            if (!lecture.colonnes.every((c) => identifiant.test(c))) throw new Error(`colonnes inattendues : ${liste}`);
            return q;
          },
          eq: (colonne: string, valeur: unknown) => {
            if (!identifiant.test(colonne)) throw new Error(`colonne inattendue : ${colonne}`);
            lecture.filtres.push([colonne, valeur]);
            return q;
          },
          then: (resolve: (v: unknown) => unknown, rejeter?: (e: unknown) => unknown) => {
            const conditions = lecture.filtres.map(([colonne], i) => `${colonne} = $${i + 1}`);
            const sql = `select ${lecture.colonnes.join(", ")} from public.${table}${conditions.length ? ` where ${conditions.join(" and ")}` : ""}`;
            return db.query(sql, lecture.filtres.map(([, valeur]) => valeur)).then(({ rows }) => ({ data: rows, error: null }), (e) => ({ data: null, error: e })).then(resolve, rejeter);
          },
        };
        return q;
      },
      rpc: async () => ({ data: [{ id: "session-fictive", cree_le: new Date().toISOString() }], error: null }),
    auth: {
        getUser: async () => ({ data: { user: { id: compte, last_sign_in_at: new Date().toISOString() } } }),
        // supabase-js : currentLevel = revendication `aal` du jeton, sinon null.
        mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: aal === undefined || aal === "" ? null : aal }, error: null }) },
      },
    };
  }

  /** Vrai si le proxy laisse la requête atteindre la page de /admin. */
  async function leProxyLaisseEntrer(compte: string, aal: string | undefined) {
    await agir(compte, aal);
    mocks.lectures.length = 0;
    mocks.client.mockReturnValue(clientDuProxy(compte, aal));
    const reponse = await proxy(new NextRequest("https://gerimmo.test/admin/brief"));
    await db.query("reset role");
    return reponse.headers.get("x-middleware-next") === "1" && !reponse.headers.get("location");
  }

  it.each(["superviseur", "superviseur-suspendu", "administrateur-agence", "superviseur-et-agence", "locataire", "sans-adhesion"])(
    "%s : le proxy décide comme is_super_admin() à tous les niveaux de session",
    async (nom) => {
      for (const aal of NIVEAUX) {
        const entre = await leProxyLaisseEntrer(comptes[nom], aal);
        await agir(comptes[nom], aal);
        const { rows: [sql] } = await db.query("select public.is_super_admin() as ok");
        await db.query("reset role");
        expect(entre, `${nom} @ ${aal ?? "sans aal"}`).toBe(sql.ok);
      }
    }
  );

  it("les seuls cas où l'on entre : adhésion super_admin active ET aal2", async () => {
    const entrants: string[] = [];
    for (const nom of Object.keys(comptes)) {
      for (const aal of NIVEAUX) {
        if (await leProxyLaisseEntrer(comptes[nom], aal)) entrants.push(`${nom}@${aal}`);
      }
    }
    expect(entrants.sort()).toEqual(["superviseur-et-agence@aal2", "superviseur@aal2"]);
  });

  it("l'adaptateur est fidèle : la lecture exécutée est bien celle du proxy (adhésions actives du compte, colonne role)", async () => {
    await leProxyLaisseEntrer(comptes["superviseur"], "aal2");
    expect(mocks.lectures).toEqual([{ table: "memberships", colonnes: ["role"], filtres: [["account_id", comptes["superviseur"]], ["status", "active"]] }]);
  });

  it("un superviseur suspendu ne passe pas, même avec un jeton aal2 (garde de non-régression sur le filtre de statut)", async () => {
    expect(await leProxyLaisseEntrer(comptes["superviseur-suspendu"], "aal2")).toBe(false);
  });
});
