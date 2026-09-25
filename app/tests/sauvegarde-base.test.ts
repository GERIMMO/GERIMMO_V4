/**
 * Export logique de la base (scripts/sauvegarde/base.mjs, 25/09, audit R1).
 *
 * On ne teste pas pg_dump : on lui substitue un programme qui écrit des octets
 * connus, et on vérifie ce que le programme garantit — chiffrement, manifeste,
 * refus d'une archive altérée, mot de passe jamais en argument.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { argumentsConnexion, exporter, extraire, verifier } from "../scripts/sauvegarde/base.mjs";

let racine: string;
let fauxPgDump: string;
const cle = randomBytes(32);
const CONNEXION = "postgres://lecteur:m0t-de-passe%40secret@base.exemple.fr:6543/gerimmo?sslmode=require";

beforeAll(async () => {
  racine = await fs.mkdtemp(path.join(os.tmpdir(), "gerimmo-base-test-"));
  fauxPgDump = path.join(racine, "faux-pg-dump.mjs");
  // Écrit ses arguments puis 200 octets de « dump » ; échoue si le mot de passe est passé en argument.
  await fs.writeFile(fauxPgDump, `
    const args = process.argv.slice(2);
    if (args.some(a => a.includes('m0t-de-passe'))) { console.error('mot de passe en argument'); process.exit(2); }
    if (!process.env.PGPASSWORD) { console.error('PGPASSWORD absent'); process.exit(3); }
    process.stdout.write(Buffer.concat([Buffer.from(JSON.stringify(args)), Buffer.alloc(200, 7)]));
  `);
  await fs.chmod(fauxPgDump, 0o700);
});
afterAll(() => fs.rm(racine, { recursive: true, force: true }));

describe("argumentsConnexion", () => {
  it("sépare le mot de passe des arguments et impose TLS hors local", () => {
    const { args, env } = argumentsConnexion(CONNEXION);
    expect(args).toEqual(["--host", "base.exemple.fr", "--port", "6543", "--username", "lecteur", "--dbname", "gerimmo"]);
    expect(env).toEqual({ PGPASSWORD: "m0t-de-passe@secret", PGSSLMODE: "require" });
    expect(argumentsConnexion("postgres://u:p@localhost/x").env.PGSSLMODE).toBe("prefer");
    expect(argumentsConnexion("postgres://u:p@hote.fr/x").env.PGSSLMODE).toBe("require");
  });
  it("refuse une chaîne qui n'est pas Postgres", () => {
    expect(() => argumentsConnexion("https://exemple.fr")).toThrow(/postgres/);
    expect(() => argumentsConnexion("")).toThrow(/invalide/);
    expect(() => argumentsConnexion("postgres://u:p@hote.fr/")).toThrow(/base/);
  });
});

describe("exporter / verifier / extraire", () => {
  it("chiffre le dump, le vérifie et le restitue octet pour octet", async () => {
    const archive = path.join(racine, "archive");
    // On lance node sur le faux pg_dump : `commande` est le programme, le chemin du script est le premier argument
    // que pg_dump ne connaît pas — on l'insère via un enrobage shell.
    const enrobage = path.join(racine, "pg_dump");
    await fs.writeFile(enrobage, `#!/bin/sh\nexec "${process.execPath}" "${fauxPgDump}" "$@"\n`, { mode: 0o700 });
    const bilan = await exporter(archive, cle, CONNEXION, { commande: enrobage, schemas: ["public"] });
    expect(bilan.octets).toBeGreaterThan(200);
    const m = await verifier(archive, cle);
    expect(m).toMatchObject({ nature: "base", schemas: ["public"], taille: bilan.octets, hote: "base.exemple.fr" });
    expect(JSON.stringify(m)).not.toMatch(/m0t-de-passe/);
    // Le fichier chiffré ne contient pas le dump en clair.
    const chiffre = await fs.readFile(path.join(archive, "base.dump.gcm"));
    expect(chiffre.subarray(0, 8).toString()).toBe("GERIMMO1");
    expect(chiffre.includes(Buffer.from("--format=custom"))).toBe(false);
    const clair = path.join(racine, "clair");
    await extraire(archive, cle, clair);
    const dump = (await fs.readFile(path.join(clair, "base.dump"))).toString();
    expect(dump).toContain('"--schema","public"');
    expect(dump).toContain('"--no-owner"');
    expect(dump).not.toContain("m0t-de-passe");
    // Rien ne s'écrase : ni l'archive, ni le dossier en clair.
    await expect(exporter(archive, cle, CONNEXION, { commande: enrobage })).rejects.toThrow(/EEXIST/);
    await expect(extraire(archive, cle, clair)).rejects.toThrow(/EEXIST/);
    // Une mauvaise clé ou un octet altéré se voient.
    await expect(verifier(archive, randomBytes(32))).rejects.toThrow(/Clé incorrecte/);
    const octets = await fs.readFile(path.join(archive, "base.dump.gcm"));
    octets[60] ^= 1;
    await fs.writeFile(path.join(archive, "base.dump.gcm"), octets);
    await expect(verifier(archive, cle)).rejects.toThrow(/altérée|Intégrité/);
  });

  it("un pg_dump qui échoue ne laisse ni archive ni message avec le mot de passe", async () => {
    const dossier = path.join(racine, "echec");
    await expect(exporter(dossier, cle, CONNEXION, { commande: path.join(racine, "inexistant") })).rejects.toThrow(/introuvable/);
    await expect(fs.stat(dossier)).rejects.toThrow(/ENOENT/);
  });
});
