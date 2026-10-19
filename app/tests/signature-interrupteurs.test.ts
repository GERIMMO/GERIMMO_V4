/**
 * Lot B7 — interrupteur du seul modèle « cautionnement ».
 *
 * `ZOHO_SIGN_CAUTIONNEMENT_FERME` est lue côté serveur seulement : la valeur « 1 » ou « true » (espaces autour
 * ignorés, décision du 19/10) suspend l'ENVOI en signature électronique de l'acte de cautionnement pour toutes les
 * organisations, essais compris. Absente, vide ou toute autre valeur : ouvert, comportement d'avant inchangé. Les
 * autres modèles ne sont jamais concernés.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MESSAGE_CAUTIONNEMENT_FERME, fermetureModeleSignature } from "@/lib/signature-interrupteurs";
import { sansJargon } from "@/lib/erreurs";

afterEach(() => vi.unstubAllEnvs());

describe("Interrupteur du modèle cautionnement", () => {
  it("absente ou vide : ouvert, comme avant", () => {
    expect(fermetureModeleSignature("cautionnement", {})).toBeNull();
    expect(fermetureModeleSignature("cautionnement", { ZOHO_SIGN_CAUTIONNEMENT_FERME: "" })).toBeNull();
    expect(fermetureModeleSignature("cautionnement", { ZOHO_SIGN_CAUTIONNEMENT_FERME: undefined })).toBeNull();
  });

  it("« 1 » ferme le cautionnement avec le message exact validé", () => {
    expect(fermetureModeleSignature("cautionnement", { ZOHO_SIGN_CAUTIONNEMENT_FERME: "1" })).toBe(MESSAGE_CAUTIONNEMENT_FERME);
    expect(MESSAGE_CAUTIONNEMENT_FERME).toBe(
      "L’envoi en signature électronique de l’acte de cautionnement est suspendu pour le moment. Vous pouvez préparer le document et le faire signer hors ligne.",
    );
  });

  // Décision du 19/10 : « true », la forme des autres drapeaux ZOHO_SIGN_*, ferme aussi ; un espace autour est ignoré.
  it.each(["true", " 1 ", "true ", "\t1\n"])("« %j » ferme aussi le cautionnement", (valeur) => {
    expect(fermetureModeleSignature("cautionnement", { ZOHO_SIGN_CAUTIONNEMENT_FERME: valeur })).toBe(MESSAGE_CAUTIONNEMENT_FERME);
  });

  it.each(["0", "TRUE", "01", "oui", "false", "fermé", "1 1", "yes"])("toute autre valeur (%j) laisse ouvert", (valeur) => {
    expect(fermetureModeleSignature("cautionnement", { ZOHO_SIGN_CAUTIONNEMENT_FERME: valeur })).toBeNull();
  });

  it.each(["bail", "avenant", "edl", "protocole_apurement", "autorisation_travaux", "devis_artisan"] as const)("ne ferme jamais le modèle %s", (code) => {
    expect(fermetureModeleSignature(code, { ZOHO_SIGN_CAUTIONNEMENT_FERME: "1" })).toBeNull();
  });

  it("un ancien circuit sans modèle (assimilé au bail) reste ouvert", () => {
    expect(fermetureModeleSignature(undefined, { ZOHO_SIGN_CAUTIONNEMENT_FERME: "1" })).toBeNull();
  });

  it("lit process.env par défaut", () => {
    vi.stubEnv("ZOHO_SIGN_CAUTIONNEMENT_FERME", "1");
    expect(fermetureModeleSignature("cautionnement")).toBe(MESSAGE_CAUTIONNEMENT_FERME);
    vi.stubEnv("ZOHO_SIGN_CAUTIONNEMENT_FERME", "");
    expect(fermetureModeleSignature("cautionnement")).toBeNull();
  });

  it("le message traverse sansJargon sans être remplacé", () => {
    expect(sansJargon(MESSAGE_CAUTIONNEMENT_FERME)).toBe(MESSAGE_CAUTIONNEMENT_FERME);
  });
});

describe("La variable n’est lue que côté serveur", () => {
  const SRC = resolve(__dirname, "..", "src");
  function fichiers(dossier: string, acc: string[] = []): string[] {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) fichiers(chemin, acc);
      else if (/\.(ts|tsx)$/.test(e.name)) acc.push(chemin);
    }
    return acc;
  }
  it("aucun composant client n’importe le module de l’interrupteur ni ne lit la variable", () => {
    const fautifs = fichiers(SRC).filter((f) => {
      const texte = readFileSync(f, "utf8");
      return /^\s*["']use client["']/m.test(texte) && /signature-interrupteurs|ZOHO_SIGN_CAUTIONNEMENT_FERME/.test(texte);
    });
    expect(fautifs).toEqual([]);
  });
  it("le module partagé politique-signature ne lit aucune variable d’environnement", () => {
    expect(readFileSync(resolve(SRC, "lib", "politique-signature.ts"), "utf8")).not.toMatch(/process\.env|ZOHO_SIGN_CAUTIONNEMENT_FERME/);
  });
});
