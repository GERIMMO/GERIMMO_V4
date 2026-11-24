/**
 * Textes officiels, lot T3 (25/11/2026) — migration 20261125111000, avec base.
 *
 * R16-A1 (ARGENT) — avant : `regulariser_charges` et la régularisation tirée des factures refusaient, en le disant
 * « prescrit », tout complément d'un exercice dont le 31 décembre avait plus de trois ans. L'article 7-1 de la loi du
 * 6 juillet 1989 (recueil fourni par le dirigeant) fait courir le délai « du jour où le titulaire d'un droit a connu ou
 * aurait dû connaître les faits » : la base ne connaît pas ce jour. Après : plus de refus ; les montants calculés sont
 * exactement ceux d'un exercice récent ; rien de ce qui est déjà enregistré ne change.
 *
 * T1R-2 — avant : un bail commencé un 29 février finissait le 27 février (un jour trop tôt). Après : le 28 ; tous les
 * autres baux gardent leur terme.
 *
 * Reprise T3R-1 (migration 20261125151000) : ce complément ne s'enregistre plus sans la confirmation explicite
 * (`p_exercice_ancien`), exigée aussi par la base. Les essais ci-dessous la donnent (ils mesurent le montant, pas la
 * confirmation, qui est tenue par tests/textes-t3-reprise-base.test.ts) ; le bloc « rejeu » joue les retours dans l'ordre
 * de la chaîne (celui de la reprise avant celui-ci) et vérifie qu'un appel sans confirmation est refusé.
 *
 * Le dernier bloc rejoue la migration et son retour dans la transaction du test : le fichier tourne en série
 * (FICHIERS_EN_SERIE de vitest.config.ts). Nécessite SUPABASE_DB_URL ; transaction annulée après chaque test.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { ajouterMois } from "@/lib/delai-conge-bailleur";

const NOM = "20261125111000_textes_officiels_t3";
/** Reprise T3R-1 : sa migration se joue après celle-ci, son retour avant celui-ci (ordre de la chaîne des retours). */
const REPRISE = "20261125151000_textes_t3_reprise_exercice_ancien";
const REGULARISER = "public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean)";
const FOURNITURE = "consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text)";
const TERME = "public.terme_bail_calcule(uuid,date)";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("lot T3 — écriture de la migration et place au manifeste (sans base)", () => {
  const lire = (chemin: string) => readFileSync(chemin, "utf8");
  it("la migration et son retour ne touchent aucune donnée, n'ouvrent aucun droit et ne recopient aucune fonction à la main", () => {
    for (const fichier of [`supabase/migrations/${NOM}.sql`, `supabase/retours-arriere/${NOM}.retour.sql`]) {
      const sql = lire(fichier).replace(/^\s*--.*$/gm, "");
      expect(sql, fichier).not.toMatch(/\b(update|delete from|insert into|truncate|alter table|drop)\b/i);
      expect(sql, fichier).not.toMatch(/\bgrant\b|\bpolicy\b|row level security/i);
      expect(sql, fichier).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
      expect(sql, fichier).toContain("pg_get_functiondef");
    }
  });
  it("manifeste, liste des retours, ordre des migrations et fichiers en série sont à jour", () => {
    const ordre = lire("e2e/local/ordre-migrations.txt").trim().split(/\r?\n/);
    expect(ordre.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(ordre.indexOf(`${NOM}.sql`)).toBeGreaterThan(ordre.indexOf("20261125101500_conge_textes_officiels_t1.sql"));
    expect(lire("supabase/retours-arriere/LISEZ-MOI.md")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(lire("tests/relais-migrations-manifeste.test.ts")).toContain(`"${NOM}.sql",`);
    expect(lire("vitest.config.ts")).toContain('"tests/textes-t3-base.test.ts"');
  });
});

describe.skipIf(!url)("lot T3 — complément de charges d'un exercice ancien, terme d'un bail commencé un 29 février (avec base)", () => {
  let db: Client, org: string, compte: string, bien: string, locataire: string, bailleur: string;

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
  /** Un bail actif sur un lot neuf. Sans provision appelée : les charges saisies donnent le complément, au centime. */
  async function bail(debut: string, type = "nu") {
    await base();
    const lot = String((await un("insert into lots(organization_id,bien_id,nom,etat,meuble) values($1,$2,'TEST '||gen_random_uuid(),'loue',$3) returning id", [org, bien, type === "meuble"])).id);
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,'2000-01-01')", [org, lot, bailleur]);
    const id = String((await un(`insert into baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,depot_garantie,jour_echeance,zone_tendue)
      values($1,$2,$3,$4,'actif',$5,600,50,600,1,false) returning id`, [org, lot, locataire, type, debut])).id);
    return id;
  }
  async function justificatif() {
    await base();
    return String((await un(`insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
      values($1::uuid,'justificatif','Décompte',$1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',10,gen_random_uuid()::text) returning id`, [org])).id);
  }
  /**
   * Régularise sous la session du propriétaire : rend l'écart (provisions − charges réelles) ou le refus.
   * Reprise T3R-1 : par défaut AVEC la confirmation d'un exercice ancien (seconde signature, `p_exercice_ancien`), que la
   * base exige depuis 20261125151000 ; `confirmer = false` fait l'appel à six paramètres d'avant (sans confirmation).
   */
  async function regulariser(bailId: string, annee: number, charges: number, etaler = false, confirmer = true) {
    const doc = await justificatif();
    await agir(compte);
    const r = await essai(async () => Number((await un(confirmer
      ? "select public.regulariser_charges($1,$2,$3,$4,null,$5,true) as ecart"
      : "select public.regulariser_charges($1,$2,$3,$4,null,$5) as ecart", [bailId, annee, charges, doc, etaler])).ecart));
    await base();
    return r;
  }
  const definition = async (signature: string) => String((await un("select pg_get_functiondef($1::text::regprocedure) as d", [signature])).d);
  const empreintes = async () => {
    const e: Record<string, unknown> = {};
    for (const s of [REGULARISER, FOURNITURE, TERME])
      e[s] = await un("select md5(p.prosrc) as corps, p.proacl::text as droits, p.prosecdef as definer, p.proconfig::text as conf from pg_proc p where p.oid = $1::text::regprocedure", [s]);
    return e;
  };

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => {
    await db.query("begin"); await base();
    await db.query("create or replace function public.aujourdhui_paris() returns date language sql stable set search_path = '' as $$ select date '2026-11-24' $$");
    compte = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [compte, `${compte}@test.local`]);
    org = String((await un("insert into organizations(name,type,status,essai_fin) values('TEST textes T3','proprietaire_direct','essai',current_date+30) returning id")).id);
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [compte, org]);
    bien = String((await un("insert into biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'TEST Bien','appartement','1 rue fictive','69003','Lyon',false) returning id", [org])).id);
    locataire = String((await un("insert into persons(organization_id,nom,prenom) values($1,'TEST Locataire','Awa') returning id", [org])).id);
    bailleur = String((await un("insert into persons(organization_id,nom,prenom,qualite) values($1,'TEST Bailleur','Paul','Personne physique') returning id", [org])).id);
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("R16-A1 — un complément de 1 234,56 € sur un exercice de plus de trois ans s'enregistre (confirmé), au centime, comme sur un exercice récent", async () => {
    const b = await bail("2018-01-01");
    // 2022 et avant : le 31/12 a plus de trois ans au 24/11/2026 (l'ancien refus). 2023 et 2024 : exercices récents.
    const ecarts: Record<number, unknown> = {};
    for (const annee of [2020, 2022, 2023, 2024]) ecarts[annee] = await regulariser(b, annee, 1234.56);
    expect(ecarts).toEqual({ 2020: -1234.56, 2022: -1234.56, 2023: -1234.56, 2024: -1234.56 });
    const lignes = (await db.query("select annee, charges_reelles::float8 reel, provisions::float8 prov, ecart::float8 ecart, etalement_12_mois is null sans_etalement from public.regularisations_charges where bail_id=$1 order by annee", [b])).rows;
    expect(lignes).toEqual([2020, 2022, 2023, 2024].map((annee) => ({ annee, reel: 1234.56, prov: 0, ecart: -1234.56, sans_etalement: true })));
    // Reprise T3R-1 : sans la confirmation, l'exercice ancien est refusé par la base ; l'exercice récent, non.
    const b2 = await bail("2018-01-01");
    expect(await regulariser(b2, 2022, 1234.56, false, false)).toMatchObject({ refus: expect.stringMatching(/confirmation nécessaire/) });
    expect(await regulariser(b2, 2023, 1234.56, false, false)).toBe(-1234.56);
  });

  it("R16-A1 — exercice ancien : étalement en douze mensualités dont la somme est le complément ; trop-perçu rendu ; les autres refus tiennent", async () => {
    const b = await bail("2018-01-01");
    expect(await regulariser(b, 2021, 1200.05, true)).toBe(-1200.05);
    const etalement = (await un("select etalement_12_mois e from public.regularisations_charges where bail_id=$1 and annee=2021", [b])).e as { montant: number }[];
    expect(etalement).toHaveLength(12);
    expect(Math.round(etalement.reduce((s, m) => s + Number(m.montant), 0) * 100)).toBe(120005);
    // Trop-perçu d'un exercice ancien : 50 € de provisions appelées, aucune charge → 50 € en faveur du locataire (inchangé).
    const b2 = await bail("2018-01-01");
    await db.query("insert into public.appels_loyer(organization_id,bail_id,periode,loyer_hc,charges,montant_du,date_echeance) values($1,$2,'2021-03-01',600,50,650,'2021-03-01')", [org, b2]);
    expect(await regulariser(b2, 2021, 0)).toBe(50);
    // Les autres gardes ne bougent pas : exercice déjà régularisé, exercice que le bail ne couvre pas.
    expect(await regulariser(b, 2021, 10)).toMatchObject({ refus: expect.stringMatching(/déjà/) });
    expect(await regulariser(b, 2015, 10)).toMatchObject({ refus: expect.any(String) });
  });

  it("R16-A1 — aucune des deux fonctions ne lève plus de refus « prescrit » ; le reste de leur texte, leurs droits et leur mode sont ceux d'avant", async () => {
    for (const s of [REGULARISER, FOURNITURE]) {
      const def = await definition(s);
      expect(def, s).not.toMatch(/raise exception 'Exercice[^']*prescrit/);
      expect(def, s).toContain("Lot T3 (R16-A1)");
      expect(def, s).toMatch(/SECURITY DEFINER/);
    }
    // Le retour de 20261014821000 compte quatre citations du jour de Paris dans regulariser_charges : le compte ne change pas.
    expect((await definition(REGULARISER)).match(/(\bpublic\.)?\baujourdhui_paris\(\)/g)).toHaveLength(4);
    expect(await un(`select has_function_privilege('anon',$1,'execute') anon, has_function_privilege('authenticated',$1,'execute') connecte,
        has_function_privilege('anon',$2,'execute') anon_fourniture, has_function_privilege('anon',$3,'execute') anon_terme,
        has_function_privilege('authenticated',$3,'execute') connecte_terme`, [REGULARISER, FOURNITURE, TERME]))
      .toEqual({ anon: false, connecte: true, anon_fourniture: false, anon_terme: false, connecte_terme: false });
  });

  it("T1R-2 — bail commencé un 29 février : dernier jour le 28 février (et non le 27) ; les autres débuts gardent « début + durée − 1 jour »", async () => {
    const terme = async (bailId: string, jour: string) => { await agir(compte); const t = (await un("select public.terme_bail($1,$2::date)::text t", [bailId, jour])).t; await base(); return t; };
    // Nu, trois ans (bailleur personne physique) : [début, jour demandé, terme attendu]
    const nus: [string, string, string][] = [
      ["2024-02-29", "2024-03-01", "2027-02-28"], // l'écart corrigé : 27/02 avant
      ["2024-02-29", "2027-03-01", "2030-02-28"], // terme suivant
      ["2024-02-28", "2024-03-01", "2027-02-27"],
      ["2024-03-01", "2024-03-01", "2027-02-28"],
      ["2021-03-01", "2021-03-01", "2024-02-29"], // veille d'un 1er mars d'année bissextile : inchangé
      ["2024-09-21", "2024-09-21", "2027-09-20"],
      ["2024-07-01", "2024-07-01", "2027-06-30"],
      ["2023-12-31", "2024-01-01", "2026-12-30"],
    ];
    for (const [debut, jour, attendu] of nus) expect(await terme(await bail(debut), jour), `nu ${debut}`).toBe(attendu);
    // Meublé, un an reconduit : commencé le 29/02/2024, il finit chaque 28 février, y compris l'année bissextile 2028.
    const meuble = await bail("2024-02-29", "meuble");
    expect(await terme(meuble, "2024-03-01")).toBe("2025-02-28");
    expect(await terme(meuble, "2027-03-01")).toBe("2028-02-28");
    // Balayage : pour chaque début de janvier 2023 à mars 2025 pris tous les 7 jours, le terme est « début + 3 ans − 1 jour ».
    for (let d = new Date("2023-01-01T00:00:00Z"); d < new Date("2025-03-31T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 7)) {
      const debut = d.toISOString().slice(0, 10);
      const veille = new Date(`${ajouterMois(debut, 36)}T00:00:00Z`); veille.setUTCDate(veille.getUTCDate() - 1);
      expect(await terme(await bail(debut), debut), debut).toBe(veille.toISOString().slice(0, 10));
    }
  });

  it("T1R-2 — le congé du bailleur d'un bail commencé le 29/02/2024 est admis jusqu'au 31 août 2026 (27 août avant) et refusé le 1er septembre", async () => {
    // Jour de Paris ramené avant la date limite : l'enregistrement d'un congé reçu « dans le futur » serait refusé pour une autre raison.
    await db.query("create or replace function public.aujourdhui_paris() returns date language sql stable set search_path = '' as $$ select date '2026-09-02' $$");
    const b = await bail("2024-02-29");
    const conge = async (reception: string) => {
      await agir(compte);
      const r = await essai(async () => {
        await db.query("select public.enregistrer_conge($1,'bailleur'::public.conge_par,$2::date,6::smallint,'Motif légitime et sérieux',null,null,null)", [b, reception]);
        await base();
        const effet = String((await un("select date_effet::text e from public.conges where bail_id=$1", [b])).e);
        throw Object.assign(new Error("annuler"), { effet });
      });
      await base();
      const refus = (r as { refus: string }).refus;
      return refus === "annuler" ? "admis" : refus;
    };
    expect(await conge("2026-08-31")).toBe("admis");
    expect(await conge("2026-09-01")).toContain("au plus tard le 31/08/2026");
  });

  it("rejeu sans effet ; le retour rend les trois fonctions à l'identique (et le refus « prescrit ») ; la marche avant repart ; aucune régularisation enregistrée ne change", async () => {
    const b = await bail("2018-01-01");
    expect(await regulariser(b, 2021, 321.09)).toBe(-321.09);
    const temoin = () => db.query("select annee, charges_reelles::text, provisions::text, ecart::text, date_emission::text, etalement_12_mois from public.regularisations_charges where bail_id=$1", [b]).then((r) => r.rows);
    const enregistre = await temoin();
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const apres = await empreintes();
    await db.query(migration);
    expect(await empreintes()).toEqual(apres);

    // Reprise T3R-1 : son retour se joue d'abord (ordre de la chaîne des retours) ; il rend la ligne de ce lot.
    const repriseMigration = readFileSync(`supabase/migrations/${REPRISE}.sql`, "utf8");
    await db.query(readFileSync(`supabase/retours-arriere/${REPRISE}.retour.sql`, "utf8"));
    await db.query(retour);
    const avant = await empreintes();
    for (const s of [REGULARISER, FOURNITURE, TERME]) {
      expect((avant[s] as { corps: string }).corps, s).not.toBe((apres[s] as { corps: string }).corps);
      expect({ ...(avant[s] as object), corps: "" }, s).toEqual({ ...(apres[s] as object), corps: "" }); // droits, mode et réglages inchangés
    }
    expect(await definition(REGULARISER)).toMatch(/raise exception 'Exercice % prescrit/);
    expect(await definition(FOURNITURE)).toMatch(/raise exception 'Exercice prescrit/);
    expect(await definition(TERME)).toContain("::date - 1;");
    expect(await temoin()).toEqual(enregistre);
    // L'ancien comportement est bien revenu : complément ancien refusé, 29 février un jour trop tôt.
    const b2 = await bail("2018-01-01");
    expect(await regulariser(b2, 2021, 100, false, false)).toMatchObject({ refus: expect.stringMatching(/prescrit/) });
    const fevrier = await bail("2024-02-29");
    expect((await un("select public.terme_bail_calcule($1,'2024-03-01')::text t", [fevrier])).t).toBe("2027-02-27");
    await db.query(retour); // rejouable
    expect(await empreintes()).toEqual(avant);

    await db.query(migration);
    await db.query(repriseMigration); // puis la reprise, dans l'ordre du manifeste
    expect(await empreintes()).toEqual(apres);
    expect(await regulariser(b2, 2021, 100, false, false)).toMatchObject({ refus: expect.stringMatching(/confirmation nécessaire/) });
    expect(await regulariser(b2, 2021, 100)).toBe(-100);
    expect((await un("select public.terme_bail_calcule($1,'2024-03-01')::text t", [fevrier])).t).toBe("2027-02-28");
    expect(await temoin()).toEqual(enregistre);
  });

  it("une définition inattendue arrête la migration sans rien modifier", async () => {
    await db.query(readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8"));
    const def = await definition(TERME);
    await db.query(def.replace("::date - 1;", "::date - 2;"));
    const etat = await empreintes();
    const r = await essai(() => db.query(readFileSync(`supabase/migrations/${NOM}.sql`, "utf8")));
    expect(r).toMatchObject({ refus: expect.stringContaining("définition inattendue pour public.terme_bail_calcule") });
    expect(await empreintes()).toEqual(etat);
  });
});
