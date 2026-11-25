/**
 * Case « mariés ou pacsés » au bail (décision du dirigeant du 24/11/2026) — migration 20261125152000, avec base.
 *
 * Article 8-1 de la loi du 6 juillet 1989 (recueil fourni par le dirigeant, non recontrôlé) : I — une location consentie
 * exclusivement à des époux ou à des partenaires de PACS au moment de la conclusion initiale du contrat n'est pas une
 * colocation ; VI — la fin de la solidarité (congé et nouveau colocataire, ou au plus tard six mois après le congé) vise
 * les colocataires. Le recueil ne fixe pas d'autre terme à la solidarité de ces locataires.
 *
 * Avant : `enregistrer_depart_colocataire` posait toujours une fin de solidarité (six mois après la date d'effet du congé,
 * ou cette date avec un remplaçant), même pour des époux ; après le sixième mois, les appels de loyer et les relances
 * cessaient d'écrire au locataire parti et à son garant. Après : case cochée, aucune fin n'est enregistrée ; case non
 * cochée (la valeur de tous les baux existants), rien ne change. Aucun départ déjà enregistré ni aucune autre donnée n'est
 * réécrit. Le bloc « rejeu et retour » prouve l'avant (retour joué, le départ d'un époux reprend la fin à six mois).
 *
 * Le fichier rejoue du DDL (colonne de `baux`, fonction) dans la transaction du test : il tourne en série
 * (FICHIERS_EN_SERIE de vitest.config.ts). Nécessite SUPABASE_DB_URL ; transaction annulée après chaque test.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sansRetraitDuRegistre } from "./fixtures/registre-retour";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261125152000_bail_locataires_epoux_pacses";
const DEPART = "public.enregistrer_depart_colocataire(uuid,date,uuid)";
/** Empreinte du texte de la fonction avant cette migration (relevée sur le banc le 25/11, après 20261125151000). */
const DEPART_AVANT = "e6150a8c0a709b300d02f1810e6a2a95";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const lire = (chemin: string) => readFileSync(chemin, "utf8");
const migration = () => lire(`supabase/migrations/${NOM}.sql`);
const retour = () => lire(`supabase/retours-arriere/${NOM}.retour.sql`);
// Relecture de la fusion (A-01, 25/11) : 20261125153000 complète `enregistrer_depart_colocataire` ; son retour se joue
// AVANT celui de cette migration (qui s'arrête sur une fonction réécrite depuis), dans l'ordre inverse du manifeste.
const retourSuivante = () => lire("supabase/retours-arriere/20261125153000_bail_epoux_pacses_personnes_a_la_signature.retour.sql");

describe("case « mariés ou pacsés » — écriture de la migration et place au manifeste (sans base)", () => {
  it("additive : une colonne ajoutée (faux par défaut), une fonction complétée ; aucune ligne écrite, aucun droit ni aucune règle de lecture", () => {
    const sql = migration().replace(/^\s*--.*$/gm, "");
    expect(sql).toMatch(/alter table public\.baux add column if not exists locataires_epoux_pacses boolean not null default false;/);
    expect(sql).not.toMatch(/\b(update|delete from|insert into|truncate|drop)\b/i);
    expect(sql).not.toMatch(/\bgrant\b|\brevoke\b|\bpolicy\b|row level security/i);
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function/i); // la fonction est relue, jamais recopiée à la main
    expect(sql).toContain("pg_get_functiondef");
    // Ni les appels de loyer ni les relances ne sont redéfinis : ils lisent déjà la date de fin (vide = toujours solidaire).
    expect(sql).not.toMatch(/appels_a_envoyer|relances_loyer_dues/);
    // RET-01 (essai « retours » du 25/11) : le retour retire sa version du registre des migrations, et rien d'autre ;
    // sansRetraitDuRegistre exige cette suppression une fois, puis la retire du texte contrôlé ci-dessous.
    const r = sansRetraitDuRegistre(retour(), NOM.slice(0, 14)).replace(/^\s*--.*$/gm, "");
    expect(r).not.toMatch(/\b(update|delete from|insert into|truncate|drop)\b/i); // la colonne et ses valeurs sont gardées
  });
  it("manifeste, liste des retours, ordre des migrations et fichiers en série sont à jour", () => {
    const ordre = lire("e2e/local/ordre-migrations.txt").trim().split(/\r?\n/);
    expect(ordre.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(ordre.indexOf(`${NOM}.sql`)).toBeGreaterThan(ordre.indexOf("20261125151000_textes_t3_reprise_exercice_ancien.sql"));
    expect(lire("supabase/retours-arriere/LISEZ-MOI.md")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(lire("tests/relais-migrations-manifeste.test.ts")).toContain(`"${NOM}.sql",`);
    expect(lire("vitest.config.ts")).toContain('"tests/bail-epoux-pacses-base.test.ts"');
  });
});

describe.skipIf(!url)("case « mariés ou pacsés » — départ, appels, relances, droits (avec base)", () => {
  let db: Client, org: string, gerant: string, autre: string, lot: string;
  const un = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0] as Record<string, unknown>;
  const id = async (sql: string, p: unknown[] = []) => String((await un(sql, p)).id);
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  async function agir(compte: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: compte, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  }
  async function essai<T>(f: () => Promise<T>): Promise<T | { refus: string }> {
    await db.query("savepoint essai");
    try { const r = await f(); await db.query("release savepoint essai"); return r; }
    catch (e) { await db.query("rollback to savepoint essai"); return { refus: (e as Error).message }; }
  }
  async function compteNeuf() {
    const c = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [c, `${c}@test.local`]);
    return c;
  }
  const personne = (nom: string, email: string) => id("insert into public.persons(organization_id,nom,prenom,email) values($1,$2,'Test',$3) returning id", [org, nom, email]);
  /**
   * Un bail commun signé à deux locataires (principal + colocataire), le garant du colocataire, et un loyer de novembre
   * impayé (échéance le 01/11, jour de Paris fixé au 24/11/2026). `cle` distingue les adresses des deux dossiers.
   */
  async function dossier(cle: string, epouxPacs: boolean, etat: "actif" | "brouillon" = "actif") {
    await base();
    await db.query("set constraints all deferred");
    const principal = await personne(`Principal ${cle}`, `principal-${cle}@exemple.invalid`);
    const conjoint = await personne(`Conjoint ${cle}`, `conjoint-${cle}@exemple.invalid`);
    const garant = await personne(`Garant ${cle}`, `garant-${cle}@exemple.invalid`);
    const l = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,(select bien_id from public.lots where id=$2),'Lot '||gen_random_uuid(),$3) returning id", [org, lot, etat === "actif" ? "loue" : "disponible"]);
    // Relecture de la fusion (A-01, 25/11) : les deux locataires sont au bail À SA SIGNATURE — le bail est créé en
    // brouillon, le conjoint et son garant y sont ajoutés, puis le bail sort du brouillon (comme au dépôt du bail signé).
    // Le dossier insérait le bail déjà actif puis le conjoint : la base tient désormais une personne ajoutée à un bail
    // signé pour un tiers entré après la signature (20261125153000). Le suivi des loyers part, comme avant, du début.
    const bail = await id(`insert into public.baux(organization_id,lot_id,type,etat,loyer_hc,charges,jour_echeance,date_debut,locataire_principal,locataires_epoux_pacses)
      values($1,$2,'colocation','brouillon',750,50,1,'2024-01-01',$3,$4) returning id`, [org, l, principal, epouxPacs]);
    const ligne = await id("insert into public.bail_personnes(organization_id,bail_id,person_id,role,quote_part) values($1,$2,$3,'colocataire',50) returning id", [org, bail, conjoint]);
    await db.query("insert into public.bail_personnes(organization_id,bail_id,person_id,role,garant_de) values($1,$2,$3,'garant',$4)", [org, bail, garant, conjoint]);
    if (etat === "actif") await db.query("update public.baux set etat='actif', loyers_suivis_depuis=null where id=$1", [bail]);
    await db.query("insert into public.appels_loyer(organization_id,bail_id,periode,loyer_hc,charges,montant_du,date_echeance) values($1,$2,'2026-11-01',750,50,800,'2026-11-01')", [org, bail]);
    // Le contrôle différé de cohérence lot / bail se joue tout de suite : une modification de la table des baux (la
    // migration, son retour) est refusée tant qu'un contrôle différé attend la fin de la transaction.
    await db.query("set constraints all immediate");
    return { bail, ligne, conjoint, garant };
  }
  /** Le départ du colocataire, enregistré par le gérant : la date rendue (texte) ou le refus. */
  async function depart(ligne: string, effet: string, remplacant: string | null = null, qui = gerant) {
    await agir(qui);
    const r = await essai(async () => (await un("select public.enregistrer_depart_colocataire($1,$2::date,$3)::text as fin", [ligne, effet, remplacant])).fin as string | null);
    await base();
    return r;
  }
  const lignes = async (bail: string) => (await db.query(
    "select role, date_depart::text depart, date_solidarite_fin::text fin from public.bail_personnes where bail_id=$1 order by role", [bail])).rows;
  /** Les destinataires que la tâche planifiée calcule (service, sans identité) pour l'appel et la relance du bail. */
  async function destinataires(bail: string) {
    await base();
    const appel = await un("select autres_destinataires a from public.appels_a_envoyer(500) where bail_id=$1", [bail]);
    const relance = await un("select autres_destinataires a, garants g from public.relances_loyer_dues(500) where bail_id=$1", [bail]);
    return { appel: (appel?.a ?? null) as string[] | null, relance: (relance?.a ?? null) as string[] | null, garants: (relance?.g ?? null) as string[] | null };
  }
  const definition = async () => String((await un("select pg_get_functiondef($1::text::regprocedure) d", [DEPART])).d);
  const etat = async () => un("select md5(p.prosrc) corps, p.proacl::text droits, p.prosecdef definer, p.proconfig::text conf from pg_proc p where p.oid=$1::text::regprocedure", [DEPART]);

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => {
    await db.query("begin"); await base();
    await db.query("create or replace function public.aujourdhui_paris() returns date language sql stable set search_path = '' as $$ select date '2026-11-24' $$");
    gerant = await compteNeuf(); autre = await compteNeuf();
    org = await id(`insert into public.organizations(name,type,status,appels_envoi_auto,relances_envoi_auto,relance_1_jours,relance_2_jours,relance_seuil_montant)
      values('TEST époux pacsés','agence','active',true,true,1,10,0) returning id`);
    const org2 = await id("insert into public.organizations(name,type,status) values('TEST autre espace','agence','active') returning id");
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'admin_agence'),($3,$4,'admin_agence')", [gerant, org, autre, org2]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Immeuble fictif','appartement','1 rue Test','69001','Lyon',false) returning id", [org]);
    lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot modèle','disponible') returning id", [org, bien]);
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("la colonne : un booléen jamais vide, faux par défaut ; un bail créé sans la préciser l'a à faux", async () => {
    const c = await un("select data_type t, is_nullable n, column_default d from information_schema.columns where table_schema='public' and table_name='baux' and column_name='locataires_epoux_pacses'");
    expect(c).toEqual({ t: "boolean", n: "NO", d: "false" });
    const principal = await personne("Seul", "seul@exemple.invalid");
    const b = await id("insert into public.baux(organization_id,lot_id,type,etat,loyer_hc,charges,jour_echeance,date_debut,locataire_principal) values($1,$2,'colocation','brouillon',750,50,1,'2026-12-01',$3) returning id", [org, lot, principal]);
    expect((await un("select locataires_epoux_pacses v from public.baux where id=$1", [b])).v).toBe(false);
  });

  it("case non cochée : rien ne change — fin à six mois (ou au remplacement), le locataire parti et son garant ne reçoivent plus rien ensuite", async () => {
    const d = await dossier("coloc", false);
    expect(await depart(d.ligne, "2026-03-31")).toBe("2026-09-30");
    expect(await lignes(d.bail)).toEqual([
      { role: "colocataire", depart: "2026-03-31", fin: "2026-09-30" },
      { role: "garant", depart: null, fin: "2026-09-30" },
    ]);
    // Au 24/11/2026, la fin (30/09) est passée : ni l'appel, ni la relance, ni la caution ne le visent plus.
    await db.query("insert into public.relances(organization_id,bail_id,niveau,date_envoi) values($1,$2,'relance_1','2026-11-10')", [org, d.bail]);
    expect(await destinataires(d.bail)).toEqual({ appel: [], relance: [], garants: [] });
    // Avec un remplaçant figurant au bail : la fin est la date d'effet du congé.
    const d2 = await dossier("remplace", false);
    const nouveau = await personne("Nouveau", "nouveau@exemple.invalid");
    await db.query("insert into public.bail_personnes(organization_id,bail_id,person_id,role,quote_part) values($1,$2,$3,'colocataire',50)", [org, d2.bail, nouveau]);
    expect(await depart(d2.ligne, "2026-05-31", nouveau)).toBe("2026-05-31");
  });

  it("case cochée : le départ s'enregistre sans date de fin (avec ou sans remplaçant) ; le garant reste engagé sans date", async () => {
    const d = await dossier("epoux", true);
    expect(await depart(d.ligne, "2026-03-31")).toBeNull();
    expect(await lignes(d.bail)).toEqual([
      { role: "colocataire", depart: "2026-03-31", fin: null },
      { role: "garant", depart: null, fin: null },
    ]);
    const d2 = await dossier("epoux-remplace", true);
    const nouveau = await personne("Nouveau", "nouveau-epoux@exemple.invalid");
    await db.query("insert into public.bail_personnes(organization_id,bail_id,person_id,role,quote_part) values($1,$2,$3,'colocataire',50)", [org, d2.bail, nouveau]);
    expect(await depart(d2.ligne, "2026-05-31", nouveau)).toBeNull();
    // Les autres gardes de la fonction ne bougent pas.
    expect(await depart(d.ligne, "2026-04-30")).toMatchObject({ refus: expect.stringMatching(/déjà enregistré/) });
    expect(await depart(d2.ligne, "2026-06-30", null, autre)).toMatchObject({ refus: expect.stringMatching(/Accès refusé/) });
  });

  it("case cochée : sept mois après le congé, l'appel de loyer et la relance écrivent encore au conjoint parti, et la caution est encore informée", async () => {
    const d = await dossier("suivi", true);
    expect(await depart(d.ligne, "2026-03-31")).toBeNull();
    await db.query("insert into public.relances(organization_id,bail_id,niveau,date_envoi) values($1,$2,'relance_1','2026-11-10')", [org, d.bail]);
    expect(await destinataires(d.bail)).toEqual({
      appel: ["conjoint-suivi@exemple.invalid"],
      relance: ["conjoint-suivi@exemple.invalid"],
      garants: ["garant-suivi@exemple.invalid"],
    });
  });

  it("isolation : le gérant d'un autre espace ne lit ni ne change la case ; un bail signé la fige ; rien pour anon", async () => {
    const signe = await dossier("signe", false);
    const prepa = await dossier("prepa", false, "brouillon");
    await agir(autre);
    expect((await db.query("select locataires_epoux_pacses from public.baux where id=$1", [prepa.bail])).rows).toEqual([]);
    expect((await db.query("update public.baux set locataires_epoux_pacses=true where id=$1 returning id", [prepa.bail])).rows).toEqual([]);
    await agir(gerant);
    expect(await essai(() => db.query("update public.baux set locataires_epoux_pacses=true where id=$1", [signe.bail])))
      .toMatchObject({ refus: expect.stringMatching(/Bail signé : son contenu est figé \(locataires_epoux_pacses\)/) });
    expect((await db.query("update public.baux set locataires_epoux_pacses=true where id=$1 returning locataires_epoux_pacses v", [prepa.bail])).rows).toEqual([{ v: true }]);
    await base();
    await db.query("set local role anon");
    expect(await essai(() => db.query("select locataires_epoux_pacses from public.baux limit 1"))).toMatchObject({ refus: expect.stringMatching(/permission denied/) });
    await base();
    expect(await un(`select has_function_privilege('anon',$1::text::regprocedure,'execute') a, has_function_privilege('authenticated',$1::text::regprocedure,'execute') c`, [DEPART])).toEqual({ a: false, c: true });
  });

  it("aucune donnée existante n'est réécrite : sur la base d'avant (colonne retirée), la migration ne change ni un bail ni un départ", async () => {
    // Un départ déjà enregistré, avant la migration, sur un bail qui sera « non coché ».
    const ancien = await dossier("ancien", false);
    expect(await depart(ancien.ligne, "2026-01-31")).toBe("2026-07-31");
    await base();
    await db.query(retourSuivante());
    await db.query(retour());
    await db.query("alter table public.baux drop column locataires_epoux_pacses");
    const instantane = async () => ({
      baux: (await un("select md5(string_agg((to_jsonb(b) - 'locataires_epoux_pacses' - 'updated_at')::text, ',' order by b.id)) m from public.baux b")).m,
      departs: (await un("select md5(string_agg(id::text||'|'||coalesce(date_depart::text,'')||'|'||coalesce(date_solidarite_fin::text,''), ',' order by id)) m from public.bail_personnes")).m,
      n: (await un("select count(*)::int n from public.baux")).n,
    });
    const avant = await instantane();
    await db.query(migration());
    expect(await instantane()).toEqual(avant);
    expect((await un("select count(*)::int n from public.baux where locataires_epoux_pacses")).n).toBe(0);
    expect(await lignes(ancien.bail)).toEqual([
      { role: "colocataire", depart: "2026-01-31", fin: "2026-07-31" },
      { role: "garant", depart: null, fin: "2026-07-31" },
    ]);
  });

  it("rejeu sans effet ; le retour rend la fonction à l'identique et garde la colonne : un époux parti reprend la fin à six mois (l'état d'avant) ; la marche avant repart", async () => {
    await db.query(retourSuivante()); // l'état de cette migration, avant 20261125153000
    const apres = await etat();
    await db.query(migration());
    expect(await etat()).toEqual(apres);
    await db.query(retour());
    const avant = await etat();
    expect(avant.corps).toBe(DEPART_AVANT);
    expect({ ...avant, corps: "" }).toEqual({ ...apres, corps: "" }); // droits, mode, réglages inchangés
    expect((await un("select count(*)::int n from information_schema.columns where table_name='baux' and column_name='locataires_epoux_pacses'")).n).toBe(1);
    const d = await dossier("avant", true);
    expect(await depart(d.ligne, "2026-03-31")).toBe("2026-09-30"); // l'avant : même cochée, six mois
    await db.query(retour()); // rejouable
    expect(await etat()).toEqual(avant);
    await db.query(migration());
    expect(await etat()).toEqual(apres);
    const d2 = await dossier("apres", true);
    expect(await depart(d2.ligne, "2026-03-31")).toBeNull();
    expect(await lignes(d.bail)).toEqual([
      { role: "colocataire", depart: "2026-03-31", fin: "2026-09-30" }, // enregistré avant : pas réécrit
      { role: "garant", depart: null, fin: "2026-09-30" },
    ]);
  });

  it("une définition inattendue (ligne des six mois absente) arrête la migration sans rien modifier ; un retour sur une fonction réécrite s'arrête aussi", async () => {
    await db.query(retourSuivante());
    await db.query(retour());
    await db.query((await definition()).replace("interval '6 months'", "interval '6 mons'"));
    const e = await etat();
    expect(await essai(() => db.query(migration()))).toMatchObject({ refus: expect.stringContaining(`définition inattendue pour ${DEPART} (0 occurrence(s) de la ligne des six mois)`) });
    expect(await etat()).toEqual(e);
    await db.query((await definition()).replace("interval '6 mons'", "interval '6 months'"));
    await db.query(migration());
    await db.query((await definition()).replace("v_fin := null;", "v_fin := null; -- réécrite"));
    const reecrite = await etat();
    expect(await essai(() => db.query(retour()))).toMatchObject({ refus: expect.stringContaining("a été réécrite depuis la migration") });
    expect(await etat()).toEqual(reecrite);
  });
});
