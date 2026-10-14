/**
 * D08 (audit du 13/10, SA-01 et SA-09), option A — la trace de l'entrée du super-administrateur dans un
 * espace client, côté base : une page rendue plusieurs fois dans la minute n'écrit qu'une ligne.
 *
 * Constat : « chaque navigation écrit en plus 1 à 15 lignes `traversee_espace` vides (15 en une minute) ».
 * `log_sa_access` ne dédoublonnait que les `consultation_*`. Maintenant `traversee_espace` l'est aussi : même
 * compte, même organisation, mêmes détails (donc même page et même objet) dans la minute = une ligne.
 * `traversee_action` ne l'est JAMAIS : chaque geste lancé depuis un espace client est une ligne.
 * Aucun droit ne change : seul le super-administrateur peut écrire ces lignes, comme avant.
 *
 * Tout est joué dans une transaction annulée à la fin.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

// La trace réelle (lib/traversee.ts) est jouée sur la base : seul l'en-tête de la requête est simulé.
const requete = vi.hoisted(() => ({ entetes: {} as Record<string, string> }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(requete.entetes) }));
import { tracerTraversee } from "../src/lib/traversee";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("D08 — log_sa_access : une page, une ligne par minute", () => {
  let db: Client;
  let sa: string;
  let autreSa: string;
  let simple: string;
  let org: string;
  let autreOrg: string;

  async function compte(superAdmin: boolean) {
    const { rows: [u] } = await db.query(
      `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values (gen_random_uuid(), 'authenticated', 'authenticated', 'trace-' || gen_random_uuid() || '@test.local', 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()) returning id`
    );
    if (superAdmin) await db.query("insert into public.memberships (account_id, organization_id, role) values ($1,null,'super_admin')", [u.id]);
    return u.id as string;
  }
  async function agir(id: string, aal = "aal2") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated','aal',$2::text)::text, true)", [id, aal]);
    await db.query("set local role authenticated");
  }
  async function tracer(action: string, organisation: string, details?: Record<string, unknown>) {
    if (details === undefined) await db.query("select public.log_sa_access($1,$2)", [organisation, action]);
    else await db.query("select public.log_sa_access($1,$2,$3::jsonb)", [organisation, action, JSON.stringify(details)]);
  }
  async function lignes(organisation: string, action?: string) {
    await db.query("reset role");
    const { rows } = await db.query(
      "select action, details from public.audit_log where organization_id=$1 and ($2::text is null or action=$2) order by created_at, id", [organisation, action ?? null]
    );
    return rows as { action: string; details: Record<string, unknown> }[];
  }

  const PAGE = { resultat: "autorise", requete: "page", rubrique: "baux", objet_id: "0b6e1d6e-7c1a-4b5e-9a3d-5f2f3d9a1c11", route: "/agence/x/baux/0b6e1d6e-7c1a-4b5e-9a3d-5f2f3d9a1c11" };

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
    sa = await compte(true); autreSa = await compte(true); simple = await compte(false);
    ({ rows: [{ id: org }] } = await db.query("insert into public.organizations (name) values ('Agence trace D08') returning id"));
    ({ rows: [{ id: autreOrg }] } = await db.query("insert into public.organizations (name) values ('Autre agence trace D08') returning id"));
  });
  beforeEach(async () => { await db.query("reset role"); await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("reset role"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  it("la même page rendue quinze fois dans la minute n'écrit qu'une ligne « traversee_espace »", async () => {
    await agir(sa);
    for (let i = 0; i < 15; i++) await tracer("traversee_espace", org, PAGE);
    expect(await lignes(org, "traversee_espace")).toEqual([{ action: "traversee_espace", details: PAGE }]);
  });

  it("des détails vides, comme l'ancienne application, ne se multiplient plus non plus", async () => {
    await agir(sa);
    for (let i = 0; i < 15; i++) await tracer("traversee_espace", org);
    expect(await lignes(org, "traversee_espace")).toHaveLength(1);
  });

  it("une autre page, un autre objet ou un autre résultat est une autre ligne", async () => {
    await agir(sa);
    await tracer("traversee_espace", org, PAGE);
    await tracer("traversee_espace", org, { ...PAGE, rubrique: "loyers", objet_id: undefined, route: "/agence/x/loyers" });
    await tracer("traversee_espace", org, { ...PAGE, objet_id: "11111111-1111-4111-8111-111111111111" });
    await tracer("traversee_espace", org, { ...PAGE, resultat: "refuse", motif: "organisation_introuvable" });
    expect(await lignes(org, "traversee_espace")).toHaveLength(4);
  });

  it("une autre organisation et un autre super-administrateur ont leurs propres lignes", async () => {
    await agir(sa);
    await tracer("traversee_espace", org, PAGE);
    await tracer("traversee_espace", autreOrg, PAGE);
    await agir(autreSa);
    await tracer("traversee_espace", org, PAGE);
    expect(await lignes(org, "traversee_espace")).toHaveLength(2);
    expect(await lignes(autreOrg, "traversee_espace")).toHaveLength(1);
  });

  it("la minute passée, la même page s'écrit de nouveau", async () => {
    await agir(sa);
    await tracer("traversee_espace", org, PAGE);
    await db.query("reset role");
    await db.query("update public.audit_log set created_at = now() - interval '2 minutes' where organization_id=$1 and action='traversee_espace'", [org]);
    await agir(sa);
    await tracer("traversee_espace", org, PAGE);
    expect(await lignes(org, "traversee_espace")).toHaveLength(2);
  });

  it("« traversee_action » n'est jamais dédoublonné : chaque geste est une ligne", async () => {
    await agir(sa);
    const geste = { ...PAGE, requete: "action_serveur", action_ref: "3f9a0c1d2e4b5a69" };
    for (let i = 0; i < 3; i++) await tracer("traversee_action", org, geste);
    expect(await lignes(org, "traversee_action")).toHaveLength(3);
  });

  it("les consultations d'organisation gardent leur règle d'une ligne par minute", async () => {
    await agir(sa);
    for (let i = 0; i < 3; i++) await tracer("consultation_organisation", org);
    expect(await lignes(org, "consultation_organisation")).toHaveLength(1);
  });

  it("aucun droit ne change : un compte sans supervision, ou sans second facteur, est refusé", async () => {
    await agir(simple);
    await expect(tracer("traversee_espace", org, PAGE)).rejects.toThrow(/reserve au super admin/);
    await db.query("rollback to savepoint cas"); await db.query("savepoint cas");
    await agir(sa, "aal1");
    await expect(tracer("traversee_action", org, PAGE)).rejects.toThrow(/reserve au super admin/);
    await db.query("rollback to savepoint cas"); await db.query("savepoint cas");
    expect(await lignes(org)).toEqual([]);
  });

  it("l'anonyme n'a toujours pas le droit d'exécuter la fonction", async () => {
    const { rows: [r] } = await db.query("select has_function_privilege('anon','public.log_sa_access(uuid,text,jsonb)','execute') as ok");
    expect(r.ok).toBe(false);
  });

  /** Un client dont `rpc` joue la vraie fonction SQL sous la session ouverte (une erreur est rendue, comme supabase-js). */
  function clientBase() {
    return {
      rpc: async (fn: string, args: Record<string, unknown> = {}) => {
        await db.query("savepoint rpc_trace");
        try {
          await db.query(`select public.${fn}($1::uuid,$2::text,$3::jsonb)`, [args.org ?? null, args.sa_action, JSON.stringify(args.sa_details ?? {})]);
          await db.query("release savepoint rpc_trace");
          return { error: null };
        } catch (e) {
          await db.query("rollback to savepoint rpc_trace");
          return { error: { message: e instanceof Error ? e.message : String(e) } };
        }
      },
    };
  }
  async function lignesSansOrganisation(compte: string) {
    await db.query("reset role");
    const { rows } = await db.query(
      "select action, details from public.audit_log where organization_id is null and account_id=$1 order by created_at, id", [compte]
    );
    return rows as { action: string; details: Record<string, unknown> }[];
  }

  describe("le refus « organisation introuvable » s'écrit VRAIMENT (audit_log.organization_id est une clé étrangère)", () => {
    const INCONNUE = "22222222-2222-4222-8222-222222222222";

    it("la page : une ligne sans organisation, avec l'identifiant demandé en détail", async () => {
      await agir(sa);
      requete.entetes = { "x-gerimmo-chemin": `/agence/${INCONNUE}/parc`, "x-gerimmo-methode": "GET" };
      const ecrite = await tracerTraversee(clientBase(), { orgId: INCONNUE, nature: "espace", resultat: "refuse", motif: "organisation_introuvable" });
      expect(ecrite).toBe(true);
      expect(await lignesSansOrganisation(sa)).toEqual([{
        action: "traversee_espace",
        details: { resultat: "refuse", requete: "page", motif: "organisation_introuvable", rubrique: "parc", route: `/agence/${INCONNUE}/parc`, org_demandee: INCONNUE },
      }]);
    });

    it("le geste : « traversee_action », même chose, et chaque tentative est une ligne", async () => {
      await agir(sa);
      requete.entetes = { "x-gerimmo-chemin": `/agence/${INCONNUE}/loyers`, "x-gerimmo-methode": "POST", "next-action": "7f3a9c0d2e4b5a69c8d7e6f5" };
      for (let i = 0; i < 2; i++) {
        expect(await tracerTraversee(clientBase(), { orgId: INCONNUE, nature: "geste", resultat: "refuse", motif: "organisation_introuvable" })).toBe(true);
      }
      const lignes = await lignesSansOrganisation(sa);
      expect(lignes).toHaveLength(2);
      expect(lignes[0]).toMatchObject({ action: "traversee_action", details: { resultat: "refuse", org_demandee: INCONNUE } });
    });

    it("une adresse dont l'organisation n'est même pas un identifiant s'écrit aussi (sans la recopier dans les détails de recherche)", async () => {
      await agir(sa);
      requete.entetes = { "x-gerimmo-chemin": "/agence/pas-un-uuid/parc", "x-gerimmo-methode": "GET" };
      expect(await tracerTraversee(clientBase(), { orgId: "pas-un-uuid", nature: "espace", resultat: "refuse", motif: "organisation_introuvable" })).toBe(true);
      const [ligne] = await lignesSansOrganisation(sa);
      expect(ligne.details).toMatchObject({ resultat: "refuse", org_demandee: "invalide" });
    });

    it("un encaissement saisi depuis la fenêtre de lot dit son geste et son bail, chaque geste est une ligne", async () => {
      const bail = "0b6e1d6e-7c1a-4b5e-9a3d-5f2f3d9a1c11";
      await agir(sa);
      requete.entetes = { "x-gerimmo-chemin": `/agence/${org}/parc`, "x-gerimmo-methode": "POST", "next-action": "7f3a9c0d2e4b5a69c8d7" };
      for (let i = 0; i < 2; i++) {
        expect(await tracerTraversee(clientBase(), { orgId: org, nature: "geste", resultat: "autorise", geste: { geste: "encaissement", cible: bail } })).toBe(true);
      }
      expect(await lignes(org, "traversee_action")).toEqual([
        { action: "traversee_action", details: { resultat: "autorise", requete: "action_serveur", geste: "encaissement", rubrique: "parc", objet_id: bail, route: `/agence/${org}/parc`, action_ref: "7f3a9c0d2e4b5a69" } },
        { action: "traversee_action", details: { resultat: "autorise", requete: "action_serveur", geste: "encaissement", rubrique: "parc", objet_id: bail, route: `/agence/${org}/parc`, action_ref: "7f3a9c0d2e4b5a69" } },
      ]);
    });

    it("l'accès autorisé, lui, reste rattaché à son organisation", async () => {
      await agir(sa);
      requete.entetes = { "x-gerimmo-chemin": `/agence/${org}/parc`, "x-gerimmo-methode": "GET" };
      expect(await tracerTraversee(clientBase(), { orgId: org, nature: "espace", resultat: "autorise" })).toBe(true);
      expect(await lignes(org, "traversee_espace")).toHaveLength(1);
      expect(await lignesSansOrganisation(sa)).toEqual([]);
    });
  });

});
