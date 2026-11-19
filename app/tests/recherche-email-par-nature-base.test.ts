/**
 * SCI-2, suite (audit après publication de la PR #347, 19/11/2026) — migration 20261119200300.
 *
 * Depuis 20261119200000, la fiche d'une société et celle de la personne physique qui la gère peuvent partager une
 * adresse e-mail dans un même espace. Les deux recherches de fiche par e-mail qui prenaient « la première trouvée »
 * départagent désormais :
 *  — `import_personne` (import du parc, locataire d'une ligne) : la personne physique d'abord ;
 *  — `reprendre_soldes` (reprise comptable, propriétaire d'une ligne « fonds_mandant ») : la fiche qui détient des lots
 *    dans l'espace d'abord, puis la société.
 * Sans adresse partagée, rien ne change. La migration se rejoue sans effet ; son retour rend la recherche d'avant, et la
 * marche avant suivante retrouve exactement la définition migrée, droits compris.
 *
 * Transaction annulée après chaque test. Nécessite SUPABASE_DB_URL (base de test locale), sinon ignoré.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const MIGRATION = "supabase/migrations/20261119200300_recherche_email_par_nature.sql";
const RETOUR = "supabase/retours-arriere/20261119200300_recherche_email_par_nature.retour.sql";
const SIGNATURES = ["public.import_personne(uuid,text,text,text)", "public.reprendre_soldes(uuid,uuid,jsonb,boolean)"];
const PARTAGEE = "tilleul@exemple.fr";

let db: Client;
let org: string;
let admin: string;
let reprise: string | undefined;

const id = async (sql: string, args: unknown[] = []) => (await db.query<{ id: string }>(sql, args)).rows[0].id;

async function simuler(accountId: string) {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: accountId, role: "authenticated", aal: "aal2" })]);
  await db.query("set local role authenticated");
}
const fiche = (nom: string, qualite: string, email: string | null, prenom: string | null = null) =>
  id("insert into public.persons(organization_id,nom,prenom,email,qualite) values($1,$2,$3,$4,$5) returning id", [org, nom, prenom, email, qualite]);

async function detenir(person: string) {
  const bien = await id(
    "insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Le Tilleul','appartement','1 rue Fictive','69003','Lyon') returning id",
    [org]
  );
  const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'A1','disponible') returning id", [org, bien]);
  await db.query("insert into public.detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$3,100)", [org, lot, person]);
}

async function proprietaireDeLaLigne(email: string): Promise<string | null> {
  await simuler(admin);
  // Une seule reprise en cours par espace : ouverte au premier contrôle du test, reprise ensuite.
  reprise ??= (await db.query<{ r: string }>("select public.ouvrir_reprise($1, current_date, 100, 'fichier') r", [org])).rows[0].r;
  const { rows } = await db.query<{ statut: string; person_id: string | null }>(
    "select statut, person_id from public.reprendre_soldes($1,$2,$3::jsonb,true)",
    [org, reprise, JSON.stringify([{ type: "fonds_mandant", montant: "100", proprietaire_email: email }])]
  );
  await db.query("reset role");
  expect(rows).toHaveLength(1);
  return rows[0].statut === "ok" ? rows[0].person_id : null;
}
const importer = async (nom: string, prenom: string | null, email: string) =>
  (await db.query<{ id: string }>("select public.import_personne($1,$2,$3,$4) id", [org, nom, prenom, email])).rows[0].id;

const definitions = async () =>
  (await db.query<{ d: string; acl: string | null }>(
    "select pg_get_functiondef(s::regprocedure) d, (select proacl::text from pg_proc where oid = s::regprocedure) acl from unnest($1::text[]) s",
    [SIGNATURES]
  )).rows;

describe.skipIf(!DB_URL)("SCI-2, suite : recherche de fiche par e-mail quand une société et son gérant partagent l'adresse", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("begin");
    await db.query("reset role");
    reprise = undefined;
    org = await id("insert into public.organizations(name,status,type) values('Recherche par e-mail','active','agence') returning id");
    admin = await id(
      `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,
         created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
       values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','resp-'||gen_random_uuid()||'@test.local',
         'x',now(),'{}','{}',now(),now(),'','','','','') returning id`
    );
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'admin_agence')", [admin, org]);
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  it("l'index par nature accepte la société et son gérant sur la même adresse (prémisse)", async () => {
    await fiche("SCI du Tilleul", "SCI", PARTAGEE);
    await fiche("Martin", "Personne physique", PARTAGEE, "Camille");
    expect((await db.query("select count(*)::int n from public.persons where organization_id=$1 and lower(email)=$2", [org, PARTAGEE])).rows[0].n).toBe(2);
  });

  it("import du parc : la ligne d'un locataire à l'adresse partagée retrouve la personne physique, jamais la société", async () => {
    // La société d'abord : sans départage, `limit 1` la rendait souvent (ordre d'insertion).
    const societe = await fiche("SCI du Tilleul", "SCI", PARTAGEE);
    const gerant = await fiche("Martin", "Personne physique", PARTAGEE, "Camille");
    expect(await importer("Martin", "Camille", PARTAGEE)).toBe(gerant);
    expect(await importer("Autre nom", null, PARTAGEE.toUpperCase())).toBe(gerant);
    expect(await importer("Autre nom", null, PARTAGEE)).not.toBe(societe);
  });

  it("import du parc : sans adresse partagée, rien ne change (la seule fiche trouvée est rendue, aucune fiche créée)", async () => {
    const societe = await fiche("SCI du Tilleul", "SCI", PARTAGEE);
    const avant = (await db.query("select count(*)::int n from public.persons where organization_id=$1", [org])).rows[0].n;
    expect(await importer("SCI du Tilleul", null, PARTAGEE)).toBe(societe);
    const nouvelle = await importer("Durand", "Léa", "lea.durand@exemple.fr");
    expect(nouvelle).not.toBe(societe);
    expect((await db.query("select count(*)::int n from public.persons where organization_id=$1", [org])).rows[0].n).toBe(avant + 1);
  });

  it("reprise comptable : le propriétaire d'une ligne est la fiche qui détient des lots, puis la société", async () => {
    const gerant = await fiche("Martin", "Personne physique", PARTAGEE, "Camille");
    const societe = await fiche("SCI du Tilleul", "SCI", PARTAGEE);
    // Aucune détention : la société (propriétaire naturel de l'espace d'une SCI).
    expect(await proprietaireDeLaLigne(PARTAGEE)).toBe(societe);
    await db.query("savepoint detention");
    // La société détient les lots : elle.
    await detenir(societe);
    expect(await proprietaireDeLaLigne(PARTAGEE.toUpperCase())).toBe(societe);
    await db.query("rollback to savepoint detention");
    // Le gérant détient, à titre personnel, les lots de l'espace : lui.
    await detenir(gerant);
    expect(await proprietaireDeLaLigne(PARTAGEE)).toBe(gerant);
  });

  it("reprise comptable : sans adresse partagée, la seule fiche est rendue ; une adresse inconnue reste une erreur", async () => {
    const proprietaire = await fiche("Moreau", "Personne physique", "alain.moreau@exemple.fr", "Alain");
    expect(await proprietaireDeLaLigne("alain.moreau@exemple.fr")).toBe(proprietaire);
    expect(await proprietaireDeLaLigne("inconnu@exemple.fr")).toBeNull();
  });

  it("migration rejouable, retour exact, marche avant identique ; droits inchangés et fermés à anon", async () => {
    const migree = await definitions();
    for (const s of SIGNATURES) {
      expect((await db.query("select has_function_privilege('anon', $1, 'execute') a", [s])).rows[0].a).toBe(false);
    }
    // Rejeu : rien ne change.
    await db.query(readFileSync(MIGRATION, "utf8"));
    expect(await definitions()).toEqual(migree);
    // Retour : la recherche d'avant, sans départage ; droits identiques.
    await db.query(readFileSync(RETOUR, "utf8"));
    const rendue = await definitions();
    expect(rendue[0].d).toContain("where organization_id = p_org and lower(email) = v_email limit 1;");
    expect(rendue[1].d).toMatch(/lower\(p\.email\) = lower\(btrim\(v_ligne->>'proprietaire_email'\)\)\s+limit 1;/);
    for (const r of rendue) expect(r.d).not.toContain("Personne morale");
    expect(rendue.map((r) => r.acl)).toEqual(migree.map((r) => r.acl));
    // Retour rejoué : rien à faire.
    await db.query(readFileSync(RETOUR, "utf8"));
    expect(await definitions()).toEqual(rendue);
    // Marche avant de nouveau : exactement la définition migrée.
    await db.query(readFileSync(MIGRATION, "utf8"));
    expect(await definitions()).toEqual(migree);
  });

  it("une définition qui n'a ni la forme d'avant ni celle d'après : la migration refuse sans rien modifier", async () => {
    const avant = await definitions();
    await db.query(avant[0].d.replace("lower(email) = v_email", "lower(btrim(email)) = v_email"));
    const modifiee = await definitions();
    await db.query("savepoint essai");
    await expect(db.query(readFileSync(MIGRATION, "utf8"))).rejects.toThrow(/import_personne : forme inattendue \(0 ancienne\(s\), 0 nouvelle\(s\)\)/);
    await db.query("rollback to savepoint essai");
    expect(await definitions()).toEqual(modifiee);
  });
});
