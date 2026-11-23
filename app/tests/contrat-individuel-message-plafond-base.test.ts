/**
 * LE REFUS D'ACTIVER UN CONTRAT INDIVIDUEL SANS PLAFOND NOMME LE « LOYER MAXIMAL APPLICABLE AU LOGEMENT ENTIER » — phase 3 de
 * la mission palier 1, reprise du lot 40 (défaut C30 relevé sur les documents générés), côté base.
 *
 * Le défaut : l'écran du lot, l'aide et le contrat individuel disent « Loyer maximal applicable au logement entier » depuis le
 * lot 40 ; le déclencheur `baux_contrat_individuel` refusait encore avec « Renseignez le loyer de référence du logement
 * entier… », l'ancien mot, confondu avec les loyers de référence de l'encadrement.
 *
 * Ces tests tiennent :
 *  1. le refus emploie le nouveau mot ; le contrôle reste le même (un plafond renseigné laisse activer le contrat) ;
 *  2. la fonction porte le nouveau message une fois, l'ancien jamais ; droits inchangés (fonction de déclencheur, fermée aux
 *     comptes et aux visiteurs) ;
 *  3. la migration se rejoue sans effet ; elle refuse une définition inattendue sans rien modifier ;
 *  4. le retour rend l'ancien message, retire sa ligne d'historique, se rejoue, refuse une fonction réécrite depuis ; la
 *     migration se rejoue ensuite.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le fichier rejoue du DDL : il tourne en série
 * (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const CODE = "20261123170000";
const NOM = `${CODE}_contrat_individuel_message_plafond`;
const FONCTION = "public.controler_contrat_individuel()";
const AVANT = "Renseignez le loyer de référence du logement entier avant d’activer un contrat individuel";
const POSE = "Renseignez le loyer maximal applicable au logement entier avant d’activer un contrat individuel";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const lire = (chemin: string) => readFileSync(chemin, "utf8");
const migration = () => lire(`supabase/migrations/${NOM}.sql`);
const retour = () => lire(`supabase/retours-arriere/${NOM}.retour.sql`);
const compter = (texte: string, motif: string) => texte.split(motif).length - 1;

describe("message du plafond de la colocation — manifeste, retour et écriture de la migration (sans base)", () => {
  it("la migration est au manifeste une seule fois, après la première mensualité, avec son retour listé", () => {
    const manifeste = lire("e2e/local/ordre-migrations.txt").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261123150000_regularisation_premiere_mensualite.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(lire("supabase/retours-arriere/LISEZ-MOI.md")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(lire("tests/relais-migrations-manifeste.test.ts")).toContain(`"${NOM}.sql",`);
    expect(lire("vitest.config.ts")).toContain('"tests/contrat-individuel-message-plafond-base.test.ts"');
  });

  it("la migration ne lit ni n'écrit aucune ligne, ne recopie aucune fonction et n'ouvre rien aux visiteurs", () => {
    const sql = migration().replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/\b(update|delete from|insert into)\s+public\./i);
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
    expect(sql).toContain("pg_get_functiondef");
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
  });

  it("le retour ne supprime ni table, ni colonne, ni fonction ; il retire sa ligne d'historique", () => {
    const sql = retour().replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/drop table|drop column|drop function|truncate|delete from public\./i);
    expect(sql).toContain(`delete from supabase_migrations.schema_migrations where version = '${CODE}'`);
  });
});

describe.skipIf(!url)("message du plafond de la colocation (avec base)", () => {
  let db: Client;
  let org = "", lot = "", chambre = "", locataire = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const un = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0] as Record<string, unknown>;
  const id = async (sql: string, p: unknown[] = []) => String((await un(sql, p)).id);
  const refus = async (sql: string, p: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, p); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  const definition = async () => String((await un("select pg_get_functiondef($1::text::regprocedure) as d", [FONCTION])).d);
  const empreinte = async () => un(
    "select md5(pg_get_functiondef(p.oid)) as def, p.proacl::text as acl, p.prosecdef as definer from pg_proc p where p.oid = $1::text::regprocedure",
    [FONCTION]
  );
  /** Un contrat individuel activé d'emblée sur la chambre du lot. */
  const activer = () => refus(
    `insert into public.baux(organization_id,lot_id,type,etat,loyer_hc,charges,jour_echeance,date_debut,locataire_principal,chambre_id)
     values($1,$2,'colocation','actif',400,50,5,'2026-01-01',$3,$4)`,
    [org, lot, locataire, chambre]
  );

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,type,status) values('Essai plafond fictif','proprietaire_direct','active') returning id");
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Immeuble fictif','appartement','1 rue Test','69001','Lyon',false) returning id", [org]);
    lot = await id("insert into public.lots(organization_id,bien_id,nom,etat,surface_m2,meuble) values($1,$2,'Lot fictif','loue',80,true) returning id", [org, bien]);
    chambre = await id("insert into public.lot_chambres(organization_id,lot_id,nom,surface_m2,volume_m3,description,espaces_partages) values($1,$2,'Chambre 1',12,30,'Porte','Cuisine') returning id", [org, lot]);
    locataire = await id("insert into public.persons(organization_id,nom,prenom) values($1,'Fictif','Locataire') returning id", [org]);
  });

  it("sans plafond, le refus nomme le loyer maximal applicable au logement entier ; avec un plafond, le contrat s'active", async () => {
    expect(await activer()).toBe(POSE);
    await db.query("update public.lots set colocation_loyer_reference = 1800 where id = $1", [lot]);
    expect(await activer()).toBe("");
  });

  it("la fonction porte le nouveau message une fois et l'ancien jamais ; droits inchangés, rien pour les comptes ni anon", async () => {
    const def = await definition();
    expect(compter(def, POSE)).toBe(1);
    expect(compter(def, AVANT)).toBe(0);
    expect(def).toMatch(/SECURITY DEFINER/);
    const droits = await un(
      "select has_function_privilege('anon',$1,'execute') anon, has_function_privilege('authenticated',$1,'execute') connecte",
      [FONCTION]
    );
    expect(droits).toEqual({ anon: false, connecte: false });
  });

  it("rejouée deux fois, la migration ne change rien ; une définition inattendue l'arrête sans rien modifier", async () => {
    const avant = await empreinte();
    await db.query(migration());
    expect(await empreinte()).toEqual(avant);
    await db.query(migration());
    expect(await empreinte()).toEqual(avant);

    // L'ancien ET le nouveau message dans la même fonction : forme inconnue, refusée.
    await db.query((await definition()).replace("return new;\nend", `if false then raise exception '${AVANT}'; end if;\n  return new;\nend`));
    const modifiee = await empreinte();
    expect(modifiee).not.toEqual(avant);
    expect(await refus(migration())).toMatch(/controler_contrat_individuel\(\) contient 1 fois l'ancien message et 1 fois celui de ce lot/);
    expect(await empreinte()).toEqual(modifiee);
  });

  it("le retour rend l'ancien message, retire sa ligne d'historique, se rejoue ; la migration se rejoue ensuite", async () => {
    const migre = await empreinte();
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values($1,'contrat_individuel_message_plafond') on conflict do nothing", [CODE]);
    await db.query(retour());
    const def = await definition();
    expect(compter(def, POSE)).toBe(0);
    expect(compter(def, AVANT)).toBe(1);
    expect(Number((await un("select count(*) n from supabase_migrations.schema_migrations where version = $1", [CODE])).n)).toBe(0);
    expect(await activer()).toBe(AVANT);
    const revenu = await empreinte();
    await db.query(retour());
    expect(await empreinte()).toEqual(revenu);
    await db.query(migration());
    expect(await empreinte()).toEqual(migre);
  });

  it("le retour n'écrase pas une fonction réécrite depuis : il s'arrête et ne modifie rien", async () => {
    await db.query((await definition()).replace("return new;\nend", `if false then raise exception '${POSE}'; end if;\n  return new;\nend`));
    const avant = await empreinte();
    expect(await refus(retour())).toMatch(/controler_contrat_individuel\(\) contient 2 fois le message de la migration et 0 fois celui d'avant : définition réécrite depuis, rien n'est modifié/);
    expect(await empreinte()).toEqual(avant);
  });
});
