/**
 * TYPE DE VENDEUR CHOISI, ET VENTE AUX PARTICULIERS SANS MÉDIATEUR DÉCIDÉE À PART — décisions du 24/11, lot D7 et textes
 * T4, seconde reprise (relectures T4R-02, T4R-03 et T4R-04). Migration 20261125106000.
 *
 * Ce que ces tests tiennent :
 *  1. sans base : manifeste, retour listé, aucun droit ouvert à un visiteur, liste des clés = celles du formulaire ;
 *  2. T4R-02 : une levée du blocage enregistrée AVANT la migration ne vaut pas décision de vendre sans médiateur — la
 *     colonne naît vide, et le reste après la migration ; la décision est datée PAR LA BASE (une date envoyée par le
 *     navigateur est remplacée), inscrite à l'historique avec l'état du médiateur, et se retire ;
 *  3. seul le super-administrateur permanent (second facteur) la prend ; un compte connecté la lit, un visiteur non ;
 *  4. T4R-03 : la base admet la clé `typeVendeur`, ses deux valeurs et l'absence de choix, rien d'autre ;
 *  5. rejeu sans effet ; retour (colonne, déclencheur, clé et contraintes retirés, les autres faits intacts), rejeu du
 *     retour, puis marche avant.
 *
 * Nécessite SUPABASE_DB_URL (base locale fictive). Transaction annulée à la fin du fichier. Le fichier rejoue du DDL :
 * il tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CHAMPS_EDITEUR } from "../src/lib/identite-editeur";
import { TYPES_VENDEUR } from "../src/lib/editeur";
import { lignesJournalReglage } from "../src/lib/garde-souscription";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261125106000_type_vendeur_et_vente_sans_mediateur";
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
if (url && (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) || !new URL(url).pathname.startsWith("/gerimmo_ci_"))) {
  throw new Error("Base locale fictive gerimmo_ci_… obligatoire.");
}
const COLONNE = "vente_particuliers_sans_mediateur_le";

describe("type de vendeur et vente sans médiateur — manifeste et droits (sans base)", () => {
  it("la migration est au manifeste une seule fois, après celles des réglages de l'identité, avec son retour listé et son test en série", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    // Lot D4 du 24/11/2026 : cette migration n'est plus la dernière du manifeste (20261125110000 la suit). Ce que le test
    // tient : elle clôt les quatre migrations des lots D7 et T4, et seules celles des lots D4 et D5 (ce dernier ne
    // retire que des droits d'exécution, 20261125140000) viennent après elle — puis celle de la reprise du lot D4
    // (20261125150000 : accord aux conditions sur une version archivée, relance à la main sans reprise autonome).
    // Fusion des deux arbres de travail (25/11) : les migrations des textes officiels T3 (20261125111000, 20261125151000) et
    // de la case « mariés ou pacsés » (20261125152000), préparées en parallèle, prennent leur rang d'horodatage parmi elles.
    // Aucune des migrations qui suivent ne touche la table de l'identité (garde ajoutée ci-dessous).
    const suivantes = manifeste.slice(manifeste.indexOf(`${NOM}.sql`) + 1);
    expect(suivantes).toEqual([
      "20261125110000_relance_report_rdv_et_relance_a_la_main.sql",
      "20261125111000_textes_officiels_t3.sql",
      "20261125140000_ancien_parcours_signature_manuelle_droits_retires.sql",
      "20261125150000_accord_conditions_version_archivee.sql",
      "20261125151000_textes_t3_reprise_exercice_ancien.sql",
      "20261125152000_bail_locataires_epoux_pacses.sql",
      // Relecture de la fusion (A-01, 25/11) : la case « mariés ou pacsés » ne vaut que pour les personnes à la signature.
      "20261125153000_bail_epoux_pacses_personnes_a_la_signature.sql",
    ]);
    expect(suivantes.filter((m) => /supervision_identite/.test(readFileSync(`supabase/migrations/${m}`, "utf8")))).toEqual([]);
    expect(manifeste[manifeste.indexOf(`${NOM}.sql`) - 1]).toBe("20261125105000_archive_compte_apres_client_stripe.sql");
    for (const avant of ["20261019123000_identite_editeur_prestataires.sql", "20261022210326_reglage_blocage_souscription_identite.sql", "20261114001320_ouverture_souscriptions_payantes.sql"]) {
      expect(manifeste.indexOf(`${NOM}.sql`), avant).toBeGreaterThan(manifeste.indexOf(avant));
    }
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/type-vendeur-vente-sans-mediateur-base.test.ts"');
    expect(MIGRATION).toContain(`supabase/retours-arriere/${NOM}.retour.sql`);
  });

  it("aucun droit pour un visiteur, aucune règle d'accès touchée, le réglage existant n'est pas réécrit", () => {
    const code = MIGRATION.replace(/^\s*--.*$/gm, "");
    expect(code).not.toMatch(/\bto\s+(anon|public)\b/i);
    expect(code.match(/grant[^;]*;/gi)).toEqual([`grant select(${COLONNE}), update(${COLONNE})\n  on public.supervision_identite to authenticated;`]);
    expect(code).not.toMatch(/create policy|drop policy|disable row level security|\btruncate\b|\bdelete\s+from\b/i);
    // T4R-02 : la migration ne touche ni à la levée existante, ni à aucune valeur enregistrée.
    expect(code).not.toMatch(/\bupdate\s+public\./i);
    expect(code).not.toContain("blocage_souscription_identite =");
    expect(code).toContain("select public.fermer_fonctions_a_anon();");
  });

  it("la liste fermée de la base est exactement celle des clés du formulaire, dans son ordre ; les deux valeurs admises sont celles du code", () => {
    const listes = [...MIGRATION.matchAll(/array\[([^\]]+)\]::text\[\]/g)].map((m) => [...m[1].matchAll(/'([A-Za-z]+)'/g)].map((c) => c[1]));
    expect(listes).toEqual([Object.keys(CHAMPS_EDITEUR)]);
    expect([...MIGRATION.matchAll(/in \('([a-z_]+)', '([a-z_]+)'\)/g)].map((m) => [m[1], m[2]])).toEqual([Object.keys(TYPES_VENDEUR)]);
  });
});

describe.skipIf(!url)("type de vendeur et vente sans médiateur (avec base)", () => {
  let db: Client;
  let admin: string;
  let compte: string;
  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect(); await db.query("begin");
    const users = await db.query(`insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
      select gen_random_uuid(),'authenticated','authenticated','t4r-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}'
      from generate_series(1,2) returning id,email`);
    [admin, compte] = users.rows.map((r) => r.id);
    for (const u of users.rows) await db.query("insert into public.accounts(id,email) values($1,$2) on conflict(id) do nothing", [u.id, u.email]);
    await db.query("insert into public.memberships(account_id,organization_id,role,status) values($1,null,'super_admin','active')", [admin]);
  });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("reset role"); });

  async function session(id: string, aal = "aal2") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal',$2::text)::text,true)", [id, aal]);
    await db.query("set local role authenticated");
  }
  const systeme = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const lire = async () => (await db.query(`select ${COLONNE}::text as d, blocage_souscription_identite as b, revision, valeurs from public.supervision_identite where singleton`)).rows[0] as { d: string | null; b: boolean; revision: number; valeurs: Record<string, unknown> };
  const ecrire = (set: string, params: unknown[] = []) => db.query(`update public.supervision_identite set ${set}, revision = revision + 1 where singleton returning revision`, params);
  async function echec(action: () => Promise<unknown>): Promise<string> {
    await db.query("savepoint essai");
    try { await action(); await db.query("release savepoint essai"); return ""; }
    catch (e) { await db.query("rollback to savepoint essai"); return `${(e as { code?: string }).code} ${(e as Error).message}`; }
  }
  const dernieresTraces = async (n: number) => (await db.query(
    "select auteur, avant, apres from public.supervision_registre where objet = 'supervision_identite' and auteur = $1 order by (apres->>'revision')::int desc limit $2", [admin, n])).rows.reverse() as { auteur: string; avant: Record<string, unknown>; apres: Record<string, unknown> }[];

  it("T4R-02 — une levée du blocage enregistrée AVANT la migration ne vaut pas décision : la colonne naît vide, et la levée n'est pas touchée", async () => {
    // L'état d'avant le lot : pas de colonne, blocage levé par le super-administrateur (sens d'alors : les hausses).
    await db.query(RETOUR);
    expect((await db.query("select 1 from information_schema.columns where table_schema='public' and table_name='supervision_identite' and column_name=$1", [COLONNE])).rowCount).toBe(0);
    await session(admin);
    expect((await ecrire("blocage_souscription_identite = false")).rowCount).toBe(1);
    await systeme();
    const revision = (await db.query("select revision from public.supervision_identite where singleton")).rows[0].revision;
    // Le déploiement.
    await db.query(MIGRATION);
    const apres = await lire();
    expect(apres.d).toBeNull();
    expect(apres.b).toBe(false);
    expect(apres.revision).toBe(revision);
    // Rejouée, la migration ne crée toujours aucune décision.
    await db.query(MIGRATION);
    expect((await lire()).d).toBeNull();
  });

  it("T4R-02 — la décision est datée par la base, inscrite à l'historique avec l'état réel du médiateur, et se retire", async () => {
    await session(admin);
    // Le navigateur envoie une date fantaisiste : la base pose la sienne.
    expect((await ecrire(`${COLONNE} = '2001-01-01T00:00:00Z'`)).rowCount).toBe(1);
    const prise = await lire();
    expect(prise.d).not.toBeNull();
    expect(prise.d!.startsWith("2001")).toBe(false);
    expect((await db.query(`select ${COLONNE} = now() as meme from public.supervision_identite where singleton`)).rows[0].meme).toBe(true);
    // Le blocage n'a pas bougé : deux réglages distincts.
    expect(prise.b).toBe((await dernieresTraces(1))[0].avant.blocage_souscription_identite);
    // Modifier autre chose ne re-date pas la décision.
    await ecrire("blocage_souscription_identite = not blocage_souscription_identite");
    expect((await lire()).d).toBe(prise.d);
    // Retrait.
    await ecrire(`${COLONNE} = null`);
    expect((await lire()).d).toBeNull();
    const [t1, t2, t3] = await dernieresTraces(3);
    expect(t1.auteur).toBe(admin);
    expect(t1.avant[COLONNE]).toBeNull();
    expect(typeof t1.apres[COLONNE]).toBe("string");
    expect(String(t1.apres[COLONNE]).startsWith("2001")).toBe(false);
    expect(t3.apres[COLONNE]).toBeNull();
    // Ce que /admin/journaux en écrit, à partir de ces lignes réelles : la base de test n'a aucun médiateur saisi.
    expect(lignesJournalReglage(t1.avant, t1.apres)).toEqual(["Vente aux particuliers sans médiateur de la consommation : décision prise (à cette date, aucun médiateur de la consommation n’était saisi)."]);
    expect(lignesJournalReglage(t2.avant, t2.apres)).toHaveLength(1);
    expect(lignesJournalReglage(t2.avant, t2.apres)[0]).toMatch(/^Blocage des abonnements \(identité du vendeur incomplète : augmentations payantes\) : (levé|réactivé)\.$/);
    expect(lignesJournalReglage(t3.avant, t3.apres)).toEqual(["Vente aux particuliers sans médiateur de la consommation : décision retirée (à cette date, aucun médiateur de la consommation n’était saisi)."]);
  });

  it("le journal dit qu'un médiateur était saisi quand il l'était (état lu dans l'identité enregistrée avec la décision)", async () => {
    await session(admin);
    await ecrire("valeurs = valeurs || $1::jsonb", [JSON.stringify({ mediateurNom: "Médiateur fictif", mediateurAdresse: "2 rue Exemple, 75000 Paris", mediateurSite: "https://example.test/m" })]);
    await ecrire(`${COLONNE} = now()`);
    const [t] = await dernieresTraces(1);
    expect(lignesJournalReglage(t.avant, t.apres)).toEqual(["Vente aux particuliers sans médiateur de la consommation : décision prise (à cette date, un médiateur de la consommation était saisi)."]);
  });

  it("seul le super-administrateur permanent, second facteur compris, prend ou retire la décision ; un compte connecté la lit, un visiteur non", async () => {
    await session(compte);
    expect((await ecrire(`${COLONNE} = now()`)).rowCount).toBe(0);
    await session(admin, "aal1");
    expect((await ecrire(`${COLONNE} = now()`)).rowCount).toBe(0);
    await systeme();
    expect((await lire()).d).toBeNull();
    await session(compte);
    expect((await db.query(`select ${COLONNE} from public.supervision_identite where singleton`)).rowCount).toBe(1);
    await db.query("reset role");
    await db.query("set local role anon");
    expect(await echec(() => db.query(`select ${COLONNE} from public.supervision_identite`))).toMatch(/^42501/);
    expect(await echec(() => db.query(`update public.supervision_identite set ${COLONNE} = now()`))).toMatch(/^42501/);
    await db.query("reset role");
    const droits = (await db.query("select grantee, privilege_type from information_schema.column_privileges where table_schema='public' and table_name='supervision_identite' and column_name=$1 and grantee in ('anon','authenticated','PUBLIC') order by 1,2", [COLONNE])).rows;
    expect(droits).toEqual([{ grantee: "authenticated", privilege_type: "SELECT" }, { grantee: "authenticated", privilege_type: "UPDATE" }]);
    const f = (await db.query("select has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as connecte, p.proconfig as chemin from pg_proc p where p.proname = 'supervision_identite_dater_decision'")).rows;
    expect(f).toEqual([{ anon: false, connecte: false, chemin: ['search_path=""'] }]);
  });

  it("T4R-03 — la base admet la clé typeVendeur, ses deux valeurs et l'absence de choix ; rien d'autre", async () => {
    await session(admin);
    for (const choix of [...Object.keys(TYPES_VENDEUR), null]) {
      expect((await ecrire("valeurs = valeurs || $1::jsonb", [JSON.stringify({ typeVendeur: choix })])).rowCount, String(choix)).toBe(1);
      expect((await lire()).valeurs.typeVendeur).toBe(choix);
    }
    for (const faux of ["Entrepreneur individuel", "EI", "societe", "", 1, true, ["entrepreneur_individuel"]]) {
      expect(await echec(() => ecrire("valeurs = valeurs || $1::jsonb", [JSON.stringify({ typeVendeur: faux })])), JSON.stringify(faux)).toMatch(/^23514 .*identite_type_vendeur_connu/);
    }
    // La liste reste fermée : une clé inconnue est toujours refusée.
    expect(await echec(() => ecrire("valeurs = valeurs || '{\"typeDeVendeur\":\"personne_morale\"}'::jsonb"))).toMatch(/^23514 .*identite_champs_connus/);
    // Ce que le formulaire écrit — toutes ses clés, vides — passe.
    expect((await ecrire("valeurs = $1::jsonb", [JSON.stringify(Object.fromEntries(Object.keys(CHAMPS_EDITEUR).map((k) => [k, null])))])).rowCount).toBe(1);
    await systeme();
    const def = (await db.query("select pg_get_constraintdef(oid) as d from pg_constraint where conrelid='public.supervision_identite'::regclass and conname='identite_champs_connus'")).rows[0].d as string;
    expect([...def.matchAll(/'([A-Za-z]+)'::text/g)].map((m) => m[1])).toEqual(Object.keys(CHAMPS_EDITEUR));
  });

  it("la migration se rejoue sans effet ; le retour retire colonne, déclencheur, clé et contraintes sans toucher aux autres faits, se rejoue ; la marche avant redonne le même état", async () => {
    const etat = async () => (await db.query(
      `select (select string_agg(conname || ':' || pg_get_constraintdef(oid), '|' order by conname) from pg_constraint where conrelid='public.supervision_identite'::regclass and contype='c') as contraintes,
              (select string_agg(tgname, '|' order by tgname) from pg_trigger where tgrelid='public.supervision_identite'::regclass and not tgisinternal) as declencheurs,
              (select string_agg(column_name || ':' || data_type, '|' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='supervision_identite') as colonnes,
              (select string_agg(grantee || ':' || column_name || ':' || privilege_type, '|' order by 1) from information_schema.column_privileges where table_schema='public' and table_name='supervision_identite' and grantee in ('anon','authenticated')) as droits,
              (select coalesce(md5(prosrc), 'absente') from pg_proc where proname='supervision_identite_dater_decision') as fonction`)).rows[0] as Record<string, string>;
    const apres = await etat();
    expect(apres.declencheurs).toBe("supervision_identite_dater_decision|supervision_identite_trace");
    expect(apres.colonnes).toContain(`${COLONNE}:timestamp with time zone`);
    await db.query(MIGRATION);
    expect(await etat()).toEqual(apres);

    // Une identité enregistrée, avec le type choisi et la décision prise.
    await session(admin);
    await ecrire("valeurs = valeurs || $1::jsonb", [JSON.stringify({ denomination: "MARTIN Camille EI", typeVendeur: "entrepreneur_individuel", coordonneesVercel: "Coordonnées fictives" })]);
    await ecrire(`${COLONNE} = now()`);
    await systeme();
    const revision = (await lire()).revision;
    const traces = Number((await db.query("select count(*) as n from public.supervision_registre where objet='supervision_identite'")).rows[0].n);

    await db.query(RETOUR);
    const revenu = await etat();
    expect(revenu.declencheurs).toBe("supervision_identite_trace");
    expect(revenu.colonnes).not.toContain(COLONNE);
    expect(revenu.contraintes).not.toContain("typeVendeur");
    expect(revenu.contraintes).not.toContain("identite_type_vendeur_connu");
    expect(revenu.contraintes).toContain("'coordonneesMeta'");
    expect(revenu.droits).not.toContain(COLONNE);
    expect(revenu.fonction).toBeNull();
    const ligne = (await db.query("select valeurs, revision, blocage_souscription_identite as b from public.supervision_identite where singleton")).rows[0];
    expect(ligne.valeurs).not.toHaveProperty("typeVendeur");
    expect(ligne.valeurs).toMatchObject({ denomination: "MARTIN Camille EI", coordonneesVercel: "Coordonnées fictives" });
    // La révision avance d'un cran pour que l'écran recharge ; l'historique garde tout, sans ligne de plus.
    expect(ligne.revision).toBe(revision + 1);
    expect(Number((await db.query("select count(*) as n from public.supervision_registre where objet='supervision_identite'")).rows[0].n)).toBe(traces);
    await db.query(RETOUR);
    expect(await etat()).toEqual(revenu);
    expect((await db.query("select revision from public.supervision_identite where singleton")).rows[0].revision).toBe(revision + 1);

    await db.query(MIGRATION);
    expect(await etat()).toEqual(apres);
    // Après un aller-retour, aucune décision ne revient d'elle-même.
    expect((await lire()).d).toBeNull();
  });
});
