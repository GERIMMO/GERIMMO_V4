/**
 * Migrations 20261014410000, 20261014412000 à 20261014416000 (lot « finance-dates » : X13, X09, X14) : elles se rejouent sans effet, s'arrêtent sur une
 * définition inattendue, posent leur correctif sur la définition d'AVANT (celle que leur retour arrière rétablit), et leurs retours
 * arrière retirent exactement ce qu'elles ajoutent.
 *
 * La base visée est déjà migrée. Tout est joué dans une transaction annulée à la fin. Le retour arrière gère normalement sa propre
 * transaction (et refuse de se jouer dans un lot) : ici son CORPS est joué, privé de cette enveloppe, dans la transaction du test —
 * l'essai complet (copie de base, refus dans un lot, rejeu) est décrit dans supabase/retours-arriere/LISEZ-MOI.md. La fermeture à anon
 * (`fermer_fonctions_a_anon`), qui réécrit les droits de TOUTES les fonctions de `public`, est écartée du rejeu : sa présence en fin de
 * migration est vérifiée plus bas, ses effets dans le catalogue.
 */
import { readFileSync, readdirSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const LOT = [
  "20261014410000_encaissement_reste_jour_de_paris",
  "20261014412000_encaissements_montant_au_centime",
  "20261014413000_encaissement_plancher_honoraires",
  "20261014414000_encaissements_montant_fini",
  "20261014415000_reprise_soldes_au_centime",
  "20261014416000_quittance_jour_de_paris",
] as const;
const migration = (nom: string) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8");
const retour = (nom: string) => readFileSync(`supabase/retours-arriere/${nom}.retour.sql`, "utf8");
const [M410, M412, M413, M414, M415, M416] = LOT.map(migration);
const [R410, R412, R413, R414, R415, R416] = LOT.map(retour);

const MARQUE_X13 = "Décision X13 du 15/10 (FIN-13)";
const MARQUE_X14 = "Décision X14 du 15/10 (PR178-B-03)";
const MARQUE_X09_REPRISE = "Décision X09 du 15/10 (FIN-03, reprise de soldes)";
const ENCAISSER = "public.encaisser_reste_atomique(uuid,uuid,uuid,uuid,numeric,numeric)";
const ECRIRE = "public.ecrire_encaissement()";
const REPRENDRE = "public.reprendre_soldes(uuid,uuid,jsonb,boolean)";
const QUITTANCES = "public.resynchroniser_quittances(uuid)";
const FONCTIONS = [ENCAISSER, ECRIRE, REPRENDRE, QUITTANCES];

const sansFermetureAnon = (sql: string) => sql.replace(/^select public\.fermer_fonctions_a_anon\(\);$/m, "");
/** Le corps d'un retour arrière, sans son enveloppe de transaction (garde de lot, begin, commit, délai de verrou). */
const corpsDuRetour = (sql: string) =>
  sql
    .replace(/do \$retour_arriere\$\nbegin\n  if statement_timestamp\(\) <> transaction_timestamp\(\)[\s\S]*?end \$retour_arriere\$;/, "")
    .replace(/^begin;$/m, "")
    .replace(/^commit;$/m, "")
    .replace(/^set local lock_timeout = '10s';$/m, "")
    .replace(/^select public\.fermer_fonctions_a_anon\(\);$/m, "")
    // Plusieurs retours se jouent ici dans UNE session (chacun a la sienne en réalité) : l'outil local se recrée sans erreur.
    .replace("create function pg_temp.restaurer_fonction", "create or replace function pg_temp.restaurer_fonction");
/** Les définitions antérieures qu'un retour embarque : signature → définition. */
function definitionsAnterieures(sql: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of sql.matchAll(/restaurer_fonction\('([^']+)',\s*\$marque\$([\s\S]*?)\$marque\$,\s*\$definition_anterieure\$([\s\S]*?)\$definition_anterieure\$\)/g)) out[m[1]] = m[3];
  return out;
}

describe("Lot finance-dates — fichiers de migration et de retour arrière (sans base)", () => {
  it("les migrations ferment la liste du manifeste, dans la plage du lot", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    const i = manifeste.indexOf(`${LOT[0]}.sql`);
    expect(i).toBeGreaterThan(0);
    expect(manifeste.slice(i, i + LOT.length)).toEqual(LOT.map((n) => `${n}.sql`));
    // Après la dernière migration de la vague précédente de ce banc : jamais devant.
    expect(manifeste.indexOf("20261014330000_creation_fiche_personne_cle.sql")).toBeLessThan(i);
    for (const nom of LOT) {
      const horodatage = Number(nom.slice(0, 14));
      expect(horodatage).toBeGreaterThanOrEqual(20261014410000);
      expect(horodatage).toBeLessThanOrEqual(20261014419999);
    }
  });

  it("chaque migration nomme son retour arrière ; celles qui touchent des fonctions ferment les fonctions à anon", () => {
    for (const [sql, nom] of [[M410, LOT[0]], [M412, LOT[1]], [M413, LOT[2]], [M414, LOT[3]], [M415, LOT[4]], [M416, LOT[5]]] as const) {
      expect(sql).toContain(`supabase/retours-arriere/${nom}.retour.sql`);
    }
    for (const sql of [M410, M413, M415, M416]) expect(sql).toMatch(/^select public\.fermer_fonctions_a_anon\(\);$/m);
    // Les contraintes ne touchent aucune fonction : rien à fermer, aucun verrou de catalogue à prendre.
    for (const sql of [M412, M414]) expect(sql).not.toMatch(/fermer_fonctions_a_anon\(\);/);
  });

  it.each([[R410, "20261014410000"], [R412, "20261014412000"], [R413, "20261014413000"], [R414, "20261014414000"], [R415, "20261014415000"], [R416, "20261014416000"]])(
    "le retour %# est atomique sans valider la transaction appelante et retire sa version",
    (sql, version) => {
      expect(sql).not.toMatch(/statement_timestamp\(\) <> transaction_timestamp\(\)/);
      expect(sql).toMatch(/do \$retour_atomique\$/);
      expect(sql).toMatch(/end \$retour_atomique\$;/);
      expect(sql).toContain(`where version = '${version}'`);
    }
  );

  it("les marques des retours sont celles que les migrations posent", () => {
    for (const sql of [M410, M416]) expect(sql).toContain(MARQUE_X13);
    expect(M413).toContain(MARQUE_X14);
    expect(M415).toContain(MARQUE_X09_REPRISE);
    expect(R410).toContain(`$marque$${MARQUE_X13}$marque$`);
    expect(R416).toContain(`$marque$${MARQUE_X13}$marque$`);
    expect(R413).toContain(`$marque$${MARQUE_X14}$marque$`);
    expect(R415).toContain(`$marque$${MARQUE_X09_REPRISE}$marque$`);
  });

  it("les définitions antérieures embarquées sont celles d'avant : le jour de la session, pas de marque", () => {
    const antes = { ...definitionsAnterieures(R410), ...definitionsAnterieures(R413), ...definitionsAnterieures(R415), ...definitionsAnterieures(R416) };
    expect(Object.keys(antes).sort()).toEqual([ECRIRE, ENCAISSER, REPRENDRE, QUITTANCES].sort());
    for (const [signature, def] of Object.entries(antes)) {
      expect(def, signature).not.toContain(MARQUE_X13);
      expect(def, signature).not.toContain(MARQUE_X14);
      expect(def, signature).not.toContain(MARQUE_X09_REPRISE);
    }
    expect(antes[REPRENDRE]).toContain("elsif v_montant is null then");
    expect(antes[REPRENDRE]).not.toContain("Montant au centime près");
    expect(antes[QUITTANCES]).toContain("date_emission = current_date, email_envoye_at = null");
    expect(antes[ENCAISSER]).toContain("insert into public.encaissements(organization_id,bail_id,montant,mode,note)");
    expect(antes[ECRIRE]).not.toContain("trop petit");
  });

  it("aucun retour ne réécrit ni ne supprime une donnée métier", () => {
    for (const sql of [R410, R412, R413, R414, R415, R416]) {
      const sansCommentaires = sql.replace(/^\s*--.*$/gm, "");
      // Les définitions embarquées sont du texte de fonction, pas des instructions du retour : on les retire.
      const instructions = sansCommentaires.replace(/\$definition_anterieure\$[\s\S]*?\$definition_anterieure\$/g, "");
      expect(instructions).not.toMatch(/\b(truncate|update\s+public\.|insert\s+into)\b/i);
      for (const m of instructions.matchAll(/delete\s+from\s+([\w.]+)/gi)) expect(m[1]).toBe("supabase_migrations.schema_migrations");
    }
  });

  it("les migrations ne réécrivent aucun encaissement ni aucune écriture existants", () => {
    for (const sql of [M410, M412, M413, M414, M415, M416]) {
      const instructions = sql.replace(/^\s*--.*$/gm, "").replace(/\$nouveau\$[\s\S]*?\$nouveau\$/g, "").replace(/\$ancre\$[\s\S]*?\$ancre\$/g, "");
      expect(instructions).not.toMatch(/\b(truncate|delete\s+from|update\s+public\.|insert\s+into)\b/i);
    }
  });

  // Périmètre (constat de relecture du 15/10) : la décision X13 ne demande que la date de « Encaisser ». Le lot avait aussi modifié l'état des loyers,
  // la fiche du lot et les contrats de colocation (échu au jour de Paris) sans que le dirigeant l'ait ratifié, en laissant les alertes d'impayé et les
  // relances sur le jour de la session. Aucune migration du lot ne modifie d'autres fonctions que celles-ci.
  it("les migrations du lot ne modifient que les fonctions des décisions X13, X09 et X14 (pas l'état des loyers, la fiche du lot, les alertes ni les relances)", () => {
    const AUTORISEES = new Set([ENCAISSER, ECRIRE, REPRENDRE, QUITTANCES]);
    const fichiers = readdirSync("supabase/migrations").filter((f) => f >= "20261014410000" && f < "20261014420000");
    expect(fichiers.length).toBeGreaterThan(0);
    for (const f of fichiers) {
      const sql = readFileSync(`supabase/migrations/${f}`, "utf8").replace(/^\s*--.*$/gm, "");
      // Une migration du lot ne relit (pg_get_functiondef) que les fonctions qu'elle corrige.
      for (const m of sql.matchAll(/pg_get_functiondef\('([^']+)'/g)) expect(AUTORISEES.has(m[1]), `${f} modifie ${m[1]}`).toBe(true);
      // Et ne nomme, dans son code (hors commentaires), aucune des fonctions qui lisent l'échéance d'un loyer.
      for (const interdite of ["etat_loyers_bail_brut", "fiche_lot", "contrats_du_lot", "suivre_impayes_bail", "relances_loyer_dues"]) {
        expect(sql, `${f} ne doit pas toucher ${interdite}`).not.toMatch(new RegExp(`\\b${interdite}\\b`));
      }
    }
  });

  it("le LISEZ-MOI des retours arrière liste les scripts", () => {
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    for (const nom of LOT) expect(lisezMoi).toContain(`${nom}.retour.sql`);
  });
});

describe.skipIf(!DB_URL)("Lot finance-dates — rejeu sur une base déjà migrée", () => {
  let db: Client;

  async function empreinte() {
    const etat: Record<string, string> = {};
    for (const signature of FONCTIONS) {
      const { rows } = await db.query(
        "select md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '') as v from pg_proc p where p.oid = $1::text::regprocedure",
        [signature]
      );
      etat[signature] = rows[0].v;
    }
    const contrainte = await db.query("select conname || ':' || convalidated as v from pg_constraint where conname in ('encaissements_montant_centime_check', 'encaissements_montant_fini_check') order by conname");
    etat.contrainte = contrainte.rows.map((r) => r.v).join("|");
    etat.defautEmission = await defautEmission();
    return etat;
  }
  const defautEmission = async () =>
    (await db.query(
      "select pg_get_expr(d.adbin, d.adrelid) as v from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum where d.adrelid = 'public.quittances'::regclass and a.attname = 'date_emission'"
    )).rows[0].v as string;
  const definition = async (signature: string) => (await db.query("select pg_get_functiondef($1::text::regprocedure) as def", [signature])).rows[0].def as string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
  });
  afterEach(async () => {
    await db.query("rollback to savepoint cas");
    await db.query("release savepoint cas");
  });

  it("les fonctions portent la marque de leur correctif, et les deux contraintes existent, non validées", async () => {
    expect(await definition(ENCAISSER)).toContain(MARQUE_X13);
    expect(await definition(REPRENDRE)).toContain(MARQUE_X09_REPRISE);
    expect(await definition(QUITTANCES)).toContain(MARQUE_X13);
    expect(await defautEmission()).toContain("Europe/Paris");
    expect(await definition(ECRIRE)).toContain(MARQUE_X14);
    expect((await empreinte()).contrainte).toBe("encaissements_montant_centime_check:false|encaissements_montant_fini_check:false");
  });

  it("les marques ne sont posées qu'une fois (pas de garde doublée)", async () => {
    expect((await definition(ENCAISSER)).split(MARQUE_X13)).toHaveLength(2);
    expect((await definition(ECRIRE)).split(MARQUE_X14)).toHaveLength(2);
    expect((await definition(REPRENDRE)).split(MARQUE_X09_REPRISE)).toHaveLength(2);
    // resynchroniser_quittances porte la marque à chacune des deux réémissions (quittance et reçu).
    expect((await definition(QUITTANCES)).split(MARQUE_X13)).toHaveLength(3);
  });

  it("rejouées deux fois de suite, dans un ordre ou l'autre, elles ne changent rien (définitions, droits, contrainte)", async () => {
    const avant = await empreinte();
    for (const sql of [M410, M412, M413, M414, M415, M416, M416, M415, M414, M413, M412, M410, M410, M412, M414, M415, M416]) {
      await db.query(sansFermetureAnon(sql));
      expect(await empreinte()).toEqual(avant);
    }
  });

  it("les droits restent explicites : ni anon ni public ; authenticated exécute « Encaisser », pas le déclencheur", async () => {
    const droit = async (role: string, signature: string) =>
      (await db.query("select has_function_privilege($1, $2::text::regprocedure, 'execute') as ok", [role, signature])).rows[0].ok as boolean;
    for (const signature of FONCTIONS) expect(await droit("anon", signature), signature).toBe(false);
    expect(await droit("authenticated", ENCAISSER)).toBe(true);
    expect(await droit("authenticated", REPRENDRE)).toBe(true);
    expect(await droit("service_role", REPRENDRE)).toBe(true);
    expect(await droit("authenticated", ECRIRE)).toBe(false);
    expect(await droit("authenticated", QUITTANCES)).toBe(false);
    expect(await droit("service_role", QUITTANCES)).toBe(true);
  });

  it.each([
    [ENCAISSER, M410, R410, "insert into public.encaissements(organization_id,bail_id,montant,mode,note)", "insert into public.encaissements(organization_id,bail_id,montant,note,mode)", /X13 \(encaissement\) : définition inattendue/],
    [ECRIRE, M413, R413, "if v_taux is not null and v_taux > 0 then", "if v_taux is not null then", /X14 \(plancher d'honoraires\) : définition inattendue/],
    [REPRENDRE, M415, R415, "elsif v_montant is null then", "elsif v_montant is not null then", /X09 \(reprise de soldes\) : définition inattendue/],
    [QUITTANCES, M416, R416, "date_emission = current_date, email_envoye_at = null", "date_emission = current_date + 0, email_envoye_at = null", /X13 \(quittances\) : définition inattendue/],
  ])("%s : une définition inattendue arrête la migration (l'ancre ne se devine pas)", async (signature, sql, retourSql, ancre, autre, message) => {
    // La définition d'avant, puis altérée : l'ancre n'y est plus.
    const avant = definitionsAnterieures(retourSql)[signature];
    expect(avant, `définition antérieure de ${signature}`).toContain(ancre);
    await db.query(avant.replace(ancre, autre));
    await expect(db.query(sansFermetureAnon(sql))).rejects.toThrow(message);
  });

  it("quittances : une seule des deux réémissions reconnues arrête la migration", async () => {
    const avant = definitionsAnterieures(R416)[QUITTANCES];
    const ancre = "date_emission = current_date, email_envoye_at = null";
    expect(avant.split(ancre)).toHaveLength(3);
    // Seule la première occurrence est altérée : il n'en reste qu'une à reconnaître.
    await db.query(avant.replace(ancre, "date_emission = current_date + 0, email_envoye_at = null"));
    await expect(db.query(sansFermetureAnon(M416))).rejects.toThrow(/X13 \(quittances\) : définition inattendue/);
  });

  it("sur les définitions d'AVANT, les migrations posent leur correctif et retrouvent exactement l'état migré", async () => {
    const migre = await empreinte();
    const migreDefs = Object.fromEntries(await Promise.all(FONCTIONS.map(async (s) => [s, await definition(s)])));
    for (const def of Object.values({ ...definitionsAnterieures(R410), ...definitionsAnterieures(R413), ...definitionsAnterieures(R415), ...definitionsAnterieures(R416) })) await db.query(def);
    await db.query("alter table public.quittances alter column date_emission set default current_date");
    for (const signature of FONCTIONS) expect(await definition(signature), signature).not.toMatch(/Décision X(1[34]|09)/);
    for (const sql of [M410, M413, M415, M416]) await db.query(sansFermetureAnon(sql));
    for (const signature of FONCTIONS) expect(await definition(signature), signature).toBe(migreDefs[signature]);
    expect(await empreinte()).toEqual(migre);
  });

  it("les retours arrière (corps joué dans la transaction du test) rétablissent les définitions d'avant, puis la marche avant retrouve l'état migré", async () => {
    const migre = await empreinte();
    for (const sql of [R416, R415, R414, R413, R412, R410]) await db.query(corpsDuRetour(sql));
    for (const signature of FONCTIONS) expect(await definition(signature), signature).not.toMatch(/Décision X(1[34]|09)/);
    // Le défaut de la colonne revient au jour de la session.
    expect(await defautEmission()).toBe("CURRENT_DATE");
    expect((await empreinte()).contrainte).toBe("");
    // Leur rejeu ne fait rien.
    const apres = await empreinte();
    for (const sql of [R416, R415, R414, R413, R412, R410]) await db.query(corpsDuRetour(sql));
    expect(await empreinte()).toEqual(apres);
    // Marche avant.
    for (const sql of [M410, M412, M413, M414, M415, M416]) await db.query(sansFermetureAnon(sql));
    expect(await empreinte()).toEqual(migre);
  });

  it("le retour de la date d'émission ne touche pas un défaut changé depuis (sans l'expression de la migration, il n'y touche pas)", async () => {
    await db.query("alter table public.quittances alter column date_emission set default current_date + 1");
    await db.query(corpsDuRetour(R416));
    expect(await defautEmission()).toBe("(CURRENT_DATE + 1)");
  });

  it("la contrainte « fini » est une contrainte de plus : son retour et son rejeu ne touchent pas la contrainte de centime", async () => {
    const oidCentime = async () => (await db.query("select oid::int as oid from pg_constraint where conname = 'encaissements_montant_centime_check'")).rows;
    const avant = await oidCentime();
    expect(avant).toHaveLength(1);
    await db.query(corpsDuRetour(R414));
    expect((await empreinte()).contrainte).toBe("encaissements_montant_centime_check:false");
    expect(await oidCentime()).toEqual(avant);
    await db.query(M414);
    expect((await empreinte()).contrainte).toBe("encaissements_montant_centime_check:false|encaissements_montant_fini_check:false");
    expect(await oidCentime()).toEqual(avant);
  });
});
