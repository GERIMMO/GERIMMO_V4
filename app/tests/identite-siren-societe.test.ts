import { expect, it } from "vitest";
import { lireSirenSociete } from "../src/lib/qualite-bailleur";
import { Fusion } from "../src/lib/documents/gabarit";
import { construireBailNu } from "../src/lib/documents/modeles/bail-nu";
import { construireBailMeuble } from "../src/lib/documents/modeles/bail-meuble";
import { contexte } from "./fixtures/contexte-document";

it("conserve le zéro initial, accepte les espaces et refuse un numéro tronqué", () => {
  expect(lireSirenSociete("012 345 678")).toBe("012345678");
  expect(lireSirenSociete(null)).toBeNull();
  expect(() => lireSirenSociete("123-45")).toThrow("neuf chiffres");
});
it.each([construireBailNu, construireBailMeuble])("identifie le bailleur société et conserve la présentation historique", construire => {
  const ctx = contexte();
  ctx.bailleurs[0] = { ...ctx.bailleurs[0], qualite: "SCI", siren: "012345678" };
  const options = { f: new Fusion(), dpeClasse: "D", inventaire: [] };
  expect(construire(ctx, options).html).toContain("SIREN : 012345678");
  expect(construire(ctx, { ...options, presentationAncienne: true }).html).not.toContain("012345678");
});
