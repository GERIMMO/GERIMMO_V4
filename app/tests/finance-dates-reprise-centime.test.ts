/**
 * Décision X09 du 14/10/2026 (fiche FIN-03), constat de relecture du 15/10 : la reprise de soldes dit, au contrôle, ce que la bascule fera.
 *
 * La contrainte de centime des encaissements (20261014412000) fait refuser toute avance de locataire qui n'est pas au centime près.
 * Or le contrôle de la reprise (reprendre_soldes, mode « contrôle seulement ») lisait le montant sans le ramener au centime : une ligne
 * « 123,456 » (trésorerie annoncée 123,46) passait en « Prêt à reprendre. », puis la bascule échouait sur la contrainte, avec un message
 * générique, au moment même d'une reprise. Rien n'était écrit (la bascule est atomique), mais le contrôle ne tenait plus sa promesse.
 *
 * Maintenant le contrôle refuse toute ligne dont le montant n'est pas au centime près (« Montant au centime près »), quel que soit son
 * type, ainsi que les montants qui ne sont pas des nombres (NaN, Infinity). Ce que le contrôle accepte, la bascule l'écrit.
 *
 * Nécessite SUPABASE_DB_URL (base locale jetable). Transaction annulée à la fin de chaque test.
 */
import { verifierBaseDeTest } from "./garde-base";
import { couvrirParMandat } from "./fixtures/mandat";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sansJargon } from "../src/lib/erreurs";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

let db: Client;
let org: string;
let admin: string;
let bail: string;

type Resultat = { ligne: number; statut: "ok" | "alerte" | "erreur"; message: string; type: string; montant: string; tresorerie: boolean };

const id = async (sql: string, args: unknown[] = []) => (await db.query<{ id: string }>(sql, args)).rows[0].id;
const compte = (prefixe: string) =>
  id(
    `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
       raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,
       email_change,email_change_token_new,email_change_token_current)
     values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
       $1||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`,
    [prefixe]
  );
async function simuler(accountId: string) {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: accountId, role: "authenticated", aal: "aal2" })]);
  await db.query("set local role authenticated");
}
/** Joue une requête dont on ATTEND le refus, sans emporter la transaction ; rend le message de l'erreur. */
async function refus(sql: string, args: unknown[] = []): Promise<string> {
  await db.query("savepoint essai");
  try {
    await db.query(sql, args);
    await db.query("release savepoint essai");
    throw new Error("PAS_DE_REFUS");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.query("rollback to savepoint essai");
    if (message === "PAS_DE_REFUS") throw new Error(`Attendu un refus, la requête est passée : ${sql}`);
    return message;
  }
}
async function ouvrir(tresorerie: string): Promise<string> {
  await simuler(admin);
  const { rows } = await db.query<{ r: string }>("select public.ouvrir_reprise($1, current_date, $2::numeric, 'fichier') as r", [org, tresorerie]);
  return rows[0].r;
}
async function passer(reprise: string, lignes: Record<string, string>[], controleSeulement = true): Promise<Resultat[]> {
  await simuler(admin);
  const { rows } = await db.query<Resultat>("select * from public.reprendre_soldes($1,$2,$3::jsonb,$4)", [org, reprise, JSON.stringify(lignes), controleSeulement]);
  return rows;
}
const compter = async (table: string, colonne = "organization_id") => {
  await db.query("reset role");
  return Number((await db.query<{ n: string }>(`select count(*) as n from public.${table} where ${colonne} = $1`, [org])).rows[0].n);
};

const solde = (montant: string) => ({ type: "solde_locataire", montant, locataire_email: "linh.nguyen@exemple.fr" });
const MESSAGE_CENTIME = (saisie: string) => `Montant au centime près : « ${saisie} » a plus de deux décimales. Corrigez-le dans le fichier.`;

beforeAll(async () => {
  db = new Client({ connectionString: DB_URL });
  await db.connect();
});
afterAll(async () => {
  await db?.end();
});
afterEach(async () => {
  await db.query("rollback");
});
beforeEach(async () => {
  await db.query("begin");
  await db.query("reset role");
  org = await id("insert into public.organizations(name,status,type) values('Reprise centime','active','agence') returning id");
  admin = await compte("admin");
  await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'admin_agence')", [admin, org]);
  await id("insert into public.persons(organization_id,nom,prenom,email) values($1,'Moreau','Alain','alain.moreau@exemple.fr') returning id", [org]);
  const locataire = await id("insert into public.persons(organization_id,nom,prenom,email) values($1,'Nguyen','Linh','linh.nguyen@exemple.fr') returning id", [org]);
  const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Les Acacias','appartement','4 rue des Acacias','69003','Lyon') returning id", [org]);
  const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'A1','loue') returning id", [org, bien]);
  bail = await id(
    "insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges,depot_garantie) values($1,$2,$3,'actif',current_date-400,700,50,700) returning id",
    [org, lot, locataire]
  );
  await couvrirParMandat(db, bail);
});

describe.skipIf(!DB_URL)("X09 : le contrôle de la reprise refuse ce que la contrainte de centime refuserait à la bascule", () => {
  it("« 123,456 » avec 123,46 annoncé : erreur dès le contrôle, avec le motif — plus de « Prêt à reprendre. »", async () => {
    const reprise = await ouvrir("123.46");
    const [ligne] = await passer(reprise, [solde("123,456")]);
    expect(ligne.statut).toBe("erreur");
    expect(ligne.message).toBe(MESSAGE_CENTIME("123,456"));
    expect(ligne.message).not.toMatch(/Prêt à reprendre/);
    expect(ligne.tresorerie).toBe(false);
  });

  it("la bascule d'une telle ligne est refusée par le motif habituel (« ligne en erreur »), pas par la contrainte, et n'écrit rien", async () => {
    const reprise = await ouvrir("123.46");
    await simuler(admin);
    const e = await refus("select * from public.reprendre_soldes($1,$2,$3::jsonb,false)", [org, reprise, JSON.stringify([solde("123,456")])]);
    expect(e).toMatch(/1 ligne\(s\) en erreur/);
    expect(e).not.toMatch(/encaissements_montant_centime_check/);
    // sansJargon ne la remplace pas par le message générique « Gerimmo n'a pas pu terminer cette action ».
    expect(sansJargon(e)).not.toMatch(/pas pu terminer/);
    expect(await compter("encaissements")).toBe(0);
    expect(await compter("reprise_soldes")).toBe(0);
    await db.query("reset role");
    expect((await db.query("select statut from public.reprises_portefeuille where id=$1", [reprise])).rows[0].statut).not.toBe("basculee");
  });

  it.each([
    ["solde_locataire", { locataire_email: "linh.nguyen@exemple.fr" }],
    ["depot_garantie", { locataire_email: "linh.nguyen@exemple.fr", detenteur: "agence" }],
    ["provision_charges", { locataire_email: "linh.nguyen@exemple.fr" }],
    ["fonds_mandant", { proprietaire_email: "alain.moreau@exemple.fr" }],
  ])("%s à trois décimales : refusé aussi (la base arrondirait en silence ou la contrainte refuserait à la bascule)", async (type, rattachement) => {
    const reprise = await ouvrir("700");
    const [ligne] = await passer(reprise, [{ type, montant: "700,004", ...rattachement }]);
    expect(ligne.statut).toBe("erreur");
    expect(ligne.message).toBe(MESSAGE_CENTIME("700,004"));
  });

  it("une dette (solde négatif) à trois décimales est refusée de la même façon", async () => {
    const reprise = await ouvrir("0");
    const [ligne] = await passer(reprise, [solde("-50,125")]);
    expect(ligne.statut).toBe("erreur");
    expect(ligne.message).toBe(MESSAGE_CENTIME("-50,125"));
  });

  it("trois fonds de 10,004 € avec 30,01 € annoncés : chaque ligne est refusée, la somme des arrondis ne se substitue pas au fichier", async () => {
    const reprise = await ouvrir("30.01");
    const lignes = await passer(reprise, [1, 2, 3].map(() => ({ type: "fonds_mandant", montant: "10,004", proprietaire_email: "alain.moreau@exemple.fr" })));
    expect(lignes.map((l) => l.statut)).toEqual(["erreur", "erreur", "erreur"]);
  });

  it("la virgule du tableur et l'espace des milliers restent lus ; seul compte le montant : « 12,500 » vaut 12,50 et passe, « 1 234,567 » est refusé", async () => {
    const reprise = await ouvrir("0");
    const lignes = await passer(reprise, [solde("1 234,567"), solde("1 234,56"), solde("1234.5"), solde("12,5"), solde("12,500")]);
    expect(lignes.map((l) => l.statut)).toEqual(["erreur", "ok", "ok", "ok", "ok"]);
    expect(lignes[0].message).toBe(MESSAGE_CENTIME("1 234,567"));
    expect(lignes[1].message).toBe("Prêt à reprendre.");
  });

  it.each(["NaN", "Infinity", "-Infinity"])("« %s » n'est pas un montant : illisible dès le contrôle, jamais « Prêt à reprendre. »", async (texte) => {
    const reprise = await ouvrir("0");
    const [ligne] = await passer(reprise, [solde(texte)]);
    expect(ligne.statut).toBe("erreur");
    expect(ligne.message).toBe("Montant absent ou illisible.");
    expect(ligne.tresorerie).toBe(false);
  });

  it.each([
    ["123,45", 123.45],
    ["123.4", 123.4],
    ["12,5", 12.5],
    ["1 000", 1000],
  ])("le contrôle dit ce que la bascule fera : « %s » accepté au contrôle s'écrit tel quel dans l'encaissement", async (saisie, ecrit) => {
    const reprise = await ouvrir(String(ecrit));
    const [controle] = await passer(reprise, [solde(saisie)]);
    expect(controle.statut).toBe("ok");
    const [bascule] = await passer(reprise, [solde(saisie)], false);
    expect(bascule.statut).toBe("ok");
    await db.query("reset role");
    const { rows } = await db.query<{ m: string }>("select montant::text as m from public.encaissements where bail_id=$1 and note='Avance reprise au portefeuille'", [bail]);
    expect(rows.map((r) => Number(r.m))).toEqual([ecrit]);
  });
});
