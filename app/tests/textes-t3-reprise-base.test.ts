/**
 * Textes officiels, reprise du lot T3 (relecture T3R, 25/11/2026) — avec base.
 *
 * T3R-1 (ARGENT, régression du lot T3) — avant : le lot T3 avait retiré de `regulariser_charges` et de
 * `consommations_interne.emettre_regularisation` le refus « exercice prescrit » ; la confirmation qui le remplace n'était
 * vérifiée que par l'application. Sous le rôle `authenticated`, le gérant de l'espace enregistrait par un appel direct un
 * complément de 5 000 € sur l'exercice 2012 sans aucune confirmation. Après (migration 20261125151000) : la base refuse ce
 * complément (« confirmation nécessaire », jamais « prescrit ») tant que `p_exercice_ancien` n'est pas passé à vrai, dans
 * les deux fonctions et leurs deux enveloppes publiques ; droits identiques ; un trop-perçu ou un exercice récent ne
 * change pas. Le bloc « rejeu et retour » prouve l'avant : retour joué, le même appel direct est de nouveau accepté.
 *
 * T3R-8 — le terme corrigé par le lot T3 (jour ramené en fin de mois = dernier jour du bail) change aussi d'un jour le
 * terme d'un bail étudiant de neuf mois commencé un 30/05, un 31/05, un 31/07, un 31/12, ou un 29/05 quand le mois
 * d'arrivée n'a pas de 29 : ce fichier le tient, avant (retours joués) et après.
 *
 * Le fichier rejoue des migrations et leurs retours dans la transaction du test : il tourne en série (FICHIERS_EN_SERIE
 * de vitest.config.ts). Nécessite SUPABASE_DB_URL ; transaction annulée après chaque test.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261125151000_textes_t3_reprise_exercice_ancien";
const T3 = "20261125111000_textes_officiels_t3";
const REGULARISER = "public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean)";
const FOURNITURE = "consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text)";
/** Les deux fonctions, leurs deux enveloppes publiques, et la seconde signature de chacune (avec `p_exercice_ancien`). */
const JUMELLES: [string, string][] = [
  [REGULARISER, "public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean,boolean)"],
  ["public.regulariser_charges_avec_justificatif(uuid,integer,numeric,text,text,text,bigint,text,boolean)",
    "public.regulariser_charges_avec_justificatif(uuid,integer,numeric,text,text,text,bigint,text,boolean,boolean)"],
  [FOURNITURE, "consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text,boolean)"],
  ["public.emettre_regularisation_fourniture(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text)",
    "public.emettre_regularisation_fourniture(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text,boolean)"],
];
const REFUS = /Exercice \d{4} clos depuis plus de trois ans : confirmation nécessaire pour enregistrer un complément de charges à la charge du locataire/;
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const lire = (chemin: string) => readFileSync(chemin, "utf8");
const migration = () => lire(`supabase/migrations/${NOM}.sql`);
const retour = () => lire(`supabase/retours-arriere/${NOM}.retour.sql`);
const retourT3 = () => lire(`supabase/retours-arriere/${T3}.retour.sql`);
/**
 * Les instructions de premier niveau d'un fichier SQL, telles que `psql -f` les envoie une à une (guillemets simples et
 * dollar, commentaires respectés). Reprise de la relecture de la fusion (X-02) : sans `-v ON_ERROR_STOP=1`, psql
 * continue après une instruction en erreur ; un retour en deux instructions pouvait donc échouer sur sa garde puis
 * modifier la base quand même.
 */
function instructions(sql: string): string[] {
  const liste: string[] = [];
  let debut = 0, i = 0;
  while (i < sql.length) {
    if (sql.startsWith("--", i)) { const f = sql.indexOf("\n", i); i = f < 0 ? sql.length : f + 1; continue; }
    if (sql.startsWith("/*", i)) { const f = sql.indexOf("*/", i + 2); i = f < 0 ? sql.length : f + 2; continue; }
    if (sql[i] === "'") {
      i++;
      while (i < sql.length && !(sql[i] === "'" && sql[i + 1] !== "'")) i += sql[i] === "'" ? 2 : 1;
      i++;
      continue;
    }
    const balise = /^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/.exec(sql.slice(i, i + 64));
    if (balise) { const f = sql.indexOf(balise[0], i + balise[0].length); i = f < 0 ? sql.length : f + balise[0].length; continue; }
    if (sql[i] === ";") {
      const instruction = sql.slice(debut, i + 1).replace(/^\s*--.*$/gm, "").trim();
      if (instruction !== ";") liste.push(instruction);
      debut = i + 1;
    }
    i++;
  }
  const reste = sql.slice(debut).replace(/^\s*--.*$/gm, "").trim();
  if (reste) liste.push(reste);
  return liste;
}

describe("reprise du lot T3 — écriture de la migration et place au manifeste (sans base)", () => {
  it("la migration et son retour ne touchent aucune donnée ni aucune règle de lecture, et n'ouvrent rien aux visiteurs", () => {
    for (const fichier of [`supabase/migrations/${NOM}.sql`, `supabase/retours-arriere/${NOM}.retour.sql`]) {
      const sql = lire(fichier).replace(/^\s*--.*$/gm, "");
      expect(sql, fichier).not.toMatch(/\b(update|delete from|insert into|truncate|alter table)\b/i);
      expect(sql, fichier).not.toMatch(/\bpolicy\b|row level security/i);
      expect(sql, fichier).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
      // La ligne remplacée est relue dans la définition en vigueur : aucune des deux fonctions n'est recopiée à la main.
      expect(sql, fichier).toContain("pg_get_functiondef");
      expect(sql, fichier).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.regulariser_charges\(\s*p_bail uuid, p_annee integer, p_charges_reelles numeric, p_justificatif uuid, p_note text, p_etaler boolean\)/i);
    }
  });
  it("manifeste, liste des retours (et leur ordre), ordre des migrations et fichiers en série sont à jour", () => {
    const ordre = lire("e2e/local/ordre-migrations.txt").trim().split(/\r?\n/);
    expect(ordre.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(ordre.indexOf(`${NOM}.sql`)).toBeGreaterThan(ordre.indexOf(`${T3}.sql`));
    const lisezMoi = lire("supabase/retours-arriere/LISEZ-MOI.md");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    // Son retour se joue AVANT celui du lot T3 (qui attend la ligne du lot T3) : il le précède dans l'ordre complet.
    const chaine = lisezMoi.split("Ordre complet si tout doit être défait :")[1] ?? "";
    const codes = [...chaine.split("puis `500000`")[0].matchAll(/`(\d{14})`/g)].map((m) => m[1]);
    expect(codes.indexOf("20261125151000")).toBeGreaterThanOrEqual(0);
    expect(codes.indexOf("20261125151000")).toBeLessThan(codes.indexOf("20261125111000"));
    expect(lire("tests/relais-migrations-manifeste.test.ts")).toContain(`"${NOM}.sql",`);
    expect(lire("vitest.config.ts")).toContain('"tests/textes-t3-reprise-base.test.ts"');
  });
  it("X-02 (reprise de la relecture de la fusion) — les deux retours de la chaîne T3 sont chacun UNE instruction : psql les joue d'un bloc, avec ou sans ON_ERROR_STOP", () => {
    // Avant : le retour du lot T3 portait sa garde dans un premier bloc DO, à part ; joué par `psql -f` sans
    // ON_ERROR_STOP, l'erreur de la garde n'arrêtait pas le second bloc. Le retour de la reprise faisait suivre son bloc
    // de quatre « drop function » : une erreur du bloc laissait partir les suppressions.
    expect(instructions(retourT3()), T3).toHaveLength(1);
    expect(instructions(retour()), NOM).toHaveLength(1);
    expect(instructions(retourT3())[0]).toMatch(/^do \$/);
    expect(instructions(retour())[0]).toMatch(/^do \$/);
    // Le découpage lui-même : une garde à part donne bien deux instructions.
    expect(instructions("-- x\ndo $$ begin raise exception 'a;b'; end $$;\ndo $q$ begin perform 1; end $q$;")).toHaveLength(2);
  });
});

describe.skipIf(!url)("reprise du lot T3 — confirmation d'un complément ancien exigée par la base ; terme des baux étudiants (avec base)", () => {
  let db: Client, org: string, compte: string, autreCompte: string, bien: string, locataire: string, bailleur: string;

  const un = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0] as Record<string, unknown>;
  async function agir(id: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  }
  const base = () => db.query("reset role");
  async function essai<T>(f: () => Promise<T>): Promise<T | { refus: string }> {
    await db.query("savepoint essai");
    try { const r = await f(); await db.query("release savepoint essai"); return r; }
    catch (e) { await db.query("rollback to savepoint essai"); return { refus: (e as Error).message }; }
  }
  async function compteNeuf() {
    const id = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [id, `${id}@test.local`]);
    await db.query("insert into public.accounts(id,email) values($1,$2) on conflict do nothing", [id, `${id}@test.local`]);
    return id;
  }
  /** Un bail actif (nu) sur un lot neuf, ou un bail étudiant meublé de neuf mois. Sans provision : le complément = les charges saisies. */
  async function bail(debut: string, etudiant = false) {
    await base();
    const lot = String((await un("insert into lots(organization_id,bien_id,nom,etat,meuble) values($1,$2,'TEST '||gen_random_uuid(),'loue',$3) returning id", [org, bien, etudiant])).id);
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,'2000-01-01')", [org, lot, bailleur]);
    return String((await un(`insert into baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,depot_garantie,jour_echeance,zone_tendue,meuble_etudiant)
      values($1,$2,$3,$4,'actif',$5,600,50,600,1,false,$6) returning id`, [org, lot, locataire, etudiant ? "meuble" : "nu", debut, etudiant])).id);
  }
  async function justificatif() {
    await base();
    return String((await un(`insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
      values($1::uuid,'justificatif','Décompte',$1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',10,gen_random_uuid()::text) returning id`, [org])).id);
  }
  /** `regulariser_charges` sous la session de `qui` : sans le 7e paramètre (appel d'avant), ou avec `p_exercice_ancien`. */
  async function regulariser(bailId: string, annee: number, charges: number, confirmation?: boolean, qui = compte) {
    const doc = await justificatif();
    await agir(qui);
    const r = await essai(async () => Number((await un(
      confirmation === undefined
        ? "select public.regulariser_charges($1,$2,$3,$4,null,false) as ecart"
        : "select public.regulariser_charges($1,$2,$3,$4,null,false,$5) as ecart",
      confirmation === undefined ? [bailId, annee, charges, doc] : [bailId, annee, charges, doc, confirmation])).ecart));
    await base();
    return r;
  }
  /** L'enveloppe publique (dépôt du décompte dans la même transaction) : 9 paramètres, ou 10 avec `p_exercice_ancien`. */
  async function enveloppe(bailId: string, annee: number, charges: number, confirmation?: boolean) {
    await agir(compte);
    const chemin = `${org}/decompte-${randomUUID()}.pdf`;
    const r = await essai(async () => Number((await un(
      confirmation === undefined
        ? "select public.regulariser_charges_avec_justificatif($1,$2,$3,null,$4,'application/pdf',10,$5,false) as ecart"
        : "select public.regulariser_charges_avec_justificatif($1,$2,$3,null,$4,'application/pdf',10,$5,false,$6) as ecart",
      confirmation === undefined ? [bailId, annee, charges, chemin, randomUUID()] : [bailId, annee, charges, chemin, randomUUID(), confirmation])).ecart));
    await base();
    const fiche = Number((await un("select count(*) n from public.documents where storage_path=$1", [chemin])).n);
    return { r, fiche };
  }
  /**
   * La régularisation tirée des factures : un brouillon d'exercice 2021 dont le décompte met 321,09 € à la charge du
   * locataire. Le calcul des factures n'est pas l'objet de ce test : la source est fixée le temps de la transaction
   * (fonction remplacée, rendue à l'annulation), et le brouillon la porte, comme `preparer_regularisation_fourniture`.
   */
  async function brouillon(bailId: string, annee = 2021) {
    await base();
    const source = { provisions: 0, charges_reelles: 321.09, ecart: -321.09 };
    await db.query(`create or replace function consommations_interne.source_regularisation(p_org uuid, p_bail uuid, p_annee integer)
      returns jsonb language sql stable security definer set search_path = '' as $$ select '${JSON.stringify(source)}'::jsonb $$`);
    return String((await un("insert into public.brouillons_regularisation_fourniture(organization_id,bail_id,annee,source,empreinte,created_by) values($1,$2,$3,$4,'empreinte-test',$5) returning id",
      [org, bailId, annee, JSON.stringify(source), compte])).id);
  }
  /** Émet le brouillon par l'enveloppe publique (`public`) ou la fonction interne (`interne`), avec ou sans `p_exercice_ancien`. */
  async function emettre(d: string, voie: "public" | "interne", confirmation?: boolean) {
    await agir(compte);
    const fn = voie === "public" ? "public.emettre_regularisation_fourniture" : "consommations_interne.emettre_regularisation";
    const r = await essai(async () => String((await un(
      `select ${fn}($1,$2,'empreinte-test',true,false,false,$3,'application/pdf',123,$4${confirmation === undefined ? "" : ",$5"}) as id`,
      [org, d, `${org}/decompte-${randomUUID()}.pdf`, randomUUID().replace(/-/g, "").padEnd(64, "e"), ...(confirmation === undefined ? [] : [confirmation])])).id));
    await base();
    return r;
  }
  const lignes = async (bailId: string) => (await db.query("select annee, ecart::text from public.regularisations_charges where bail_id=$1 order by annee", [bailId])).rows;
  const definition = async (signature: string) => String((await un("select pg_get_functiondef($1::text::regprocedure) as d", [signature])).d);
  const empreintes = async () => {
    const e: Record<string, unknown> = {};
    for (const s of [REGULARISER, FOURNITURE])
      e[s] = await un("select md5(p.prosrc) as corps, p.proacl::text as droits, p.prosecdef as definer, p.proconfig::text as conf from pg_proc p where p.oid = $1::text::regprocedure", [s]);
    e.secondes = Number((await un("select count(*) n from pg_proc p where p.oid in (select to_regprocedure(s) from unnest($1::text[]) s)", [JUMELLES.map(([, s]) => s)])).n);
    return e;
  };
  const etatAvecTerme = async () => ({ ...(await empreintes()),
    terme: (await un("select md5(prosrc) m from pg_proc where oid=$1::text::regprocedure", ["public.terme_bail_calcule(uuid,date)"])).m });
  /** Joue un fichier comme `psql -f` sans ON_ERROR_STOP : chaque instruction pour elle-même ; rend les erreurs vues. */
  async function commePsqlSansArret(sql: string) {
    const erreurs: string[] = [];
    for (const instruction of instructions(sql)) {
      const r = await essai(() => db.query(instruction));
      if (r && typeof r === "object" && "refus" in r) erreurs.push(r.refus);
    }
    return erreurs;
  }

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => {
    await db.query("begin"); await base();
    await db.query("create or replace function public.aujourdhui_paris() returns date language sql stable set search_path = '' as $$ select date '2026-11-24' $$");
    compte = await compteNeuf();
    autreCompte = await compteNeuf();
    org = String((await un("insert into organizations(name,type,status,essai_fin) values('TEST reprise T3','proprietaire_direct','essai',current_date+30) returning id")).id);
    const org2 = String((await un("insert into organizations(name,type,status,essai_fin) values('TEST reprise T3 autre','proprietaire_direct','essai',current_date+30) returning id")).id);
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$4,'proprietaire_direct')", [compte, org, autreCompte, org2]);
    bien = String((await un("insert into biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'TEST Bien','appartement','1 rue fictive','69003','Lyon',false) returning id", [org])).id);
    locataire = String((await un("insert into persons(organization_id,nom,prenom) values($1,'TEST Locataire','Awa') returning id", [org])).id);
    bailleur = String((await un("insert into persons(organization_id,nom,prenom,qualite) values($1,'TEST Bailleur','Paul','Personne physique') returning id", [org])).id);
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("T3R-1 — appel direct sans confirmation, sous le rôle authenticated : complément de 5 000 € sur 2012 refusé « confirmation nécessaire », rien d'enregistré", async () => {
    const b = await bail("2010-01-01");
    // L'appel de la sonde de relecture (T3R/tmp/sonde1.sql) : il rendait -5000.00 et enregistrait la ligne.
    expect(await regulariser(b, 2012, 5000)).toEqual({ refus: expect.stringMatching(REFUS) });
    expect(await regulariser(b, 2012, 5000, false)).toEqual({ refus: expect.stringMatching(REFUS) });
    expect((await regulariser(b, 2012, 5000) as { refus: string }).refus).not.toMatch(/prescrit/);
    // L'enveloppe publique, avec dépôt du décompte : refus aussi, et la fiche du décompte est annulée avec lui.
    expect(await enveloppe(b, 2012, 5000)).toEqual({ r: { refus: expect.stringMatching(REFUS) }, fiche: 0 });
    expect(await enveloppe(b, 2012, 5000, false)).toEqual({ r: { refus: expect.stringMatching(REFUS) }, fiche: 0 });
    expect(await lignes(b)).toEqual([]);
  });

  it("T3R-1 — avec la confirmation (p_exercice_ancien = vrai) : enregistré, au centime, par la fonction comme par l'enveloppe", async () => {
    const b = await bail("2010-01-01");
    expect(await regulariser(b, 2012, 5000, true)).toBe(-5000);
    const r = await enveloppe(b, 2013, 1234.56, true);
    expect(r).toEqual({ r: -1234.56, fiche: 1 });
    expect(await lignes(b)).toEqual([{ annee: 2012, ecart: "-5000.00" }, { annee: 2013, ecart: "-1234.56" }]);
  });

  it("T3R-1 — rien ne change pour un trop-perçu ancien, un exercice récent, ni pour les autres refus", async () => {
    const b = await bail("2010-01-01");
    await db.query("insert into public.appels_loyer(organization_id,bail_id,periode,loyer_hc,charges,montant_du,date_echeance) values($1,$2,'2012-03-01',600,50,650,'2012-03-01')", [org, b]);
    expect(await regulariser(b, 2012, 0)).toBe(50); // trop-perçu : aucune confirmation demandée (avant comme après)
    expect(await regulariser(b, 2023, 1234.56)).toBe(-1234.56); // exercice récent : rien ne change
    expect(await regulariser(b, 2024, 10, false)).toBe(-10);
    expect(await regulariser(b, 2023, 10, true)).toMatchObject({ refus: expect.stringMatching(/déjà/) }); // les autres gardes tiennent
    expect(await regulariser(b, 2008, 10, true)).toMatchObject({ refus: expect.stringMatching(/aucun jour/) });
  });

  it("T3R-1 — régularisation tirée des factures : refusée sans confirmation par l'enveloppe et par la fonction interne, enregistrée avec", async () => {
    const b1 = await bail("2018-01-01");
    const d1 = await brouillon(b1);
    for (const [voie, confirmation] of [["public", undefined], ["public", false], ["interne", undefined], ["interne", false]] as const)
      expect(await emettre(d1, voie, confirmation), `${voie} ${confirmation}`).toEqual({ refus: expect.stringMatching(REFUS) });
    expect(await lignes(b1)).toEqual([]);
    expect(typeof await emettre(d1, "public", true)).toBe("string");
    expect(await lignes(b1)).toEqual([{ annee: 2021, ecart: "-321.09" }]);
    const b2 = await bail("2018-01-01");
    const d2 = await brouillon(b2);
    expect(typeof await emettre(d2, "interne", true)).toBe("string");
    expect(await lignes(b2)).toEqual([{ annee: 2021, ecart: "-321.09" }]);
  });

  it("T3R-1 — la confirmation ne vaut que pour son appel : l'appel suivant, sans elle, est refusé", async () => {
    const b1 = await bail("2010-01-01");
    const b2 = await bail("2010-01-01");
    expect(await regulariser(b1, 2012, 100, true)).toBe(-100);
    expect(await regulariser(b2, 2012, 100)).toEqual({ refus: expect.stringMatching(REFUS) });
    expect(String((await un("select coalesce(current_setting('gerimmo.exercice_ancien_confirme', true), '') v")).v)).toBe("");
  });

  it("T3R-1 — droits : chaque seconde signature a ceux de sa jumelle ; rien pour anon ; le gérant d'un autre espace est refusé, même avec la confirmation", async () => {
    const droits = (s: string) => db.query(
      `select coalesce(string_agg(coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type, ',' order by coalesce(r.rolname, 'PUBLIC')), '') d
         from pg_proc p cross join lateral aclexplode(p.proacl) a left join pg_roles r on r.oid = a.grantee where p.oid = $1::text::regprocedure`,
      [s]).then((x) => String(x.rows[0].d));
    for (const [jumelle, seconde] of JUMELLES) {
      expect(await droits(seconde), seconde).toBe(await droits(jumelle));
      expect(await droits(seconde), seconde).not.toMatch(/anon|PUBLIC/);
      expect((await un("select has_function_privilege('anon',$1::text::regprocedure,'execute') a", [seconde])).a, seconde).toBe(false);
      // Les secondes signatures s'exécutent avec les droits de l'appelant ; les deux fonctions d'origine restent DEFINER.
      expect((await un("select prosecdef d from pg_proc where oid=$1::text::regprocedure", [seconde])).d, seconde).toBe(false);
    }
    for (const s of [REGULARISER, FOURNITURE]) expect(await definition(s), s).toMatch(/SECURITY DEFINER/);
    const b = await bail("2010-01-01");
    expect(await regulariser(b, 2012, 100, true, autreCompte)).toMatchObject({ refus: expect.stringMatching(/Accès refusé/) });
    expect(await lignes(b)).toEqual([]);
  });

  it("T3R-1 — le texte des deux fonctions : plus de refus « prescrit », quatre citations du jour de Paris dans regulariser_charges (le retour de 20261014821000 les compte)", async () => {
    for (const s of [REGULARISER, FOURNITURE]) {
      const def = await definition(s);
      expect(def, s).not.toMatch(/raise exception 'Exercice[^']*prescrit/);
      expect(def, s).toMatch(/raise exception 'Exercice % clos depuis plus de trois ans : confirmation nécessaire/);
      expect(def, s).toContain("Lot T3 (R16-A1), reprise T3R-1");
    }
    expect((await definition(REGULARISER)).match(/(\bpublic\.)?\baujourdhui_paris\(\)/g)).toHaveLength(4);
  });

  it("T3R-1 — rejeu sans effet ; le retour rend la ligne du lot T3 et retire les secondes signatures : l'appel direct est de nouveau accepté sans confirmation (l'état d'avant) ; la marche avant repart", async () => {
    const apres = await empreintes();
    expect(apres.secondes).toBe(4);
    await db.query(migration());
    expect(await empreintes()).toEqual(apres);

    const t3 = lire(`supabase/migrations/${T3}.sql`);
    await db.query(retour());
    const avant = await empreintes();
    expect(avant.secondes).toBe(0);
    for (const s of [REGULARISER, FOURNITURE]) {
      expect((avant[s] as { corps: string }).corps, s).not.toBe((apres[s] as { corps: string }).corps);
      expect({ ...(avant[s] as object), corps: "" }, s).toEqual({ ...(apres[s] as object), corps: "" }); // droits, mode, réglages
      expect(await definition(s), s).not.toContain("reprise T3R-1");
    }
    // L'état d'avant, celui de la relecture : le complément de 2012 s'enregistre sans confirmation.
    const b = await bail("2010-01-01");
    expect(await regulariser(b, 2012, 5000)).toBe(-5000);
    // La ligne rendue est celle que le lot T3 avait posée : sa migration se rejoue sans effet sur ces deux fonctions.
    await db.query(t3);
    expect(await empreintes()).toEqual(avant);
    await db.query(retour()); // rejouable
    expect(await empreintes()).toEqual(avant);

    await db.query(migration());
    expect(await empreintes()).toEqual(apres);
    const b2 = await bail("2010-01-01");
    expect(await regulariser(b2, 2012, 5000)).toEqual({ refus: expect.stringMatching(REFUS) });
    expect(await regulariser(b2, 2012, 5000, true)).toBe(-5000);
    expect(await lignes(b)).toEqual([{ annee: 2012, ecart: "-5000.00" }]); // rien d'enregistré n'a bougé
  });

  it("T3R-1 — une définition inattendue (ligne du lot T3 absente) arrête la migration sans rien modifier", async () => {
    await db.query(retour());
    await db.query((await definition(REGULARISER)).replace("-- Lot T3 (R16-A1) : plus de refus", "-- Lot T3 (R16-A1) : plus aucun refus"));
    const etat = await empreintes();
    expect(await essai(() => db.query(migration()))).toMatchObject({ refus: expect.stringContaining(`définition inattendue pour ${REGULARISER} (0 occurrence(s) de la ligne du lot T3)`) });
    expect(await empreintes()).toEqual(etat);
  });

  it("A-02 (relecture de la fusion) — retours dans le mauvais ordre : celui du lot T3 joué AVANT celui de cette reprise s'arrête avec une erreur explicite, sans rien modifier ; dans l'ordre de la chaîne, les deux passent et rendent le refus « prescrit »", async () => {
    // Avant la correction : le retour du lot T3 ne trouvait plus sa ligne (réécrite par cette reprise), passait sans rien
    // dire, puis le retour de la reprise rendait la ligne du lot T3 : la base restait dans l'état du lot T3 (complément de
    // 2012 enregistré par appel direct, sans refus ni confirmation), alors que l'opérateur la croyait revenue.
    // (Ce test joue le fichier en un seul message : il ne voyait pas le cas de psql sans ON_ERROR_STOP, tenu par X-02.)
    const apres = await etatAvecTerme();
    expect(await essai(() => db.query(retourT3()))).toEqual({
      refus: expect.stringContaining("jouez d'abord le retour de 20261125151000"),
    });
    expect(await etatAvecTerme()).toEqual(apres); // rien n'a bougé, ni les deux fonctions, ni le terme du bail
    // L'ordre de la chaîne « Ordre complet » : la reprise, puis le lot T3.
    await db.query(retour());
    await db.query(retourT3());
    const b = await bail("2010-01-01");
    expect(await regulariser(b, 2012, 1000)).toEqual({ refus: expect.stringMatching(/Exercice 2012 prescrit/) });
    expect(await lignes(b)).toEqual([]);
    // Rejouable : sur une base revenue, le retour du lot T3 ne trouve plus rien à faire et n'échoue pas.
    expect(await essai(() => db.query(retourT3()))).not.toHaveProperty("refus");
  });

  it("X-02 (reprise de la relecture de la fusion) — retour du lot T3 joué en premier comme `psql -f` SANS ON_ERROR_STOP (chaque instruction à part, l'erreur n'arrête pas la suite) : l'erreur le dit, et rien ne bouge, ni les deux fonctions ni le terme du bail", async () => {
    // Avant : la garde était un bloc DO à part. psql affichait « … Rien n'est modifié », puis jouait le second bloc :
    // `terme_bail_calcule` revenait à son texte d'avant le lot T3 (terme d'un bail commencé un 29 février un jour trop
    // tôt) pendant que les deux fonctions gardaient la reprise T3R-1, et psql sortait avec le code 0.
    const apres = await etatAvecTerme();
    const erreurs = await commePsqlSansArret(retourT3());
    expect(erreurs).toEqual([expect.stringContaining("jouez d'abord le retour de 20261125151000, puis celui-ci. Rien n'est modifié")]);
    expect(await etatAvecTerme()).toEqual(apres);
    // Dans l'ordre de la chaîne, joués de la même façon, les deux passent sans erreur.
    expect(await commePsqlSansArret(retour())).toEqual([]);
    expect(await commePsqlSansArret(retourT3())).toEqual([]);
    const b = await bail("2010-01-01");
    expect(await regulariser(b, 2012, 1000)).toEqual({ refus: expect.stringMatching(/Exercice 2012 prescrit/) });
  });

  it("X-02 — retour de cette reprise sur une définition inattendue, joué comme `psql -f` sans ON_ERROR_STOP : l'erreur le dit, et les secondes signatures ne sont pas supprimées", async () => {
    // Avant : le bloc DO s'arrêtait (texte de la reprise incomplet), puis les quatre « drop function » qui le suivaient
    // partaient quand même : les fonctions gardaient la reprise T3R-1 sans plus offrir la signature de confirmation.
    await db.query((await definition(REGULARISER)).replace(
      "à la charge du locataire', p_annee;\n  end if;", "à la charge du locataire', p_annee;\n  end  if;"));
    const etat = await empreintes();
    expect(etat.secondes).toBe(4);
    const erreurs = await commePsqlSansArret(retour());
    expect(erreurs).toEqual([expect.stringContaining(`texte de la reprise incomplet dans ${REGULARISER} ; rien n'est modifié`)]);
    expect(await empreintes()).toEqual(etat);
  });

  it("T3R-8 — bail étudiant de neuf mois : le terme d'un début au 29, 30 ou 31 ramené en fin de mois change d'un jour ; les autres débuts, non", async () => {
    const terme = async (b: string) => String((await un("select public.terme_bail_calcule($1,'2026-01-01')::text t", [b])).t);
    // [début, terme avant le lot T3 (« début + 9 mois − 1 jour »), terme depuis le lot T3]
    const cas: [string, string, string][] = [
      ["2025-05-29", "2026-02-27", "2026-02-28"], // février 2026 n'a pas de 29
      ["2025-05-30", "2026-02-27", "2026-02-28"],
      ["2025-05-31", "2026-02-27", "2026-02-28"],
      ["2025-07-31", "2026-04-29", "2026-04-30"],
      ["2025-12-31", "2026-09-29", "2026-09-30"],
      ["2027-05-29", "2028-02-28", "2028-02-28"], // février 2028 a un 29 : inchangé
      ["2025-03-31", "2025-12-30", "2025-12-30"],
      ["2025-09-01", "2026-05-31", "2026-05-31"],
      ["2025-10-31", "2026-07-30", "2026-07-30"],
    ];
    const baux = [];
    for (const [debut] of cas) baux.push(await bail(debut, true));
    for (const [i, [debut, , apresT3]] of cas.entries()) expect(await terme(baux[i]), `après ${debut}`).toBe(apresT3);
    // L'avant : les deux retours joués dans l'ordre de la chaîne (cette reprise, puis le lot T3).
    await db.query(retour());
    await db.query(lire(`supabase/retours-arriere/${T3}.retour.sql`));
    for (const [i, [debut, avantT3]] of cas.entries()) expect(await terme(baux[i]), `avant ${debut}`).toBe(avantT3);
  });
});
