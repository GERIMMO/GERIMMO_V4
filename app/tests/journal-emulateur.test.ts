import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("le message de démarrage du banc d’essai indique seulement son adresse d’écoute", () => {
  const source = readFileSync(new URL("../e2e/local/serveur-supabase-local.mjs", import.meta.url), "utf8");
  const message = source.split("\n").find(ligne => ligne.includes("Émulateur Supabase local prêt"));
  expect(message?.trim()).toBe('console.log(`Émulateur Supabase local prêt : http://127.0.0.1:${PORT}`);');
});
