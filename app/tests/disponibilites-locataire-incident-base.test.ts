/**
 * LE LOCATAIRE DIT SES DISPONIBILITÉS DÈS QU'IL SIGNALE UN INCIDENT — audit palier 1 du 22/11/2026, P2-02, côté base.
 *
 * Ces tests tiennent, sous les vrais rôles :
 *  1. le locataire qui a déclaré écrit, corrige, efface ses disponibilités ; l'instant suit ; le gestionnaire les lit ;
 *  2. un incident déclaré par le gestionnaire sur un bail : le locataire principal du bail peut les indiquer ;
 *  3. un autre locataire du même espace, le gestionnaire lui-même, un compte étranger, un visiteur : refus, rien n'est
 *     écrit, et le refus est le même que pour un dossier qui n'existe pas ;
 *  4. dossier clos : refus ; texte de plus de 300 caractères : refus, par la fonction et par la contrainte ;
 *  5. la migration se rejoue sans effet ; son retour supprime la fonction et garde ce qui a été écrit.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { DISPONIBILITES_LOCATAIRE_MAX } from "../src/lib/incidents";

const NOM = "20261122233000_disponibilites_locataire_incident";
const FONCTION = "public.indiquer_mes_disponibilites_incident(uuid,text)";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("disponibilités du locataire — manifeste, retour et borne (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/disponibilites-locataire-incident-base.test.ts"');
  });

  it("l'écran borne le texte comme la base ; la migration n'ouvre rien aux visiteurs", () => {
    expect(DISPONIBILITES_LOCATAIRE_MAX).toBe(300);
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).toContain("between 1 and 300");
    expect(sql).toContain("length(v_texte) > 300");
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    expect(sql).not.toContain("poser_gardes_abonnement");
    expect(sql).not.toMatch(/current_date|aujourdhui_paris/i);
  });
});

describe.skipIf(!url)("disponibilités du locataire sur un signalement (avec base)", () => {
  let db: Client;
  let org = "", gerant = "", locataire = "", colocataire = "", etranger = "", incident = "", incidentGerant = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  async function compte() {
    return id("insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now()) returning id");
  }
  async function agir(compteId: string | null, role: "authenticated" | "anon" = "authenticated") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(compteId ? { sub: compteId, role, aal: "aal2" } : { role })]);
    await db.query(`set local role ${role}`);
  }
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const refus = async (sql: string, p: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, p); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  const indiquer = (texte: string | null, cible = incident) => refus("select public.indiquer_mes_disponibilites_incident($1,$2)", [cible, texte]);
  const lu = async (cible = incident) => { await base(); return (await db.query("select disponibilites_locataire texte, disponibilites_locataire_le is not null date from public.incidents where id=$1", [cible])).rows[0] as { texte: string | null; date: boolean }; };

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,type,status) values('Essai disponibilités fictif','proprietaire_direct','active') returning id");
    const autre = await id("insert into public.organizations(name,type,status) values('Autre espace fictif','proprietaire_direct','active') returning id");
    gerant = await compte(); locataire = await compte(); colocataire = await compte(); etranger = await compte();
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$2,'locataire'),($4,$2,'locataire'),($5,$6,'proprietaire_direct')", [gerant, org, locataire, colocataire, etranger, autre]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Bien fictif','appartement','1 rue Test','69001','Lyon',false) returning id", [org]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','loue') returning id", [org, bien]);
    const fiche = await id("insert into public.persons(organization_id,nom,prenom,account_id) values($1,'Fictif','Locataire',$2) returning id", [org, locataire]);
    await db.query("insert into public.persons(organization_id,nom,prenom,account_id) values($1,'Fictif','Voisin',$2)", [org, colocataire]);
    const bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'nu','actif',current_date-100,600,40) returning id", [org, lot, fiche]);
    incident = await id("insert into public.incidents(organization_id,lot_id,bail_id,declarant_person_id,numero,canal,categorie,description,etat,urgence) values($1,$2,$3,$4,$5,'espace_locataire','plomberie_joint','TEST disponibilités','declare','normale') returning id", [org, lot, bail, fiche, `TEST-DISPO-${randomUUID().slice(0, 8)}`]);
    // Déclaré par le gestionnaire sur le bail : aucun déclarant, le titulaire est le locataire principal du bail.
    incidentGerant = await id("insert into public.incidents(organization_id,lot_id,bail_id,numero,canal,categorie,description,etat,urgence) values($1,$2,$3,$4,'agence','serrurerie_cle','TEST disponibilités gestionnaire','declare','normale') returning id", [org, lot, bail, `TEST-DISPO-G-${randomUUID().slice(0, 8)}`]);
  });

  it("le locataire écrit, corrige et efface ; l'instant suit ; le gestionnaire les lit", async () => {
    expect(await lu()).toEqual({ texte: null, date: false });
    await agir(locataire);
    expect(await indiquer("  En semaine après 18 h, samedi matin  ")).toBe("");
    expect(await lu()).toEqual({ texte: "En semaine après 18 h, samedi matin", date: true });
    // Le gestionnaire du dossier lit ce texte comme le reste de l'incident, sous ses propres droits.
    await agir(gerant);
    expect((await db.query("select disponibilites_locataire t from public.incidents where id=$1", [incident])).rows).toEqual([{ t: "En semaine après 18 h, samedi matin" }]);
    await agir(locataire);
    expect(await indiquer("Tous les jours après 17 h")).toBe("");
    expect(await lu()).toEqual({ texte: "Tous les jours après 17 h", date: true });
    await agir(locataire);
    for (const vide of ["", "   ", null]) {
      expect(await indiquer(vide)).toBe("");
      expect(await lu()).toEqual({ texte: null, date: false });
      await agir(locataire);
    }
  });

  it("incident déclaré par le gestionnaire sur le bail : le locataire principal indique ses disponibilités", async () => {
    await agir(locataire);
    expect(await indiquer("Le matin avant 9 h", incidentGerant)).toBe("");
    expect(await lu(incidentGerant)).toEqual({ texte: "Le matin avant 9 h", date: true });
  });

  it("autre locataire, gestionnaire, compte étranger, visiteur : même refus que pour un dossier absent, rien n'est écrit", async () => {
    for (const qui of [colocataire, gerant, etranger]) {
      await agir(qui);
      expect(await indiquer("Samedi"), qui).toBe("Signalement introuvable");
    }
    await agir(locataire);
    expect(await indiquer("Samedi", randomUUID())).toBe("Signalement introuvable");
    await agir(null, "anon");
    expect(await indiquer("Samedi")).toMatch(/permission denied|droit refusé/i);
    expect(await lu()).toEqual({ texte: null, date: false });
  });

  it("dossier clos ou texte trop long : refus ; la contrainte tient aussi une écriture directe", async () => {
    await agir(locataire);
    expect(await indiquer("x".repeat(301))).toMatch(/300 caractères au plus/);
    expect(await indiquer("x".repeat(300))).toBe("");
    await base();
    expect(await refus("update public.incidents set disponibilites_locataire = repeat('x', 301), disponibilites_locataire_le = now() where id=$1", [incident])).toMatch(/incidents_disponibilites_locataire_bornees/);
    expect(await refus("update public.incidents set disponibilites_locataire = 'Samedi', disponibilites_locataire_le = null where id=$1", [incident])).toMatch(/incidents_disponibilites_locataire_bornees/);
    expect(await refus("update public.incidents set disponibilites_locataire = '   ', disponibilites_locataire_le = now() where id=$1", [incident])).toMatch(/incidents_disponibilites_locataire_bornees/);
    await db.query("update public.incidents set etat='clos', clos_le=now(), cloture_motif='sans_suite' where id=$1", [incident]);
    await agir(locataire);
    expect(await indiquer("Dimanche")).toMatch(/Ce signalement est clos/);
    expect((await lu()).texte).toBe("x".repeat(300));
  });

  it("rejeu sans effet ; le retour supprime la fonction et garde ce qui a été écrit ; la migration se rejoue", async () => {
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const existe = async () => (await db.query("select to_regprocedure($1) is not null e", [FONCTION])).rows[0].e as boolean;
    const colonnes = async () => (await db.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='incidents' and column_name in ('disponibilites_locataire','disponibilites_locataire_le')")).rows[0].n as number;
    const droits = async () => (await db.query("select has_function_privilege('anon',$1,'execute') anon, has_function_privilege('authenticated',$1,'execute') connecte", [FONCTION])).rows[0];

    await agir(locataire);
    expect(await indiquer("Samedi matin")).toBe("");
    await base();
    await db.query(migration);
    expect(await existe()).toBe(true);
    expect(await droits()).toEqual({ anon: false, connecte: true });
    expect(await lu()).toEqual({ texte: "Samedi matin", date: true });

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122233000','disponibilites_locataire_incident') on conflict do nothing");
    await db.query(retour);
    expect(await existe()).toBe(false);
    expect(await colonnes()).toBe(2);
    expect(await lu()).toEqual({ texte: "Samedi matin", date: true });
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261122233000'")).rows[0].n).toBe(0);
    await db.query(retour);
    expect(await existe()).toBe(false);

    await db.query(migration);
    expect(await existe()).toBe(true);
    expect(await droits()).toEqual({ anon: false, connecte: true });
    expect(await lu()).toEqual({ texte: "Samedi matin", date: true });
    await agir(locataire);
    expect(await indiquer("Dimanche")).toBe("");
  });
});
