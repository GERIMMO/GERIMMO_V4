/**
 * Audit palier 1, P2-05 — un loyer pointé à partir d'une ligne de relevé de banque : la base.
 *
 * Ce que ce fichier prouve, sur une vraie base, dans une transaction annulée :
 *  1. la fonction enregistre le règlement avec les garanties de la réception déclarée, et sa note dit d'où il vient ;
 *  2. montant égal au reste : loyer soldé ; inférieur : partiel ; supérieur : refusé, rien n'est écrit ;
 *  3. la même ligne ne compte qu'une fois, même relue ; elle ne peut pas servir à solder un AUTRE loyer ;
 *  4. le plus ancien loyer d'abord, jamais une échéance à venir, jamais une date future ;
 *  5. seul le propriétaire de l'espace : ni un autre propriétaire, ni le locataire, ni un visiteur ;
 *  6. le libellé est ramené à une ligne de 200 caractères ; la migration se rejoue ; son retour garde les règlements.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const CODE = "20261122235950";
const NOM = `${CODE}_pointage_loyer_releve`;
const FONCTION = "public.pointer_loyer_releve(uuid,uuid,numeric,date,text,uuid,numeric,text)";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("pointage d'un loyer sur relevé — manifeste et retour (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    // Elle vient après toutes les migrations plus anciennes qu'elle (d'autres lots peuvent la suivre).
    expect(manifeste.slice(0, manifeste.indexOf(`${NOM}.sql`)).every((l) => l < `${NOM}.sql`)).toBe(true);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/pointage-loyer-releve-base.test.ts"');
  });

  it("la migration ne crée ni table ni colonne et ne recopie aucune règle d'encaissement", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/create table|alter table|drop |insert into|delete from/i);
    // Une seule écriture : la note du règlement que l'appel vient de créer, retrouvé par sa clé.
    expect(sql.match(/update\s+public\.\w+/gi)).toEqual(["update public.encaissements"]);
    expect(sql).toMatch(/if r ->> 'statut' = 'enregistre' then/);
    expect(sql).toContain("public.declarer_reception_loyer(");
    // Elle écrit sous ses propres droits : sa garde d'accès est la sienne, AVANT tout appel et toute écriture.
    const garde = sql.indexOf("if auth.uid() is null or p_org is null");
    expect(garde).toBeGreaterThan(0);
    expect(sql).toContain("p_org not in (select public.org_ids_avec_roles(array['proprietaire_direct']::public.membership_role[]))");
    expect(garde).toBeLessThan(sql.indexOf("public.declarer_reception_loyer("));
    expect(garde).toBeLessThan(sql.indexOf("update public.encaissements"));
    expect(sql).toMatch(/security definer\s+set search_path = ''/);
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
  });

  it("le retour ne supprime que la fonction", () => {
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(retour).not.toMatch(/drop table|truncate|delete from public\.|update /i);
    expect(retour.replace(/\s+/g, "")).toContain("dropfunctionifexistspublic.pointer_loyer_releve(uuid,uuid,numeric,date,text,uuid,numeric,text)");
  });
});

describe.skipIf(!url)("pointage d'un loyer sur relevé — base réelle", () => {
  let db: Client, org: string, autre: string, compte: string, etranger: string, locataire: string;
  let bail: string, ancien: string, courant: string, futur: string, jour: string;

  async function utilisateur() {
    const id = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [id, `${id}@test.local`]);
    return id;
  }
  async function agir(id: string | null, role: "authenticated" | "anon" = "authenticated") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(id ? { sub: id, role, aal: "aal2" } : { role })]);
    await db.query(`set local role ${role}`);
  }
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  type Appel = { cible?: string; montant?: number | null; reste?: number; date?: string; mode?: string; cle?: string; libelle?: string | null; espace?: string };
  async function pointer(a: Appel = {}) {
    const p = [a.espace ?? org, a.cible ?? ancien, a.montant === undefined ? 800 : a.montant, a.date ?? jour, a.mode ?? "virement", a.cle ?? randomUUID(), a.reste ?? 800, a.libelle === undefined ? "VIR SEPA M DURAND LOYER" : a.libelle];
    await db.query("savepoint pointage");
    try {
      const r = (await db.query("select public.pointer_loyer_releve($1,$2,$3,$4,$5,$6,$7,$8) r", p)).rows[0].r as { statut: string; bail_id?: string; montant?: number };
      await db.query("release savepoint pointage");
      return { ...r, erreur: "" };
    } catch (e) { await db.query("rollback to savepoint pointage"); return { statut: "", erreur: (e as Error).message }; }
  }
  const reglements = async () => {
    await base();
    return (await db.query("select montant::float8 montant, date_paiement::text date, mode, note, cle_envoi cle from public.encaissements where bail_id=$1 order by created_at, montant", [bail])).rows;
  };

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => {
    await db.query("begin");
    jour = (await db.query("select public.aujourdhui_paris()::text jour")).rows[0].jour;
    compte = await utilisateur(); etranger = await utilisateur(); locataire = await utilisateur();
    const orgs = (await db.query("insert into organizations(name,type,status,essai_fin) values('TEST pointage','proprietaire_direct','essai',public.aujourdhui_paris()+30),('TEST étranger','proprietaire_direct','essai',public.aujourdhui_paris()+30) returning id")).rows;
    [org, autre] = orgs.map((o) => o.id);
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$4,'proprietaire_direct'),($5,$2,'locataire')", [compte, org, etranger, autre, locataire]);
    const bien = (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST Bien','appartement','1 rue fictive','75001','Paris') returning id", [org])).rows[0].id;
    const lot = (await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST Appartement','loue') returning id", [org, bien])).rows[0].id;
    const personne = (await db.query("insert into persons(organization_id,prenom,nom,account_id) values($1,'Marc','Durand',$2) returning id", [org, locataire])).rows[0].id;
    bail = (await db.query("insert into baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,'nu','actif',public.aujourdhui_paris()-100,750,50,5) returning id", [org, lot, personne])).rows[0].id;
    [ancien, courant, futur] = [randomUUID(), randomUUID(), randomUUID()];
    await db.query(`insert into appels_loyer(id,organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values
      ($1,$4,$5,(date_trunc('month',public.aujourdhui_paris())-interval '1 month')::date,public.aujourdhui_paris()-30,750,50,800),
      ($2,$4,$5,date_trunc('month',public.aujourdhui_paris())::date,public.aujourdhui_paris(),750,50,800),
      ($3,$4,$5,(date_trunc('month',public.aujourdhui_paris())+interval '1 month')::date,public.aujourdhui_paris()+30,750,50,800)`, [ancien, courant, futur, org, bail]);
    await agir(compte);
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("montant égal au reste : le loyer est soldé, la note dit le relevé et son libellé, l'écriture comptable existe", async () => {
    const cle = randomUUID();
    const r = await pointer({ cle });
    expect(r).toMatchObject({ statut: "enregistre", bail_id: bail, montant: 800, erreur: "" });
    expect(await reglements()).toEqual([{ montant: 800, date: jour, mode: "virement", note: "Pointé sur un relevé de banque : VIR SEPA M DURAND LOYER", cle }]);
    const etat = (await db.query("select montant_couvert::float8 c from public.etat_loyers_bail_brut($1) where appel_id=$2", [bail, ancien])).rows[0];
    expect(etat.c).toBe(800);
    const ecritures = (await db.query("select count(*)::int n from public.ecritures e join public.encaissements c on c.id=e.encaissement_id where c.cle_envoi=$1 and e.sens='recette'", [cle])).rows[0].n;
    expect(ecritures).toBeGreaterThan(0);
    // La trace de la demande est celle de la réception déclarée : même registre, même garantie.
    expect((await db.query("select requete->>'reponse' reponse, appel_id from public.commandes_encaissement_reste where id=$1", [cle])).rows).toEqual([{ reponse: "recu", appel_id: ancien }]);
  });

  it("montant inférieur : règlement partiel ; le reste se pointe ensuite ; supérieur : refusé sans rien écrire", async () => {
    expect(await pointer({ montant: 300, libelle: "VIR DURAND ACOMPTE" })).toMatchObject({ statut: "enregistre", montant: 300 });
    await agir(compte);
    // Le reste attendu a changé : l'ancien reste est refusé, le nouveau est accepté et solde le loyer.
    expect((await pointer({ montant: 500, reste: 800 })).erreur).toMatch(/montant a changé/);
    expect((await pointer({ montant: 900, reste: 500 })).erreur).toMatch(/Vérifiez le montant/);
    expect(await pointer({ montant: 500, reste: 500, libelle: "VIR DURAND SOLDE" })).toMatchObject({ statut: "enregistre", montant: 500 });
    expect((await reglements()).map((e) => [e.montant, e.note])).toEqual([
      [300, "Pointé sur un relevé de banque : VIR DURAND ACOMPTE"],
      [500, "Pointé sur un relevé de banque : VIR DURAND SOLDE"],
    ]);
  });

  it("la même ligne relue ne compte qu'une fois et ne réécrit pas la note ; elle ne solde pas un autre loyer", async () => {
    const cle = randomUUID();
    expect((await pointer({ cle })).statut).toBe("enregistre");
    await agir(compte);
    expect(await pointer({ cle, libelle: "AUTRE LIBELLE" })).toMatchObject({ statut: "deja_enregistre", erreur: "" });
    // La même clé présentée pour le loyer suivant : refusée, pas de second règlement.
    expect((await pointer({ cle, cible: courant })).erreur).toMatch(/déjà été utilisée/);
    const lignes = await reglements();
    expect(lignes).toHaveLength(1);
    expect(lignes[0].note).toBe("Pointé sur un relevé de banque : VIR SEPA M DURAND LOYER");
  });

  it("le plus ancien d'abord ; ni échéance à venir, ni date future, ni mode inconnu", async () => {
    expect((await pointer({ cible: courant })).erreur).toMatch(/plus ancien reste à régler/);
    expect((await pointer({ cible: futur })).erreur).toMatch(/pas encore à confirmer/);
    const demain = (await db.query("select (public.aujourdhui_paris()+1)::text j")).rows[0].j;
    expect((await pointer({ date: demain })).erreur).toMatch(/Vérifiez le montant, la date et le mode/);
    expect((await pointer({ mode: "bitcoin" })).erreur).toMatch(/Vérifiez le montant, la date et le mode/);
    expect((await pointer({ montant: null })).erreur).toMatch(/Vérifiez le montant, la date et le mode/);
    expect(await reglements()).toEqual([]);
    // Dans l'ordre : l'ancien puis le courant.
    await agir(compte);
    expect((await pointer()).statut).toBe("enregistre");
    expect((await pointer({ cible: courant })).statut).toBe("enregistre");
    expect(await reglements()).toHaveLength(2);
  });

  it("seul le propriétaire de l'espace pointe : ni un autre propriétaire, ni le locataire, ni un visiteur", async () => {
    await agir(etranger);
    expect((await pointer()).erreur).toMatch(/Accès refusé/);
    expect((await pointer({ espace: autre })).erreur).toMatch(/inaccessible/);
    await agir(locataire);
    expect((await pointer()).erreur).toMatch(/Accès refusé/);
    await agir(null, "anon");
    expect((await pointer()).erreur).toMatch(/permission denied|Accès refusé/);
    expect(await reglements()).toEqual([]);
    await base();
    expect((await db.query("select has_function_privilege('anon',$1,'execute') a, has_function_privilege('authenticated',$1,'execute') u, has_function_privilege('public',$1,'execute') p", [FONCTION])).rows[0]).toEqual({ a: false, u: true, p: false });
    const f = (await db.query("select prosecdef, proconfig from pg_proc where oid=to_regprocedure($1)", [FONCTION])).rows[0];
    expect(f.prosecdef).toBe(true);
    expect(f.proconfig).toContain('search_path=""');
  });

  it("le libellé tient sur une ligne de 200 caractères ; sans libellé, la note reste vraie", async () => {
    await pointer({ libelle: `  VIR\tSEPA\n\nM DURAND   ${"X".repeat(300)}  ` });
    const [premier] = await reglements();
    expect(premier.note.startsWith("Pointé sur un relevé de banque : VIR SEPA M DURAND XXXX")).toBe(true);
    expect(premier.note).not.toMatch(/[\t\n\r]|  /);
    expect(premier.note.length).toBe("Pointé sur un relevé de banque : ".length + 200);
    await agir(compte);
    await pointer({ cible: courant, libelle: null });
    expect((await reglements()).map((e) => e.note)).toContain("Pointé sur un relevé de banque");
  });

  it("la migration se rejoue ; le retour supprime la fonction et garde les règlements pointés", async () => {
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const existe = async () => { await base(); return (await db.query("select to_regprocedure($1) is not null e", [FONCTION])).rows[0].e as boolean; };
    expect((await pointer()).statut).toBe("enregistre");
    await base();
    await db.query(migration);
    await db.query(migration);
    expect(await existe()).toBe(true);

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values($1,'pointage_loyer_releve') on conflict do nothing", [CODE]);
    await db.query(retour);
    expect(await existe()).toBe(false);
    expect(Number((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version=$1", [CODE])).rows[0].n)).toBe(0);
    expect((await reglements()).map((e) => e.note)).toEqual(["Pointé sur un relevé de banque : VIR SEPA M DURAND LOYER"]);
    // La réception déclarée, dont ce lot dépend, n'est pas touchée par le retour.
    expect((await db.query("select to_regprocedure('public.declarer_reception_loyer(uuid,uuid,text,numeric,date,text,uuid,numeric)') is not null e")).rows[0].e).toBe(true);
    await db.query(retour);
    expect(await existe()).toBe(false);

    await db.query(migration);
    expect(await existe()).toBe(true);
    await agir(compte);
    expect((await pointer({ cible: courant })).statut).toBe("enregistre");
  });
});
