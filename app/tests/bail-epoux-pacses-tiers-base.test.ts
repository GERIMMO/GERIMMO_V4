/**
 * Relecture de la fusion du 25/11/2026, constat A-01 — case « mariés ou pacsés » : la fin de solidarité vide ne vaut que
 * pour les deux personnes présentes au bail à sa signature (migration 20261125153000), avec base.
 *
 * Article 8-1 de la loi du 6 juillet 1989 (recueil fourni par le dirigeant, non recontrôlé) : I — la location consentie
 * exclusivement à des époux ou à des partenaires de PACS « au moment de la conclusion initiale du contrat » n'est pas une
 * colocation ; VI — la fin de la solidarité (date d'effet du congé et nouveau colocataire au bail, ou au plus tard six mois
 * après) vise les colocataires.
 *
 * Avant : sur un bail coché, `enregistrer_depart_colocataire` laissait la fin VIDE pour toute personne qui part, y compris
 * un tiers ajouté après la signature (le remplaçant de l'un des époux) et son garant ; un brouillon coché à deux pouvait
 * recevoir un troisième locataire puis être activé. Après : une personne entrée après la signature garde la règle de la
 * colocation (six mois, ou la date du remplacement), son garant aussi ; la base refuse un troisième locataire sur un
 * brouillon coché et l'activation d'un bail coché qui ne compte pas exactement deux locataires. Le bloc « rejeu et
 * retour » prouve l'avant (retour joué, le tiers repart sans date de fin).
 *
 * Tout se joue sous le rôle `authenticated` (le gérant), comme l'action `ajouterBailPersonne` et le dépôt du bail signé.
 * Le fichier rejoue du DDL (déclencheurs, fonction) dans la transaction du test : il tourne en série (FICHIERS_EN_SERIE
 * de vitest.config.ts). Nécessite SUPABASE_DB_URL ; transaction annulée après chaque test.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261125153000_bail_epoux_pacses_personnes_a_la_signature";
const PRECEDENTE = "20261125152000_bail_locataires_epoux_pacses";
const DEPART = "public.enregistrer_depart_colocataire(uuid,date,uuid)";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const lire = (chemin: string) => readFileSync(chemin, "utf8");
const migration = () => lire(`supabase/migrations/${NOM}.sql`);
const retour = () => lire(`supabase/retours-arriere/${NOM}.retour.sql`);

describe("case « mariés ou pacsés », personnes à la signature — écriture de la migration et place au manifeste (sans base)", () => {
  it("additive : une colonne (faux par défaut), deux déclencheurs, une fonction complétée par relecture ; aucune ligne écrite, aucun droit ouvert, aucune règle de lecture", () => {
    const sql = migration().replace(/^\s*--.*$/gm, "");
    expect(sql).toMatch(/alter table public\.bail_personnes add column if not exists entree_apres_signature boolean not null default false;/);
    expect(sql).not.toMatch(/\b(update|delete from|insert into|truncate)\b\s+public\./i);
    expect(sql).not.toMatch(/\bgrant\b|\bpolicy\b|row level security/i);
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.enregistrer_depart_colocataire/i); // relue, jamais recopiée
    expect(sql).toContain("pg_get_functiondef");
    expect(sql.match(/revoke all on function public\.\w+\(\) from public, anon, authenticated;/g)).toHaveLength(2);
    expect(sql.match(/security definer\s+set search_path = ''/g)).toHaveLength(2);
    expect(sql).not.toMatch(/appels_a_envoyer|relances_loyer_dues/);
    const r = retour().replace(/^\s*--.*$/gm, "");
    expect(r).not.toMatch(/\b(update|delete from|insert into|truncate)\b\s+public\./i);
    expect(r).not.toMatch(/drop column/i); // la colonne et ses valeurs sont gardées
  });
  it("manifeste, liste des retours (avant celui de 20261125152000), ordre des migrations et fichiers en série sont à jour", () => {
    const ordre = lire("e2e/local/ordre-migrations.txt").trim().split(/\r?\n/);
    expect(ordre.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(ordre.indexOf(`${NOM}.sql`)).toBe(ordre.indexOf(`${PRECEDENTE}.sql`) + 1);
    const lisezMoi = lire("supabase/retours-arriere/LISEZ-MOI.md");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(lire("tests/relais-migrations-manifeste.test.ts")).toContain(`"${NOM}.sql",`);
    expect(lire("vitest.config.ts")).toContain('"tests/bail-epoux-pacses-tiers-base.test.ts"');
    expect(migration()).toContain(`supabase/retours-arriere/${NOM}.retour.sql`);
  });
});

describe.skipIf(!url)("case « mariés ou pacsés », personnes à la signature — départ, garant, ajout, activation, droits (avec base)", () => {
  let db: Client, org: string, gerant: string, bailleur: string;
  const un = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0] as Record<string, unknown>;
  const id = async (sql: string, p: unknown[] = []) => String((await un(sql, p)).id);
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  async function agir(compte = gerant) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: compte, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  }
  async function essai<T>(f: () => Promise<T>): Promise<T | { refus: string }> {
    await db.query("savepoint essai");
    try { const r = await f(); await db.query("release savepoint essai"); return r; }
    catch (e) { await db.query("rollback to savepoint essai"); return { refus: (e as Error).message }; }
  }
  const personne = async (nom: string) => { await base(); return id("insert into public.persons(organization_id,nom,prenom,email) values($1,$2,'Test',$3) returning id", [org, nom, `${nom.toLowerCase().replace(/\W+/g, "-")}-${randomUUID().slice(0, 6)}@exemple.invalid`]); };
  /** Une ligne de bail ajoutée par le gérant, comme `ajouterBailPersonne` (insertion directe sous sa session). */
  async function ajouter(bail: string, person: string, role: "colocataire" | "garant" = "colocataire", garantDe: string | null = null, marque?: boolean) {
    await agir();
    const r = await essai(async () => id(`insert into public.bail_personnes(organization_id,bail_id,person_id,role,garant_de${marque === undefined ? "" : ",entree_apres_signature"})
      values($1,$2,$3,$4,$5${marque === undefined ? "" : ",$6"}) returning id`, [org, bail, person, role, garantDe, ...(marque === undefined ? [] : [marque])]));
    await base();
    return r;
  }
  /** Un brouillon de bail commun (le gérant le crée), son locataire principal, et la case posée comme l'action. */
  async function brouillon(principal: string, epoux: boolean) {
    await base();
    // Un bien par bail : un second lot dans le même bien demanderait de revalider sa clé de répartition des charges.
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Immeuble '||gen_random_uuid(),'appartement','1 rue Test','69003','Lyon',false) returning id", [org]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat,meuble,surface_m2) values($1,$2,'Lot '||gen_random_uuid(),'disponible',false,40) returning id", [org, bien]);
    await db.query("insert into public.detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,'2000-01-01')", [org, lot, bailleur]);
    await agir();
    const bail = await id(`insert into public.baux(organization_id,lot_id,type,etat,loyer_hc,charges,depot_garantie,jour_echeance,date_debut,locataire_principal,zone_tendue)
      values($1,$2,'colocation','brouillon',750,50,750,1,'2025-01-01',$3,false) returning id`, [org, lot, principal]);
    if (epoux) await db.query("update public.baux set locataires_epoux_pacses = true where id = $1 and etat = 'brouillon'", [bail]);
    await base();
    return bail;
  }
  /** Le dépôt du bail signé papier par le gérant (activer_bail_papier) : le bail sort du brouillon. */
  async function deposer(bail: string) {
    await base();
    const doc = await id(`insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
      values($1::uuid,'bail','Bail signé',$1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',10,gen_random_uuid()::text) returning id`, [org]);
    await agir();
    const r = await essai(() => db.query("select public.activer_bail_papier($1,$2,$3)", [org, bail, doc]));
    await base();
    return r;
  }
  async function depart(ligne: string, effet: string, remplacant: string | null = null) {
    await agir();
    const r = await essai(async () => (await un("select public.enregistrer_depart_colocataire($1,$2::date,$3)::text as fin", [ligne, effet, remplacant])).fin as string | null);
    await base();
    return r;
  }
  const lignes = async (bail: string) => (await db.query(
    "select p.nom, bp.role, bp.entree_apres_signature apres, bp.date_depart::text depart, bp.date_solidarite_fin::text fin from public.bail_personnes bp join public.persons p on p.id = bp.person_id where bp.bail_id=$1 order by p.nom", [bail])).rows;
  /** Un bail coché, signé avec ses deux époux (Époux A principal, Époux B colocataire, garant de B), au dépôt du bail papier. */
  async function couple() {
    const a = await personne("Époux A"), b = await personne("Époux B"), gb = await personne("Garant de B");
    const bail = await brouillon(a, true);
    const ligneB = String(await ajouter(bail, b));
    await ajouter(bail, gb, "garant", b);
    expect(await deposer(bail)).not.toHaveProperty("refus");
    expect((await un("select etat::text e, locataires_epoux_pacses c from public.baux where id=$1", [bail]))).toEqual({ e: "actif", c: true });
    return { bail, a, b, ligneB };
  }
  const etat = async () => un("select md5(p.prosrc) corps, p.proacl::text droits, p.prosecdef definer, p.proconfig::text conf from pg_proc p where p.oid=$1::text::regprocedure", [DEPART]);
  const definition = async () => String((await un("select pg_get_functiondef($1::text::regprocedure) d", [DEPART])).d);

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => {
    await db.query("begin"); await base();
    await db.query("create or replace function public.aujourdhui_paris() returns date language sql stable set search_path = '' as $$ select date '2026-11-24' $$");
    gerant = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [gerant, `${gerant}@test.local`]);
    await db.query("insert into public.accounts(id,email) values($1,$2) on conflict do nothing", [gerant, `${gerant}@test.local`]);
    org = await id("insert into public.organizations(name,type,status,essai_fin) values('TEST A-01 époux','proprietaire_direct','essai',current_date+30) returning id");
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [gerant, org]);
    bailleur = await id("insert into public.persons(organization_id,nom,prenom,qualite) values($1,'Bailleur fictif','Paul','Personne physique') returning id", [org]);
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("A-01 — un tiers ajouté après la signature (le remplaçant de l'un des époux) : son départ et l'engagement de son garant suivent la règle de la colocation ; l'époux remplacé part sans date de fin", async () => {
    const { bail, ligneB } = await couple();
    const c = await personne("Tiers C"), gc = await personne("Garant de C");
    const ligneC = String(await ajouter(bail, c));
    await ajouter(bail, gc, "garant", c);
    // B part, remplacé par C : époux présent à la signature, aucune fin (décision du 24/11).
    expect(await depart(ligneB, "2026-01-31", c)).toBeNull();
    // C part le 31/03/2026 sans remplaçant : la règle de la colocation, six mois après la date d'effet du congé.
    expect(await depart(ligneC, "2026-03-31")).toBe("2026-09-30");
    expect(await lignes(bail)).toEqual([
      { nom: "Garant de B", role: "garant", apres: false, depart: null, fin: null },
      { nom: "Garant de C", role: "garant", apres: true, depart: null, fin: "2026-09-30" },
      { nom: "Tiers C", role: "colocataire", apres: true, depart: "2026-03-31", fin: "2026-09-30" },
      { nom: "Époux B", role: "colocataire", apres: false, depart: "2026-01-31", fin: null },
    ]);
    // Un second tiers qui remplace C : la fin de C est la date du remplacement (le VI s'applique à lui).
    const { bail: bail2 } = await couple();
    const c2 = await personne("Tiers C2"), d2 = await personne("Tiers D2");
    const ligneC2 = String(await ajouter(bail2, c2));
    await ajouter(bail2, d2);
    expect(await depart(ligneC2, "2026-05-31", d2)).toBe("2026-05-31");
  });

  // La relance (relances_loyer_dues) lit la même date de fin, pour les colocataires comme pour les garants
  // (tests/bail-epoux-pacses-base.test.ts, espace d'agence) ; un espace propriétaire la soumet en plus à sa confirmation.
  it("A-01 — au 24/11/2026, sept mois après, l'appel de loyer écrit encore à l'époux parti, plus au tiers parti ; le garant du tiers n'est plus engagé", async () => {
    const { bail, ligneB } = await couple();
    const c = await personne("Tiers C"), gc = await personne("Garant de C");
    const ligneC = String(await ajouter(bail, c));
    await ajouter(bail, gc, "garant", c);
    expect(await depart(ligneB, "2026-03-31")).toBeNull();
    expect(await depart(ligneC, "2026-03-31")).toBe("2026-09-30");
    await base();
    const courriel = async (nom: string) => String((await un("select email from public.persons where organization_id=$1 and nom=$2", [org, nom])).email);
    await db.query("update public.organizations set appels_envoi_auto=true, relances_envoi_auto=true, relance_1_jours=1, relance_2_jours=10, relance_seuil_montant=0 where id=$1", [org]);
    // Le suivi des loyers part du début du bail (le dépôt du bail signé le fait partir du mois de la reprise) : le terme
    // de novembre est suivi, comme dans tests/bail-epoux-pacses-base.test.ts.
    await db.query("update public.baux set loyers_suivis_depuis=null where id=$1", [bail]);
    await db.query("insert into public.appels_loyer(organization_id,bail_id,periode,loyer_hc,charges,montant_du,date_echeance) values($1,$2,'2026-11-01',750,50,800,'2026-11-01')", [org, bail]);
    const appel = await un("select autres_destinataires a from public.appels_a_envoyer(500) where bail_id=$1", [bail]);
    expect(appel?.a).toEqual([await courriel("Époux B")]);
    // Les garants que la relance compterait encore (même filtre que relances_loyer_dues) : celui de B, plus celui de C.
    const garants = (await db.query(`select p.nom from public.bail_personnes bp join public.persons p on p.id = bp.person_id
      where bp.bail_id = $1 and bp.role = 'garant' and (bp.date_solidarite_fin is null or bp.date_solidarite_fin >= public.aujourdhui_paris()) order by 1`, [bail])).rows.map((r) => r.nom);
    expect(garants).toEqual(["Garant de B"]);
  });

  it("A-01 — la marque « entrée après la signature » est posée par la base, jamais par le client", async () => {
    const { bail } = await couple();
    const c = await personne("Tiers C");
    const ligneC = String(await ajouter(bail, c, "colocataire", null, false)); // le client écrit « faux »
    expect((await un("select entree_apres_signature v from public.bail_personnes where id=$1", [ligneC])).v).toBe(true);
    // Le client ne modifie pas une ligne (aucun droit de mise à jour sur la table) ; une modification par la base garde la marque.
    await agir();
    expect(await essai(() => db.query("update public.bail_personnes set entree_apres_signature=false where id=$1", [ligneC]))).toMatchObject({ refus: expect.stringMatching(/permission denied/) });
    await base();
    await db.query("update public.bail_personnes set entree_apres_signature=false, quote_part=30 where id=$1", [ligneC]);
    expect((await un("select entree_apres_signature v, quote_part::text q from public.bail_personnes where id=$1", [ligneC]))).toEqual({ v: true, q: "30" });
    // Au brouillon, « vrai » écrit par le client ne tient pas non plus : la personne est au bail à sa signature.
    const p = await personne("Principal brouillon"), q = await personne("Second brouillon");
    const b2 = await brouillon(p, false);
    const ligneQ = String(await ajouter(b2, q, "colocataire", null, true));
    expect((await un("select entree_apres_signature v from public.bail_personnes where id=$1", [ligneQ])).v).toBe(false);
  });

  it("A-01 — brouillon coché : un troisième locataire est refusé (décocher d'abord) ; un garant s'ajoute ; décochée, le troisième s'ajoute", async () => {
    const a = await personne("Époux A"), b = await personne("Époux B"), c = await personne("Tiers C"), g = await personne("Garant");
    const bail = await brouillon(a, true);
    expect(await ajouter(bail, b)).not.toHaveProperty("refus");
    expect(await ajouter(bail, c)).toMatchObject({ refus: expect.stringContaining("La case « mariés ou pacsés » est cochée : ce bail est consenti à deux personnes, mariées ou pacsées l'une à l'autre. Décochez-la avant d'ajouter un troisième locataire") });
    expect(await ajouter(bail, g, "garant", b)).not.toHaveProperty("refus");
    await agir();
    await db.query("update public.baux set locataires_epoux_pacses=false where id=$1", [bail]);
    await base();
    expect(await ajouter(bail, c)).not.toHaveProperty("refus");
  });

  it("A-01 — un bail coché ne sort du brouillon qu'avec exactement deux locataires (dépôt du bail papier) ; sans la case, trois passent", async () => {
    const a = await personne("Époux A"), b = await personne("Époux B"), c = await personne("Tiers C");
    // Trois locataires au brouillon, puis la case posée directement (la base ne la refuse pas au brouillon) : l'activation refuse.
    const bail = await brouillon(a, false);
    await ajouter(bail, b);
    await ajouter(bail, c);
    await agir();
    await db.query("update public.baux set locataires_epoux_pacses=true where id=$1", [bail]);
    await base();
    expect(await deposer(bail)).toMatchObject({ refus: expect.stringContaining("Mise en location refusée : la case « mariés ou pacsés » est cochée et le bail compte 3 locataire(s)") });
    expect((await un("select etat::text e from public.baux where id=$1", [bail])).e).toBe("brouillon");
    // Un seul locataire, case cochée : refusé aussi.
    const seul = await brouillon(await personne("Seul"), true);
    expect(await deposer(seul)).toMatchObject({ refus: expect.stringContaining("le bail compte 1 locataire(s)") });
    // Décochée : le bail à trois s'active, sans rien de changé pour la colocation.
    await agir();
    await db.query("update public.baux set locataires_epoux_pacses=false where id=$1", [bail]);
    await base();
    expect(await deposer(bail)).not.toHaveProperty("refus");
    expect((await un("select etat::text e from public.baux where id=$1", [bail])).e).toBe("actif");
  });

  it("sans la case : rien ne change — un colocataire d'origine comme un colocataire ajouté ensuite partent avec la fin à six mois", async () => {
    const a = await personne("Principal"), b = await personne("Colocataire B"), c = await personne("Colocataire C");
    const bail = await brouillon(a, false);
    const ligneB = String(await ajouter(bail, b));
    expect(await deposer(bail)).not.toHaveProperty("refus");
    const ligneC = String(await ajouter(bail, c));
    expect(await depart(ligneB, "2026-03-31")).toBe("2026-09-30");
    expect(await depart(ligneC, "2026-04-30")).toBe("2026-10-30");
  });

  it("droits : la fonction du départ garde ses droits, son mode et ses réglages ; les deux fonctions de déclencheur ne sont appelables par personne ; rien pour anon", async () => {
    const apres = await etat();
    await db.query(retour());
    const avant = await etat();
    expect({ ...avant, corps: "" }).toEqual({ ...apres, corps: "" });
    await db.query(migration());
    const { rows } = await db.query(`select p.proname f, has_function_privilege('anon', p.oid, 'execute') anon,
        has_function_privilege('authenticated', p.oid, 'execute') compte, p.prosecdef definer, coalesce(array_to_string(p.proconfig, ','), '') chemin
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
      where p.proname in ('bail_personnes_epoux_pacses', 'controler_epoux_pacses_a_la_signature', 'enregistrer_depart_colocataire') order by 1`);
    expect(rows).toEqual([
      { f: "bail_personnes_epoux_pacses", anon: false, compte: false, definer: true, chemin: 'search_path=""' },
      { f: "controler_epoux_pacses_a_la_signature", anon: false, compte: false, definer: true, chemin: 'search_path=""' },
      { f: "enregistrer_depart_colocataire", anon: false, compte: true, definer: true, chemin: 'search_path=""' },
    ]);
    await db.query("set local role anon");
    expect(await essai(() => db.query("select entree_apres_signature from public.bail_personnes limit 1"))).toMatchObject({ refus: expect.stringMatching(/permission denied/) });
  });

  it("rejeu sans effet ; le retour rend la fonction de 20261125152000 à l'identique, retire les déclencheurs et garde la colonne : le tiers repart sans date de fin (l'avant) ; la marche avant repart", async () => {
    const apres = await etat();
    await db.query(migration());
    expect(await etat()).toEqual(apres);
    await db.query(retour());
    const avant = await etat();
    expect(avant.corps).not.toBe(apres.corps);
    expect(await definition()).not.toContain("entree_apres_signature");
    expect(await definition()).toContain("locataires_epoux_pacses");
    // Le texte rendu est celui de 20261125152000 : son retour le reconnaît et le défait.
    await db.query("savepoint precedente");
    await db.query(lire(`supabase/retours-arriere/${PRECEDENTE}.retour.sql`));
    expect(await definition()).not.toContain("locataires_epoux_pacses");
    await db.query("rollback to savepoint precedente");
    expect((await db.query("select tgname from pg_trigger where tgname in ('bail_personnes_epoux_pacses','baux_epoux_pacses_a_la_signature')")).rows).toEqual([]);
    expect((await un("select count(*)::int n from information_schema.columns where table_name='bail_personnes' and column_name='entree_apres_signature'")).n).toBe(1);
    // L'avant, celui de la relecture : le tiers part sans date de fin.
    const { bail } = await couple();
    const ligneC = String(await ajouter(bail, await personne("Tiers C")));
    expect(await depart(ligneC, "2026-03-31")).toBeNull();
    await db.query(retour()); // rejouable
    expect(await etat()).toEqual(avant);
    await db.query(migration());
    expect(await etat()).toEqual(apres);
    const { bail: bail2 } = await couple();
    const ligneC2 = String(await ajouter(bail2, await personne("Tiers C2")));
    expect(await depart(ligneC2, "2026-03-31")).toBe("2026-09-30");
    expect((await un("select date_solidarite_fin::text f from public.bail_personnes where id=$1", [ligneC])).f).toBeNull(); // enregistré avant : pas réécrit
  });

  it("une définition inattendue (bloc de 20261125152000 absent) arrête la migration sans rien modifier ; un retour sur une fonction réécrite s'arrête aussi", async () => {
    await db.query(retour());
    await db.query((await definition()).replace("    v_fin := null;\n  end if;\n\n  update", "    v_fin := null; -- autre\n  end if;\n\n  update"));
    const e = await etat();
    expect(await essai(() => db.query(migration()))).toMatchObject({ refus: expect.stringContaining(`définition inattendue pour ${DEPART} (0 occurrence(s) du bloc de 20261125152000)`) });
    expect(await etat()).toEqual(e);
    await db.query((await definition()).replace("    v_fin := null; -- autre\n", "    v_fin := null;\n"));
    await db.query(migration());
    await db.query((await definition()).replace("and not v.entree_apres_signature then", "and not v.entree_apres_signature then -- réécrite"));
    const reecrite = await etat();
    expect(await essai(() => db.query(retour()))).toMatchObject({ refus: expect.stringContaining("a été réécrite depuis la migration") });
    expect(await etat()).toEqual(reecrite);
  });
});
