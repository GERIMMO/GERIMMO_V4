/**
 * D05 (fiche PR178-B-06), décision du dirigeant du 14/10/2026 : un encaissement ne se rejoue pas après une réponse
 * perdue. Colonne facultative `cle_envoi` + index unique partiel, d'abord pour l'encaissement de loyer, puis le
 * dépôt de garantie et l'écriture libre (migrations 20261014100000, 20261014101000, 20261014102000).
 *
 * Ce fichier teste la BASE : la contrainte, la fonction `encaisser_depot`, les droits de colonne, la concurrence entre
 * deux sessions, le rejeu des migrations et la cohérence du manifeste / des retours arrière. Les actions qui s'en
 * servent sont testées dans `encaissement-cle-envoi-action.test.ts`.
 *
 * Nécessite SUPABASE_DB_URL (base locale jetable). Les essais s'exécutent dans une transaction annulée, sauf les
 * essais de concurrence, qui exigent deux sessions et gardent donc une fixture fictive.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const MIGRATIONS = [
  "20261014100000_cle_envoi_encaissement_loyer.sql",
  "20261014101000_cle_envoi_depot_garantie.sql",
  "20261014102000_cle_envoi_ecriture_libre.sql",
];

type Fixture = { org: string; bail: string; user: string; autre: string; appels: string[] };

async function creer(db: Client): Promise<Fixture> {
  const org = (await db.query("insert into public.organizations(name,type,status) values ('TEST clé d''envoi','proprietaire_direct','active') returning id")).rows[0].id;
  const user = randomUUID();
  const autre = randomUUID();
  for (const id of [user, autre]) {
    await db.query(
      "insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values ($1,'authenticated','authenticated',$2,'x',now(),'{}','{}')",
      [id, `${id}@test.local`]
    );
  }
  await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [user, org]);
  const bien = (await db.query("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST clé','appartement','1 rue de Test','75001','Paris') returning id", [org])).rows[0].id;
  const lot = (await db.query("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST clé','loue') returning id", [org, bien])).rows[0].id;
  const loc = (await db.query("insert into public.persons(organization_id,nom,prenom) values($1,'TEST','Locataire') returning id", [org])).rows[0].id;
  const bail = (await db.query("insert into public.baux(organization_id,lot_id,type,etat,loyer_hc,charges,depot_garantie,date_debut,jour_echeance,locataire_principal) values($1,$2,'nu','actif',780,60,780,'2026-01-01',5,$3) returning id", [org, lot, loc])).rows[0].id;
  const appels = (
    await db.query(
      "insert into public.appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) select $1,$2,d::date,(d+interval '4 days')::date,780,60,840 from generate_series('2026-01-01'::date,'2026-02-01'::date,interval '1 month') d returning id",
      [org, bail]
    )
  ).rows.map((r) => r.id);
  return { org, bail, user, autre, appels };
}

async function agir(db: Client, user: string) {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,false)", [user]);
  await db.query("set role authenticated");
}

/** Une requête qui peut échouer sans abandonner la transaction du test. */
async function essai<T = unknown>(db: Client, sql: string, args: unknown[] = []): Promise<{ lignes: T[] } | { erreur: { code?: string; message: string; detail?: string } }> {
  await db.query("savepoint essai");
  try {
    const r = await db.query(sql, args);
    await db.query("release savepoint essai");
    return { lignes: r.rows as T[] };
  } catch (e) {
    await db.query("rollback to savepoint essai");
    const { code, message, detail } = e as { code?: string; message: string; detail?: string };
    return { erreur: { code, message, detail } };
  }
}

const compter = async (db: Client, table: string, org: string) =>
  (await db.query(`select count(*)::int n from public.${table} where organization_id=$1`, [org])).rows[0].n as number;

describe.skipIf(!url)("Clé d'envoi — encaissement de loyer (migration 20261014100000)", () => {
  let db: Client;
  let f: Fixture;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => { await db.query("reset role"); await db.query("begin"); f = await creer(db); await agir(db, f.user); });
  afterEach(async () => { await db.query("rollback"); await db.query("reset role"); });
  afterAll(async () => { await db?.end(); });

  const insertion = "insert into public.encaissements(organization_id,bail_id,montant,cle_envoi) values($1,$2,$3,$4) returning id";

  it("la colonne est facultative et l'index unique est partiel (clé non nulle seulement)", async () => {
    const col = await db.query("select is_nullable from information_schema.columns where table_schema='public' and table_name='encaissements' and column_name='cle_envoi'");
    expect(col.rows).toEqual([{ is_nullable: "YES" }]);
    const idx = await db.query("select indexdef from pg_indexes where schemaname='public' and tablename='encaissements' and indexname='encaissements_cle_envoi_unique'");
    expect(idx.rows).toHaveLength(1);
    expect(idx.rows[0].indexdef).toMatch(/UNIQUE/);
    expect(idx.rows[0].indexdef).toMatch(/cle_envoi IS NOT NULL/);
  });

  it("sans clé, des encaissements identiques restent possibles (rien n'est réécrit, les saisies anciennes ne sont pas touchées)", async () => {
    expect(await essai(db, insertion, [f.org, f.bail, 2, null])).toHaveProperty("lignes");
    expect(await essai(db, insertion, [f.org, f.bail, 2, null])).toHaveProperty("lignes");
    expect(await compter(db, "encaissements", f.org)).toBe(2);
  });

  it("la même clé deux fois = un seul encaissement : le second est refusé par la base (23505)", async () => {
    const cle = randomUUID();
    expect(await essai(db, insertion, [f.org, f.bail, 2, cle])).toHaveProperty("lignes");
    const second = await essai(db, insertion, [f.org, f.bail, 2, cle]);
    expect(second).toHaveProperty("erreur");
    if ("erreur" in second) {
      expect(second.erreur.code).toBe("23505");
      expect(second.erreur.message).toMatch(/encaissements_cle_envoi_unique/);
    }
    expect(await compter(db, "encaissements", f.org)).toBe(1);
  });

  it("deux clés différentes = deux encaissements", async () => {
    expect(await essai(db, insertion, [f.org, f.bail, 2, randomUUID()])).toHaveProperty("lignes");
    expect(await essai(db, insertion, [f.org, f.bail, 2, randomUUID()])).toHaveProperty("lignes");
    expect(await compter(db, "encaissements", f.org)).toBe(2);
  });

  it("le rejeu refusé ne laisse ni reçu ni quittance de plus", async () => {
    const cle = randomUUID();
    expect(await essai(db, insertion, [f.org, f.bail, 840, cle])).toHaveProperty("lignes");
    const documents = async () => (await db.query("select count(*)::int n from public.quittances where bail_id=$1", [f.bail])).rows[0].n as number;
    const avant = await documents();
    expect(avant).toBe(1);
    expect(await essai(db, insertion, [f.org, f.bail, 840, cle])).toHaveProperty("erreur");
    expect(await documents()).toBe(avant);
  });

  it("la clé est lisible par le gérant de l'organisation (la lecture avant écriture de l'action)", async () => {
    const cle = randomUUID();
    await essai(db, insertion, [f.org, f.bail, 2, cle]);
    const lu = await db.query("select bail_id from public.encaissements where organization_id=$1 and cle_envoi=$2", [f.org, cle]);
    expect(lu.rows).toEqual([{ bail_id: f.bail }]);
  });

  it("un autre compte, hors de l'organisation, ne voit pas la clé", async () => {
    const cle = randomUUID();
    await essai(db, insertion, [f.org, f.bail, 2, cle]);
    await agir(db, f.autre);
    const lu = await db.query("select 1 from public.encaissements where cle_envoi=$1", [cle]);
    expect(lu.rows).toHaveLength(0);
  });
});

describe.skipIf(!url)("Clé d'envoi — dépôt de garantie (migration 20261014101000)", () => {
  let db: Client;
  let f: Fixture;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => { await db.query("reset role"); await db.query("begin"); f = await creer(db); await agir(db, f.user); });
  afterEach(async () => { await db.query("rollback"); await db.query("reset role"); });
  afterAll(async () => { await db?.end(); });

  const appel = "select public.encaisser_depot($1,$2,current_date,'virement',null,null,$3) as cumul";

  it("la colonne est facultative et l'index unique est partiel", async () => {
    const idx = await db.query("select indexdef from pg_indexes where schemaname='public' and tablename='depot_encaissements' and indexname='depot_encaissements_cle_envoi_unique'");
    expect(idx.rows).toHaveLength(1);
    expect(idx.rows[0].indexdef).toMatch(/UNIQUE.*cle_envoi IS NOT NULL/);
  });

  it("l'ancien appel à six arguments fonctionne encore, sans clé", async () => {
    const r = await essai<{ cumul: string }>(db, "select public.encaisser_depot($1,300,current_date,'virement',null,null) as cumul", [f.bail]);
    expect(r).toEqual({ lignes: [{ cumul: "300" }] });
    expect(await essai(db, "select public.encaisser_depot($1,300,current_date,'virement',null,null) as cumul", [f.bail])).toEqual({ lignes: [{ cumul: "600" }] });
  });

  it("une seule fonction encaisser_depot subsiste (pas de surcharge ambiguë pour PostgREST)", async () => {
    const r = await db.query("select pg_get_function_identity_arguments(oid) as a from pg_proc where proname='encaisser_depot' and pronamespace='public'::regnamespace");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].a).toContain("p_cle_envoi uuid");
  });

  it("la même clé deux fois = un seul encaissement de dépôt, une seule écriture au journal", async () => {
    const cle = randomUUID();
    expect(await essai(db, appel, [f.bail, 300, cle])).toEqual({ lignes: [{ cumul: "300" }] });
    const second = await essai(db, appel, [f.bail, 300, cle]);
    expect(second).toHaveProperty("erreur");
    if ("erreur" in second) {
      expect(second.erreur.code).toBe("23505");
      expect(second.erreur.message).toMatch(/déjà enregistré/);
      expect(second.erreur.detail ?? "").toMatch(/cle_envoi/);
    }
    expect(await compter(db, "depot_encaissements", f.org)).toBe(1);
    expect((await db.query("select count(*)::int n from public.ecritures where organization_id=$1 and categorie='depot_garantie'", [f.org])).rows[0].n).toBe(1);
  });

  it("le rejeu est reconnu AVANT les autres contrôles : un dépôt déjà soldé répond « déjà enregistré », pas « dépasse le dépôt dû »", async () => {
    const cle = randomUUID();
    expect(await essai(db, appel, [f.bail, 780, cle])).toEqual({ lignes: [{ cumul: "780" }] });
    const second = await essai(db, appel, [f.bail, 780, cle]);
    expect(second).toHaveProperty("erreur");
    if ("erreur" in second) {
      expect(second.erreur.code).toBe("23505");
      expect(second.erreur.message).toMatch(/déjà enregistré/);
    }
    expect(await compter(db, "depot_encaissements", f.org)).toBe(1);
  });

  it("deux clés différentes = deux encaissements (et le plafond du dépôt dû reste appliqué)", async () => {
    expect(await essai(db, appel, [f.bail, 300, randomUUID()])).toEqual({ lignes: [{ cumul: "300" }] });
    expect(await essai(db, appel, [f.bail, 300, randomUUID()])).toEqual({ lignes: [{ cumul: "600" }] });
    const trop = await essai(db, appel, [f.bail, 300, randomUUID()]);
    expect(trop).toHaveProperty("erreur");
    if ("erreur" in trop) expect(trop.erreur.message).toMatch(/dépasse le dépôt dû restant/);
    expect(await compter(db, "depot_encaissements", f.org)).toBe(2);
  });

  it("un autre compte ne peut pas encaisser, clé ou pas", async () => {
    await agir(db, f.autre);
    const r = await essai(db, appel, [f.bail, 300, randomUUID()]);
    expect(r).toHaveProperty("erreur");
    if ("erreur" in r) expect(r.erreur.message).toMatch(/Accès refusé/);
  });

  it("les droits de la fonction sont ceux de l'ancienne : appelable par un compte connecté, jamais par anon", async () => {
    await db.query("reset role");
    const r = await db.query(
      `select has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as service,
              p.prosecdef as definer, p.proconfig as config
         from pg_proc p where proname='encaisser_depot' and pronamespace='public'::regnamespace`
    );
    expect(r.rows[0]).toMatchObject({ auth: true, anon: false, service: true, definer: true });
    // search_path vide, comme partout dans les fonctions du produit
    expect(r.rows[0].config).toEqual(['search_path=""']);
  });
});

describe.skipIf(!url)("Clé d'envoi — écriture libre (migration 20261014102000)", () => {
  let db: Client;
  let f: Fixture;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => { await db.query("reset role"); await db.query("begin"); f = await creer(db); await agir(db, f.user); });
  afterEach(async () => { await db.query("rollback"); await db.query("reset role"); });
  afterAll(async () => { await db?.end(); });

  const insertion = "insert into public.ecritures(organization_id,categorie,sens,montant,libelle,cle_envoi) values($1,'Travaux','depense',$2,'TEST',$3) returning id";

  it("le compte connecté peut écrire la clé (droit de colonne) et la relire", async () => {
    const cle = randomUUID();
    expect(await essai(db, insertion, [f.org, 10, cle])).toHaveProperty("lignes");
    expect((await db.query("select count(*)::int n from public.ecritures where organization_id=$1 and cle_envoi=$2", [f.org, cle])).rows[0].n).toBe(1);
  });

  it("la même clé deux fois = une seule écriture ; deux clés = deux écritures ; sans clé, rien ne change", async () => {
    const cle = randomUUID();
    expect(await essai(db, insertion, [f.org, 10, cle])).toHaveProperty("lignes");
    const second = await essai(db, insertion, [f.org, 10, cle]);
    expect(second).toHaveProperty("erreur");
    if ("erreur" in second) {
      expect(second.erreur.code).toBe("23505");
      expect(second.erreur.message).toMatch(/ecritures_cle_envoi_unique/);
    }
    expect(await compter(db, "ecritures", f.org)).toBe(1);
    expect(await essai(db, insertion, [f.org, 10, randomUUID()])).toHaveProperty("lignes");
    expect(await essai(db, insertion, [f.org, 10, null])).toHaveProperty("lignes");
    expect(await essai(db, insertion, [f.org, 10, null])).toHaveProperty("lignes");
    expect(await compter(db, "ecritures", f.org)).toBe(4);
  });

  it("une saisie en deux lignes (taxe foncière et TEOM) porte la clé sur la première ligne seulement", async () => {
    const cle = randomUUID();
    const deux = "insert into public.ecritures(organization_id,categorie,sens,montant,cle_envoi) values($1,'Taxe foncière','depense',100,$2),($1,'TEOM','depense',20,null)";
    expect(await essai(db, deux, [f.org, cle])).toHaveProperty("lignes");
    expect(await essai(db, deux, [f.org, cle])).toHaveProperty("erreur");
    expect(await compter(db, "ecritures", f.org)).toBe(2);
  });

  it("la colonne reste la seule ajoutée aux droits d'insertion : le client ne pose toujours pas « systeme » ni « bail_id »", async () => {
    const r = await essai(db, "insert into public.ecritures(organization_id,categorie,sens,montant,systeme) values($1,'x','depense',1,true)", [f.org]);
    expect(r).toHaveProperty("erreur");
    if ("erreur" in r) expect(r.erreur.code).toBe("42501");
  });
});

describe.skipIf(!url)("Clé d'envoi — deux sessions simultanées, même clé (concurrence)", () => {
  let admin: Client;
  let a: Client;
  let b: Client;
  let observateur: Client;
  let f: Fixture;

  beforeAll(async () => {
    admin = new Client({ connectionString: url }); await admin.connect();
    a = new Client({ connectionString: url }); await a.connect();
    b = new Client({ connectionString: url }); await b.connect();
    observateur = new Client({ connectionString: url }); await observateur.connect();
    // Fixture explicitement fictive, validée : deux sessions ne se voient qu'après un commit.
    await admin.query("begin");
    f = await creer(admin);
    await admin.query("commit");
    await agir(a, f.user);
    await agir(b, f.user);
  });
  afterAll(async () => { await Promise.all([admin?.end(), a?.end(), b?.end(), observateur?.end()]); });

  /** Joue `sql` dans deux transactions croisées : A écrit, B attend sur le verrou, A valide, B est refusée. */
  async function croiser(sql: string, args: unknown[]) {
    const pidB = (await b.query("select pg_backend_pid() as pid")).rows[0].pid;
    await a.query("begin");
    await b.query("begin");
    await a.query(sql, args);
    const secondePromesse = b.query(sql, args).then(
      () => ({ ok: true as const }),
      (e: { code?: string }) => ({ ok: false as const, code: e.code })
    );
    let bloque = false;
    for (let i = 0; i < 200; i++) {
      const attente = (await observateur.query("select wait_event_type from pg_stat_activity where pid=$1", [pidB])).rows[0];
      if (attente?.wait_event_type === "Lock") { bloque = true; break; }
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(bloque, "la seconde session doit attendre la première").toBe(true);
    await a.query("commit");
    const seconde = await secondePromesse;
    await b.query("rollback");
    return seconde;
  }

  it("encaissement de loyer : la seconde session attend, puis est refusée ; une seule ligne", async () => {
    const cle = randomUUID();
    const seconde = await croiser("insert into public.encaissements(organization_id,bail_id,montant,cle_envoi) values($1,$2,5,$3)", [f.org, f.bail, cle]);
    expect(seconde).toEqual({ ok: false, code: "23505" });
    expect((await admin.query("select count(*)::int n from public.encaissements where organization_id=$1 and cle_envoi=$2", [f.org, cle])).rows[0].n).toBe(1);
  });

  it("dépôt de garantie : même résultat par la fonction", async () => {
    const cle = randomUUID();
    const seconde = await croiser("select public.encaisser_depot($1,100,current_date,'virement',null,null,$2)", [f.bail, cle]);
    expect(seconde).toEqual({ ok: false, code: "23505" });
    expect((await admin.query("select count(*)::int n from public.depot_encaissements where organization_id=$1 and cle_envoi=$2", [f.org, cle])).rows[0].n).toBe(1);
    expect((await admin.query("select count(*)::int n from public.ecritures where depot_encaissement_id in (select id from public.depot_encaissements where cle_envoi=$1)", [cle])).rows[0].n).toBe(1);
  });

  it("écriture libre : même résultat", async () => {
    const cle = randomUUID();
    const seconde = await croiser("insert into public.ecritures(organization_id,categorie,sens,montant,cle_envoi) values($1,'Travaux','depense',7,$2)", [f.org, cle]);
    expect(seconde).toEqual({ ok: false, code: "23505" });
    expect((await admin.query("select count(*)::int n from public.ecritures where organization_id=$1 and cle_envoi=$2", [f.org, cle])).rows[0].n).toBe(1);
  });
});

describe.skipIf(!url)("Migrations de la clé d'envoi — rejeu et manifeste", () => {
  let db: Client;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); await db.query("begin"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  async function empreinte() {
    const r = await db.query(
      `select
         (select string_agg(table_name||'.'||column_name||':'||is_nullable||':'||data_type, ',' order by table_name) from information_schema.columns
           where table_schema='public' and column_name='cle_envoi' and table_name in ('encaissements','depot_encaissements','ecritures')) as colonnes,
         (select string_agg(indexname||'='||indexdef, ' | ' order by indexname) from pg_indexes where schemaname='public' and indexname like '%cle_envoi_unique') as index,
         (select string_agg(md5(pg_get_functiondef(p.oid))||coalesce(p.proacl::text,''), ',') from pg_proc p where proname='encaisser_depot' and pronamespace='public'::regnamespace) as fonction,
         (select string_agg(privilege_type, ',' order by privilege_type) from information_schema.column_privileges
           where table_schema='public' and table_name='ecritures' and column_name='cle_envoi' and grantee='authenticated') as droits`
    );
    return r.rows[0];
  }

  it.each(MIGRATIONS)("%s rejouée sur une base déjà migrée ne change rien (deux fois de suite)", async (nom) => {
    const sql = readFileSync(`supabase/migrations/${nom}`, "utf8");
    const avant = await empreinte();
    await db.query("savepoint rejeu");
    await db.query(sql);
    expect(await empreinte()).toEqual(avant);
    await db.query(sql);
    expect(await empreinte()).toEqual(avant);
    await db.query("rollback to savepoint rejeu");
  });

  it("encaisser_depot : une définition inattendue arrête la migration au lieu d'être écrasée", async () => {
    await db.query("savepoint inattendue");
    await db.query("drop function public.encaisser_depot(uuid,numeric,date,text,uuid,text,uuid)");
    await db.query(
      `create function public.encaisser_depot(p_bail uuid, p_montant numeric, p_date date, p_moyen text, p_versant_person uuid default null, p_versant_libelle text default null)
       returns numeric language plpgsql security definer set search_path to '' as $f$ begin return 0; end $f$`
    );
    await expect(db.query(readFileSync(`supabase/migrations/${MIGRATIONS[1]}`, "utf8"))).rejects.toThrow(/définition inattendue/);
    await db.query("rollback to savepoint inattendue");
  });

  it("les trois migrations sont à la fin du manifeste, dans l'ordre, une seule fois chacune", () => {
    const lignes = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    for (const nom of MIGRATIONS) expect(lignes.filter((l) => l === nom)).toHaveLength(1);
    const positions = MIGRATIONS.map((n) => lignes.indexOf(n));
    expect([...positions].sort((x, y) => x - y)).toEqual(positions);
    // Plage du lot « encaissement » : 20261014100000 à 20261014109999.
    for (const nom of MIGRATIONS) expect(Number(nom.slice(0, 14))).toBeGreaterThanOrEqual(20261014100000);
    for (const nom of MIGRATIONS) expect(Number(nom.slice(0, 14))).toBeLessThanOrEqual(20261014109999);
  });

  it.each(MIGRATIONS)("%s a son retour arrière, déclaré dans le LISEZ-MOI du dossier", (nom) => {
    const retour = nom.replace(/\.sql$/, ".retour.sql");
    const script = readFileSync(`supabase/retours-arriere/${retour}`, "utf8");
    expect(script).toMatch(/^-- RETOUR ARRIÈRE de /);
    expect(script).toMatch(/\bcommit;\s*$/m);
    expect(script).toContain(nom.slice(0, 14));
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(retour);
  });
});
