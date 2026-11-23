/**
 * LA PREMIÈRE MENSUALITÉ D'UNE RÉGULARISATION ÉTALÉE TOMBE AU MOINS UN MOIS APRÈS L'ÉMISSION — phase 3 de la mission
 * palier 1, lot 42 (défaut C77 relevé sur les documents générés), côté base.
 *
 * Le défaut : `regulariser_charges` (et la régularisation tirée des factures de fourniture) fixait la première des douze
 * mensualités au 1er du mois suivant l'émission : émise le 23/11/2026, exigible le 01/12/2026, huit jours plus tard. L'échéancier
 * de charges (`preparer_echeancier_charges`) exige, lui, au moins un mois avant la première échéance ; le courrier annonçait le
 * décompte « communiqué un mois avant la régularisation ».
 *
 * Ces tests tiennent, sous les vrais rôles et à jour de Paris fixé (fonction du jour remplacée le temps de la transaction) :
 *  1. la première mensualité est le premier 1er du mois au moins un mois après l'émission (23/11 → 01/01 ; 1er novembre →
 *     01/12 ; 31/01 → 01/03 ; 31/12 → 01/02), les suivantes de mois en mois, la somme exacte ; c'est la borne de
 *     `preparer_echeancier_charges` ;
 *  2. les deux fonctions portent la nouvelle expression une fois, l'ancienne jamais ; `regulariser_charges` garde ses quatre
 *     citations du jour de Paris (le retour de 20261014821000 les compte) ; droits inchangés, rien pour anon ;
 *  3. la migration se rejoue sans effet ; elle refuse une définition inattendue sans rien modifier ;
 *  4. le retour rend l'ancienne première mensualité (1er du mois suivant), retire sa ligne d'historique, se rejoue, refuse une
 *     fonction réécrite depuis ; la migration se rejoue ensuite.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le fichier rejoue du DDL (et remplace la fonction du
 * jour dans sa transaction) : il tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const CODE = "20261123150000";
const NOM = `${CODE}_regularisation_premiere_mensualite`;
const REGULARISER = "public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean)";
const FOURNITURE = "consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text)";
const POSEE = "date_trunc('month', ((public.aujourdhui_paris() + interval '1 month')::date - 1)::timestamp) + interval '1 month'";
const AVANT = /date_trunc\(\s*'month'\s*,\s*(public\.)?aujourdhui_paris\(\)\s*\)\s*\+\s*interval\s*'1 month'/gi;
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const lire = (chemin: string) => readFileSync(chemin, "utf8");
const migration = () => lire(`supabase/migrations/${NOM}.sql`);
const retour = () => lire(`supabase/retours-arriere/${NOM}.retour.sql`);

describe("première mensualité — manifeste, retour et écriture de la migration (sans base)", () => {
  it("la migration est au manifeste une seule fois, après les repères fiscaux, avec son retour listé et dans l'ordre complet des retours", () => {
    const manifeste = lire("e2e/local/ordre-migrations.txt").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261123090000_reperes_fiscaux_reglage.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = lire("supabase/retours-arriere/LISEZ-MOI.md");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    // Elle cite la fonction du jour de Paris : son retour précède celui de 20261014500000, en tête de la chaîne (la plus récente).
    const chaine = lisezMoi.split("Ordre complet si tout doit être défait :")[1] ?? "";
    const codes = [...chaine.split("puis `500000`")[0].matchAll(/`(\d{14})`/g)].map((m) => m[1]);
    expect(codes[0]).toBe(CODE);
    expect(codes[1]).toBe("20261123090000");
    expect(lire("tests/relais-migrations-manifeste.test.ts")).toContain(`"${NOM}.sql",`);
    expect(lire("vitest.config.ts")).toContain('"tests/regularisation-premiere-mensualite-base.test.ts"');
  });

  it("la migration ne réécrit aucune donnée, ne lit pas le jour de la session et n'ouvre rien aux visiteurs", () => {
    const sql = migration().replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/\b(update|delete from|insert into)\s+public\./i);
    expect(sql).not.toMatch(/current_date|date_trunc\(\s*'month'\s*,\s*now\(\)/i);
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
    // Une expression remplacée, jamais une définition recopiée à la main.
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
    expect(sql).toContain("pg_get_functiondef");
  });

  it("le retour ne supprime ni table, ni colonne, ni ligne métier ; il retire sa ligne d'historique", () => {
    const sql = retour().replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/drop table|drop column|drop function|truncate|delete from public\./i);
    expect(sql).toContain(`delete from supabase_migrations.schema_migrations where version = '${CODE}'`);
  });
});

describe.skipIf(!url)("première mensualité d'une régularisation étalée (avec base)", () => {
  let db: Client;
  let org = "", gerant = "", bien = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const un = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0] as Record<string, unknown>;
  const id = async (sql: string, p: unknown[] = []) => String((await un(sql, p)).id);
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  async function agir(compte: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: compte, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  }
  const refus = async (sql: string, p: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, p); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  /** Le jour de Paris fixé pour la transaction (fonction du jour remplacée, rendue à l'annulation). */
  const fixerJour = (jour: string) =>
    db.query(`create or replace function public.aujourdhui_paris() returns date language sql stable set search_path = '' as $$ select date '${jour}' $$`);
  const definition = async (signature: string) => String((await un("select pg_get_functiondef($1::text::regprocedure) as d", [signature])).d);
  const empreinte = async () => {
    const etat: Record<string, unknown> = {};
    for (const s of [REGULARISER, FOURNITURE])
      etat[s] = await un("select md5(pg_get_functiondef($1::text::regprocedure)) as def, p.proacl::text as acl, p.prosecdef as definer from pg_proc p where p.oid = $1::text::regprocedure", [s]);
    return etat;
  };

  /** Une régularisation tardive étalée, émise le jour de Paris `jour` : les mensualités enregistrées. */
  async function regulariserEtale(jour: string) {
    await base();
    await fixerJour(jour);
    const annee = Number(jour.slice(0, 4));
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot '||gen_random_uuid(),'loue') returning id", [org, bien]);
    const locataire = await id("insert into public.persons(organization_id,nom,prenom) values($1,'Fictif','Locataire') returning id", [org]);
    const bail = await id(
      `insert into public.baux(organization_id,lot_id,type,etat,loyer_hc,charges,jour_echeance,date_debut,locataire_principal)
       values($1,$2,'nu','actif',600,50,5,$3,$4) returning id`,
      [org, lot, `${annee - 3}-01-01`, locataire]
    );
    const justificatif = await id(
      `insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
       values($1::uuid,'justificatif','Décompte',$1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',10,gen_random_uuid()::text) returning id`,
      [org]
    );
    await agir(gerant);
    // Exercice de l'avant-dernière année : la régularisation est tardive, donc étalable ; aucune provision, 1 200 € dus.
    const { ecart } = await un("select public.regulariser_charges($1,$2,1200,$3,null,true) as ecart", [bail, annee - 2, justificatif]);
    expect(Number(ecart)).toBe(-1200);
    await base();
    const r = await un("select date_emission::text as emission, etalement_12_mois as etalement from public.regularisations_charges where bail_id = $1", [bail]);
    return { emission: String(r.emission), mensualites: r.etalement as { rang: number; echeance: string; montant: number }[] };
  }

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,type,status) values('Essai régularisation fictive','proprietaire_direct','active') returning id");
    gerant = await id("insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now()) returning id");
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [gerant, org]);
    bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Immeuble fictif','appartement','1 rue Test','69001','Lyon',false) returning id", [org]);
  });

  it.each([
    ["2026-11-23", "2027-01-01"],
    ["2026-11-01", "2026-12-01"],
    ["2026-01-31", "2026-03-01"],
    ["2026-12-31", "2027-02-01"],
  ])("émise le %s : première mensualité le %s, au moins un mois après, puis de mois en mois", async (jour, premiere) => {
    const { emission, mensualites } = await regulariserEtale(jour);
    expect(emission).toBe(jour);
    expect(mensualites).toHaveLength(12);
    expect(mensualites[0].echeance).toBe(premiere);
    // La borne de preparer_echeancier_charges : jamais avant le jour de l'émission plus un mois.
    const borne = String((await un("select ($1::date + interval '1 month')::date::text as b", [jour])).b);
    expect(mensualites[0].echeance >= borne).toBe(true);
    for (let k = 1; k < 12; k++) {
      const attendue = String((await un("select ($1::date + make_interval(months => $2))::date::text as d", [premiere, k])).d);
      expect(mensualites[k]).toMatchObject({ rang: k + 1, echeance: attendue });
    }
    expect(mensualites.reduce((s, m) => s + Number(m.montant), 0)).toBeCloseTo(1200, 2);
  });

  it("les deux fonctions portent la nouvelle première mensualité une fois et l'ancienne jamais ; droits inchangés, rien pour anon", async () => {
    for (const s of [REGULARISER, FOURNITURE]) {
      const def = await definition(s);
      expect(def.split(POSEE).length - 1, s).toBe(1);
      expect(def.match(AVANT) ?? [], s).toHaveLength(0);
      expect(def, s).toMatch(/SECURITY DEFINER/);
    }
    // Le retour de 20261014821000 compte quatre citations du jour de Paris dans regulariser_charges : le compte ne change pas.
    expect((await definition(REGULARISER)).match(/(\bpublic\.)?\baujourdhui_paris\(\)/g)).toHaveLength(4);
    const droits = await un(
      `select has_function_privilege('anon',$1,'execute') anon, has_function_privilege('authenticated',$1,'execute') connecte,
              has_function_privilege('anon',$2,'execute') anon_fourniture`,
      [REGULARISER, FOURNITURE]
    );
    expect(droits).toEqual({ anon: false, connecte: true, anon_fourniture: false });
  });

  it("rejouée deux fois, la migration ne change rien ; une définition inattendue l'arrête sans rien modifier", async () => {
    const avant = await empreinte();
    await db.query(migration());
    expect(await empreinte()).toEqual(avant);
    await db.query(migration());
    expect(await empreinte()).toEqual(avant);

    // L'ancienne ET la nouvelle première mensualité dans la même fonction : forme inconnue, refusée.
    await db.query((await definition(REGULARISER)).replace("v_etalement := '[]'::jsonb;", "v_etalement := '[]'::jsonb; v_base := v_base + 0 * extract(day from (date_trunc('month', public.aujourdhui_paris()) + interval '1 month'));"));
    const modifiee = await empreinte();
    expect(await refus(migration())).toMatch(/regulariser_charges\(uuid,integer,numeric,uuid,text,boolean\) contient 1 fois la première mensualité d'avant et 1 fois celle de ce lot/);
    expect(await empreinte()).toEqual(modifiee);
  });

  it("le retour rend le 1er du mois suivant, retire sa ligne d'historique, se rejoue ; la migration se rejoue ensuite", async () => {
    const migre = await empreinte();
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values($1,'regularisation_premiere_mensualite') on conflict do nothing", [CODE]);
    await db.query(retour());
    for (const s of [REGULARISER, FOURNITURE]) {
      const def = await definition(s);
      expect(def.split(POSEE).length - 1, s).toBe(0);
      expect(def.match(AVANT) ?? [], s).toHaveLength(1);
    }
    expect((await definition(REGULARISER)).match(/(\bpublic\.)?\baujourdhui_paris\(\)/g)).toHaveLength(4);
    expect(Number((await un("select count(*) n from supabase_migrations.schema_migrations where version = $1", [CODE])).n)).toBe(0);
    // Après le retour, le défaut revient : émise le 23/11, première mensualité le 01/12.
    await db.query("savepoint essai");
    expect((await regulariserEtale("2026-11-23")).mensualites[0].echeance).toBe("2026-12-01");
    await db.query("rollback to savepoint essai");
    await base();
    const revenu = await empreinte();
    await db.query(retour());
    expect(await empreinte()).toEqual(revenu);
    await db.query(migration());
    expect(await empreinte()).toEqual(migre);
  });

  it("le retour n'écrase pas une fonction réécrite depuis : il s'arrête et ne modifie rien", async () => {
    await db.query((await definition(REGULARISER)).replace("v_etalement := '[]'::jsonb;", `v_etalement := '[]'::jsonb; v_base := v_base + 0 * extract(day from (${POSEE}));`));
    const avant = await empreinte();
    expect(await refus(retour())).toMatch(/regulariser_charges\(uuid,integer,numeric,uuid,text,boolean\) contient 2 fois la première mensualité de la migration et 0 fois celle d'avant : définition réécrite depuis, rien n'est modifié/);
    expect(await empreinte()).toEqual(avant);
  });
});
