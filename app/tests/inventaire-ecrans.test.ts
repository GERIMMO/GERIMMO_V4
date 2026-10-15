import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const racine = path.resolve(__dirname, "../src/app");
const inventaire: { path: string; persona: string }[] = JSON.parse(readFileSync(path.resolve(__dirname, "../e2e/routes-inventaire.json"), "utf8"));
// Décision D27 : « /espace/<id>/… » est l'adresse du propriétaire direct pour les pages du dossier app/agence/[orgId] (alias réécrit
// par le proxy, sans dossier propre) : une entrée de l'inventaire sous /espace couvre la page /agence correspondante.
const normaliser = (route: string) => route.split("?")[0].replace(/^\/espace\//, "/agence/").replace(/\[[^\]]+\]|\b[A-Z][A-Z_]+\b/g, "[]");

describe("Couverture des écrans", () => {
  it("chaque modèle de page figure dans l'audit navigateur", () => {
    const couverts = new Set(inventaire.map(r => normaliser(r.path)));
    const pages = readdirSync(racine, { recursive: true }).filter((p) => typeof p === "string" && /(^|\/)page\.tsx$/.test(p)) as string[];
    const manquantes = pages.map(p => normaliser("/" + p.replace(/(^|\/)page\.tsx$/, "")))
      .filter(p => !couverts.has(p));
    expect(manquantes).toEqual([]);
  });

  it("les pages ajoutées ont un profil valide et ne sont pas doublonnées", () => {
    const profils = new Set(["public", "agent", "admin-agence", "locataire", "proprietaire", "superadmin", "artisan"]);
    expect(inventaire.filter(r => !profils.has(r.persona))).toEqual([]);
    expect(new Set(inventaire.map(r => `${r.persona}:${r.path}`)).size).toBe(inventaire.length);
  });

  it("décision D27 : le propriétaire direct est inventorié sous /espace, jamais sous /agence ; les autres profils ne touchent pas à /espace", () => {
    const proprietaire = inventaire.filter(r => r.persona === "proprietaire");
    expect(proprietaire.filter(r => r.path.startsWith("/agence/")).map(r => r.path)).toEqual([]);
    expect(proprietaire.filter(r => r.path.startsWith("/espace/")).length).toBeGreaterThan(15);
    expect(inventaire.filter(r => r.persona !== "proprietaire" && r.path.startsWith("/espace/")).map(r => `${r.persona}:${r.path}`)).toEqual([]);
  });
});
