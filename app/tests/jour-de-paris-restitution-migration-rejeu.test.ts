/**
 * Restitution du dépôt au jour de Paris (migration 20261014851000, décision du 15/10, point 1, complétée le 16/10) : la
 * migration et son retour arrière. Même méthode que tests/jour-de-paris-suite-migrations-rejeu.test.ts (lot « fuseau-suite ») :
 *  - REJEU sans effet (définitions et droits identiques), deux fois de suite ;
 *  - FORME DE PRODUCTION : aucune ancre de plusieurs lignes ; on remet chaque fonction dans sa forme d'AVANT sous une AUTRE mise
 *    en forme (mot en capitales, indentation retirée) avant de rejouer : la logique obtenue est la même ;
 *  - FORME DÉJÀ CONVERTIE : une fonction déjà au jour de Paris par l'expression explicite est laissée telle quelle ; son retour
 *    ne la touche pas non plus ;
 *  - DÉFINITION INATTENDUE : autre nombre, mélange des deux formes, ni l'un ni l'autre, fonction absente, fonction du jour de
 *    Paris absente : la migration s'arrête avec un message qui nomme l'objet, et ne laisse rien de changé ;
 *  - RETOUR : `current_date` remis à sa place (nombre exact), rejeu sans effet, refus dans un lot, aucune fonction réécrite
 *    écrasée ; aller, retour, aller : même état ; le retour de la fonction du jour de Paris refuse tant que ce lot s'en sert ;
 *  - INVENTAIRE : plus aucune fonction qui écrit sur la restitution du dépôt ou dans le journal comptable ne lit le jour de la
 *    session, hors objets classés (avec leur raison).
 *
 * Le rejeu supprime puis recrée des fonctions (essai « fonction absente », « fonction du jour absente ») dans la transaction de
 * l'essai : ce fichier tourne dans le groupe « serie » de vitest.config.ts. La base visée est déjà migrée ; tout est annulé.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const VERSION = "20261014851000";
const FICHIER = `${VERSION}_jour_de_paris_restitution_depot`;
/** signature, nombre exact de `current_date` remplacés */
const FONCTIONS: [string, number][] = [
  ["public.finaliser_decompte(uuid)", 5],
  ["public.marquer_decompte_envoye(uuid,date)", 2],
];
const SIGNATURES = FONCTIONS.map(([s]) => s);

const migration = () => readFileSync(`supabase/migrations/${FICHIER}.sql`, "utf8");
const retour = () => readFileSync(`supabase/retours-arriere/${FICHIER}.retour.sql`, "utf8");
const RETOUR_FONCTION_DU_JOUR = readFileSync("supabase/retours-arriere/20261014500000_jour_de_paris_fonction.retour.sql", "utf8");

/** Le script de retour gère sa propre transaction et refuse de se jouer dans un lot : on lui retire cette enveloppe seule. */
const sansEnveloppe = (script: string) =>
  script
    .replace(/do \$retour_arriere\$\s*begin\s*if statement_timestamp\(\) <> transaction_timestamp\(\)[\s\S]*?end \$retour_arriere\$;/, "")
    .replace(/^begin;$/m, "")
    .replace(/^commit;$/m, "");

const PAR_LA_FONCTION = /(\bpublic\.)?\baujourdhui_paris\(\)/g;
const EXPLICITE = "(now() at time zone 'Europe/Paris')::date";
const PAR_L_EXPRESSION = /\(\s*now\(\)\s+at\s+time\s+zone\s+'Europe\/Paris'(::text)?\s*\)\)?\s*::\s*date/gi;

describe.skipIf(!DB_URL)("restitution du dépôt au jour de Paris — migration et retour arrière", () => {
  let db: Client;

  async function empreinte(): Promise<Record<string, string>> {
    const etat: Record<string, string> = {};
    for (const signature of ["public.aujourdhui_paris()", ...SIGNATURES]) {
      const { rows } = await db.query(
        `select coalesce(md5(pg_get_functiondef(to_regprocedure($1))), 'absente') || ' ' ||
                coalesce((select p.proacl::text from pg_proc p where p.oid = to_regprocedure($1)), '-') as v`,
        [signature]
      );
      etat[signature] = rows[0].v;
    }
    return etat;
  }
  const definition = async (signature: string) =>
    (await db.query<{ def: string }>("select pg_get_functiondef($1::text::regprocedure) as def", [signature])).rows[0].def;
  const nbSession = (def: string) => (def.match(/\bcurrent_date\b/gi) ?? []).length;
  const nbFonction = (def: string) => (def.match(PAR_LA_FONCTION) ?? []).length;
  const nbExplicite = (def: string) => (def.match(PAR_L_EXPRESSION) ?? []).length;
  const normaliser = (def: string) =>
    def
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim()
      .replace(/(public\.)?aujourdhui_paris\(\)/g, "<jour de paris>");
  /** La définition d'AVANT la migration, sous une AUTRE forme (capitales, indentation retirée). */
  const versLOrigine = (def: string) => def.replace(PAR_LA_FONCTION, "CURRENT_DATE").replace(/\n[ \t]+/g, "\n");
  async function remettreAvantAutrement() {
    for (const signature of SIGNATURES) await db.query(versLOrigine(await definition(signature)));
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
    it("chaque fonction du lot lit le jour de Paris, en nombre exact, et plus jamais le jour de la session", async () => {
      for (const [signature, attendu] of FONCTIONS) {
        const def = await definition(signature);
        expect(nbSession(def), signature).toBe(0);
        expect(nbFonction(def), signature).toBe(attendu);
      }
      // La valeur par défaut de la date d'envoi est le jour de Paris.
      expect(await definition("public.marquer_decompte_envoye(uuid,date)")).toMatch(/p_date date DEFAULT (public\.)?aujourdhui_paris\(\)/);
    });

    it("les droits sont ceux d'avant : aucune fonction ouverte à anon, appelables par un compte connecté (le contrôle d'accès est dedans)", async () => {
      const { rows } = await db.query<{ signature: string; anon: boolean; connecte: boolean }>(
        `select s as signature, has_function_privilege('anon', s, 'EXECUTE') as anon, has_function_privilege('authenticated', s, 'EXECUTE') as connecte
           from unnest($1::text[]) s`,
        [SIGNATURES]
      );
      for (const r of rows) expect(r, r.signature).toEqual({ signature: r.signature, anon: false, connecte: true });
    });

    it("inventaire : plus aucune fonction qui écrit sur la restitution du dépôt ou dans le journal comptable ne lit le jour de la session", async () => {
      // Écrire = insérer ou mettre à jour une restitution, une retenue, une écriture du journal, un dépôt, un mouvement de mandant ou une
      // clôture. Les fonctions qui ne font que LIRE la restitution (alertes de délai, pilotage) sont classées ici avec leur raison : elles
      // n'écrivent aucune date du jour sur la restitution ni dans le journal (question laissée au dirigeant).
      const { rows } = await db.query<{ nom: string }>(
        `select distinct p.proname as nom from pg_proc p
          where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p')
            and pg_get_functiondef(p.oid) ~* '(\\m(current_date|localtimestamp|localtime)\\M|now\\(\\)\\s*::\\s*date|\\(\\s*now\\(\\)\\s*\\)\\s*::\\s*date|current_timestamp\\s*::\\s*date)'
            and pg_get_functiondef(p.oid) ~* '(insert\\s+into|update)\\s+public\\.(restitutions|retenues|ecritures|depot_encaissements|mouvements_mandants|clotures_comptables)\\M'
          order by 1`
      );
      expect(rows.map((r) => r.nom)).toEqual([]);
      const HORS_DECISION = new Map<string, string>([
        ["generer_alertes_restitution", "seuil J-7 / J+0 de l'alerte du délai légal : compare au jour, n'écrit aucune date du jour"],
        ["rafraichir_alerte_restitution", "même seuil, à la correction d'une restitution en cours : n'écrit aucune date du jour"],
        ["actualiser_orchestration_socle", "priorité d'un dossier de pilotage (restitutions et devis) : n'écrit aucune date du jour"],
      ]);
      const { rows: lecteurs } = await db.query<{ nom: string }>(
        `select distinct p.proname as nom from pg_proc p
          where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p')
            and pg_get_functiondef(p.oid) ~* '\\mcurrent_date\\M' and pg_get_functiondef(p.oid) ~* 'public\\.restitutions\\M'
          order by 1`
      );
      expect(lecteurs.map((r) => r.nom).filter((nom) => !HORS_DECISION.has(nom))).toEqual([]);
    });
  });

  describe("migration", () => {
    it("rejouée sur une base déjà migrée, elle ne change rien (deux fois de suite)", async () => {
      const avant = await empreinte();
      await db.query(migration());
      expect(await empreinte()).toEqual(avant);
      await db.query(migration());
      expect(await empreinte()).toEqual(avant);
    });

    it("sur des définitions d'une AUTRE mise en forme (capitales, indentation retirée), elle les ramène au jour de Paris, logique inchangée", async () => {
      const avant = Object.fromEntries(await Promise.all(SIGNATURES.map(async (s) => [s, normaliser(await definition(s))])));
      await remettreAvantAutrement();
      for (const [signature, attendu] of FONCTIONS) {
        const def = await definition(signature);
        expect(nbSession(def), `${signature} (avant)`).toBe(attendu);
        expect(nbFonction(def), `${signature} (avant)`).toBe(0);
      }
      await db.query(migration());
      for (const [signature, attendu] of FONCTIONS) {
        const def = await definition(signature);
        expect(nbSession(def), signature).toBe(0);
        expect(nbFonction(def), signature).toBe(attendu);
        expect(normaliser(def), signature).toBe(avant[signature]);
      }
    });

    it.each(FONCTIONS)("%s DÉJÀ au jour de Paris par l'expression explicite : laissée telle quelle, sans échec ; le retour ne la touche pas", async (signature, attendu) => {
      await remettreAvantAutrement();
      await db.query((await definition(signature)).replace(/\bcurrent_date\b/gi, EXPLICITE));
      const explicite = await definition(signature);
      expect(nbExplicite(explicite)).toBe(attendu);
      await db.query(migration());
      expect(await definition(signature)).toBe(explicite);
      for (const [autre, n] of FONCTIONS.filter(([s]) => s !== signature)) expect(nbFonction(await definition(autre)), autre).toBe(n);
      await db.query(sansEnveloppe(retour()));
      expect(await definition(signature)).toBe(explicite);
    });

    it.each(FONCTIONS)("%s : un nombre d'occurrences inattendu l'arrête, en nommant la fonction, et ne laisse rien de changé", async (signature, attendu) => {
      await remettreAvantAutrement();
      await db.query((await definition(signature)).replace(/\bcurrent_date\b/i, "current_date + (current_date - current_date)"));
      const avant = await empreinte();
      const message = await echoue(migration());
      expect(message).toContain(`${signature} contient ${attendu + 2} occurrence(s) de current_date et 0 du jour de Paris, au lieu de ${attendu}`);
      expect(message).toContain("rien n'est modifié");
      expect(await empreinte()).toEqual(avant);
    });

    it("un mélange des deux formes (conversion à moitié faite) l'arrête, en nommant la fonction", async () => {
      await remettreAvantAutrement();
      const [signature, attendu] = FONCTIONS[0];
      await db.query((await definition(signature)).replace(/\bcurrent_date\b/i, "public.aujourdhui_paris()"));
      expect(await echoue(migration())).toContain(`${signature} contient ${attendu - 1} occurrence(s) de current_date et 1 du jour de Paris`);
    });

    it("une fonction qui ne lit ni current_date ni le jour de Paris l'arrête", async () => {
      await remettreAvantAutrement();
      const [signature] = FONCTIONS[1];
      await db.query((await definition(signature)).replace(/\bcurrent_date\b/gi, "now()::date"));
      expect(await echoue(migration())).toContain(`${signature} ne lit ni current_date ni le jour de Paris : définition inattendue`);
    });

    it("une fonction absente l'arrête, avec son nom", async () => {
      const [signature] = FONCTIONS[1];
      await db.query(`drop function ${signature}`);
      expect(await echoue(migration())).toContain(`la fonction ${signature} est absente de cette base`);
    });

    it("sans la fonction du jour de Paris, elle s'arrête et dit laquelle appliquer d'abord", async () => {
      await db.query("drop function public.aujourdhui_paris() cascade");
      expect(await echoue(migration())).toMatch(/public\.aujourdhui_paris\(\) est absente.*20261014500000/);
    });

    it("elle ne réécrit aucune donnée : restitutions et écritures existantes gardent leurs dates", () => {
      const code = migration().replace(/--.*$/gm, "");
      expect(code).not.toMatch(/\b(update|insert\s+into|delete\s+from)\s+public\./i);
      expect(code.trimEnd().endsWith("select public.fermer_fonctions_a_anon();")).toBe(true);
    });
  });

  describe("retour arrière", () => {
    it("il refuse de se jouer dans un lot (migrations.yml, begin;)", async () => {
      expect(await echoue(retour())).toMatch(/Retour arrière refusé : ce script gère sa propre transaction/);
    });

    it("il rétablit current_date (nombre exact), puis se rejoue sans effet", async () => {
      await db.query(sansEnveloppe(retour()));
      for (const [signature, attendu] of FONCTIONS) {
        const def = await definition(signature);
        expect(nbFonction(def), signature).toBe(0);
        expect(nbSession(def), signature).toBe(attendu);
      }
      const unefois = await empreinte();
      await db.query(sansEnveloppe(retour()));
      expect(await empreinte()).toEqual(unefois);
    });

    it("aller, retour, aller : l'état migré est retrouvé à l'identique ; le retour rend la logique d'avant", async () => {
      const migre = await empreinte();
      const normalisees = Object.fromEntries(await Promise.all(SIGNATURES.map(async (s) => [s, normaliser(await definition(s))])));
      await db.query(sansEnveloppe(retour()));
      expect(await empreinte()).not.toEqual(migre);
      for (const signature of SIGNATURES) expect(normaliser(await definition(signature)), signature).toBe(normalisees[signature].replace(/<jour de paris>/g, "current_date"));
      await db.query(migration());
      expect(await empreinte()).toEqual(migre);
    });

    it("il n'écrase pas une fonction réécrite depuis : nombre d'occurrences inattendu, rien n'est modifié", async () => {
      const [signature, attendu] = FONCTIONS[0];
      await db.query((await definition(signature)).replace(/public\.aujourdhui_paris\(\)/, "public.aujourdhui_paris() + 0 * (public.aujourdhui_paris() - public.aujourdhui_paris())"));
      const avant = await empreinte();
      const message = await echoue(sansEnveloppe(retour()));
      expect(message).toContain(`${signature} cite aujourdhui_paris() ${attendu + 2} fois au lieu de ${attendu}`);
      expect(message).toContain("rien n'est modifié");
      expect(await empreinte()).toEqual(avant);
    });

    it("tant que ce lot s'en sert, le retour de la fonction du jour de Paris (20261014500000) refuse et nomme ses fonctions", async () => {
      const message = await echoue(sansEnveloppe(RETOUR_FONCTION_DU_JOUR));
      expect(message).toMatch(/Retour arrière refusé : ces fonctions citent encore public\.aujourdhui_paris\(\)/);
      for (const signature of ["finaliser_decompte(uuid)", "marquer_decompte_envoye(uuid,date)"]) expect(message).toContain(signature);
    });

    it("il retire la ligne d'historique de sa migration (migrations.yml pourra la rejouer)", async () => {
      await db.query("create schema if not exists supabase_migrations");
      await db.query("create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[])");
      await db.query("insert into supabase_migrations.schema_migrations (version, name) values ($1, $2), ('20261014820000', 'x') on conflict do nothing", [VERSION, FICHIER]);
      await db.query(sansEnveloppe(retour()));
      const { rows } = await db.query("select version from supabase_migrations.schema_migrations where version in ($1, '20261014820000') order by 1", [VERSION]);
      expect(rows.map((r) => r.version)).toEqual(["20261014820000"]);
    });
  });

  describe("manifeste et procédure", () => {
    it("la migration est au manifeste une seule fois, dans la plage du lot, après la fonction du jour de Paris et le lot « fuseau-suite »", () => {
      const lignes = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
      const nom = `${FICHIER}.sql`;
      expect(lignes.filter((l) => l === nom)).toHaveLength(1);
      expect(lignes.indexOf(nom)).toBeGreaterThan(lignes.indexOf("20261014500000_jour_de_paris_fonction.sql"));
      expect(lignes.indexOf(nom)).toBeGreaterThan(lignes.indexOf("20261014820000_jour_de_paris_depot_et_journal.sql"));
      expect(Number(VERSION)).toBeGreaterThanOrEqual(20261014850000);
      expect(Number(VERSION)).toBeLessThanOrEqual(20261014859999);
    });

    it("son retour gère sa transaction, est déclaré au LISEZ-MOI, et figure en tête de l'ordre complet des retours", () => {
      expect(retour()).toMatch(/^-- RETOUR ARRIÈRE de /);
      expect(retour()).toMatch(/\bcommit;\s*$/m);
      const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
      expect(lisezMoi).toContain(`${FICHIER}.retour.sql`);
      const chaine = lisezMoi.match(/Ordre complet si tout doit être défait :([\s\S]*?)puis `500000`/)?.[1] ?? "";
      expect([...chaine.matchAll(/`(\d{6})`/g)].map((m) => m[1])[0]).toBe("851000");
    });
  });
});
