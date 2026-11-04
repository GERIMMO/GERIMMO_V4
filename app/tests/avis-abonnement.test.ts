/**
 * Les courriers d'information sur l'abonnement (audit du 29/09/2026) :
 * ce qu'ils disent, et ce qu'ils ne promettent pas.
 */
import { describe, expect, it } from "vitest";
import { courrierCapaciteDepassee, courrierFinEssai, courrierReconduction, periodeSuivante, veilleDeLEcheance } from "@/lib/avis-abonnement";

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
  it("plan du 23/10 (R17) : un encadré en table donne la date limite de non-reconduction, la veille de l'échéance", () => {
    expect(c.html).toMatch(/<table role="presentation" border="1"[^>]*border:2px solid #12263f[^>]*><tr><td><strong>Date limite de non-reconduction : 14 décembre 2026<\/strong>/);
    expect(c.html).toContain("Pour ne pas reconduire votre abonnement, résiliez-le depuis « Mon abonnement » au plus tard à cette date.");
    // L'encadré précède « Vous pouvez choisir ».
    expect(c.html.indexOf("Date limite de non-reconduction")).toBeLessThan(c.html.indexOf("Vous pouvez choisir"));
  });
  it("la veille se compte en jour de Paris : une échéance à 0 h 30 le 1er janvier à Paris donne le 31 décembre", () => {
    expect(veilleDeLEcheance("2026-12-31T23:30:00Z")).toBe("2026-12-31");
    expect(veilleDeLEcheance("2027-03-01T10:00:00Z")).toBe("2027-02-28");
  });
  it("relecture adverse du 24/10 (M2) : le premier du mois s'écrit « 1er »", () => {
    const a = courrierReconduction({ organisation: "O", echeance: "2027-01-02T10:00:00Z", montantCents: 5990, formule: "solo", lien: null });
    expect(a.html).toContain("Date limite de non-reconduction : 1er janvier 2027");
    expect(a.html).not.toMatch(/\b1 janvier/);
    const b = courrierReconduction({ organisation: "O", echeance: "2027-03-01T10:00:00Z", montantCents: 5990, formule: "solo", lien: null });
    expect(b.sujet).toContain("1er mars 2027");
  });
  it("plan du 23/10 (R55) : éditeur en franchise de TVA, pas de « TTC » à côté du montant", () => {
    expect(c.html).not.toContain("TTC");
  });
});

describe("plan du 23/10 (R17) : le montant de la période suivante", () => {
  it("sans changement demandé : le montant de la période en cours, avantage compris", () => {
    expect(periodeSuivante({ formule: "bailleur", periodicite_suivante: null, unites_souscrites: 3, montant_periode_cents: 7490 })).toEqual({ periodicite: "annuel", montantCents: 7490 });
  });
  it("montant inconnu en base : le tarif annuel de la formule détenue", () => {
    expect(periodeSuivante({ formule: "bailleur", periodicite_suivante: null, unites_souscrites: 3, montant_periode_cents: null })).toEqual({ periodicite: "annuel", montantCents: 17700 });
  });
  it("passage au mensuel demandé pour l'échéance : le prix mensuel, et l'avis le dit", () => {
    const s = periodeSuivante({ formule: "bailleur", periodicite_suivante: "mensuel", unites_souscrites: 3, montant_periode_cents: 17700 });
    expect(s).toEqual({ periodicite: "mensuel", montantCents: 1770 });
    const avis = courrierReconduction({ organisation: "O", echeance: "2026-12-15T10:00:00Z", montantCents: s.montantCents, periodiciteSuivante: s.periodicite, formule: "bailleur", lien: null });
    expect(avis.html).toMatch(/il se poursuivra ensuite au mois, comme vous l'avez demandé, sans engagement, au prix de <strong>17,70/);
    expect(avis.html).not.toContain("99,90");
    expect(avis.html).not.toContain("Vous pouvez aussi passer au paiement mensuel");
    expect(avis.html).toContain("Date limite de non-reconduction : 14 décembre 2026");
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


it("l’avis ne promet pas une hausse de tarif non confirmée sur un ancien abonnement", () => {
 expect(periodeSuivante({formule:"bailleur",periodicite_suivante:"mensuel",unites_souscrites:3,montant_periode_cents:9990})).toEqual({periodicite:"annuel",montantCents:9990});
});
