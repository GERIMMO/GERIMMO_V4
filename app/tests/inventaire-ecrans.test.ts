import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const racine = path.resolve(__dirname, "../src/app");
const inventaire: { path: string; persona: string }[] = JSON.parse(readFileSync(path.resolve(__dirname, "../e2e/routes-inventaire.json"), "utf8"));
const normaliser = (route: string) => route.split("?")[0].replace(/\[[^\]]+\]|\b[A-Z][A-Z_]+\b/g, "[]");

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
});
