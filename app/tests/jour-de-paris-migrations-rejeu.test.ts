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
 *  - FORME DE LA VAGUE 4a (constat de relecture du 15/10). La décision X13 (migration 20261014416000, déjà en production) a
 *    daté `resynchroniser_quittances` et le défaut de `quittances.date_emission` du jour de Paris par l'expression explicite
 *    `(now() at time zone 'Europe/Paris')::date`, sans passer par la fonction du lot. La migration 503000 doit les laisser tels
 *    quels (ils sont déjà au jour de Paris) au lieu de s'arrêter, et son retour ne doit jamais y remettre `current_date`.
 *    Les tests tournent sur les deux bancs (avec ou sans 416000) et fabriquent la forme X13 quand la base ne l'a pas.
 *  - RETOURS. Chaque retour remet `current_date` à sa place (nombre exact vérifié), se rejoue sans effet, refuse de se jouer
 *    dans un lot, et celui de la fonction elle-même refuse tant qu'un objet s'en sert. Aller, retour, aller : même état.
 *    (L'égalité avec l'état d'AVANT les migrations, empreinte md5 à l'appui, a été mesurée sur une base de banc reconstruite sans elles.)
 *
 * Ce fichier tient des verrous de table (changement de valeur par défaut) jusqu'à la fin de chaque essai : il tourne en série
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

/**
 * Deux objets peuvent être « au jour de Paris » par l'expression explicite de la décision X13 (20261014416000) plutôt que par
 * `public.aujourdhui_paris()`. Les deux formes sont admises pour eux, et pour eux seuls.
 */
const FONCTIONS_A_FORME_EXPLICITE = new Set(["public.resynchroniser_quittances(uuid)"]);
const DEFAUTS_A_FORME_EXPLICITE = new Set(["quittances.date_emission"]);
const FORME_EXPLICITE = /\(\s*now\(\)\s+at\s+time\s+zone\s+'Europe\/Paris'\s*\)\s*::\s*date/gi;
const DEFAUT_PAR_LA_FONCTION = /^(public\.)?aujourdhui_paris\(\)$/;
/** Ce que le catalogue rend pour le défaut posé par 416000 : `((now() AT TIME ZONE 'Europe/Paris'::text))::date`. */
const DEFAUT_EXPLICITE = /^\(*\s*now\(\)\s+at\s+time\s+zone\s+'Europe\/Paris'(::text)?\s*\)*\s*::\s*date\s*\)*$/i;
const MARQUE_X13 = "Décision X13 du 15/10 (FIN-13)";

const migration = (v: string, f: string) => readFileSync(`supabase/migrations/${v}_${f}.sql`, "utf8");
const retour = (v: string, f: string) => readFileSync(`supabase/retours-arriere/${v}_${f}.retour.sql`, "utf8");

/**
 * Les lots postérieurs dont les fonctions citent aussi `public.aujourdhui_paris()` (décision D18, lot « devis-revisable » :
 * refuser_devis, demander_revision_devis, deposer_devis, expirer_revisions_devis). Leurs retours se jouent AVANT celui de la
 * fonction du jour, dans l'ordre inverse de leurs migrations, comme la procédure du LISEZ-MOI le demande ; leurs migrations se
 * rejouent après celles du lot pour revenir exactement à l'état migré. Absents du dépôt, ils ne comptent pas.
 */
const LOTS_POSTERIEURS = [
  // Décision X16 du 15/10 (relances d'invitation) : relance_invitation_locataire_due et reserver_relance_invitation_locataire
  // citent aussi la fonction du jour. Indépendant du lot du devis révisable ; le plus récent, il se défait le premier.
  { version: "20261014830000", fichier: "relances_invitations_locataires" },
  // Reprise du 15/10 (dépôt du PDF en révision, ordre des verrous) : son retour précède celui de 601000, qui le vérifie.
  { version: "20261014602000", fichier: "devis_revision_verrous_stockage" },
  { version: "20261014601000", fichier: "devis_revision_versions" },
  { version: "20261014600000", fichier: "devis_refus_motive" },
].filter((l) => existsSync(`supabase/migrations/${l.version}_${l.fichier}.sql`));

const MIGRATIONS = [
  migration(FONCTION_DU_JOUR.version, FONCTION_DU_JOUR.fichier),
  ...FAMILLES.map((f) => migration(f.version, f.fichier)),
  ...[...LOTS_POSTERIEURS].reverse().map((l) => migration(l.version, l.fichier)),
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
  const nbExplicite = (def: string, signature: string) =>
    FONCTIONS_A_FORME_EXPLICITE.has(signature) ? (def.match(FORME_EXPLICITE) ?? []).length : 0;
  /** Les occurrences du jour de Paris : la fonction du lot, et pour les objets de la vague 4a l'expression explicite de X13. */
  const nbJourDeParis = (def: string, signature: string) => (def.match(/public\.aujourdhui_paris\(\)/g) ?? []).length + nbExplicite(def, signature);
  /** Espaces et casse ramenés à une forme unique ; les deux écritures du jour de Paris sont un seul jeton (même logique, autre mot). */
  const normaliser = (def: string) =>
    def
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim()
      .replace(/public\.aujourdhui_paris\(\)/g, "<jour de paris>")
      .replace(/\(\s*now\(\)\s+at\s+time\s+zone\s+'europe\/paris'\s*\)\s*::\s*date/g, "<jour de paris>");
  const defautAuJourDeParis = (table: string, colonne: string, valeur: string) =>
    DEFAUT_PAR_LA_FONCTION.test(valeur) || (DEFAUTS_A_FORME_EXPLICITE.has(`${table}.${colonne}`) && DEFAUT_EXPLICITE.test(valeur));
  const defaut = async (table: string, colonne: string) =>
    (
      await db.query<{ v: string }>(
        `select pg_get_expr(d.adbin, d.adrelid) as v from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
          where d.adrelid = $1::regclass and a.attname = $2`,
        [`public.${table}`, colonne]
      )
    ).rows[0].v;

  /** La définition d'AVANT les migrations, sous une AUTRE forme (capitales, indentation retirée). */
  const versLOrigine = (def: string, signature: string) =>
    def
      .replace(/public\.aujourdhui_paris\(\)/g, "CURRENT_DATE")
      // La forme de la vague 4a (X13) redevient, elle aussi, le jour de la session : c'est l'état d'avant 20261014416000 et d'avant le lot.
      .replace(FONCTIONS_A_FORME_EXPLICITE.has(signature) ? FORME_EXPLICITE : /(?!)/, "CURRENT_DATE")
      // Les trois conversions d'horodatage de l'historique du lot (502000) reprennent leur forme d'origine.
      .replace(/\((edl\.signe_le|i\.created_at|i\.clos_le) at time zone 'Europe\/Paris'\)::date/g, "$1::date")
      .replace(/\n[ \t]+/g, "\n");

  /** Remet toute la famille dans son état d'AVANT, mais sous une AUTRE forme (capitales, indentation retirée). */
  async function remettreAvantAutrement(famille: Famille) {
    for (const [signature] of famille.fonctions) {
      await db.query(versLOrigine(await definition(signature), signature));
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
        expect(nbJourDeParis(def, signature), signature).toBeGreaterThan(0);
      }
      for (const [table, colonne] of DEFAUTS) {
        const valeur = await defaut(table, colonne);
        expect(defautAuJourDeParis(table, colonne, valeur), `${table}.${colonne} : ${valeur}`).toBe(true);
      }
    });

    it("le nombre d'occurrences remplacées est celui que les migrations annoncent", async () => {
      for (const famille of FAMILLES)
        for (const [signature, attendu] of famille.fonctions) expect(nbJourDeParis(await definition(signature), signature), signature).toBe(attendu);
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
        expect(nbJourDeParis(def, signature), `${signature} (avant)`).toBe(0);
      }
      await db.query(migration(famille.version, famille.fichier));
      for (const [signature, attendu] of famille.fonctions) {
        const def = await definition(signature);
        expect(nbJourDeSession(def), signature).toBe(0);
        expect(nbJourDeParis(def, signature), signature).toBe(attendu);
        // La logique est celle d'origine : seul le mot a changé, mots et ordre des mots identiques à l'espace près.
        expect(normaliser(def), signature).toBe(avant[signature]);
      }
      for (const [table, colonne] of famille.defauts) expect(await defaut(table, colonne)).toMatch(DEFAUT_PAR_LA_FONCTION);
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

  describe("historique du lot — les jours tirés d'un horodatage (502000)", () => {
    const famille = FAMILLES[1];
    const SIGNATURE = "public.historique_du_lot(uuid,integer)";
    const COLONNES = ["edl.signe_le", "i.created_at", "i.clos_le"];
    const aParis = (c: string) => new RegExp(`\\(${c.replace(".", "\\.")} at time zone 'Europe/Paris'\\)::date`, "g");
    const brute = (c: string) => new RegExp(`\\b${c.replace(".", "\\.")}::date`, "g");

    it("chaque conversion d'horodatage est à Paris, une fois, et plus aucune ne suit le fuseau de la session", async () => {
      const def = await definition(SIGNATURE);
      for (const c of COLONNES) {
        expect(def.match(aParis(c)) ?? [], c).toHaveLength(1);
        expect(def.match(brute(c)) ?? [], c).toHaveLength(0);
      }
    });

    it("sur l'ancienne forme (conversion brute, autre mise en forme), la migration les passe à Paris", async () => {
      await remettreAvantAutrement(famille);
      const avant = await definition(SIGNATURE);
      for (const c of COLONNES) expect(avant.match(brute(c)) ?? [], c).toHaveLength(1);
      await db.query(migration(famille.version, famille.fichier));
      const apres = await definition(SIGNATURE);
      for (const c of COLONNES) expect(apres.match(aParis(c)) ?? [], c).toHaveLength(1);
    });

    it("une conversion en double l'arrête, en la nommant, et ne laisse rien de changé", async () => {
      await remettreAvantAutrement(famille);
      const def = await definition(SIGNATURE);
      await db.query(def.replace("'incident', 'Incident clos'", "'incident', 'Incident clos' || (i.created_at::date)::text"));
      const avant = await empreinte();
      const message = await echoue(migration(famille.version, famille.fichier));
      expect(message).toMatch(/historique_du_lot\(uuid,integer\) contient 2 conversion\(s\) i\.created_at::date et 0 déjà à Paris/);
      expect(message).toContain("rien n'est modifié");
      expect(await empreinte()).toEqual(avant);
    });

    it("le retour ne rétablit que la conversion d'origine, et se rejoue sans effet", async () => {
      await db.query(sansEnveloppe(retour(famille.version, famille.fichier)));
      const def = await definition(SIGNATURE);
      for (const c of COLONNES) {
        expect(def.match(brute(c)) ?? [], c).toHaveLength(1);
        expect(def.match(aParis(c)) ?? [], c).toHaveLength(0);
      }
      expect(def).not.toContain("Europe/Paris");
      const unefois = await empreinte();
      await db.query(sansEnveloppe(retour(famille.version, famille.fichier)));
      expect(await empreinte()).toEqual(unefois);
    });
  });

  describe("forme de la vague 4a (X13, 20261014416000) : resynchroniser_quittances et quittances.date_emission", () => {
    const famille = FAMILLES[2];
    const RESYNC = "public.resynchroniser_quittances(uuid)";
    const AUTRES = famille.fonctions.filter(([signature]) => signature !== RESYNC);
    const DEFAUT_X13 = "((now() at time zone 'Europe/Paris')::date)";
    const joue = () => db.query(migration(famille.version, famille.fichier));
    const rejoue = () => migration(famille.version, famille.fichier);

    /**
     * Met la base dans l'état de la production après la vague 4a : l'expression explicite (et la marque de X13) dans
     * `resynchroniser_quittances`, le même jour pour le défaut de la colonne ; les quatre autres fonctions de la famille comme avant le lot.
     * Vaut pour un banc sans 416000 (on la fabrique) comme pour un banc qui l'a (on la retrouve).
     */
    async function poserLaFormeX13() {
      const origine = versLOrigine(await definition(RESYNC), RESYNC);
      await db.query(origine.replace(/CURRENT_DATE/g, `(now() at time zone 'Europe/Paris')::date /* ${MARQUE_X13} : émission datée du jour de Paris */`));
      await db.query(`alter table public.quittances alter column date_emission set default ${DEFAUT_X13}`);
      for (const [signature] of AUTRES) await db.query(versLOrigine(await definition(signature), signature));
      const def = await definition(RESYNC);
      expect(nbJourDeSession(def), "banc de l'essai : plus aucun jour de session").toBe(0);
      expect(nbExplicite(def, RESYNC), "banc de l'essai : deux expressions de X13").toBe(2);
      expect(await defaut("quittances", "date_emission")).toMatch(DEFAUT_EXPLICITE);
    }

    it("la migration laisse ces deux objets tels quels (déjà au jour de Paris), convertit le reste, et se rejoue sans effet", async () => {
      await poserLaFormeX13();
      const resyncAvant = await definition(RESYNC);
      const defautAvant = await defaut("quittances", "date_emission");
      await joue();
      expect(await definition(RESYNC)).toBe(resyncAvant);
      expect(await defaut("quittances", "date_emission")).toBe(defautAvant);
      for (const [signature, attendu] of AUTRES) {
        const def = await definition(signature);
        expect(nbJourDeSession(def), signature).toBe(0);
        expect(nbJourDeParis(def, signature), signature).toBe(attendu);
      }
      const unefois = await empreinte();
      await joue();
      expect(await empreinte()).toEqual(unefois);
    });

    it("resynchroniser_quittances qui ne lit ni current_date, ni la fonction du lot, ni l'expression de X13 l'arrête", async () => {
      await poserLaFormeX13();
      await db.query((await definition(RESYNC)).replace(FORME_EXPLICITE, "now()::date"));
      const avant = await empreinte();
      const message = await echoue(rejoue());
      expect(message).toMatch(/resynchroniser_quittances\(uuid\) ne lit ni current_date ni aujourdhui_paris\(\) ni l'expression du jour de Paris/);
      expect(message).toContain("rien n'est modifié");
      expect(await empreinte()).toEqual(avant);
    });

    it("l'expression de X13 en nombre inattendu l'arrête, en nommant la fonction, et ne laisse rien de changé", async () => {
      await poserLaFormeX13();
      let n = 0;
      await db.query((await definition(RESYNC)).replace(FORME_EXPLICITE, (m) => (++n === 1 ? "now()::date" : m)));
      const avant = await empreinte();
      const message = await echoue(rejoue());
      expect(message).toMatch(/resynchroniser_quittances\(uuid\) contient 1 occurrence\(s\) de l'expression du jour de Paris au lieu de 2/);
      expect(message).toContain("rien n'est modifié");
      expect(await empreinte()).toEqual(avant);
    });

    it("un défaut à l'heure d'un autre fuseau que Paris n'est pas pris pour celui de X13 : la migration s'arrête", async () => {
      for (const fuseau of ["UTC", "Europe/London", "Atlantic/Azores"]) {
        await db.query(`alter table public.quittances alter column date_emission set default ((now() at time zone '${fuseau}')::date)`);
        const message = await echoue(rejoue());
        expect(message, fuseau).toContain("le défaut de quittances.date_emission est");
        expect(message, fuseau).toContain("rien n'est modifié");
      }
    });

    it("le retour laisse l'expression de X13 en place (jamais current_date), rétablit le reste, et se rejoue sans effet", async () => {
      await poserLaFormeX13();
      await joue();
      const resyncAvant = await definition(RESYNC);
      const defautAvant = await defaut("quittances", "date_emission");
      await db.query(sansEnveloppe(retour(famille.version, famille.fichier)));
      expect(await definition(RESYNC)).toBe(resyncAvant);
      expect(await defaut("quittances", "date_emission")).toBe(defautAvant);
      for (const [signature, attendu] of AUTRES) {
        const def = await definition(signature);
        expect(nbJourDeParis(def, signature), signature).toBe(0);
        expect(nbJourDeSession(def), signature).toBe(attendu);
      }
      const unefois = await empreinte();
      await db.query(sansEnveloppe(retour(famille.version, famille.fichier)));
      expect(await empreinte()).toEqual(unefois);
    });

    it("aller, retour, aller : l'état migré est retrouvé à l'identique", async () => {
      await poserLaFormeX13();
      await joue();
      const migre = await empreinte();
      await db.query(sansEnveloppe(retour(famille.version, famille.fichier)));
      expect(await empreinte()).not.toEqual(migre);
      await joue();
      expect(await empreinte()).toEqual(migre);
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
    /** Les retours des lots postérieurs qui citent la fonction du jour : à jouer avant ceux du lot. */
    async function defaireLotsPosterieurs() {
      for (const lot of LOTS_POSTERIEURS) await db.query(sansEnveloppe(retour(lot.version, lot.fichier)));
    }

    async function toutDefaire() {
      await defaireLotsPosterieurs();
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

    it("chaque retour rétablit current_date (nombre exact) là où le lot l'avait remplacé, les défauts, et se rejoue sans effet", async () => {
      // Sur une base passée par la vague 4a, deux objets sont au jour de Paris par l'expression explicite de X13 : le lot ne les a pas
      // touchés, son retour non plus (jamais `current_date` sur eux : ce serait défaire X13).
      const explicites = new Set<string>();
      for (const signature of FONCTIONS_A_FORME_EXPLICITE) if (nbExplicite(await definition(signature), signature) > 0) explicites.add(signature);
      const defautsExplicites = new Set<string>();
      for (const [table, colonne] of DEFAUTS)
        if (DEFAUT_EXPLICITE.test(await defaut(table, colonne))) defautsExplicites.add(`${table}.${colonne}`);
      for (const famille of [...FAMILLES].reverse()) {
        await db.query(sansEnveloppe(retour(famille.version, famille.fichier)));
        for (const [signature, attendu] of famille.fonctions) {
          const def = await definition(signature);
          if (explicites.has(signature)) {
            expect(nbJourDeSession(def), `${signature} (forme X13 conservée)`).toBe(0);
            expect(nbExplicite(def, signature), `${signature} (forme X13 conservée)`).toBe(attendu);
          } else {
            expect(nbJourDeParis(def, signature), signature).toBe(0);
            expect(nbJourDeSession(def), signature).toBe(attendu);
          }
        }
        for (const [table, colonne] of famille.defauts) {
          const valeur = await defaut(table, colonne);
          if (defautsExplicites.has(`${table}.${colonne}`)) expect(valeur, `${table}.${colonne} (forme X13 conservée)`).toMatch(DEFAUT_EXPLICITE);
          else expect(valeur.toLowerCase()).toBe("current_date");
        }
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
      // Sans resynchroniser_quittances(uuid) : sur une base passée par la vague 4a (X13) elle date du jour de Paris par l'expression explicite
      // et ne cite pas la fonction du lot, donc le retour ne la nomme pas (elle ne retient pas la suppression de la fonction).
      for (const signature of ["etat_loyers_bail_brut(uuid)", "fiche_lot(uuid)", "quittances_a_envoyer(integer)", "contre_passer_encaissement()"])
        expect(message).toContain(signature);
    });

    it("même sans fonction qui la cite, une valeur par défaut qui s'en sert fait refuser le retour, en la nommant", async () => {
      await defaireLotsPosterieurs();
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
