/**
 * D46-B, relecture du 15/10/2026 — le passage fréquent des urgences du relais (migration 20261014812000) : rejeu et
 * retour arrière.
 *
 *  — la migration se rejoue sans rien changer : ni les fonctions, ni la tâche pg_cron, ni le recensement, ni le jeton ;
 *  — le retour arrière (retours-arriere/20261014812000_relais_urgences_passage_frequent.retour.sql) retire la tâche
 *    `relais-urgences` et le jeton, les fonctions et le recensement ajoutés, et rend aux trois fonctions qu'il avait
 *    complétées (`sentinelle_relais`, `urgences_relais_recentes`, `relais_urgence_a_envoyer`) EXACTEMENT leur définition
 *    d'avant (celle que leurs migrations d'origine écrivent) ; il se rejoue sans effet ; la marche avant remet tout ;
 *  — il refuse de se jouer dans un lot déjà ouvert ;
 *  — ORDRE DES RETOURS (relecture du 15/10) : tant que cette migration est en place, les retours de 20261014811000 et de
 *    20261014810000 refusent de se jouer (sinon la tâche `relais-urgences` resterait planifiée, sans file, et le retour de
 *    20261014812000 ne trouverait plus ses fonctions : on resterait bloqué) ; tant que 20261014811000 est en place, celui de
 *    20261014810000 refuse aussi. Dans l'ordre du LISEZ-MOI (812000, 811000, 810000), les trois passent, et la marche avant
 *    remet tout.
 *
 * Ces essais rejouent des migrations et suppriment des tables dans la transaction du test : verrous tenus pendant
 * l'essai, le fichier tourne en série (vitest.config.ts, FICHIERS_EN_SERIE).
 * Banc : `cron.unschedule` n'existe pas sur le planificateur de façade ; le test la pose, le temps de sa transaction.
 * Nécessite SUPABASE_DB_URL (base locale jetable). Chaque cas est joué dans une transaction annulée.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const MIGRATION = readFileSync("supabase/migrations/20261014812000_relais_urgences_passage_frequent.sql", "utf8");
const ORIGINE_810000 = readFileSync("supabase/migrations/20261014810000_relais_alerte_quotidienne.sql", "utf8");
const ORIGINE_811000 = readFileSync("supabase/migrations/20261014811000_relais_urgences_immediates.sql", "utf8");
const RETOUR = readFileSync("supabase/retours-arriere/20261014812000_relais_urgences_passage_frequent.retour.sql", "utf8");
/** Un retour sans sa garde de transaction ni son begin/commit : joué dans la transaction du test, annulée à la fin. */
const sansEnveloppe = (script: string) =>
  script
    .replace(/do \$retour_arriere\$\s*begin\s*if statement_timestamp\(\) <> transaction_timestamp\(\)[\s\S]*?end \$retour_arriere\$;/, "")
    .replace(/^begin;$/m, "")
    .replace(/^commit;$/m, "");
const RETOUR_DANS_LE_TEST = sansEnveloppe(RETOUR);
const RETOUR_811000 = sansEnveloppe(readFileSync("supabase/retours-arriere/20261014811000_relais_urgences_immediates.retour.sql", "utf8"));
const RETOUR_810000 = sansEnveloppe(readFileSync("supabase/retours-arriere/20261014810000_relais_alerte_quotidienne.retour.sql", "utf8"));

const COMPLETEES = ["public.sentinelle_relais()", "public.urgences_relais_recentes()", "public.relais_urgence_a_envoyer()"];
const NOUVELLES = [
  "public.declencher_relais_urgences()", "public.jeton_declencheur_relais_urgences()", "public.consigner_passage_urgences_relais()",
  "public.clore_envoi_urgences_vide(uuid)", "public.urgence_constatee_par_le_relais()",
];

/** Tout ce que les trois migrations du lot créent : tables, fonctions, déclencheur, tâche pg_cron. */
const TABLES_DU_LOT = [
  "public.relais_alertes_envois", "public.relais_urgences", "public.relais_urgences_envois",
  "public.declencheur_relais_urgences", "public.supervision_taches_hors_arret",
];
const FONCTIONS_DU_LOT = [
  // 20261014810000
  "public.reserver_alerte_relais()", "public.terminer_alerte_relais(date,text,integer,integer,integer,jsonb)", "public.sentinelle_relais()",
  "public.cron_derniere_echeance(text,timestamptz,interval,text)", "public.cron_valeurs_champ(text,integer,integer)",
  // 20261014811000
  "public.nature_urgence_relais(text)", "public.relais_urgence_a_envoyer()", "public.prendre_urgences_relais(integer)",
  "public.terminer_urgences_relais(uuid,integer,integer)", "public.urgences_relais_recentes()", "public.urgences_relais_au_quotidien(uuid[])",
  // 20261014812000
  ...NOUVELLES,
];

let db: Client;

async function proprietaire() {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', '', true)`);
}
/** La définition (et les droits) des trois fonctions complétées par la migration. */
async function definitions(): Promise<Record<string, string>> {
  await proprietaire();
  const { rows } = await db.query<{ f: string; d: string }>(
    `select f, md5(pg_get_functiondef(f::regprocedure)) || ' ' || coalesce((select proacl::text from pg_proc where oid = f::regprocedure), '') d
       from unnest($1::text[]) f`, [COMPLETEES]
  );
  return Object.fromEntries(rows.map((r) => [r.f, r.d]));
}
async function objets() {
  await proprietaire();
  const { rows: [o] } = await db.query<{ tache: number; taches: number; jeton: number; recensement: number; fonctions: number; marques: number }>(
    `select (select count(*)::int from cron.job where jobname = 'relais-urgences') tache,
            (select count(*)::int from cron.job) taches,
            (select count(*)::int from pg_class where oid = coalesce(to_regclass('public.declencheur_relais_urgences'), 0)) jeton,
            (select count(*)::int from pg_class where oid = coalesce(to_regclass('public.supervision_taches_hors_arret'), 0)) recensement,
            (select count(*)::int from unnest($1::text[]) f where to_regprocedure(f) is not null) fonctions,
            (select count(*)::int from unnest($2::text[]) f where position('Relais 15/10' in pg_get_functiondef(f::regprocedure)) > 0) marques`,
    [NOUVELLES, COMPLETEES]
  );
  return o;
}
async function lot() {
  await proprietaire();
  const { rows: [o] } = await db.query<{ tache: number; tables: number; fonctions: number; declencheur: number }>(
    `select (select count(*)::int from cron.job where jobname = 'relais-urgences') tache,
            (select count(*)::int from unnest($1::text[]) t where to_regclass(t) is not null) tables,
            (select count(*)::int from unnest($2::text[]) f where to_regprocedure(f) is not null) fonctions,
            (select count(*)::int from pg_trigger where tgname = 'relais_urgence_a_envoyer') declencheur`,
    [TABLES_DU_LOT, FONCTIONS_DU_LOT]
  );
  return o;
}
/** Le message d'erreur d'un script joué dans un point de sauvegarde (annulé, même en cas de succès) ; vide s'il passe. */
async function refus(sql: string): Promise<string> {
  await db.query("savepoint e");
  try {
    await db.query(sql);
    return "";
  } catch (err) {
    return (err as Error).message;
  } finally {
    await db.query("rollback to savepoint e");
  }
}
async function empreinte(): Promise<string> {
  await proprietaire();
  const { rows: [e] } = await db.query<{ e: string }>(
    `select concat_ws(' | ',
       (select string_agg(p.oid::regprocedure::text || ':' || md5(pg_get_functiondef(p.oid)) || ':' || coalesce(p.proacl::text, ''), ',' order by p.oid::regprocedure::text)
          from pg_proc p where p.oid::regprocedure::text = any($1::text[])),
       (select string_agg(jobname || ' ' || schedule || ' ' || command, ',' order by jobname) from cron.job),
       (select string_agg(tache || ' ' || motif, ',') from public.supervision_taches_hors_arret),
       (select md5(jeton) || site_url || actif from public.declencheur_relais_urgences),
       (select count(*)::text from pg_trigger where tgname = 'relais_urgence_a_envoyer')) e`,
    [[...COMPLETEES, ...NOUVELLES]]
  );
  return e.e;
}

describe.skipIf(!DB_URL)("D46-B — passage fréquent des urgences : rejeu et retour arrière", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query("begin");
    await proprietaire();
    // Le test porte sur le palier du passage fréquent. Revenir d'abord du complément
    // qui change la sentinelle ; le rollback de fin de test restitue le schéma courant.
    await db.query(readFileSync(new URL('../supabase/retours-arriere/20261016180000_relais_retention_sentinelle.retour.sql',import.meta.url),'utf8'));
    // Le planificateur de façade du banc n'a pas de cron.unschedule : on la pose le temps de la transaction.
    await db.query(
      `create or replace function cron.unschedule(p_nom text) returns boolean language sql as $$
         with retiree as (delete from cron.job where jobname = p_nom returning 1) select exists (select 1 from retiree) $$`
    );
  });
  afterEach(async () => { await db.query("rollback"); });

  it("rejouée deux fois, la migration ne change rien : ni les fonctions, ni la tâche, ni le recensement, ni le jeton", async () => {
    const avant = await empreinte();
    await db.query(MIGRATION);
    expect(await empreinte()).toBe(avant);
    await db.query(MIGRATION);
    expect(await empreinte()).toBe(avant);
  });

  it("le retour retire la tâche et le jeton, et rend aux trois fonctions exactement leur définition d'avant ; rejoué, sans effet ; la marche avant remet tout", async () => {
    const migre = await definitions();
    const empreinteMigree = await empreinte();
    expect(await objets()).toEqual({ tache: 1, taches: 10, jeton: 1, recensement: 1, fonctions: 5, marques: 3 });

    await db.query(RETOUR_DANS_LE_TEST);
    expect(await objets()).toEqual({ tache: 0, taches: 9, jeton: 0, recensement: 0, fonctions: 0, marques: 0 });
    const defait = await definitions();
    expect(defait).not.toEqual(migre);

    // Rejoué : sans effet ni erreur.
    await db.query(RETOUR_DANS_LE_TEST);
    expect(await definitions()).toEqual(defait);

    // « Exactement la définition d'avant » : celle qu'écrivent les migrations d'origine, rejouées ici.
    await db.query(ORIGINE_810000);
    await db.query(ORIGINE_811000);
    expect(await definitions()).toEqual(defait);

    // La marche avant : tout revient à l'identique (le jeton est nouveau : il a été retiré avec sa table).
    await db.query(MIGRATION);
    expect(await objets()).toEqual({ tache: 1, taches: 10, jeton: 1, recensement: 1, fonctions: 5, marques: 3 });
    expect(await definitions()).toEqual(migre);
    const sansJeton = (e: string) => e.replace(/\| [0-9a-f]{32}https:/, "| JETON https:");
    expect(sansJeton(await empreinte())).toBe(sansJeton(empreinteMigree));
  });

  it("le retour refuse de se jouer dans un lot déjà ouvert (migrations.yml, begin;)", async () => {
    await db.query("savepoint e");
    let message = "";
    try {
      await db.query(RETOUR);
    } catch (err) {
      message = (err as Error).message;
    }
    await db.query("rollback to savepoint e");
    expect(message).toMatch(/Retour arrière refusé : ce script gère sa propre transaction/);
  });

  it("tant que 812000 est en place, les retours de 811000 et de 810000 refusent de se jouer et nomment celui à jouer d'abord", async () => {
    await proprietaire();
    expect(await lot()).toEqual({ tache: 1, tables: 5, fonctions: 16, declencheur: 1 });
    const attendu = /Retour arrière refusé : la migration 20261014812000 \(passage fréquent des urgences du relais\) est encore appliquée\. Jouez d'abord son retour/;
    expect(await refus(RETOUR_811000)).toMatch(attendu);
    expect(await refus(RETOUR_810000)).toMatch(attendu);
    // La tâche seule suffit à refuser : son jeton retiré à la main, elle appellerait encore la route toutes les 10 minutes.
    await db.query("drop table public.declencheur_relais_urgences");
    expect(await refus(RETOUR_811000)).toMatch(attendu);
    expect(await refus(RETOUR_810000)).toMatch(attendu);
    // Et le jeton seul aussi (tâche déjà retirée).
    await db.query("rollback");
    await db.query("begin");
    await proprietaire();
    await db.query("delete from cron.job where jobname = 'relais-urgences'");
    expect(await refus(RETOUR_811000)).toMatch(attendu);
    expect(await refus(RETOUR_810000)).toMatch(attendu);
  });

  it("dans l'ordre du LISEZ-MOI (812000, 811000, 810000), les trois retours passent ; 810000 refuse tant que 811000 est en place ; la marche avant remet tout", async () => {
    const migre = await lot();
    await db.query(RETOUR_DANS_LE_TEST);
    expect(await lot()).toEqual({ tache: 0, tables: 3, fonctions: 11, declencheur: 1 });
    expect(await refus(RETOUR_810000)).toMatch(
      /Retour arrière refusé : la migration 20261014811000 \(e-mail immédiat des urgences du relais\) est encore appliquée\. Jouez d'abord son retour/
    );
    await db.query(RETOUR_811000);
    expect(await lot()).toEqual({ tache: 0, tables: 1, fonctions: 5, declencheur: 0 });
    await db.query(RETOUR_810000);
    expect(await lot()).toEqual({ tache: 0, tables: 0, fonctions: 0, declencheur: 0 });
    // Les deux retours gardés, rejoués : sans effet ni erreur (leurs gardes ne trouvent plus rien de 812000 ni de 811000).
    for (const retour of [RETOUR_811000, RETOUR_810000]) await db.query(retour);
    expect(await lot()).toEqual({ tache: 0, tables: 0, fonctions: 0, declencheur: 0 });
    // La marche avant, dans l'ordre du manifeste.
    for (const migration of [ORIGINE_810000, ORIGINE_811000, MIGRATION]) await db.query(migration);
    expect(await lot()).toEqual(migre);
  });

  it("un bloc retouché à la main arrête le retour, sans rien modifier", async () => {
    await proprietaire();
    // La marque de fin du bloc « rappel exact » est doublée : le bloc n'est plus intact.
    const { rows: [{ d }] } = await db.query<{ d: string }>("select pg_get_functiondef('public.urgences_relais_recentes()'::regprocedure) d");
    await db.query(d.replace("  -- << Relais 15/10 (rappel exact)\n", "  -- << Relais 15/10 (rappel exact)\n  -- << Relais 15/10 (rappel exact)\n"));
    const avant = await objets();
    await db.query("savepoint e");
    let message = "";
    try {
      await db.query(RETOUR_DANS_LE_TEST);
    } catch (err) {
      message = (err as Error).message;
    }
    await db.query("rollback to savepoint e");
    expect(message).toMatch(/le bloc de public\.urgences_relais_recentes\(\) n'est plus intact/);
    expect(await objets()).toEqual(avant);
  });
});
