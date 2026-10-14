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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

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
});
