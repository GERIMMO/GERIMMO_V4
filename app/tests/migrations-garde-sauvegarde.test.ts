/**
 * Lot M5 (19/10) — gardes du chantier « Migrations Supabase » (`.github/workflows/migrations.yml`).
 *
 * Le 18/10, trois migrations ont été appliquées en production HORS du chantier (outil MCP) et enregistrées sous
 * l'heure de leur application (20261018071151, 20261018071200, 20261018071811), pas sous celle de leur nom de fichier
 * (20261017180829, 20261018061548, 20261018071556) : la garde « version déjà enregistrée » ne les voit pas et les
 * rejouerait. Le même jour, deux applications réelles ont eu lieu 3 h 10 et 6 h 51 après la dernière sauvegarde réussie,
 * alors que le protocole (prompt de passation, § 6, étapes 5 puis 6) veut une sauvegarde juste avant.
 *
 * Ce test garde les réponses apportées au chantier :
 *  — droits de lecture seule sur le dépôt (`permissions: contents: read`) et aucune entrée de contournement ;
 *  — une étape « Garde — une sauvegarde réussie récente », AVANT « Appliquer », qui lit dans la base elle-même la
 *    dernière ligne `tech_log` de sauvegarde réussie (`scripts/sauvegarde/age-derniere-sauvegarde.sql`) et refuse une
 *    application réelle au-delà de 90 minutes ;
 *  — une garde par empreinte : le md5 du fichier, octet pour octet, comparé à celui du texte enregistré en base, refuse
 *    de rejouer un contenu déjà appliqué sous un autre numéro ; l'en-tête documente les équivalences connues ;
 *  — `CLAUDE.md` (app/) prescrit ce chantier et plus l'outil MCP `apply_migration`.
 *
 * Partie SANS base : le texte du chantier, lu avec js-yaml (présent dans `package-lock.json` par la chaîne d'ESLint ;
 * aucune dépendance ajoutée). Partie AVEC base (SUPABASE_DB_URL) : le SQL de la garde sur des lignes d'essai,
 * transaction annulée.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const RACINE_APP = resolve(__dirname, "..");
const RACINE_DEPOT = resolve(RACINE_APP, "..");
const CHANTIER = resolve(RACINE_DEPOT, ".github/workflows/migrations.yml");
const SQL_GARDE = resolve(RACINE_APP, "scripts/sauvegarde/age-derniere-sauvegarde.sql");
const CLAUDE_MD = resolve(RACINE_APP, "CLAUDE.md");

const { load } = createRequire(import.meta.url)("js-yaml") as { load: (texte: string) => unknown };

type Etape = { name?: string; uses?: string; run?: string; env?: Record<string, string>; if?: string };
type Chantier = {
  on?: { workflow_dispatch?: { inputs?: Record<string, unknown> } };
  permissions?: Record<string, string>;
  jobs?: Record<string, { steps?: Etape[] }>;
};

/** Fichier du dépôt → version enregistrée en production (relevé en lecture seule du 19/10). */
const EQUIVALENCES: ReadonlyArray<readonly [string, string]> = [
  ["20260911124500_restitution_rearrete_sous_verrou.sql", "20260911014814"],
  ["20261017180829_supervision_finances.sql", "20261018071151"],
  ["20261018061548_supervision_complete.sql", "20261018071200"],
  ["20261018071556_supervision_index_relations.sql", "20261018071811"],
];

const texte = readFileSync(CHANTIER, "utf8");
const chantier = load(texte) as Chantier;
const etapes = chantier.jobs?.appliquer?.steps ?? [];
const nomDe = (e: Etape) => e.name ?? e.uses ?? "";
const garde = etapes.find((e) => e.name === "Garde — une sauvegarde réussie récente");
const appliquer = etapes.find((e) => e.name === "Appliquer");

describe("chantier « Migrations Supabase » — gardes (sans base)", () => {
  it("se lit comme du YAML, n'a que les droits de lecture du dépôt et aucune entrée de contournement", () => {
    expect(chantier.permissions).toEqual({ contents: "read" });
    expect(Object.keys(chantier.on?.workflow_dispatch?.inputs ?? {}).sort()).toEqual(["fichiers", "simulation"]);
    expect(Object.keys(chantier.jobs ?? {})).toEqual(["appliquer"]);
  });

  it("la garde « sauvegarde réussie récente » précède « Appliquer » et ne bloque qu'une application réelle", () => {
    const noms = etapes.map(nomDe);
    const iGarde = noms.indexOf("Garde — une sauvegarde réussie récente");
    const iAppliquer = noms.indexOf("Appliquer");
    expect(iGarde).toBeGreaterThan(-1);
    expect(iAppliquer).toBeGreaterThan(iGarde);

    // Toujours exécutée : en simulation elle informe, en application réelle elle bloque. Ses seules variables sont la
    // connexion, le drapeau de simulation et le seuil : rien qui permette de la contourner.
    expect(garde?.if).toBeUndefined();
    expect(Object.keys(garde?.env ?? {}).sort()).toEqual(["PGPASSWORD", "REF", "REGION", "SAUVEGARDE_MAX_MINUTES", "SIMULATION"]);
    expect(garde?.env?.SAUVEGARDE_MAX_MINUTES).toBe("90");
    expect(garde?.env?.SIMULATION).toBe("${{ inputs.simulation }}");

    const run = garde?.run ?? "";
    expect(run).toContain("set -euo pipefail");
    expect(run).toContain("psql");
    expect(run).toContain("app/scripts/sauvegarde/age-derniere-sauvegarde.sql");
    expect(run).toContain('[ "$SIMULATION" != "true" ]');
    expect(run).toContain('[ "$AGE" -gt "$SAUVEGARDE_MAX_MINUTES" ]');
    expect(run).toContain("✗ Application refusée : aucune « Sauvegarde quotidienne » réussie depuis ${SAUVEGARDE_MAX_MINUTES} min.");
    expect(run).toContain("exit 1");
  });

  it("le SQL de la garde ne compte que les sauvegardes du service, réussies, et rend « minutes|préfixe »", () => {
    const sql = readFileSync(SQL_GARDE, "utf8");
    expect(sql).toContain("from public.tech_log");
    expect(sql).toContain("evenement = 'tache_sauvegarde'");
    expect(sql).toContain("account_id is null");
    expect(sql).toContain("details->>'echecs' = '0'");
    expect(sql).toContain("|| '|' ||");
    expect(sql.replace(/^--.*$/gm, "").trim().endsWith(";")).toBe(true);
  });

  it("la garde par empreinte suit la garde par version et précède l'application", () => {
    const run = appliquer?.run ?? "";
    const iVersion = run.indexOf("est déjà enregistrée en base.");
    const iEmpreinte = run.indexOf("est déjà appliqué en base sous la version");
    const iListe = run.indexOf("— à appliquer, dans cet ordre :");
    const iLot = run.indexOf("> /tmp/lot.sql");
    expect(iVersion).toBeGreaterThan(-1);
    expect(iEmpreinte).toBeGreaterThan(iVersion);
    expect(iListe).toBeGreaterThan(iEmpreinte);
    expect(iLot).toBeGreaterThan(iListe);
    // Même empreinte des deux côtés : md5 du fichier tel quel, md5 du texte enregistré en base.
    expect(run).toContain('md5sum < "$f"');
    expect(run).toContain("md5(array_to_string(statements, E'\\n'))");
  });

  it("l'en-tête documente les équivalences connues fichier du dépôt → version en base", () => {
    const entete = texte.slice(0, texte.indexOf("\nname: ")).split("\n");
    for (const [fichier, version] of EQUIVALENCES) {
      const ligne = entete.find((l) => l.includes(fichier));
      expect(ligne, fichier).toBeDefined();
      expect(ligne, fichier).toContain(version);
    }
  });

  it("app/CLAUDE.md prescrit le chantier et proscrit l'outil MCP apply_migration", () => {
    const claude = readFileSync(CLAUDE_MD, "utf8");
    expect(claude).not.toContain("migrations via l'outil MCP Supabase (`apply_migration`)");
    expect(claude).toContain("« Migrations Supabase »");
    expect(claude).toContain("simulation");
    expect(claude).toMatch(/[Jj]amais par l'outil MCP Supabase `apply_migration`/);
  });
});

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("SQL de la garde « sauvegarde réussie récente » (avec base)", () => {
  let db: Client;
  const sql = () => readFileSync(SQL_GARDE, "utf8");
  const lire = async () => Object.values((await db.query(sql())).rows[0] as Record<string, string>)[0];

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db.end();
  });
  beforeEach(async () => {
    await db.query("begin");
    await db.query("delete from public.tech_log where evenement = 'tache_sauvegarde'");
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  it("sans sauvegarde consignée : « -1| »", async () => {
    expect(await lire()).toBe("-1|");
  });

  it("seule la dernière sauvegarde du service RÉUSSIE compte : ni un échec, ni une ligne posée par un compte", async () => {
    // `now()` est figé pour toute la transaction : l'âge lu est exactement 10 minutes.
    await db.query(
      `insert into public.tech_log (evenement, details, created_at)
       values ('tache_sauvegarde', '{"echecs":0,"octets":1,"fichiers":1,"taches":10,"prefixe":"20260101-0000"}', now() - interval '10 minutes')`
    );
    await db.query(
      `insert into public.tech_log (evenement, details, created_at)
       values ('tache_sauvegarde', '{"echecs":1,"etape":"failure","prefixe":"20260101-0100"}', now())`
    );
    await db.query(
      `insert into public.tech_log (account_id, evenement, details, created_at)
       values (gen_random_uuid(), 'tache_sauvegarde', '{"echecs":0,"prefixe":"intrus"}', now())`
    );
    expect(await lire()).toBe("10|20260101-0000");
  });
});
