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
 *  — `CLAUDE.md` (app/) prescrit ce chantier et plus l'outil MCP `apply_migration` ;
 *  — (audit du 23/10) une étape « Garde — CI verte sur la révision exacte », AVANT les deux autres gardes et
 *    « Appliquer », qui lit par l'API GitHub (jeton du chantier, `actions: read`) le dernier passage du chantier CI sur
 *    `github.sha` et refuse une application réelle s'il n'est pas terminé et réussi. Le 22/10, une application réelle
 *    était partie de ed97d12 pendant que la CI de ce SHA tournait, puis échouait. La simulation reste permise.
 *
 * Partie SANS base : le texte du chantier, lu avec js-yaml (présent dans `package-lock.json` par la chaîne d'ESLint ;
 * aucune dépendance ajoutée), puis les scripts `run` des deux étapes JOUÉS avec bash et un faux `psql` (relecture du
 * 19/10 : le contrat textuel ne prouve pas le comportement du shell — seuil inclus à 90, refus à 91 et sans sauvegarde,
 * simulation non bloquante, sortie illisible refusée, refus par empreinte en nommant la version). Partie AVEC base
 * (SUPABASE_DB_URL) : le SQL de la garde sur des lignes d'essai, transaction annulée.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, resolve } from "node:path";
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
const gardeCi = etapes.find((e) => e.name === "Garde — CI verte sur la révision exacte");
const appliquer = etapes.find((e) => e.name === "Appliquer");

describe("chantier « Migrations Supabase » — gardes (sans base)", () => {
  it("se lit comme du YAML, n'a que des droits de lecture (dépôt, passages CI) et aucune entrée de contournement", () => {
    expect(chantier.permissions).toEqual({ contents: "read", actions: "read" });
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

  it("la garde « CI verte sur la révision exacte » précède les autres gardes et « Appliquer », sans contournement", () => {
    const noms = etapes.map(nomDe);
    const iCi = noms.indexOf("Garde — CI verte sur la révision exacte");
    expect(iCi).toBeGreaterThan(-1);
    expect(noms.indexOf("Garde — une sauvegarde réussie récente")).toBeGreaterThan(iCi);
    expect(noms.indexOf("Appliquer")).toBeGreaterThan(iCi);

    // Toujours exécutée ; ses seules variables sont le jeton du chantier, le dépôt, la révision lancée et la simulation.
    expect(gardeCi?.if).toBeUndefined();
    expect(gardeCi?.env).toEqual({
      GITHUB_TOKEN: "${{ github.token }}",
      DEPOT: "${{ github.repository }}",
      REVISION: "${{ github.sha }}",
      SIMULATION: "${{ inputs.simulation }}",
    });
    const run = gardeCi?.run ?? "";
    expect(run).toContain("set -euo pipefail");
    expect(run).toContain("https://api.github.com/repos/${DEPOT}/actions/workflows/ci.yml/runs?head_sha=${REVISION}");
    expect(run).toContain('[ "$ETAT" = "completed/success" ]');
    expect(run).toContain('[ "$SIMULATION" != "true" ]');
    expect(run).toContain("::error title=Application refusée::");
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

/** Faux `psql` du banc : aucune connexion ; imprime ce que le test lui dicte et sort avec le code demandé. */
const FAUX_PSQL = [
  "#!/usr/bin/env bash",
  "# Faux psql du banc de test : aucune connexion ; imprime FAUX_PSQL_SORTIE et sort avec FAUX_PSQL_CODE.",
  'if [ -n "${FAUX_PSQL_SORTIE:-}" ]; then printf \'%s\\n\' "$FAUX_PSQL_SORTIE"; fi',
  'exit "${FAUX_PSQL_CODE:-0}"',
  "",
].join("\n");

/** Faux `curl` du banc : aucun réseau ; consigne ses arguments, imprime ce que le test lui dicte, sort avec le code demandé. */
const FAUX_CURL = [
  "#!/usr/bin/env bash",
  "# Faux curl du banc de test : aucun réseau ; consigne ses arguments, imprime FAUX_CURL_SORTIE et sort avec FAUX_CURL_CODE.",
  'printf \'%s\\n\' "$*" >> "$FAUX_CURL_JOURNAL"',
  'if [ -n "${FAUX_CURL_SORTIE:-}" ]; then printf \'%s\' "$FAUX_CURL_SORTIE"; fi',
  'exit "${FAUX_CURL_CODE:-0}"',
  "",
].join("\n");

/**
 * Joue le script `run` d'une étape du chantier avec bash, depuis la racine du dépôt, avec les faux `psql` et `curl` en
 * tête de PATH : aucune base, aucun réseau. Les variables d'environnement de l'étape sont reprises telles quelles quand elles
 * sont littérales (REF, REGION, SAUVEGARDE_MAX_MINUTES : le vrai seuil est éprouvé) ; les expressions `${{ … }}`
 * (secret, entrées) prennent les valeurs du cas. Seule retouche au script : ses fichiers de travail `/tmp/…` sont
 * déplacés dans un dossier jetable, pour que deux ouvriers Vitest ne s'écrasent pas.
 */
function jouerEtape(
  etape: Etape | undefined,
  entrees: Record<string, string>,
  psql: { sortie?: string; code?: number } = {},
  curl: { sortie?: string; code?: number } = {}
) {
  const dossier = mkdtempSync(resolve(tmpdir(), "gerimmo-chantier-migrations-"));
  try {
    const bin = resolve(dossier, "bin");
    mkdirSync(bin);
    writeFileSync(resolve(bin, "psql"), FAUX_PSQL, { mode: 0o755 });
    writeFileSync(resolve(bin, "curl"), FAUX_CURL, { mode: 0o755 });
    const journalCurl = resolve(dossier, "curl.log");
    writeFileSync(journalCurl, "");
    const script = resolve(dossier, "etape.sh");
    writeFileSync(script, (etape?.run ?? "").replace(/\/tmp\//g, `${dossier}/`));
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: [bin, dirname(process.execPath), process.env.PATH ?? ""].join(delimiter),
      FAUX_PSQL_SORTIE: psql.sortie ?? "",
      FAUX_PSQL_CODE: String(psql.code ?? 0),
      FAUX_CURL_SORTIE: curl.sortie ?? "",
      FAUX_CURL_CODE: String(curl.code ?? 0),
      FAUX_CURL_JOURNAL: journalCurl,
    };
    for (const [cle, valeur] of Object.entries(etape?.env ?? {})) {
      env[cle] = valeur.includes("${{") ? (entrees[cle] ?? "") : valeur;
    }
    const r = spawnSync("bash", [script], { cwd: RACINE_DEPOT, env, encoding: "utf8" });
    const appelsCurl = readFileSync(journalCurl, "utf8").split("\n").filter(Boolean);
    return { code: r.status, sortie: r.stdout, erreurs: r.stderr, appelsCurl };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const bancShell = ["bash", "md5sum", "awk"].every((outil) => spawnSync(outil, ["--version"]).status === 0);

describe.skipIf(!bancShell)("chantier « Migrations Supabase » — les scripts des gardes joués avec bash et un faux psql (sans base)", () => {
  const garder = (ligne: string, simulation: "true" | "false", code = 0) =>
    jouerEtape(garde, { PGPASSWORD: "x", SIMULATION: simulation }, { sortie: ligne, code });
  const REFUS = "✗ Application refusée : aucune « Sauvegarde quotidienne » réussie depuis 90 min.";

  it("application réelle : refusée à 425 min, acceptée au seuil (90), refusée à 91 et sans sauvegarde consignée (-1|)", () => {
    const r425 = garder("425|20261019-0600", "false");
    expect(r425.code).toBe(1);
    expect(r425.sortie).toContain("dernière sauvegarde réussie : il y a 425 min (préfixe 20261019-0600) ; seuil 90 min");
    expect(r425.erreurs).toContain(REFUS);
    expect(r425.erreurs).toContain("« Sauvegarde quotidienne » → Run workflow");

    const r90 = garder("90|x", "false");
    expect(r90.code, r90.erreurs).toBe(0);
    expect(r90.erreurs).toBe("");

    const r91 = garder("91|x", "false");
    expect(r91.code).toBe(1);
    expect(r91.erreurs).toContain(REFUS);

    const aucune = garder("-1|", "false");
    expect(aucune.code).toBe(1);
    expect(aucune.sortie).toContain("aucune sauvegarde réussie consignée dans tech_log");
    expect(aucune.erreurs).toContain(REFUS);
  });

  it("simulation : une sauvegarde trop ancienne, ou absente, informe sans bloquer", () => {
    for (const ligne of ["425|x", "-1|"]) {
      const r = garder(ligne, "true");
      expect(r.code, ligne).toBe(0);
      expect(r.erreurs, ligne).toBe("");
      expect(r.sortie, ligne).toContain("simulation : rien n'est bloqué ici, mais l'application réelle serait refusée en l'état.");
    }
    const recente = garder("5|x", "true");
    expect(recente.code).toBe(0);
    expect(recente.sortie).not.toContain("serait refusée");
  });

  it("une sortie illisible, ou un psql en échec, refuse même en simulation", () => {
    for (const simulation of ["true", "false"] as const) {
      for (const ligne of ["", "abc", "12h|x"]) {
        const r = garder(ligne, simulation);
        expect(r.code, `${simulation} ${ligne}`).toBe(1);
        expect(r.erreurs, `${simulation} ${ligne}`).toContain("âge de la dernière sauvegarde illisible");
      }
      const panne = garder("5|x", simulation, 2);
      expect(panne.code, simulation).not.toBe(0);
    }
  });

  // Relevé de production du 19/10 : ce fichier a été appliqué le 18/10 hors chantier et enregistré sous 20261018071151
  // avec le texte du fichier, octet pour octet. L'historique fictif ci-dessous reproduit cette ligne.
  const FICHIER = "20261017180829_supervision_finances.sql";
  const EMPREINTE = "a2e6a068598badb2fd6cb9321a849a77";
  const HISTORIQUE_FICTIF = `20261018071151 ${EMPREINTE}`;
  const appliquerAvec = (fichiers: string, historique: string) =>
    jouerEtape(appliquer, { PGPASSWORD: "x", FICHIERS: fichiers, SIMULATION: "true" }, { sortie: historique });

  it("garde par empreinte : un contenu déjà appliqué sous un autre numéro est refusé en nommant fichier et version", () => {
    expect(createHash("md5").update(readFileSync(resolve(RACINE_APP, "supabase/migrations", FICHIER))).digest("hex")).toBe(EMPREINTE);
    const r = appliquerAvec(FICHIER, HISTORIQUE_FICTIF);
    expect(r.code).toBe(1);
    expect(r.erreurs).toContain(`✗ ${FICHIER} : ce contenu exact (md5 ${EMPREINTE}) est déjà appliqué en base sous la version 20261018071151`);
    expect(r.sortie).not.toContain("— à appliquer, dans cet ordre :");
  });

  it("garde par version : une version déjà enregistrée est refusée avant l'empreinte", () => {
    const r = appliquerAvec(FICHIER, "20261017180829 -");
    expect(r.code).toBe(1);
    expect(r.erreurs).toContain(`✗ ${FICHIER} : la version 20261017180829 est déjà enregistrée en base.`);
    expect(r.erreurs).not.toContain("ce contenu exact");
  });

  it("sans correspondance en base, le même fichier franchit les gardes et le lot est joué puis annulé en simulation", () => {
    const r = appliquerAvec(FICHIER, "20261018071200 834f47b8ff85428b3396824b6f760939");
    expect(r.code, r.erreurs).toBe(0);
    expect(r.sortie).toContain("— à appliquer, dans cet ordre :");
    expect(r.sortie).toContain(`· ${FICHIER}`);
    expect(r.sortie).toContain("SIMULATION : tout a été joué puis annulé.");
  });

  it("la liste est obligatoire et n'accepte que des noms de fichiers .sql seuls", () => {
    const vide = appliquerAvec("  ", HISTORIQUE_FICTIF);
    expect(vide.code).toBe(1);
    expect(vide.erreurs).toContain("✗ Aucun fichier nommé.");
    const chemin = appliquerAvec("../retours-arriere/20261017180829_supervision_finances.retour.sql", "");
    expect(chemin.code).toBe(1);
    expect(chemin.erreurs).toContain("✗ nom de fichier seul attendu");
    const autre = appliquerAvec("20261017180829_supervision_finances.txt", "");
    expect(autre.code).toBe(1);
    expect(autre.erreurs).toContain("✗ un fichier .sql de app/supabase/migrations attendu");
  });
});

const bancCi = bancShell && spawnSync("jq", ["--version"]).status === 0;

describe.skipIf(!bancCi)("chantier « Migrations Supabase » — la garde « CI verte » jouée avec bash, jq et un faux curl (sans réseau)", () => {
  // La révision de l'application réelle du 22/10 (ed97d12…), allongée à 40 caractères pour l'essai.
  const SHA = `ed97d12${"0".repeat(33)}`;
  const AUTRE = `f0eeb9c${"0".repeat(33)}`;
  type Passage = { id: number; head_sha: string; status: string; conclusion: string | null; created_at: string; html_url: string };
  const passage = (id: number, status: string, conclusion: string | null, created_at: string, head_sha = SHA): Passage =>
    ({ id, head_sha, status, conclusion, created_at, html_url: `https://github.com/GERIMMO/GERIMMO_V4/actions/runs/${id}` });
  const reponse = (...passages: Passage[]) => JSON.stringify({ total_count: passages.length, workflow_runs: passages });
  const garderCi = (simulation: "true" | "false", curl: { sortie?: string; code?: number }, revision = SHA) =>
    jouerEtape(gardeCi, { GITHUB_TOKEN: "jeton-de-test", DEPOT: "GERIMMO/GERIMMO_V4", REVISION: revision, SIMULATION: simulation }, {}, curl);
  const REFUS = (etat: string) => `✗ Application refusée : le dernier passage de la CI sur ${SHA} n'est pas réussi (${etat}).`;

  it("interroge les passages du chantier CI pour la révision exacte, avec le jeton du chantier", () => {
    const r = garderCi("false", { sortie: reponse(passage(1, "completed", "success", "2026-10-23T08:30:00Z")) });
    expect(r.appelsCurl).toHaveLength(1);
    expect(r.appelsCurl[0]).toContain(`https://api.github.com/repos/GERIMMO/GERIMMO_V4/actions/workflows/ci.yml/runs?head_sha=${SHA}&per_page=100`);
    expect(r.appelsCurl[0]).toContain("Authorization: Bearer jeton-de-test");
  });

  it("application réelle : acceptée si le dernier passage sur la révision est terminé et réussi", () => {
    const r = garderCi("false", { sortie: reponse(passage(1, "completed", "success", "2026-10-23T08:30:00Z")) });
    expect(r.code, r.erreurs).toBe(0);
    expect(r.erreurs).toBe("");
    expect(r.sortie).toContain(`— CI « Lint, types, tests, build » sur ${SHA} : completed/success (passage 1 du 2026-10-23T08:30:00Z`);
    // Une réussite ancienne suivie d'un nouvel échec ne suffit pas ; l'inverse si (le plus récent compte).
    const relance = garderCi("false", { sortie: reponse(passage(2, "completed", "success", "2026-10-23T08:40:00Z"), passage(1, "completed", "failure", "2026-10-22T22:43:00Z")) });
    expect(relance.code, relance.erreurs).toBe(0);
  });

  it.each([
    ["CI en cours (22/10, 22 h 40)", reponse(passage(39865852616, "in_progress", null, "2026-10-22T22:33:43Z")), "in_progress/-"],
    ["CI en échec", reponse(passage(39865852616, "completed", "failure", "2026-10-22T22:33:43Z")), "completed/failure"],
    ["CI annulée", reponse(passage(3, "completed", "cancelled", "2026-10-22T23:00:00Z")), "completed/cancelled"],
    ["réussite puis nouvel échec", reponse(passage(1, "completed", "success", "2026-10-22T20:00:00Z"), passage(2, "completed", "failure", "2026-10-22T22:00:00Z")), "completed/failure"],
    ["aucun passage", reponse(), "absent"],
    ["seulement une autre révision verte", reponse(passage(4, "completed", "success", "2026-10-23T08:41:57Z", AUTRE)), "absent"],
    ["réponse inattendue", JSON.stringify({ message: "Not Found" }), "illisible"],
    ["réponse tronquée", "{\"workflow_runs\": [", "illisible"],
  ])("application réelle refusée : %s", (_cas, sortie, etat) => {
    const r = garderCi("false", { sortie });
    expect(r.code).toBe(1);
    expect(r.erreurs).toContain(REFUS(etat));
    expect(r.erreurs).toContain("Actions → « CI » → Run workflow");
    expect(r.sortie).toContain(`::error title=Application refusée::la CI n'est pas verte sur la révision lancée (${etat}).`);
  });

  it("application réelle refusée si l'API ne répond pas (curl en échec) ou si la révision est illisible", () => {
    const muette = garderCi("false", { code: 22 });
    expect(muette.code).toBe(1);
    expect(muette.sortie).toContain("illisible (l'API GitHub n'a pas répondu)");
    expect(muette.erreurs).toContain(REFUS("illisible"));
    const illisible = garderCi("false", { sortie: reponse(passage(1, "completed", "success", "2026-10-23T08:30:00Z")) }, "main");
    expect(illisible.code).toBe(1);
    expect(illisible.appelsCurl).toEqual([]);
  });

  it("simulation : une CI absente, en cours, en échec ou illisible informe sans bloquer", () => {
    for (const curl of [{ sortie: reponse() }, { sortie: reponse(passage(1, "in_progress", null, "2026-10-22T22:33:43Z")) }, { sortie: reponse(passage(1, "completed", "failure", "2026-10-22T22:33:43Z")) }, { code: 22 }]) {
      const r = garderCi("true", curl);
      expect(r.code, JSON.stringify(curl)).toBe(0);
      expect(r.erreurs, JSON.stringify(curl)).toBe("");
      expect(r.sortie).not.toContain("::error");
      expect(r.sortie).toContain("simulation : rien n'est bloqué ici, mais l'application réelle serait refusée en l'état.");
    }
    const verte = garderCi("true", { sortie: reponse(passage(1, "completed", "success", "2026-10-23T08:30:00Z")) });
    expect(verte.code).toBe(0);
    expect(verte.sortie).not.toContain("serait refusée");
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
