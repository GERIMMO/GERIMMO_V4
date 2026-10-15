/**
 * Lot « fuseau-paris » : les cinq migrations (20261014500000 à 20261014504000) et leurs retours arrière.
 *
 * Ce que ce fichier garde, et pourquoi.
 *  - REJEU. Chaque migration se rejoue sans effet (définitions, droits, valeurs par défaut identiques), deux fois de suite.
 *  - FORME DE PRODUCTION (leçon du 15/10). La définition d'une fonction en production a la même LOGIQUE que celle que rejoue
 *    le banc, pas toujours la même mise en forme (trois fonctions d'alertes avaient leur contrôle d'accès sur une seule ligne,
 *    le dépôt l'avait sur plusieurs : une migration à ancre de plusieurs lignes avait échoué en simulation). Les migrations
 *    du lot n'ont aucune ancre : elles remplacent le mot `current_date` et comptent ses occurrences. On le prouve en
 *    remettant chaque fonction dans une forme DIFFÉRENTE (mot en capitales, indentation retirée) avant de rejouer.
 *  - DÉFINITION INATTENDUE. Un nombre d'occurrences différent, une fonction qui ne lit rien, une valeur par défaut étrangère, la
 *    fonction du jour de Paris absente : la migration s'arrête avec un message qui dit quoi et où, et ne laisse rien de changé.
 *  - RETOURS. Chaque retour remet `current_date` à sa place (nombre exact vérifié), se rejoue sans effet, refuse de se jouer
 *    dans un lot, et celui de la fonction elle-même refuse tant qu'un objet s'en sert. Aller, retour, aller : même état.
 *    (L'égalité avec l'état d'AVANT les migrations, empreinte md5 à l'appui, a été mesurée sur une base de banc reconstruite sans elles.)
 *
 * Ce fichier tient des verrous de table (changement de valeur par défaut) jusqu'à la fin de chaque essai : il tourne en série
 * (FICHIERS_EN_SERIE de vitest.config.ts). La base visée est déjà migrée ; tout est joué dans une transaction annulée à la fin.
 */
import { readFileSync } from "node:fs";
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
    nom: "état des loyers, alertes et relances d'impayés",
    version: "20261014501000",
    fichier: "jour_de_paris_etat_loyers_et_impayes",
    fonctions: [
      ["public.etat_loyers_bail_brut(uuid)", 1],
      ["public.suivre_impayes_bail(uuid)", 1],
      ["public.relances_loyer_dues(integer)", 6],
      ["public.relance_loyer_consigner(uuid,text,text)", 2],
      ["public.actualiser_orchestration()", 2],
      ["public.collecter_source_direction(text)", 7],
    ],
    defauts: [["relances", "date_envoi"]],
  },
  {
    nom: "fiche du lot et contrats du lot",
    version: "20261014502000",
    fichier: "jour_de_paris_lot_et_contrats",
    fonctions: [
      ["public.contrats_du_lot(uuid)", 2],
      ["public.fiche_lot(uuid)", 2],
      ["public.historique_du_lot(uuid,integer)", 2],
    ],
    defauts: [],
  },
  {
    nom: "appels de loyer et quittances",
    version: "20261014503000",
    fichier: "jour_de_paris_appels_et_quittances",
    fonctions: [
      ["public.generer_appels_loyer_interne(uuid)", 2],
      ["public.cycle_mensuel_interne()", 1],
      ["public.resynchroniser_quittances(uuid)", 2],
      ["public.quittances_a_envoyer(integer)", 1],
      ["public.appels_a_envoyer(integer)", 1],
    ],
    defauts: [["quittances", "date_emission"]],
  },
  {
    nom: "encaissements",
    version: "20261014504000",
    fichier: "jour_de_paris_encaissements",
    fonctions: [["public.contre_passer_encaissement()", 2]],
    defauts: [["encaissements", "date_paiement"]],
  },
];
const FONCTION_DU_JOUR = { version: "20261014500000", fichier: "jour_de_paris_fonction" };

const migration = (v: string, f: string) => readFileSync(`supabase/migrations/${v}_${f}.sql`, "utf8");
const retour = (v: string, f: string) => readFileSync(`supabase/retours-arriere/${v}_${f}.retour.sql`, "utf8");
const MIGRATIONS = [
  migration(FONCTION_DU_JOUR.version, FONCTION_DU_JOUR.fichier),
  ...FAMILLES.map((f) => migration(f.version, f.fichier)),
];

/** Le script de retour gère sa propre transaction et refuse de se jouer dans un lot : on lui retire cette enveloppe seule. */
function sansEnveloppe(script: string): string {
  return script
    .replace(/do \$retour_arriere\$\s*begin\s*if statement_timestamp\(\) <> transaction_timestamp\(\)[\s\S]*?end \$retour_arriere\$;/, "")
    .replace(/^begin;$/m, "")
    .replace(/^commit;$/m, "");
}

const TOUTES = [FONCTION_DU_JOUR.fichier, ...FAMILLES.map((f) => f.fichier)];
const SIGNATURES = FAMILLES.flatMap((f) => f.fonctions.map(([s]) => s));
const DEFAUTS = FAMILLES.flatMap((f) => f.defauts);

describe.skipIf(!DB_URL)("jour de Paris — migrations et retours arrière", () => {
  let db: Client;

  /** Tout ce que le lot peut changer : définitions, droits, valeurs par défaut, présence de la fonction du jour de Paris. */
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
    for (const [table, colonne] of DEFAUTS) {
      const { rows } = await db.query(
        `select coalesce((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
                           where d.adrelid = $1::regclass and a.attname = $2), '-') as v`,
        [`public.${table}`, colonne]
      );
      etat[`défaut ${table}.${colonne}`] = rows[0].v;
    }
    return etat;
  }

  const definition = async (signature: string) =>
    (await db.query<{ def: string }>("select pg_get_functiondef($1::text::regprocedure) as def", [signature])).rows[0].def;
  const nbJourDeSession = (def: string) => (def.match(/\bcurrent_date\b/gi) ?? []).length;
  const nbJourDeParis = (def: string) => (def.match(/public\.aujourdhui_paris\(\)/g) ?? []).length;
  const normaliser = (def: string) => def.replace(/\s+/g, " ").toLowerCase().trim();
  const defaut = async (table: string, colonne: string) =>
    (
      await db.query<{ v: string }>(
        `select pg_get_expr(d.adbin, d.adrelid) as v from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
          where d.adrelid = $1::regclass and a.attname = $2`,
        [`public.${table}`, colonne]
      )
    ).rows[0].v;

  /** Remet toute la famille dans son état d'AVANT, mais sous une AUTRE forme (capitales, indentation retirée). */
  async function remettreAvantAutrement(famille: Famille) {
    for (const [signature] of famille.fonctions) {
      const def = await definition(signature);
      await db.query(def.replace(/public\.aujourdhui_paris\(\)/g, "CURRENT_DATE").replace(/\n[ \t]+/g, "\n"));
    }
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
    it("chaque objet du lot est au jour de Paris, et la fonction du jour de Paris existe", async () => {
      for (const signature of SIGNATURES) {
        const def = await definition(signature);
        expect(nbJourDeSession(def), signature).toBe(0);
        expect(nbJourDeParis(def), signature).toBeGreaterThan(0);
      }
      for (const [table, colonne] of DEFAUTS) expect(await defaut(table, colonne)).toMatch(/^(public\.)?aujourdhui_paris\(\)$/);
    });

    it("le nombre d'occurrences remplacées est celui que les migrations annoncent", async () => {
      for (const famille of FAMILLES)
        for (const [signature, attendu] of famille.fonctions) expect(nbJourDeParis(await definition(signature)), signature).toBe(attendu);
    });
  });

  describe("rejeu", () => {
    it("chaque migration, rejouée sur une base déjà migrée, ne change rien (deux fois de suite)", async () => {
      const avant = await empreinte();
      for (const sql of MIGRATIONS) {
        await db.query(sql);
        expect(await empreinte()).toEqual(avant);
        await db.query(sql);
        expect(await empreinte()).toEqual(avant);
      }
    });

    it("les droits de la fonction du jour de Paris : jamais anon, ouverte aux comptes connectés et à la tâche planifiée", async () => {
      await db.query(MIGRATIONS[0]);
      const { rows } = await db.query(
        `select has_function_privilege('anon', 'public.aujourdhui_paris()', 'EXECUTE') as anon,
                has_function_privilege('authenticated', 'public.aujourdhui_paris()', 'EXECUTE') as connecte,
                has_function_privilege('service_role', 'public.aujourdhui_paris()', 'EXECUTE') as service`
      );
      expect(rows[0]).toEqual({ anon: false, connecte: true, service: true });
    });
  });

  describe.each(FAMILLES)("$nom — forme de production", (famille) => {
    it("sur des définitions d'une AUTRE mise en forme (capitales, indentation retirée), la migration les ramène au jour de Paris", async () => {
      const avant = Object.fromEntries(await Promise.all(famille.fonctions.map(async ([s]) => [s, normaliser(await definition(s))])));
      await remettreAvantAutrement(famille);
      for (const [signature, attendu] of famille.fonctions) {
        const def = await definition(signature);
        expect(nbJourDeSession(def), `${signature} (avant)`).toBe(attendu);
        expect(nbJourDeParis(def)).toBe(0);
      }
      await db.query(migration(famille.version, famille.fichier));
      for (const [signature, attendu] of famille.fonctions) {
        const def = await definition(signature);
        expect(nbJourDeSession(def), signature).toBe(0);
        expect(nbJourDeParis(def), signature).toBe(attendu);
        // La logique est celle d'origine : seul le mot a changé, mots et ordre des mots identiques à l'espace près.
        expect(normaliser(def), signature).toBe(avant[signature]);
      }
      for (const [table, colonne] of famille.defauts) expect(await defaut(table, colonne)).toMatch(/^(public\.)?aujourdhui_paris\(\)$/);
    });

    it("un nombre d'occurrences inattendu l'arrête, en nommant la fonction, et ne laisse rien de changé", async () => {
      await remettreAvantAutrement(famille);
      const [signature, attendu] = famille.fonctions[0];
      const def = await definition(signature);
      // Une occurrence de plus que prévu : la définition n'est plus celle qu'on a relue.
      await db.query(def.replace(/\bcurrent_date\b/i, "current_date + (current_date - current_date)"));
      const avant = await empreinte();
      const message = await echoue(migration(famille.version, famille.fichier));
      expect(message).toMatch(new RegExp(`${signature.replace(/[()]/g, "\\$&")} contient ${attendu + 2} occurrence\\(s\\) de current_date au lieu de ${attendu}`));
      expect(message).toMatch(/définition inattendue, rien n'est modifié/);
      expect(await empreinte()).toEqual(avant);
    });

    it("une fonction qui ne lit plus ni current_date ni le jour de Paris l'arrête", async () => {
      await remettreAvantAutrement(famille);
      const [signature] = famille.fonctions[0];
      const def = await definition(signature);
      await db.query(def.replace(/\bcurrent_date\b/gi, "now()::date"));
      const message = await echoue(migration(famille.version, famille.fichier));
      expect(message).toMatch(/ne lit ni current_date ni aujourdhui_paris\(\) : définition inattendue/);
    });

    it("une fonction absente l'arrête, avec son nom", async () => {
      const [signature] = famille.fonctions[famille.fonctions.length - 1];
      await db.query("drop function " + signature + " cascade");
      const message = await echoue(migration(famille.version, famille.fichier));
      expect(message).toContain(`la fonction ${signature} est absente de cette base`);
    });

    it("sans la fonction du jour de Paris, la migration s'arrête et dit laquelle appliquer d'abord", async () => {
      await db.query("drop function public.aujourdhui_paris() cascade");
      const message = await echoue(migration(famille.version, famille.fichier));
      expect(message).toMatch(/public\.aujourdhui_paris\(\) est absente.*20261014500000/);
    });
  });

  describe("valeurs par défaut", () => {
    it.each(DEFAUTS)("%s.%s : un défaut étranger arrête la migration au lieu d'être écrasé", async (table, colonne) => {
      const famille = FAMILLES.find((f) => f.defauts.some(([t, c]) => t === table && c === colonne))!;
      await db.query(`alter table public.${table} alter column ${colonne} set default (now() at time zone 'UTC')::date`);
      const message = await echoue(migration(famille.version, famille.fichier));
      expect(message).toContain(`le défaut de ${table}.${colonne} est`);
      expect(message).toContain("rien n'est modifié");
    });

    it.each(DEFAUTS)("%s.%s : un défaut resté à CURRENT_DATE passe au jour de Paris", async (table, colonne) => {
      const famille = FAMILLES.find((f) => f.defauts.some(([t, c]) => t === table && c === colonne))!;
      await db.query(`alter table public.${table} alter column ${colonne} set default current_date`);
      await db.query(migration(famille.version, famille.fichier));
      expect(await defaut(table, colonne)).toMatch(/^(public\.)?aujourdhui_paris\(\)$/);
    });
  });

  describe("retours arrière", () => {
    /** Joue les retours dans l'ordre recommandé : encaissements, appels, lot, état, puis la fonction elle-même. */
    async function toutDefaire() {
      for (const famille of [...FAMILLES].reverse()) await db.query(sansEnveloppe(retour(famille.version, famille.fichier)));
      await db.query(sansEnveloppe(retour(FONCTION_DU_JOUR.version, FONCTION_DU_JOUR.fichier)));
    }

    it("aucun retour ne peut se jouer dans un lot (migrations.yml, begin;) : la garde l'interdit", async () => {
      for (const fichier of TOUTES) {
        const version = fichier === FONCTION_DU_JOUR.fichier ? FONCTION_DU_JOUR.version : FAMILLES.find((f) => f.fichier === fichier)!.version;
        const message = await echoue(retour(version, fichier));
        expect(message, fichier).toMatch(/Retour arrière refusé : ce script gère sa propre transaction/);
      }
    });

    it("chaque retour rétablit current_date (nombre exact), les défauts, et se rejoue sans effet", async () => {
      for (const famille of [...FAMILLES].reverse()) {
        await db.query(sansEnveloppe(retour(famille.version, famille.fichier)));
        for (const [signature, attendu] of famille.fonctions) {
          const def = await definition(signature);
          expect(nbJourDeParis(def), signature).toBe(0);
          expect(nbJourDeSession(def), signature).toBe(attendu);
        }
        for (const [table, colonne] of famille.defauts) expect((await defaut(table, colonne)).toLowerCase()).toBe("current_date");
        const unefois = await empreinte();
        await db.query(sansEnveloppe(retour(famille.version, famille.fichier)));
        expect(await empreinte()).toEqual(unefois);
      }
    });

    it("tout défaire retire la fonction du jour de Paris ; tout refaire redonne EXACTEMENT l'état migré (aller, retour, aller)", async () => {
      const migre = await empreinte();
      await toutDefaire();
      const defait = await empreinte();
      expect(defait["fonction public.aujourdhui_paris()"].startsWith("absente")).toBe(true);
      expect(defait).not.toEqual(migre);
      for (const sql of MIGRATIONS) await db.query(sql);
      expect(await empreinte()).toEqual(migre);
    });

    it("la fonction du jour de Paris se retire en dernier : tant qu'un objet s'en sert, le retour refuse et les nomme", async () => {
      const message = await echoue(sansEnveloppe(retour(FONCTION_DU_JOUR.version, FONCTION_DU_JOUR.fichier)));
      expect(message).toMatch(/Retour arrière refusé : ces fonctions citent encore public\.aujourdhui_paris\(\)/);
      for (const signature of ["etat_loyers_bail_brut(uuid)", "fiche_lot(uuid)", "resynchroniser_quittances(uuid)", "contre_passer_encaissement()"])
        expect(message).toContain(signature);
    });

    it("même sans fonction qui la cite, une valeur par défaut qui s'en sert fait refuser le retour, en la nommant", async () => {
      for (const famille of [...FAMILLES].reverse()) await db.query(sansEnveloppe(retour(famille.version, famille.fichier)));
      await db.query("alter table public.encaissements alter column date_paiement set default public.aujourdhui_paris()");
      const message = await echoue(sansEnveloppe(retour(FONCTION_DU_JOUR.version, FONCTION_DU_JOUR.fichier)));
      expect(message).toMatch(/Retour arrière refusé : public\.aujourdhui_paris\(\) sert encore à : .*encaissements\.date_paiement/);
    });

    it("le retour de la fonction est rejouable : déjà retirée, ce n'est pas une erreur", async () => {
      await toutDefaire();
      await db.query(sansEnveloppe(retour(FONCTION_DU_JOUR.version, FONCTION_DU_JOUR.fichier)));
      expect((await empreinte())["fonction public.aujourdhui_paris()"].startsWith("absente")).toBe(true);
    });

    it("un retour n'écrase pas une fonction réécrite depuis : nombre d'occurrences inattendu, rien n'est modifié", async () => {
      const famille = FAMILLES[0];
      const [signature, attendu] = famille.fonctions[0];
      const def = await definition(signature);
      const reecrite = def.replace(/public\.aujourdhui_paris\(\)/, "public.aujourdhui_paris() + 0 * (public.aujourdhui_paris() - public.aujourdhui_paris())");
      await db.query(reecrite);
      const avant = await empreinte();
      const message = await echoue(sansEnveloppe(retour(famille.version, famille.fichier)));
      expect(message).toContain(`cite aujourdhui_paris() ${attendu + 2} fois au lieu de ${attendu}`);
      expect(message).toContain("rien n'est modifié");
      expect(await empreinte()).toEqual(avant);
    });

    it("un retour retire aussi la ligne d'historique de sa migration (migrations.yml pourra la rejouer)", async () => {
      await db.query("create schema if not exists supabase_migrations");
      await db.query(
        "create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[])"
      );
      for (const famille of FAMILLES)
        await db.query("insert into supabase_migrations.schema_migrations (version, name) values ($1,$2) on conflict do nothing", [famille.version, famille.fichier]);
      const famille = FAMILLES[3];
      await db.query(sansEnveloppe(retour(famille.version, famille.fichier)));
      const { rows } = await db.query("select version from supabase_migrations.schema_migrations where version = any($1::text[]) order by 1", [
        FAMILLES.map((f) => f.version),
      ]);
      expect(rows.map((r) => r.version)).toEqual(FAMILLES.slice(0, 3).map((f) => f.version));
    });
  });
});
