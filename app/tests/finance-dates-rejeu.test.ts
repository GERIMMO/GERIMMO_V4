/**
 * Migrations 20261014410000 à 20261014413000 (lot « finance-dates » : X13, X09, X14) : elles se rejouent sans effet, s'arrêtent sur une
 * définition inattendue, posent leur correctif sur la définition d'AVANT (celle que leur retour arrière rétablit), et leurs retours
 * arrière retirent exactement ce qu'elles ajoutent.
 *
 * La base visée est déjà migrée. Tout est joué dans une transaction annulée à la fin. Le retour arrière gère normalement sa propre
 * transaction (et refuse de se jouer dans un lot) : ici son CORPS est joué, privé de cette enveloppe, dans la transaction du test —
 * l'essai complet (copie de base, refus dans un lot, rejeu) est décrit dans supabase/retours-arriere/LISEZ-MOI.md. La fermeture à anon
 * (`fermer_fonctions_a_anon`), qui réécrit les droits de TOUTES les fonctions de `public`, est écartée du rejeu : sa présence en fin de
 * migration est vérifiée plus bas, ses effets dans le catalogue.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const LOT = [
  "20261014410000_encaissement_reste_jour_de_paris",
  "20261014411000_loyer_echu_jour_de_paris",
  "20261014412000_encaissements_montant_au_centime",
  "20261014413000_encaissement_plancher_honoraires",
] as const;
const migration = (nom: string) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8");
const retour = (nom: string) => readFileSync(`supabase/retours-arriere/${nom}.retour.sql`, "utf8");
const [M410, M411, M412, M413] = LOT.map(migration);
const [R410, R411, R412, R413] = LOT.map(retour);

const MARQUE_X13 = "Décision X13 du 15/10 (FIN-13)";
const MARQUE_X14 = "Décision X14 du 15/10 (PR178-B-03)";
const ENCAISSER = "public.encaisser_reste_atomique(uuid,uuid,uuid,uuid,numeric,numeric)";
const ETAT = "public.etat_loyers_bail_brut(uuid)";
const FICHE = "public.fiche_lot(uuid)";
const CONTRATS = "public.contrats_du_lot(uuid)";
const ECRIRE = "public.ecrire_encaissement()";
const FONCTIONS = [ENCAISSER, ETAT, FICHE, CONTRATS, ECRIRE];

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
  it("les quatre migrations ferment la liste du manifeste, dans la plage du lot", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    const i = manifeste.indexOf(`${LOT[0]}.sql`);
    expect(i).toBeGreaterThan(0);
    expect(manifeste.slice(i, i + 4)).toEqual(LOT.map((n) => `${n}.sql`));
    // Après la dernière migration de la vague précédente de ce banc : jamais devant.
    expect(manifeste.indexOf("20261014330000_creation_fiche_personne_cle.sql")).toBeLessThan(i);
    for (const nom of LOT) {
      const horodatage = Number(nom.slice(0, 14));
      expect(horodatage).toBeGreaterThanOrEqual(20261014410000);
      expect(horodatage).toBeLessThanOrEqual(20261014419999);
    }
  });

  it("chaque migration nomme son retour arrière ; celles qui touchent des fonctions ferment les fonctions à anon", () => {
    for (const [sql, nom] of [[M410, LOT[0]], [M411, LOT[1]], [M412, LOT[2]], [M413, LOT[3]]] as const) {
      expect(sql).toContain(`supabase/retours-arriere/${nom}.retour.sql`);
    }
    for (const sql of [M410, M411, M413]) expect(sql).toMatch(/^select public\.fermer_fonctions_a_anon\(\);$/m);
    // La contrainte ne touche aucune fonction : rien à fermer, aucun verrou de catalogue à prendre.
    expect(M412).not.toMatch(/fermer_fonctions_a_anon\(\);/);
  });

  it.each([[R410, "20261014410000"], [R411, "20261014411000"], [R412, "20261014412000"], [R413, "20261014413000"]])(
    "le retour %# refuse de se jouer dans un lot, gère sa transaction et retire sa version",
    (sql, version) => {
      expect(sql).toMatch(/statement_timestamp\(\) <> transaction_timestamp\(\)/);
      expect(sql).toMatch(/^begin;$/m);
      expect(sql).toMatch(/^commit;$/m);
      expect(sql).toContain(`where version = '${version}'`);
    }
  );

  it("les marques des retours sont celles que les migrations posent", () => {
    for (const sql of [M410, M411]) expect(sql).toContain(MARQUE_X13);
    expect(M413).toContain(MARQUE_X14);
    expect(R410).toContain(`$marque$${MARQUE_X13}$marque$`);
    expect(R411.split(`$marque$${MARQUE_X13}$marque$`)).toHaveLength(4); // trois fonctions
    expect(R413).toContain(`$marque$${MARQUE_X14}$marque$`);
  });

  it("les définitions antérieures embarquées sont celles d'avant : le jour de la session, pas de marque", () => {
    const antes = { ...definitionsAnterieures(R410), ...definitionsAnterieures(R411), ...definitionsAnterieures(R413) };
    expect(Object.keys(antes).sort()).toEqual(["public.contrats_du_lot(uuid)", "public.ecrire_encaissement()", "public.encaisser_reste_atomique(uuid,uuid,uuid,uuid,numeric,numeric)", "public.etat_loyers_bail_brut(uuid)", "public.fiche_lot(uuid)"].sort());
    for (const [signature, def] of Object.entries(antes)) {
      expect(def, signature).not.toContain(MARQUE_X13);
      expect(def, signature).not.toContain(MARQUE_X14);
    }
    expect(antes[ETAT]).toContain("a.date_echeance < current_date then 'impaye'");
    expect(antes[FICHE]).toContain("x.date_echeance < current_date and x.montant_du > x.montant_couvert");
    expect(antes[CONTRATS]).toContain("x.date_echeance < current_date and x.montant_du > x.montant_couvert");
    expect(antes[ENCAISSER]).toContain("insert into public.encaissements(organization_id,bail_id,montant,mode,note)");
    expect(antes[ECRIRE]).not.toContain("trop petit");
  });

  it("aucun retour ne réécrit ni ne supprime une donnée métier", () => {
    for (const sql of [R410, R411, R412, R413]) {
      const sansCommentaires = sql.replace(/^\s*--.*$/gm, "");
      // Les définitions embarquées sont du texte de fonction, pas des instructions du retour : on les retire.
      const instructions = sansCommentaires.replace(/\$definition_anterieure\$[\s\S]*?\$definition_anterieure\$/g, "");
      expect(instructions).not.toMatch(/\b(truncate|update\s+public\.|insert\s+into)\b/i);
      for (const m of instructions.matchAll(/delete\s+from\s+([\w.]+)/gi)) expect(m[1]).toBe("supabase_migrations.schema_migrations");
    }
  });

  it("les migrations ne réécrivent aucun encaissement ni aucune écriture existants", () => {
    for (const sql of [M410, M411, M412, M413]) {
      const instructions = sql.replace(/^\s*--.*$/gm, "").replace(/\$nouveau\$[\s\S]*?\$nouveau\$/g, "").replace(/\$ancre\$[\s\S]*?\$ancre\$/g, "");
      expect(instructions).not.toMatch(/\b(truncate|delete\s+from|update\s+public\.|insert\s+into)\b/i);
    }
  });

  it("le LISEZ-MOI des retours arrière liste les quatre scripts", () => {
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
    const contrainte = await db.query("select conname || ':' || convalidated as v from pg_constraint where conname = 'encaissements_montant_centime_check'");
    etat.contrainte = contrainte.rows.map((r) => r.v).join("|");
    return etat;
  }
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

  it("les fonctions portent la marque de leur correctif, et la contrainte existe, non validée", async () => {
    for (const signature of [ENCAISSER, ETAT, FICHE, CONTRATS]) expect(await definition(signature), signature).toContain(MARQUE_X13);
    expect(await definition(ECRIRE)).toContain(MARQUE_X14);
    expect((await empreinte()).contrainte).toBe("encaissements_montant_centime_check:false");
  });

  it("les marques ne sont posées qu'une fois (pas de garde doublée)", async () => {
    expect((await definition(ENCAISSER)).split(MARQUE_X13)).toHaveLength(2);
    expect((await definition(ETAT)).split(MARQUE_X13)).toHaveLength(2);
    expect((await definition(ECRIRE)).split(MARQUE_X14)).toHaveLength(2);
    // fiche_lot et contrats_du_lot portent la marque à chacune des deux comparaisons.
    expect((await definition(FICHE)).split(MARQUE_X13)).toHaveLength(3);
    expect((await definition(CONTRATS)).split(MARQUE_X13)).toHaveLength(3);
  });

  it("rejouées deux fois de suite, dans un ordre ou l'autre, elles ne changent rien (définitions, droits, contrainte)", async () => {
    const avant = await empreinte();
    for (const sql of [M410, M411, M412, M413, M413, M412, M411, M410, M410, M411]) {
      await db.query(sansFermetureAnon(sql));
      expect(await empreinte()).toEqual(avant);
    }
  });

  it("les droits restent explicites : ni anon ni public ; authenticated exécute sauf la fonction interne et le déclencheur", async () => {
    const droit = async (role: string, signature: string) =>
      (await db.query("select has_function_privilege($1, $2::text::regprocedure, 'execute') as ok", [role, signature])).rows[0].ok as boolean;
    for (const signature of FONCTIONS) expect(await droit("anon", signature), signature).toBe(false);
    for (const signature of [ENCAISSER, FICHE, CONTRATS]) expect(await droit("authenticated", signature), signature).toBe(true);
    for (const signature of [ETAT, ECRIRE]) expect(await droit("authenticated", signature), signature).toBe(false);
    expect(await droit("service_role", ETAT)).toBe(true);
  });

  it.each([
    [ENCAISSER, M410, R410, "insert into public.encaissements(organization_id,bail_id,montant,mode,note)", "insert into public.encaissements(organization_id,bail_id,montant,note,mode)", /X13 \(encaissement\) : définition inattendue/],
    [ETAT, M411, R411, "when a.date_echeance < current_date then 'impaye'", "when a.date_echeance <= current_date then 'impaye'", /X13 \(état des loyers\) : définition inattendue/],
    [ECRIRE, M413, R413, "if v_taux is not null and v_taux > 0 then", "if v_taux is not null then", /X14 \(plancher d'honoraires\) : définition inattendue/],
  ])("%s : une définition inattendue arrête la migration (l'ancre ne se devine pas)", async (signature, sql, retourSql, ancre, autre, message) => {
    // La définition d'avant, puis altérée : l'ancre n'y est plus.
    const avant = definitionsAnterieures(retourSql)[signature];
    expect(avant, `définition antérieure de ${signature}`).toContain(ancre);
    await db.query(avant.replace(ancre, autre));
    await expect(db.query(sansFermetureAnon(sql))).rejects.toThrow(message);
  });

  it.each([
    [FICHE, "fiche du lot"],
    [CONTRATS, "contrats du lot"],
  ])("%s : une seule des deux comparaisons reconnues arrête la migration (%s)", async (signature, libelle) => {
    const avant = definitionsAnterieures(R411)[signature];
    const alteree = avant.replace("x.date_echeance < current_date and x.montant_du > x.montant_couvert", "x.date_echeance <= current_date and x.montant_du > x.montant_couvert");
    expect(alteree).not.toBe(avant);
    await db.query(alteree);
    await expect(db.query(sansFermetureAnon(M411))).rejects.toThrow(new RegExp(`X13 \\(${libelle}\\) : définition inattendue`));
  });

  it("sur les définitions d'AVANT, les migrations posent leur correctif et retrouvent exactement l'état migré", async () => {
    const migre = await empreinte();
    const migreDefs = Object.fromEntries(await Promise.all(FONCTIONS.map(async (s) => [s, await definition(s)])));
    for (const [signature, def] of Object.entries({ ...definitionsAnterieures(R410), ...definitionsAnterieures(R411), ...definitionsAnterieures(R413) })) await db.query(def);
    for (const signature of FONCTIONS) expect(await definition(signature), signature).not.toMatch(/Décision X1[34]/);
    for (const sql of [M410, M411, M413]) await db.query(sansFermetureAnon(sql));
    for (const signature of FONCTIONS) expect(await definition(signature), signature).toBe(migreDefs[signature]);
    expect(await empreinte()).toEqual(migre);
  });

  it("les retours arrière (corps joué dans la transaction du test) rétablissent les définitions d'avant, puis la marche avant retrouve l'état migré", async () => {
    const migre = await empreinte();
    for (const sql of [R413, R412, R411, R410]) await db.query(corpsDuRetour(sql));
    for (const signature of FONCTIONS) expect(await definition(signature), signature).not.toMatch(/Décision X1[34]/);
    expect(await definition(ETAT)).toContain("a.date_echeance < current_date then 'impaye'");
    expect((await empreinte()).contrainte).toBe("");
    // Leur rejeu ne fait rien.
    const apres = await empreinte();
    for (const sql of [R413, R412, R411, R410]) await db.query(corpsDuRetour(sql));
    expect(await empreinte()).toEqual(apres);
    // Marche avant.
    for (const sql of [M410, M411, M412, M413]) await db.query(sansFermetureAnon(sql));
    expect(await empreinte()).toEqual(migre);
  });
});
