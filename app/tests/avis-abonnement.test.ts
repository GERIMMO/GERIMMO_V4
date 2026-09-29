/**
 * Les courriers d'information sur l'abonnement (audit du 29/09/2026) :
 * ce qu'ils disent, et ce qu'ils ne promettent pas.
 */
import { describe, expect, it } from "vitest";
import { courrierCapaciteDepassee, courrierFinEssai, courrierReconduction } from "@/lib/avis-abonnement";

describe("avis de reconduction tacite (art. L215-1 du code de la consommation)", () => {
  const c = courrierReconduction({
    organisation: "SCI <Les Tilleuls>",
    echeance: "2026-12-15T10:00:00Z",
    montantCents: 9990,
    formule: "bailleur",
    lien: "https://www.gerimmo.app/agence/o/abonnement",
  });
  it("dit la date de reconduction, le montant et le droit de ne pas reconduire", () => {
    expect(c.sujet).toContain("15 décembre 2026");
    expect(c.html).toMatch(/99,90/);
    expect(c.html).toMatch(/ne pas le reconduire/);
    expect(c.html).toMatch(/résilier depuis « Mon abonnement »/);
    expect(c.html).toMatch(/L215-1/);
    expect(c.html).toContain("formule Bailleur");
  });
  it("échappe le nom de l'organisation", () => {
    expect(c.html).toContain("SCI &lt;Les Tilleuls&gt;");
    expect(c.html).not.toContain("<Les Tilleuls>");
  });
});

describe("capacité dépassée à l'échéance", () => {
  it("annonce un renouvellement à l'identique, sans prélèvement supplémentaire", () => {
    const c = courrierCapaciteDepassee({ organisation: "O", estAgence: false, capacite: 3, aCouvrir: 5, echeance: "2026-10-02T00:00:00Z", lien: null });
    expect(c.html).toMatch(/3 biens/);
    expect(c.html).toMatch(/rien ne sera\s+prélevé en plus sans votre accord/);
    expect(c.html).toMatch(/depuis « Mon abonnement »/); // pas de lien : le geste est dit
  });
});

describe("fin d'essai", () => {
  it("donne la date et le montant du premier prélèvement", () => {
    const c = courrierFinEssai({ organisation: "O", premierPrelevementLe: "2026-10-11T00:00:00Z", montantCents: 599, lien: "https://x/a" });
    expect(c.sujet).toContain("11 octobre 2026");
    expect(c.html).toMatch(/5,99/);
  });
});
