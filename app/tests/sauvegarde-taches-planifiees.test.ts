/**
 * D07 (AUD-C-02) : la sauvegarde exporte les tâches pg_cron, et la procédure de reprise sait les rejouer.
 *
 * `cron.job` vit dans le schéma `cron`, que pg_dump ne copie pas (public, auth, storage et support_interne seulement). Une restauration
 * dans un projet neuf ne relançait donc ni les appels de loyer, ni les alertes d'impayés, ni la rétention, ni le
 * marketing, sans aucun signal. Ces tests gardent : l'export chiffré et son manifeste, la détection d'une altération,
 * la compatibilité avec les copies d'avant, le script de rejeu généré, l'échec franc quand la lecture échoue, et le
 * rejeu sur un planificateur de façade (base locale).
 *
 * Aucun essai de restauration réelle n'est joué ici : psql est substitué par un programme qui répond des octets connus.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { Client } from "pg";
import { argumentsConnexion, exporter, extraire, verifier } from "../scripts/sauvegarde/base.mjs";
import { chiffrer } from "../scripts/sauvegarde/fichiers.mjs";
import { exporterTachesPlanifiees, FICHIER_REJEU, FICHIER_TACHES, FICHIER_TACHES_CLAIR, genererRejeu, normaliserTaches } from "../scripts/sauvegarde/taches-planifiees.mjs";
import { verifierRejeuTaches } from "../scripts/sauvegarde/restaurer-archive.mjs";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const cle = randomBytes(32);
const CONNEXION = "postgres://lecteur:m0t-de-passe%40secret@base.exemple.fr:6543/gerimmo?sslmode=require";
// Ce que renvoie `to_jsonb(j)` sur la plateforme : plus de colonnes que nécessaire, dans le désordre.
const BRUT = [
  { jobid: 7, jobname: "retention-quotidienne", schedule: "0 3 * * *", command: "select public.appliquer_retention()", nodename: "localhost", database: "postgres", username: "postgres", active: true },
  { jobid: 3, jobname: "cycle-mensuel", schedule: "0 5 1 * *", command: "select public.cycle_mensuel_interne()", database: "postgres", username: "postgres", active: true },
  { jobid: 9, jobname: "tache d'essai", schedule: "*/5 * * * *", command: "select 'l''apostrophe';\nselect 2", active: false },
];
const TACHES = [
  { jobname: "cycle-mensuel", schedule: "0 5 1 * *", command: "select public.cycle_mensuel_interne()", active: true },
  { jobname: "retention-quotidienne", schedule: "0 3 * * *", command: "select public.appliquer_retention()", active: true },
  { jobname: "tache d'essai", schedule: "*/5 * * * *", command: "select 'l''apostrophe';\nselect 2", active: false },
];

let racine: string;
let fauxPgDump: string;
let n = 0;

/** Un psql de substitution : répond « présence » à la première requête et la liste à la seconde ; refuse un mot de passe en argument. */
async function fauxPsql({ presence = "true", liste = BRUT, code = 0 }: { presence?: string; liste?: unknown; code?: number } = {}): Promise<string> {
  const script = path.join(racine, `faux-psql-${++n}.mjs`);
  await fs.writeFile(script, `
    const args = process.argv.slice(2);
    if (args.some(a => a.includes('m0t-de-passe'))) { console.error('mot de passe en argument'); process.exit(2); }
    if (!process.env.PGPASSWORD) { console.error('PGPASSWORD absent'); process.exit(3); }
    if (!args.includes('ON_ERROR_STOP=1')) { console.error('ON_ERROR_STOP absent'); process.exit(4); }
    if (${code} !== 0) { console.error('connexion refusée par le serveur'); process.exit(${code}); }
    const sql = args[args.indexOf('-c') + 1];
    process.stdout.write((sql.includes('to_regclass') ? ${JSON.stringify(presence)} : ${JSON.stringify(JSON.stringify(liste))}) + '\\n');
  `);
  const enrobage = path.join(racine, `psql-${n}`);
  await fs.writeFile(enrobage, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`, { mode: 0o700 });
  return enrobage;
}

beforeAll(async () => {
  racine = await fs.mkdtemp(path.join(os.tmpdir(), "gerimmo-taches-test-"));
  fauxPgDump = path.join(racine, "pg_dump");
  const script = path.join(racine, "faux-pg-dump.mjs");
  await fs.writeFile(script, `process.stdout.write(Buffer.concat([Buffer.from(JSON.stringify(process.argv.slice(2))), Buffer.alloc(200, 7)]));`);
  await fs.writeFile(fauxPgDump, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`, { mode: 0o700 });
});
afterAll(() => fs.rm(racine, { recursive: true, force: true }));

describe("export des tâches planifiées avec la base", () => {
  it("chiffre la liste, la note au manifeste, la vérifie et la restitue avec son script de rejeu", async () => {
    const archive = path.join(racine, "archive-1");
    const bilan = await exporter(archive, cle, CONNEXION, { commande: fauxPgDump, schemas: ["public"], psql: await fauxPsql() });
    expect(bilan.taches_planifiees).toBe(3);

    const m = await verifier(archive, cle);
    expect(m.taches_planifiees).toMatchObject({ fichier: FICHIER_TACHES, pg_cron: true, nombre: 3 });
    expect(m.taches_planifiees.sha256).toMatch(/^[a-f0-9]{64}$/);
    // Ni le mot de passe, ni une commande en clair dans le manifeste (il est lui-même chiffré).
    expect(JSON.stringify(m)).not.toMatch(/m0t-de-passe|appliquer_retention/);

    // Le fichier chiffré ne contient ni nom de tâche ni commande en clair.
    const chiffre = await fs.readFile(path.join(archive, FICHIER_TACHES));
    expect(chiffre.subarray(0, 8).toString()).toBe("GERIMMO1");
    expect(chiffre.includes(Buffer.from("cycle_mensuel_interne"))).toBe(false);
    expect(chiffre.includes(Buffer.from("cycle-mensuel"))).toBe(false);

    const clair = path.join(racine, "clair-1");
    const extrait = await extraire(archive, cle, clair);
    expect(extrait.taches_planifiees).toBe(3);
    const liste = JSON.parse(await fs.readFile(path.join(clair, FICHIER_TACHES_CLAIR), "utf8"));
    // Triée par nom, réduite à ce qui sert à recréer une tâche : ni jobid, ni nœud, ni base, ni utilisateur.
    expect(liste.taches).toEqual(TACHES);
    const rejeu = await fs.readFile(path.join(clair, FICHIER_REJEU), "utf8");
    expect(rejeu).toContain("select cron.schedule('cycle-mensuel', '0 5 1 * *', 'select public.cycle_mensuel_interne()');");
    expect(rejeu).toContain("select cron.schedule('tache d''essai', '*/5 * * * *', 'select ''l''''apostrophe'';\nselect 2');");
    expect(rejeu).toContain("active := false");
    expect(rejeu).toContain("pg_cron n''est pas activée");
    expect(rejeu).not.toContain("m0t-de-passe");
    // Rien ne s'écrase.
    await expect(extraire(archive, cle, clair)).rejects.toThrow(/EEXIST/);
  });

  it("une liste de tâches altérée ou retirée se voit à la vérification", async () => {
    const archive = path.join(racine, "archive-2");
    await exporter(archive, cle, CONNEXION, { commande: fauxPgDump, schemas: ["public"], psql: await fauxPsql() });
    const chemin = path.join(archive, FICHIER_TACHES);
    const octets = await fs.readFile(chemin);
    octets[60] ^= 1;
    await fs.writeFile(chemin, octets);
    await expect(verifier(archive, cle)).rejects.toThrow(/altérée|Intégrité/);
    await fs.rm(chemin);
    await expect(verifier(archive, cle)).rejects.toThrow(/ENOENT/);
  });

  it("une liste remplacée par une autre liste valide (mêmes clés) est refusée : l'empreinte est au manifeste", async () => {
    const archive = path.join(racine, "archive-3");
    await exporter(archive, cle, CONNEXION, { commande: fauxPgDump, schemas: ["public"], psql: await fauxPsql() });
    const autre = Buffer.from(JSON.stringify({ version: 1, nature: "taches-pg-cron", date: new Date().toISOString(), pg_cron: true, taches: [] }));
    await fs.writeFile(path.join(archive, FICHIER_TACHES), chiffrer(autre, cle));
    await expect(verifier(archive, cle)).rejects.toThrow(/Intégrité des tâches planifiées/);
  });

  it("une copie d'avant la sauvegarde des tâches se vérifie et s'extrait encore, en disant qu'elle n'en porte pas", async () => {
    const archive = path.join(racine, "archive-4");
    await exporter(archive, cle, CONNEXION, { commande: fauxPgDump, schemas: ["public"], psql: await fauxPsql() });
    // On reconstitue l'ancien format : manifeste sans la rubrique, pas de fichier de tâches.
    const { taches_planifiees: _retire, ...ancien } = await verifier(archive, cle);
    await fs.writeFile(path.join(archive, "manifeste-base.gcm"), chiffrer(Buffer.from(JSON.stringify(ancien)), cle));
    await fs.rm(path.join(archive, FICHIER_TACHES));
    expect((await verifier(archive, cle)).taches_planifiees).toBeUndefined();
    const clair = path.join(racine, "clair-4");
    expect((await extraire(archive, cle, clair)).taches_planifiees).toBeNull();
    await expect(fs.stat(path.join(clair, FICHIER_REJEU))).rejects.toThrow(/ENOENT/);
  });

  it("sans schéma cron (projet sans pg_cron), la liste est vide et le dit", async () => {
    const archive = path.join(racine, "archive-5");
    const bilan = await exporter(archive, cle, CONNEXION, { commande: fauxPgDump, schemas: ["public"], psql: await fauxPsql({ presence: "false" }) });
    expect(bilan.taches_planifiees).toBe(0);
    expect((await verifier(archive, cle)).taches_planifiees).toMatchObject({ pg_cron: false, nombre: 0 });
  });

  it("une lecture qui échoue interrompt la sauvegarde, sans archive à moitié écrite ni mot de passe dans le message", async () => {
    const dossier = path.join(racine, "archive-6");
    const erreur = await exporter(dossier, cle, CONNEXION, { commande: fauxPgDump, schemas: ["public"], psql: await fauxPsql({ code: 9 }) }).catch((e: Error) => e);
    expect(erreur).toBeInstanceOf(Error);
    expect((erreur as Error).message).toMatch(/psql a échoué \(code 9\) : connexion refusée/);
    expect((erreur as Error).message).not.toContain("m0t-de-passe");
    await expect(fs.stat(dossier)).rejects.toThrow(/ENOENT/);
    // psql absent : même refus net.
    await expect(exporter(path.join(racine, "archive-7"), cle, CONNEXION, { commande: fauxPgDump, schemas: ["public"], psql: path.join(racine, "inexistant") })).rejects.toThrow(/psql introuvable/);
  });
});

describe("la liste des tâches", () => {
  it("ne garde que nom, horaire, commande et état, triés ; refuse une liste invalide ou doublonnée", () => {
    expect(normaliserTaches(BRUT)).toEqual(TACHES);
    expect(() => normaliserTaches({})).toThrow(/invalide/);
    expect(() => normaliserTaches([{ jobname: "", schedule: "* * * * *", command: "select 1" }])).toThrow(/nom valide/);
    expect(() => normaliserTaches([{ jobname: "a", schedule: "", command: "select 1" }])).toThrow(/horaire valide/);
    expect(() => normaliserTaches([{ jobname: "a", schedule: "* * * * *", command: "" }])).toThrow(/commande valide/);
    expect(() => normaliserTaches([TACHES[0], TACHES[0]])).toThrow(/même nom/);
  });

  it("le script de rejeu n'a pas de garde d'extension pour l'exercice, et une par défaut", () => {
    expect(genererRejeu(TACHES)).toContain("do $rejeu$");
    expect(genererRejeu(TACHES, { verifierExtensions: false })).not.toContain("do $rejeu$");
    expect(genererRejeu([])).not.toContain("cron.schedule");
  });
});

// ── Contre la base locale ────────────────────────────────────────────────

const psqlDisponible = spawnSync("psql", ["--version"]).status === 0;

describe.skipIf(!DB_URL || !psqlDisponible)("avec une vraie base locale (psql réel)", () => {
  it("lit les dix tâches du planificateur de la base, noms et commandes compris", async () => {
    const { pg_cron, taches } = await exporterTachesPlanifiees(argumentsConnexion(DB_URL!));
    expect(pg_cron).toBe(true);
    // La dixième, « relais-urgences » (toutes les 10 minutes), vient du passage fréquent des urgences du relais (20261014812000).
    expect(taches.map((t: { jobname: string }) => t.jobname)).toEqual([
      "alertes-assurance-quotidiennes", "alertes-diagnostics-quotidiennes", "alertes-impayes-quotidiennes", "alertes-restitutions-quotidiennes",
      "cycle-mensuel", "maintenance-artisans", "marketing-declencheur", "propositions-publication-hebdo", "relais-urgences", "retention-quotidienne",
    ]);
    expect(taches.find((t: { jobname: string }) => t.jobname === "relais-urgences")).toMatchObject({ schedule: "*/10 * * * *", command: "select public.declencher_relais_urgences()", active: true });
    expect(taches.find((t: { jobname: string }) => t.jobname === "cycle-mensuel")).toMatchObject({ schedule: "0 5 1 * *", command: "select public.cycle_mensuel_interne()", active: true });
  });

  it("un export complet de la base locale porte les dix tâches et se vérifie", async () => {
    const pgDump = spawnSync("pg_dump", ["--version"]).status === 0;
    if (!pgDump) return;
    const archive = path.join(racine, "archive-reelle");
    const bilan = await exporter(archive, cle, DB_URL!, { schemas: ["public"] });
    expect(bilan.taches_planifiees).toBe(10);
    expect((await verifier(archive, cle)).taches_planifiees.nombre).toBe(10);
  }, 120_000);

  it("le rejeu recrée la liste à l'identique sur un planificateur de façade, sans doublon, et ne laisse rien derrière lui", async () => {
    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      await db.query("begin");
      // La base locale a déjà un planificateur de façade : on le retire le temps de l'essai (transaction annulée).
      await db.query("drop schema cron cascade");
      expect(await verifierRejeuTaches(db, TACHES)).toBe(3);
      const { rows: [{ present }] } = await db.query("select to_regnamespace('cron') is not null as present");
      expect(present).toBe(false);
      // Une liste invalide est refusée avant tout rejeu.
      await expect(verifierRejeuTaches(db, [{ jobname: "a" }])).rejects.toThrow();
    } finally {
      await db.query("rollback");
      await db.end();
    }
  });
});
