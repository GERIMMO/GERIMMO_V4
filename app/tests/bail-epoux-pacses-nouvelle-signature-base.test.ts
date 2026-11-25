/**
 * Reprise de la relecture de la fusion du 25/11/2026, constat X-01 — case « mariés ou pacsés » : la marque « entrée après
 * la signature » (20261125153000) est remise à faux, à la sortie du brouillon, pour les personnes présentes à cette
 * signature (migration 20261125154000), avec base.
 *
 * Avant : un bail coché signé avec A + B, puis C (le vrai conjoint) et son garant ajoutés au bail actif (marqués), puis
 * « Corriger » (`devalider_bail`), B retiré au brouillon et un nouveau bail signé par A + C déposé : C gardait sa marque. À
 * son départ le 31/03/2026 sans remplaçant, la base enregistrait une fin de solidarité au 30/09/2026 pour C et pour son
 * garant, alors que C est l'un des deux époux présents à cette signature (rejeu de la relecture : x02.out). Après : la
 * marque de C et celle de son garant sont remises à faux au dépôt du nouveau bail signé ; C part sans date de fin, comme A.
 * Un tiers ajouté APRÈS cette nouvelle signature garde la règle de la colocation.
 *
 * Tout se joue sous le rôle `authenticated` (le gérant), comme le bouton « Corriger » (action `corrigerBail`, qui appelle
 * `devalider_bail`), l'ajout d'une personne et le dépôt du bail signé (`activer_bail_papier`). Le fichier rejoue du DDL
 * (déclencheurs) dans la transaction du test : il tourne en série (FICHIERS_EN_SERIE de vitest.config.ts). Nécessite
 * SUPABASE_DB_URL ; transaction annulée après chaque test.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261125154000_bail_epoux_pacses_marque_a_la_nouvelle_signature";
const PRECEDENTE = "20261125153000_bail_epoux_pacses_personnes_a_la_signature";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const lire = (chemin: string) => readFileSync(chemin, "utf8");
const migration = () => lire(`supabase/migrations/${NOM}.sql`);
const retour = () => lire(`supabase/retours-arriere/${NOM}.retour.sql`);
const sansCommentaires = (sql: string) => sql.replace(/^\s*--.*$/gm, "");

describe("case « mariés ou pacsés », marque à la nouvelle signature — écriture de la migration et place au manifeste (sans base)", () => {
  it("additive : deux déclencheurs et leurs fonctions, fermées à tous ; aucune ligne écrite par la migration elle-même, aucun droit ouvert, aucune règle de lecture ; la fonction du départ n'est pas touchée", () => {
    const sql = sansCommentaires(migration());
    expect(sql).not.toMatch(/\bgrant\b|\bpolicy\b|row level security|alter table/i);
    expect(sql.match(/revoke all on function public\.\w+\(\) from public, anon, authenticated;/g)).toHaveLength(2);
    expect(sql.match(/security definer\s+set search_path = ''/g)).toHaveLength(2);
    // La seule écriture est celle du déclencheur, à la sortie du brouillon : hors des corps de fonction, rien n'écrit.
    const horsCorps = sql.replace(/\$\$[\s\S]*?\$\$/g, "");
    expect(horsCorps).not.toMatch(/\b(update|delete from|insert into|truncate)\s+public\./i);
    expect(sql.match(/\bupdate public\.bail_personnes\b/g)).toHaveLength(1);
    expect(migration()).not.toMatch(/enregistrer_depart_colocataire|activer_bail_papier|devalider_bail\(/);
    expect(sql).toContain("when (old.etat = 'brouillon' and new.etat is distinct from 'brouillon')");
    const r = sansCommentaires(retour());
    expect(r).not.toMatch(/\b(update|delete from|insert into|truncate)\s+public\.|alter table/i);
    // Une seule instruction : le retour passe ou s'arrête d'un bloc (relecture de la fusion, X-02).
    expect(r.trim()).toMatch(/^do \$retour_marques_signature\$[\s\S]*end \$retour_marques_signature\$;$/);
  });
  it("manifeste, liste des retours (avant celui de 20261125153000), ordre des migrations et fichiers en série sont à jour", () => {
    const ordre = lire("e2e/local/ordre-migrations.txt").trim().split(/\r?\n/);
    expect(ordre.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(ordre.indexOf(`${NOM}.sql`)).toBe(ordre.indexOf(`${PRECEDENTE}.sql`) + 1);
    const lisezMoi = lire("supabase/retours-arriere/LISEZ-MOI.md");
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(lisezMoi.split(`| \`${NOM}.retour.sql\``)[1]?.split("\n")[0]).toContain("**À jouer AVANT le retour de `20261125153000`.**");
    expect(lire("tests/relais-migrations-manifeste.test.ts")).toContain(`"${NOM}.sql",`);
    expect(lire("vitest.config.ts")).toContain('"tests/bail-epoux-pacses-nouvelle-signature-base.test.ts"');
    expect(migration()).toContain(`supabase/retours-arriere/${NOM}.retour.sql`);
  });
});

describe.skipIf(!url)("case « mariés ou pacsés », marque à la nouvelle signature — Corriger, retrait, nouveau dépôt, départ (avec base)", () => {
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
  async function ajouter(bail: string, person: string, role: "colocataire" | "garant" = "colocataire", garantDe: string | null = null) {
    await agir();
    const r = await essai(async () => id("insert into public.bail_personnes(organization_id,bail_id,person_id,role,garant_de) values($1,$2,$3,$4,$5) returning id", [org, bail, person, role, garantDe]));
    await base();
    return r;
  }
  /** Le retrait d'une personne au brouillon, comme le bouton « Retirer » (suppression sous la session du gérant). */
  async function retirer(ligne: string) {
    await agir();
    const r = await essai(() => db.query("delete from public.bail_personnes where id=$1", [ligne]));
    await base();
    return r;
  }
  /** Un brouillon de bail commun (le gérant le crée), son locataire principal, et la case posée comme l'action. */
  async function brouillon(principal: string, epoux: boolean) {
    await base();
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
  /** Le bouton « Corriger » d'un bail signé (carte-bail-signe.tsx, action corrigerBail) : devalider_bail. */
  async function corriger(bail: string) {
    await agir();
    const r = await essai(() => db.query("select public.devalider_bail($1)", [bail]));
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
    "select p.nom, bp.role, bp.entree_apres_signature apres, bp.date_depart::text depart, bp.date_solidarite_fin::text fin from public.bail_personnes bp join public.persons p on p.id = bp.person_id where bp.bail_id=$1 order by p.nom collate \"C\", bp.role", [bail])).rows;
  const marque = async (ligne: string) => (await un("select entree_apres_signature v from public.bail_personnes where id=$1", [ligne])).v;
  const etatBail = async (bail: string) => String((await un("select etat::text e from public.baux where id=$1", [bail])).e);
  /**
   * Le scénario de la relecture : A + B signés (B saisi par erreur), C et son garant ajoutés au bail actif, « Corriger »,
   * B retiré au brouillon, nouveau bail signé A + C déposé.
   */
  async function correctionPuisNouvelleSignature() {
    const a = await personne("Époux A"), b = await personne("Erreur B"), c = await personne("Époux C"), gc = await personne("Garant de C");
    const bail = await brouillon(a, true);
    const ligneB = String(await ajouter(bail, b));
    expect(await deposer(bail)).not.toHaveProperty("refus");
    const ligneC = String(await ajouter(bail, c));
    const ligneGC = String(await ajouter(bail, gc, "garant", c));
    expect([await marque(ligneC), await marque(ligneGC)]).toEqual([true, true]); // ajoutés au bail signé (153000)
    expect(await corriger(bail)).not.toHaveProperty("refus");
    expect(await etatBail(bail)).toBe("brouillon");
    expect(await retirer(ligneB)).not.toHaveProperty("refus");
    return { bail, a, c, ligneC, ligneGC };
  }

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => {
    await db.query("begin"); await base();
    await db.query("create or replace function public.aujourdhui_paris() returns date language sql stable set search_path = '' as $$ select date '2026-11-24' $$");
    gerant = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [gerant, `${gerant}@test.local`]);
    await db.query("insert into public.accounts(id,email) values($1,$2) on conflict do nothing", [gerant, `${gerant}@test.local`]);
    org = await id("insert into public.organizations(name,type,status,essai_fin) values('TEST X-01 époux','proprietaire_direct','essai',current_date+30) returning id");
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [gerant, org]);
    bailleur = await id("insert into public.persons(organization_id,nom,prenom,qualite) values($1,'Bailleur fictif','Paul','Personne physique') returning id", [org]);
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("X-01 — activé, ajout de C et de son garant, « Corriger », retrait de B, nouveau dépôt A + C : C et son garant sont présents à cette signature ; C part le 31/03/2026 sans date de fin, son garant reste engagé", async () => {
    const { bail, ligneC, ligneGC } = await correctionPuisNouvelleSignature();
    expect(await deposer(bail)).not.toHaveProperty("refus");
    expect((await un("select etat::text e, locataires_epoux_pacses c from public.baux where id=$1", [bail]))).toEqual({ e: "actif", c: true });
    expect([await marque(ligneC), await marque(ligneGC)]).toEqual([false, false]);
    // Avant (rejeu de la relecture) : « 2026-09-30 » pour C et pour son garant.
    expect(await depart(ligneC, "2026-03-31")).toBeNull();
    expect(await lignes(bail)).toEqual([
      { nom: "Garant de C", role: "garant", apres: false, depart: null, fin: null },
      { nom: "Époux C", role: "colocataire", apres: false, depart: "2026-03-31", fin: null },
    ]);
  });

  it("X-01 — un tiers ajouté APRÈS la nouvelle signature garde la marque et la règle de la colocation (six mois)", async () => {
    const { bail } = await correctionPuisNouvelleSignature();
    expect(await deposer(bail)).not.toHaveProperty("refus");
    const ligneD = String(await ajouter(bail, await personne("Tiers D")));
    expect(await marque(ligneD)).toBe(true);
    expect(await depart(ligneD, "2026-03-31")).toBe("2026-09-30");
  });

  it("X-01 — une activation refusée (trois locataires, case cochée) ne touche à aucune marque ; la marque ne change pas au retour au brouillon, seulement à la sortie", async () => {
    const a = await personne("Époux A"), b = await personne("Erreur B"), c = await personne("Époux C");
    const bail = await brouillon(a, true);
    const ligneB = String(await ajouter(bail, b));
    expect(await deposer(bail)).not.toHaveProperty("refus");
    const ligneC = String(await ajouter(bail, c));
    expect(await corriger(bail)).not.toHaveProperty("refus");
    expect(await marque(ligneC)).toBe(true); // au brouillon, rien n'est encore signé
    expect(await deposer(bail)).toMatchObject({ refus: expect.stringContaining("le bail compte 3 locataire(s)") });
    expect(await etatBail(bail)).toBe("brouillon");
    expect(await marque(ligneC)).toBe(true);
    expect(await retirer(ligneB)).not.toHaveProperty("refus");
    expect(await deposer(bail)).not.toHaveProperty("refus");
    expect(await marque(ligneC)).toBe(false);
  });

  it("X-01 — une personne déjà partie garde sa ligne telle quelle (date de départ, date de fin et marque) quand le bail est signé de nouveau", async () => {
    // Sans la case : un brouillon à trois s'active (la case n'y est pas), le tiers C part, « Corriger », nouveau dépôt.
    const a = await personne("Principal"), b = await personne("Colocataire B"), c = await personne("Tiers C");
    const bail = await brouillon(a, false);
    await ajouter(bail, b);
    expect(await deposer(bail)).not.toHaveProperty("refus");
    const ligneC = String(await ajouter(bail, c));
    expect(await depart(ligneC, "2026-03-31")).toBe("2026-09-30");
    expect(await corriger(bail)).not.toHaveProperty("refus");
    expect(await deposer(bail)).not.toHaveProperty("refus");
    expect((await lignes(bail)).find((l) => l.nom === "Tiers C")).toEqual({ nom: "Tiers C", role: "colocataire", apres: true, depart: "2026-03-31", fin: "2026-09-30" });
  });

  it("X-01 — sur un bail signé, une modification par la base garde la marque ; au brouillon, elle la remet à faux ; le client ne modifie aucune ligne", async () => {
    const a = await personne("Époux A"), b = await personne("Époux B"), c = await personne("Tiers C");
    const bail = await brouillon(a, true);
    const ligneB = String(await ajouter(bail, b));
    expect(await deposer(bail)).not.toHaveProperty("refus");
    const ligneC = String(await ajouter(bail, c));
    await db.query("update public.bail_personnes set entree_apres_signature=false, quote_part=30 where id=$1", [ligneC]);
    expect(await marque(ligneC)).toBe(true);
    await agir();
    expect(await essai(() => db.query("update public.bail_personnes set entree_apres_signature=false where id=$1", [ligneC]))).toMatchObject({ refus: expect.stringMatching(/permission denied/) });
    await base();
    expect(await corriger(bail)).not.toHaveProperty("refus");
    // Au brouillon coché à trois, 20261125153000 refuse toute écriture d'une ligne de colocataire : B est d'abord retiré.
    expect(await retirer(ligneB)).not.toHaveProperty("refus");
    await db.query("update public.bail_personnes set quote_part=40 where id=$1", [ligneC]);
    expect(await marque(ligneC)).toBe(false);
  });

  it("droits : les deux fonctions de déclencheur ne sont appelables par personne, en SECURITY DEFINER, chemin de recherche vide ; rien pour anon", async () => {
    const { rows } = await db.query(`select p.proname f, has_function_privilege('anon', p.oid, 'execute') anon,
        has_function_privilege('authenticated', p.oid, 'execute') compte, p.prosecdef definer, coalesce(array_to_string(p.proconfig, ','), '') chemin
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
      where p.proname in ('bail_personnes_epoux_pacses_brouillon', 'marquer_presents_a_la_signature') order by 1`);
    expect(rows).toEqual([
      { f: "bail_personnes_epoux_pacses_brouillon", anon: false, compte: false, definer: true, chemin: 'search_path=""' },
      { f: "marquer_presents_a_la_signature", anon: false, compte: false, definer: true, chemin: 'search_path=""' },
    ]);
    // L'ordre des déclencheurs (ordre des noms) : la garde de 20261125153000 avant chacun des deux.
    const noms = async (table: string) => (await db.query("select tgname from pg_trigger where tgrelid=$1::regclass and not tgisinternal and tgname like '%epoux_pacses%' order by tgname", [table])).rows.map((r) => r.tgname);
    expect(await noms("public.bail_personnes")).toEqual(["bail_personnes_epoux_pacses", "bail_personnes_epoux_pacses_brouillon"]);
    expect(await noms("public.baux")).toEqual(["baux_epoux_pacses_a_la_signature", "baux_epoux_pacses_marques_a_la_signature"]);
  });

  it("rejeu sans effet ; le retour retire les deux déclencheurs et leurs fonctions : le défaut revient (fin à six mois pour C et son garant) ; rejouable ; la marche avant repart", async () => {
    const declencheurs = async () => (await db.query(`select t.tgname, md5(p.prosrc) corps, p.proacl::text droits from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgname in ('bail_personnes_epoux_pacses_brouillon','baux_epoux_pacses_marques_a_la_signature') order by 1`)).rows;
    const apres = await declencheurs();
    expect(apres).toHaveLength(2);
    await db.query(migration());
    expect(await declencheurs()).toEqual(apres);
    await db.query(retour());
    expect(await declencheurs()).toEqual([]);
    expect((await un("select count(*)::int n from pg_proc where proname in ('bail_personnes_epoux_pacses_brouillon','marquer_presents_a_la_signature')")).n).toBe(0);
    // L'avant, celui de la relecture.
    const avant = await correctionPuisNouvelleSignature();
    expect(await deposer(avant.bail)).not.toHaveProperty("refus");
    expect(await depart(avant.ligneC, "2026-03-31")).toBe("2026-09-30");
    expect((await lignes(avant.bail)).map((l) => [l.nom, l.apres, l.fin])).toEqual([["Garant de C", true, "2026-09-30"], ["Époux C", true, "2026-09-30"]]);
    await db.query(retour()); // rejouable
    await db.query(migration());
    expect(await declencheurs()).toEqual(apres);
    const apresRetour = await correctionPuisNouvelleSignature();
    expect(await deposer(apresRetour.bail)).not.toHaveProperty("refus");
    expect(await depart(apresRetour.ligneC, "2026-03-31")).toBeNull();
    // Le départ enregistré pendant le retour n'est pas réécrit par la marche avant.
    expect((await un("select date_solidarite_fin::text f from public.bail_personnes where id=$1", [avant.ligneC])).f).toBe("2026-09-30");
  });
});
