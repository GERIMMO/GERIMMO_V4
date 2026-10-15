/**
 * Lot « fuseau-suite » : les deux migrations (20261014820000, 20261014821000) et leurs retours arrière.
 *
 * Ce que ce fichier garde (même méthode que tests/jour-de-paris-migrations-rejeu.test.ts, lot « fuseau-paris ») :
 *  - REJEU. Chaque migration se rejoue sans effet (définitions, droits, valeurs par défaut identiques), deux fois de suite.
 *  - FORME DE PRODUCTION. Aucune ancre de plusieurs lignes : on le prouve en remettant chaque fonction dans sa forme d'AVANT
 *    sous une AUTRE mise en forme (mot en capitales, indentation retirée) avant de rejouer : la logique obtenue est la même.
 *  - FORME DÉJÀ CONVERTIE. Une fonction déjà au jour de Paris par l'expression explicite `(now() at time zone 'Europe/Paris')::date`
 *    (et non par `aujourdhui_paris()`) est laissée telle quelle, sans échec ; son retour ne la touche pas non plus.
 *  - DÉFINITION INATTENDUE. Un autre nombre d'occurrences, un mélange des deux formes, une fonction qui ne lit rien, une
 *    fonction absente, une valeur par défaut étrangère, la fonction du jour de Paris absente : la migration s'arrête avec un
 *    message qui nomme l'objet, et ne laisse rien de changé.
 *  - RETOURS. Chaque retour remet `current_date` (et le mois de la session pour le rapport automatique) à sa place, nombre exact
 *    vérifié, se rejoue sans effet, refuse de se jouer dans un lot et n'écrase pas une fonction réécrite depuis. Aller, retour,
 *    aller : même état. Le retour de la fonction du jour de Paris (20261014500000) refuse tant que ce lot s'en sert.
 *  - INVENTAIRE. Plus aucune fonction de ces domaines ne lit le jour de la session, hors objets classés (avec leur raison).
 *
 * Ce fichier change des valeurs par défaut (verrou de table tenu jusqu'à la fin de l'essai) : il tourne en série
 * (FICHIERS_EN_SERIE de vitest.config.ts). La base visée est déjà migrée ; tout est joué dans une transaction annulée à la fin.
 */
import { existsSync, readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

type Famille = {
  nom: string;
  version: string;
  fichier: string;
  /** signature, nombre exact de `current_date` remplacés */
  fonctions: [string, number][];
  /** table, colonne dont le défaut passe au jour de Paris */
  defauts: [string, string][];
};

const FAMILLES: Famille[] = [
  {
    nom: "dépôt de garantie et journal comptable",
    version: "20261014820000",
    fichier: "jour_de_paris_depot_et_journal",
    fonctions: [
      ["public.encaisser_depot(uuid,numeric,date,text,uuid,text,uuid)", 3],
      ["public.contre_passer_depot_encaissement()", 2],
      ["public.contre_ecriture(uuid,text)", 1],
    ],
    defauts: [
      ["depot_encaissements", "date_encaissement"],
      ["ecritures", "date_piece"],
      ["ecritures", "date_imputation"],
    ],
  },
  {
    nom: "révision IRL, terme du bail, régularisation des charges et rapport de gestion",
    version: "20261014821000",
    fichier: "jour_de_paris_irl_terme_charges_rapports",
    fonctions: [
      ["public.reviser_loyer(uuid,numeric,text,date)", 2],
      ["public.terme_bail(uuid,date)", 1],
      ["public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean)", 4],
      ["public.rapport_du_lot(uuid,date)", 1],
      ["public.envoyer_rapport(uuid,text)", 1],
    ],
    defauts: [["regularisations_charges", "date_emission"]],
  },
];
/** Le rapport préparé automatiquement : une expression `date_trunc('month', now())`, pas de `current_date`. */
const MOIS = "public.preparer_rapports_automatiques()";
const MOIS_SESSION = /date_trunc\('month',\s*now\(\)\)/gi;
const MOIS_PARIS = /date_trunc\('month', public\.aujourdhui_paris\(\)::timestamp\)/g;

const migration = (f: Famille) => readFileSync(`supabase/migrations/${f.version}_${f.fichier}.sql`, "utf8");
const retour = (f: Famille) => readFileSync(`supabase/retours-arriere/${f.version}_${f.fichier}.retour.sql`, "utf8");
const RETOUR_FONCTION_DU_JOUR = readFileSync("supabase/retours-arriere/20261014500000_jour_de_paris_fonction.retour.sql", "utf8");

/** Le manifeste des migrations, dans l'ordre où elles s'appliquent. */
const MANIFESTE = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
const FICHIER_FONCTION_DU_JOUR = "20261014500000_jour_de_paris_fonction.sql";
/** Le fichier du manifeste dont la version se termine par ce code à six chiffres (« 610000 » → 20261014610000_…). */
const parCode = (code: string) => MANIFESTE.find((m) => m.startsWith(`20261014${code}_`));

/**
 * La chaîne « Ordre complet si tout doit être défait » de la section du lot dans le LISEZ-MOI des retours, lue telle
 * qu'écrite : les codes à six chiffres avant « puis `500000` », une plage « `504000` → `501000` » dépliée par pas de 1000.
 */
function chaineDuLisezMoi(): string[] {
  const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
  const section = lisezMoi.slice(lisezMoi.indexOf("## Lot « fuseau-suite »"));
  const phrase = section.match(/Ordre complet si tout doit être défait :([\s\S]*?)puis `500000`/);
  if (!phrase) throw new Error("La section du lot ne donne plus l'ordre complet des retours.");
  const codes: string[] = [];
  for (const [, debut, fin] of phrase[1].matchAll(/`(\d{6})`(?:\s*→\s*`(\d{6})`)?/g)) {
    if (!fin) codes.push(debut);
    else for (let n = Number(debut); n >= Number(fin); n -= 1000) codes.push(String(n));
  }
  return codes;
}

/** Les migrations postérieures à la fonction du jour dont le code (commentaires retirés) cite `aujourdhui_paris()`. */
const MIGRATIONS_QUI_CITENT_LE_JOUR = MANIFESTE.slice(MANIFESTE.indexOf(FICHIER_FONCTION_DU_JOUR) + 1).filter((m) =>
  readFileSync(`supabase/migrations/${m}`, "utf8").replace(/--.*$/gm, "").includes("aujourdhui_paris()")
);

/** Le script de retour gère sa propre transaction et refuse de se jouer dans un lot : on lui retire cette enveloppe seule. */
function sansEnveloppe(script: string): string {
  return script
    .replace(/do \$retour_arriere\$\s*begin\s*if statement_timestamp\(\) <> transaction_timestamp\(\)[\s\S]*?end \$retour_arriere\$;/, "")
    .replace(/^begin;$/m, "")
    .replace(/^commit;$/m, "");
}

const SIGNATURES = [...FAMILLES.flatMap((f) => f.fonctions.map(([s]) => s)), MOIS];
const DEFAUTS = FAMILLES.flatMap((f) => f.defauts);
/** La fonction du jour de Paris, qualifiée (corps) ou non (en-tête relu avec `public` dans le chemin de recherche). */
const PAR_LA_FONCTION = /(\bpublic\.)?\baujourdhui_paris\(\)/g;
const EXPLICITE = "(now() at time zone 'Europe/Paris')::date";
const PAR_L_EXPRESSION = /\(\s*now\(\)\s+at\s+time\s+zone\s+'Europe\/Paris'(::text)?\s*\)\)?\s*::\s*date/gi;
const DEFAUT_PAR_LA_FONCTION = /^(public\.)?aujourdhui_paris\(\)$/;

describe.skipIf(!DB_URL)("jour de Paris, la suite — migrations et retours arrière", () => {
  let db: Client;

  /** Tout ce que le lot peut changer : définitions, droits, valeurs par défaut. */
  async function empreinte(): Promise<Record<string, string>> {
    const etat: Record<string, string> = {};
    for (const signature of ["public.aujourdhui_paris()", ...SIGNATURES]) {
      const { rows } = await db.query(
        `select coalesce(md5(pg_get_functiondef(to_regprocedure($1))), 'absente') || ' ' ||
                coalesce((select p.proacl::text from pg_proc p where p.oid = to_regprocedure($1)), '-') as v`,
        [signature]
      );
      etat[`fonction ${signature}`] = rows[0].v;
    }
    for (const [table, colonne] of DEFAUTS) etat[`défaut ${table}.${colonne}`] = await defaut(table, colonne);
    return etat;
  }

  const definition = async (signature: string) =>
    (await db.query<{ def: string }>("select pg_get_functiondef($1::text::regprocedure) as def", [signature])).rows[0].def;
  const nbSession = (def: string) => (def.match(/\bcurrent_date\b/gi) ?? []).length;
  const nbFonction = (def: string) => (def.match(PAR_LA_FONCTION) ?? []).length;
  const nbExplicite = (def: string) => (def.match(PAR_L_EXPRESSION) ?? []).length;
  /** Espaces et casse ramenés à une forme unique ; les écritures du jour de Paris sont un seul jeton (même logique, autre mot). */
  const normaliser = (def: string) =>
    def
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim()
      .replace(/(public\.)?aujourdhui_paris\(\)/g, "<jour de paris>");
  const defaut = async (table: string, colonne: string) =>
    (
      await db.query<{ v: string }>(
        `select coalesce((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
                           where d.adrelid = $1::regclass and a.attname = $2), '-') as v`,
        [`public.${table}`, colonne]
      )
    ).rows[0].v;

  /** La définition d'AVANT la migration, sous une AUTRE forme (capitales, indentation retirée). */
  const versLOrigine = (def: string) =>
    def
      .replace(PAR_LA_FONCTION, "CURRENT_DATE")
      .replace(/date_trunc\('month', CURRENT_DATE::timestamp\)/g, "DATE_TRUNC('month',NOW())")
      .replace(/\n[ \t]+/g, "\n");

  /** Remet toute la famille (et, pour la seconde, le rapport automatique) dans son état d'AVANT, sous une AUTRE forme. */
  async function remettreAvantAutrement(famille: Famille) {
    for (const [signature] of famille.fonctions) await db.query(versLOrigine(await definition(signature)));
    if (famille === FAMILLES[1]) await db.query(versLOrigine(await definition(MOIS)));
    for (const [table, colonne] of famille.defauts) await db.query(`alter table public.${table} alter column ${colonne} set default current_date`);
  }

  async function echoue(sql: string): Promise<string> {
    await db.query("savepoint essai");
    try {
      await db.query(sql);
      return "";
    } catch (e) {
      return (e as Error).message;
    } finally {
      await db.query("rollback to savepoint essai");
      await db.query("release savepoint essai");
    }
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
    // La chaîne des retours commence par celui de 20261014812000 (lot « relais-alertes »), qui retire sa tâche avec
    // `cron.unschedule` : le planificateur de façade du banc ne l'a pas, on la pose le temps de la transaction (annulée).
    await db.query(
      `do $$ begin
         if to_regprocedure('cron.unschedule(text)') is null then
           create function cron.unschedule(p_nom text) returns boolean language sql as $f$
             with retiree as (delete from cron.job where jobname = p_nom returning 1) select exists (select 1 from retiree) $f$;
         end if;
       end $$`
    );
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

  describe("état de la base du banc", () => {
    it("chaque fonction du lot lit le jour de Paris, en nombre exact, et plus jamais le jour de la session", async () => {
      for (const famille of FAMILLES)
        for (const [signature, attendu] of famille.fonctions) {
          const def = await definition(signature);
          expect(nbSession(def), signature).toBe(0);
          expect(nbFonction(def), signature).toBe(attendu);
        }
      const mois = await definition(MOIS);
      expect(mois.match(MOIS_SESSION) ?? []).toHaveLength(0);
      expect(mois.match(MOIS_PARIS) ?? []).toHaveLength(1);
      expect(nbSession(mois)).toBe(0);
    });

    it("chaque valeur par défaut du lot est le jour de Paris", async () => {
      for (const [table, colonne] of DEFAUTS) expect(await defaut(table, colonne), `${table}.${colonne}`).toMatch(DEFAUT_PAR_LA_FONCTION);
    });

    it("les droits sont ceux d'avant le lot : aucune fonction ouverte à anon, le rapport automatique réservé au service", async () => {
      const { rows } = await db.query<{ signature: string; anon: boolean; connecte: boolean; service: boolean }>(
        `select s as signature, has_function_privilege('anon', s, 'EXECUTE') as anon,
                has_function_privilege('authenticated', s, 'EXECUTE') as connecte, has_function_privilege('service_role', s, 'EXECUTE') as service
           from unnest($1::text[]) s`,
        [SIGNATURES]
      );
      for (const r of rows) {
        expect(r.anon, r.signature).toBe(false);
        expect(r.service, r.signature).toBe(r.signature !== "public.contre_passer_depot_encaissement()");
        // Fonctions de déclencheur et traitement automatique : jamais appelables par un compte connecté.
        expect(r.connecte, r.signature).toBe(![MOIS, "public.contre_passer_depot_encaissement()"].includes(r.signature));
      }
    });

    it("inventaire : aucune autre fonction de ces domaines ne lit encore le jour de la session, hors objets classés", async () => {
      // Les fonctions qui écrivent ou lisent le dépôt, le journal, les révisions, les régularisations ou les rapports ET lisent le jour
      // de la SESSION. Les objets hors de la décision du 15/10 sont classés ici avec leur raison, jamais en assouplissant le motif.
      const HORS_PERIMETRE = new Map<string, string>([
        ["finaliser_decompte", "restitution du dépôt (décompte de sortie) : catégorie « restitutions », hors des questions tranchées le 15/10"],
        ["actualiser_orchestration_socle", "lit le jour de la session pour les restitutions et les devis d'artisan, pas pour les rapports"],
      ]);
      const { rows } = await db.query<{ nom: string }>(
        `select distinct p.proname as nom from pg_proc p
          where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p')
            and pg_get_functiondef(p.oid) ~* '(\\m(current_date|localtimestamp|localtime)\\M|now\\(\\)\\s*::\\s*date|\\(\\s*now\\(\\)\\s*\\)\\s*::\\s*date|current_timestamp\\s*::\\s*date|date_trunc\\(\\s*''month''\\s*,\\s*now\\(\\)\\s*\\))'
            and pg_get_functiondef(p.oid) ~* 'public\\.(depot_encaissements|ecritures|revisions_loyer|regularisations_charges|rapports_gestion|clotures_comptables)\\M'
          order by 1`
      );
      expect(rows.map((r) => r.nom).filter((nom) => !HORS_PERIMETRE.has(nom))).toEqual([]);
    });
  });

  describe("rejeu", () => {
    it.each(FAMILLES)("$version, rejouée sur une base déjà migrée, ne change rien (deux fois de suite)", async (famille) => {
      const avant = await empreinte();
      await db.query(migration(famille));
      expect(await empreinte()).toEqual(avant);
      await db.query(migration(famille));
      expect(await empreinte()).toEqual(avant);
    });
  });

  describe.each(FAMILLES)("$nom — formes rencontrées", (famille) => {
    it("sur des définitions d'une AUTRE mise en forme (capitales, indentation retirée), la migration les ramène au jour de Paris, logique inchangée", async () => {
      const avant = Object.fromEntries(await Promise.all(famille.fonctions.map(async ([s]) => [s, normaliser(await definition(s))])));
      await remettreAvantAutrement(famille);
      for (const [signature, attendu] of famille.fonctions) {
        const def = await definition(signature);
        expect(nbSession(def), `${signature} (avant)`).toBe(attendu);
        expect(nbFonction(def), `${signature} (avant)`).toBe(0);
      }
      await db.query(migration(famille));
      for (const [signature, attendu] of famille.fonctions) {
        const def = await definition(signature);
        expect(nbSession(def), signature).toBe(0);
        expect(nbFonction(def), signature).toBe(attendu);
        expect(normaliser(def), signature).toBe(avant[signature]);
      }
      for (const [table, colonne] of famille.defauts) expect(await defaut(table, colonne)).toMatch(DEFAUT_PAR_LA_FONCTION);
    });

    it("une fonction DÉJÀ au jour de Paris par l'expression explicite est laissée telle quelle, sans échec ; le retour ne la touche pas", async () => {
      await remettreAvantAutrement(famille);
      const [signature, attendu] = famille.fonctions[0];
      await db.query((await definition(signature)).replace(/\bcurrent_date\b/gi, EXPLICITE));
      const explicite = await definition(signature);
      expect(nbExplicite(explicite)).toBe(attendu);
      await db.query(migration(famille));
      expect(await definition(signature)).toBe(explicite);
      // Les autres fonctions de la famille, elles, sont converties.
      for (const [autre, n] of famille.fonctions.slice(1)) expect(nbFonction(await definition(autre)), autre).toBe(n);
      await db.query(sansEnveloppe(retour(famille)));
      expect(await definition(signature)).toBe(explicite);
    });

    it("un défaut DÉJÀ au jour de Paris par l'expression explicite est laissé tel quel, par la migration comme par le retour", async () => {
      const [table, colonne] = famille.defauts[0];
      await db.query(`alter table public.${table} alter column ${colonne} set default ${EXPLICITE}`);
      const pose = await defaut(table, colonne);
      await db.query(migration(famille));
      expect(await defaut(table, colonne)).toBe(pose);
      await db.query(sansEnveloppe(retour(famille)));
      expect(await defaut(table, colonne)).toBe(pose);
    });

    it("un nombre d'occurrences inattendu l'arrête, en nommant la fonction, et ne laisse rien de changé", async () => {
      await remettreAvantAutrement(famille);
      const [signature, attendu] = famille.fonctions[0];
      await db.query((await definition(signature)).replace(/\bcurrent_date\b/i, "current_date + (current_date - current_date)"));
      const avant = await empreinte();
      const message = await echoue(migration(famille));
      expect(message).toContain(`${signature} contient ${attendu + 2} occurrence(s) de current_date et 0 du jour de Paris, au lieu de ${attendu}`);
      expect(message).toContain("rien n'est modifié");
      expect(await empreinte()).toEqual(avant);
    });

    it("un mélange des deux formes (conversion à moitié faite) l'arrête, en nommant la fonction", async () => {
      await remettreAvantAutrement(famille);
      const [signature, attendu] = famille.fonctions.find(([, n]) => n > 1) ?? famille.fonctions[0];
      await db.query((await definition(signature)).replace(/\bcurrent_date\b/i, "public.aujourdhui_paris()"));
      const message = await echoue(migration(famille));
      expect(message).toContain(`${signature} contient ${attendu - 1} occurrence(s) de current_date et 1 du jour de Paris`);
    });

    it("une fonction qui ne lit ni current_date ni le jour de Paris l'arrête", async () => {
      await remettreAvantAutrement(famille);
      const [signature] = famille.fonctions[0];
      await db.query((await definition(signature)).replace(/\bcurrent_date\b/gi, "now()::date"));
      expect(await echoue(migration(famille))).toContain(`${signature} ne lit ni current_date ni le jour de Paris : définition inattendue`);
    });

    it("une fonction absente l'arrête, avec son nom", async () => {
      const [signature] = famille.fonctions[famille.fonctions.length - 1];
      await db.query(`drop function ${signature} cascade`);
      expect(await echoue(migration(famille))).toContain(`la fonction ${signature} est absente de cette base`);
    });

    it("sans la fonction du jour de Paris, la migration s'arrête et dit laquelle appliquer d'abord", async () => {
      await db.query("drop function public.aujourdhui_paris() cascade");
      expect(await echoue(migration(famille))).toMatch(/public\.aujourdhui_paris\(\) est absente.*20261014500000/);
    });

    it.each(famille.defauts)("%s.%s : un défaut étranger arrête la migration au lieu d'être écrasé", async (table, colonne) => {
      await db.query(`alter table public.${table} alter column ${colonne} set default (now() at time zone 'UTC')::date`);
      const message = await echoue(migration(famille));
      expect(message).toContain(`le défaut de ${table}.${colonne} est`);
      expect(message).toContain("rien n'est modifié");
    });
  });

  describe("rapport de gestion préparé automatiquement (mois de la session → mois de Paris)", () => {
    const famille = FAMILLES[1];

    it("sur l'ancienne forme (autre mise en forme), la migration pose le mois de Paris, une fois", async () => {
      await remettreAvantAutrement(famille);
      expect((await definition(MOIS)).match(MOIS_SESSION) ?? []).toHaveLength(1);
      await db.query(migration(famille));
      const def = await definition(MOIS);
      expect(def.match(MOIS_SESSION) ?? []).toHaveLength(0);
      expect(def.match(MOIS_PARIS) ?? []).toHaveLength(1);
    });

    it("déjà au mois de Paris par l'expression explicite : laissée telle quelle", async () => {
      await remettreAvantAutrement(famille);
      await db.query((await definition(MOIS)).replace(MOIS_SESSION, "date_trunc('month', now() at time zone 'Europe/Paris')"));
      const explicite = await definition(MOIS);
      await db.query(migration(famille));
      expect(await definition(MOIS)).toBe(explicite);
    });

    it("deux expressions du mois de la session l'arrêtent, en nommant la fonction", async () => {
      await remettreAvantAutrement(famille);
      await db.query((await definition(MOIS)).replace(/declare n integer;/i, "declare n integer; z date := date_trunc('month',now());"));
      expect(await echoue(migration(famille))).toContain("preparer_rapports_automatiques() contient 2 expression(s) date_trunc('month', now())");
    });

    it("un current_date apparu dans la fonction l'arrête", async () => {
      await remettreAvantAutrement(famille);
      await db.query((await definition(MOIS)).replace(/declare n integer;/i, "declare n integer; z date := current_date;"));
      expect(await echoue(migration(famille))).toContain("preparer_rapports_automatiques() contient 1 occurrence(s) de current_date au lieu d'aucune");
    });
  });

  describe("retours arrière", () => {
    it.each(FAMILLES)("$version : le retour refuse de se jouer dans un lot (migrations.yml, begin;)", async (famille) => {
      expect(await echoue(retour(famille))).toMatch(/Retour arrière refusé : ce script gère sa propre transaction/);
    });

    it.each(FAMILLES)("$version : le retour rétablit current_date (nombre exact) et les défauts, puis se rejoue sans effet", async (famille) => {
      await db.query(sansEnveloppe(retour(famille)));
      for (const [signature, attendu] of famille.fonctions) {
        const def = await definition(signature);
        expect(nbFonction(def), signature).toBe(0);
        expect(nbSession(def), signature).toBe(attendu);
      }
      if (famille === FAMILLES[1]) {
        const mois = await definition(MOIS);
        expect(mois).toContain("date_trunc('month',now())");
        expect(mois).not.toContain("aujourdhui_paris");
      }
      for (const [table, colonne] of famille.defauts) expect((await defaut(table, colonne)).toLowerCase()).toBe("current_date");
      const unefois = await empreinte();
      await db.query(sansEnveloppe(retour(famille)));
      expect(await empreinte()).toEqual(unefois);
    });

    it("aller, retour, aller : l'état migré est retrouvé à l'identique ; le retour rend la logique d'avant", async () => {
      const migre = await empreinte();
      const normalisees = Object.fromEntries(await Promise.all(SIGNATURES.map(async (s) => [s, normaliser(await definition(s))])));
      for (const famille of [...FAMILLES].reverse()) await db.query(sansEnveloppe(retour(famille)));
      const defait = await empreinte();
      expect(defait).not.toEqual(migre);
      for (const signature of SIGNATURES) {
        const avant = normalisees[signature]
          .replace(/date_trunc\('month', <jour de paris>::timestamp\)/g, "date_trunc('month',now())")
          .replace(/<jour de paris>/g, "current_date");
        expect(normaliser(await definition(signature)), signature).toBe(avant);
      }
      for (const famille of FAMILLES) await db.query(migration(famille));
      expect(await empreinte()).toEqual(migre);
    });

    it("un retour n'écrase pas une fonction réécrite depuis : nombre d'occurrences inattendu, rien n'est modifié", async () => {
      for (const famille of FAMILLES) {
        const [signature, attendu] = famille.fonctions[0];
        await db.query((await definition(signature)).replace(/public\.aujourdhui_paris\(\)/, "public.aujourdhui_paris() + 0 * (public.aujourdhui_paris() - public.aujourdhui_paris())"));
        const avant = await empreinte();
        const message = await echoue(sansEnveloppe(retour(famille)));
        expect(message).toContain(`${signature} cite aujourdhui_paris() ${attendu + 2} fois au lieu de ${attendu}`);
        expect(message).toContain("rien n'est modifié");
        expect(await empreinte()).toEqual(avant);
      }
    });

    it("le retour du rapport automatique n'écrase pas une fonction qui cite autrement le jour de Paris", async () => {
      await db.query((await definition(MOIS)).replace(/declare n integer;/i, "declare n integer; z date := public.aujourdhui_paris();"));
      const message = await echoue(sansEnveloppe(retour(FAMILLES[1])));
      expect(message).toContain("preparer_rapports_automatiques() cite aujourdhui_paris() 2 fois, dont 1 sous la forme posée par la migration");
    });

    it("tant que ce lot s'en sert, le retour de la fonction du jour de Paris (20261014500000) refuse et nomme ses fonctions", async () => {
      const message = await echoue(sansEnveloppe(RETOUR_FONCTION_DU_JOUR));
      expect(message).toMatch(/Retour arrière refusé : ces fonctions citent encore public\.aujourdhui_paris\(\)/);
      for (const signature of ["encaisser_depot(", "contre_ecriture(uuid,text)", "reviser_loyer(", "terme_bail(uuid,date)", "preparer_rapports_automatiques()"])
        expect(message).toContain(signature);
    });

    it("la chaîne « Ordre complet » du LISEZ-MOI, jouée telle qu'écrite, défait tout : le retour de 20261014500000 passe ensuite", async () => {
      for (const code of chaineDuLisezMoi()) {
        const fichier = parCode(code);
        expect(fichier, `${code} : absent du manifeste`).toBeDefined();
        await db.query(sansEnveloppe(readFileSync(`supabase/retours-arriere/${fichier!.replace(/\.sql$/, ".retour.sql")}`, "utf8")));
      }
      // Joué hors de `echoue` (qui annule même un succès) : un refus fait échouer le test avec le message du retour.
      await db.query(sansEnveloppe(RETOUR_FONCTION_DU_JOUR));
      expect((await db.query("select to_regprocedure('public.aujourdhui_paris()') is null as retiree")).rows[0].retiree).toBe(true);
    });

    it("un retour retire aussi la ligne d'historique de sa migration (migrations.yml pourra la rejouer)", async () => {
      await db.query("create schema if not exists supabase_migrations");
      await db.query("create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[])");
      for (const famille of FAMILLES)
        await db.query("insert into supabase_migrations.schema_migrations (version, name) values ($1,$2) on conflict do nothing", [famille.version, famille.fichier]);
      await db.query(sansEnveloppe(retour(FAMILLES[1])));
      const { rows } = await db.query("select version from supabase_migrations.schema_migrations where version = any($1::text[]) order by 1", [
        FAMILLES.map((f) => f.version),
      ]);
      expect(rows.map((r) => r.version)).toEqual([FAMILLES[0].version]);
    });
  });

  describe("manifeste et procédure", () => {
    const lignes = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    it.each(FAMILLES)("$version est au manifeste une seule fois, dans la plage du lot, après la fonction du jour de Paris", (famille) => {
      const nom = `${famille.version}_${famille.fichier}.sql`;
      expect(lignes.filter((l) => l === nom)).toHaveLength(1);
      expect(lignes.indexOf(nom)).toBeGreaterThan(lignes.indexOf("20261014500000_jour_de_paris_fonction.sql"));
      expect(Number(famille.version)).toBeGreaterThanOrEqual(20261014820000);
      expect(Number(famille.version)).toBeLessThanOrEqual(20261014829999);
    });

    it("l'ordre complet des retours nomme, avant 500000, chaque migration postérieure qui cite la fonction du jour, dans l'ordre inverse du manifeste", () => {
      const chaine = chaineDuLisezMoi();
      // Chaque code désigne une migration du manifeste postérieure à la fonction du jour, et qui a son retour.
      const positions = chaine.map((code) => {
        const fichier = parCode(code);
        expect(fichier, `${code} : absent du manifeste`).toBeDefined();
        expect(existsSync(`supabase/retours-arriere/${fichier!.replace(/\.sql$/, ".retour.sql")}`), `${code} : sans retour`).toBe(true);
        return MANIFESTE.indexOf(fichier!);
      });
      expect(Math.min(...positions)).toBeGreaterThan(MANIFESTE.indexOf(FICHIER_FONCTION_DU_JOUR));
      expect(positions, "ordre inverse du manifeste").toEqual([...positions].sort((a, b) => b - a));
      // Aucune migration qui cite la fonction du jour n'est oubliée : son retour doit précéder celui de 500000.
      const absentes = MIGRATIONS_QUI_CITENT_LE_JOUR.filter((m) => !chaine.some((code) => m.startsWith(`20261014${code}_`)));
      expect(absentes).toEqual([]);
    });

    it.each(FAMILLES)("$version a son retour arrière, déclaré dans le LISEZ-MOI du dossier", (famille) => {
      const script = retour(famille);
      expect(script).toMatch(/^-- RETOUR ARRIÈRE de /);
      expect(script).toMatch(/\bcommit;\s*$/m);
      expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`${famille.version}_${famille.fichier}.retour.sql`);
    });
  });
});
