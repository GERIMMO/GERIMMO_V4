/**
 * Lot « fuseau-paris », côté application : les dates de loyer que le serveur (UTC) décide lui-même se lisent au jour de Paris.
 *
 * Deux endroits décidaient d'une date de loyer avec `new Date()` (le jour du SERVEUR, UTC) :
 *  - l'avis d'échéance (PDF) : « Établi le » et « Fait à …, le » donnaient la veille entre minuit et 2 h à Paris ;
 *  - « Mes paiements » du locataire : « Prochaine échéance en … » prenait le mois du serveur, donc un mois trop tôt le dernier
 *    soir du mois entre 22 h et 24 h UTC.
 * Le temps est simulé par l'horloge de vitest (jamais la machine) : on pose un INSTANT UTC et on vérifie le jour de Paris.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Fusion } from "@/lib/documents/gabarit";
import { construireAvisEcheance } from "@/lib/documents/modeles/avis-echeance";
import { premierDuMoisSuivant } from "@/lib/echeances";

const exp = { nom: "Agence Alpha", adresse: "5 place du Marché, 69001 Lyon", email: "a@b.fr", telephone: "04", ville: "Lyon" };

function avis(jour?: string): string {
  return construireAvisEcheance({
    reference: "AVIS-1",
    periode: "2026-10-01",
    dateEcheance: "2026-10-05",
    loyerHc: 650,
    charges: 50,
    montantDu: 700,
    prorata: false,
    chargesMode: "provision",
    bailleurNom: "Paul",
    locatairesNoms: "Julie",
    logementAdresse: "1 rue",
    referenceBail: "BAIL-1",
    dateBail: "2026-09-15",
    exp,
    f: new Fusion(),
    ...(jour ? { jour } : {}),
  }).html;
}

/** Les deux mentions de date de l'avis : « Établi le » (en-tête) et « Fait à …, le » (pied). */
function datesDeLAvis(html: string): string[] {
  return [...html.matchAll(/(?:Établi le|Fait à <span class="v">[^<]*<\/span>, le) <span class="v">(\d{2}\/\d{2}\/\d{4})<\/span>/g)].map((m) => m[1]);
}

describe("avis d'échéance : « établi le » est le jour de Paris", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    // [instant UTC simulé, jour de Paris attendu, ce que le serveur UTC aurait écrit]
    ["2026-10-15T21:59:00Z", "15/10/2026", "à 23 h 59 à Paris, le jour est encore le 15"],
    ["2026-10-15T22:00:00Z", "16/10/2026", "à minuit à Paris (heure d'été), le 16 : le serveur UTC écrivait encore le 15"],
    ["2026-10-15T23:30:00Z", "16/10/2026", "23 h 30 UTC = 01 h 30 à Paris : le 16"],
    ["2026-10-16T00:30:00Z", "16/10/2026", "00 h 30 UTC = 02 h 30 à Paris : le 16, serveur et Paris d'accord"],
    ["2026-12-31T23:30:00Z", "01/01/2027", "le 1er janvier à 00 h 30 (heure d'hiver) : l'année change à Paris avant le serveur"],
    ["2027-01-01T00:30:00Z", "01/01/2027", "00 h 30 UTC le 1er janvier = 01 h 30 à Paris"],
  ])("à %s : %s (%s)", (instant, attendu) => {
    vi.setSystemTime(new Date(instant));
    const dates = datesDeLAvis(avis());
    expect(dates).toEqual([attendu, attendu]);
  });

  it("un jour fourni (tests, réémission) prime sur l'horloge", () => {
    vi.setSystemTime(new Date("2026-10-15T23:30:00Z"));
    expect(datesDeLAvis(avis("2026-03-02"))).toEqual(["02/03/2026", "02/03/2026"]);
  });
});

describe("premierDuMoisSuivant : le mois suivant du jour de Paris", () => {
  it.each([
    ["2026-10-15", "2026-11-01T00:00:00.000Z"],
    ["2026-10-31", "2026-11-01T00:00:00.000Z"],
    ["2026-11-01", "2026-12-01T00:00:00.000Z"],
    ["2026-12-31", "2027-01-01T00:00:00.000Z"],
    ["2027-01-01", "2027-02-01T00:00:00.000Z"],
    ["2028-02-29", "2028-03-01T00:00:00.000Z"],
  ])("%s -> %s", (jour, attendu) => {
    expect(premierDuMoisSuivant(jour)).toBe(attendu);
  });

  it("ne dépend ni de l'horloge ni du fuseau du processus", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-31T23:59:59Z"));
      expect(premierDuMoisSuivant("2026-10-31")).toBe("2026-11-01T00:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("« Mes paiements » du locataire : le mois suivant vient du jour de Paris", () => {
  const source = readFileSync("src/app/locataire/[orgId]/loyers/page.tsx", "utf8");

  it("la page lit le jour de Paris et n'utilise plus l'horloge locale du serveur pour le mois suivant", () => {
    expect(source).toContain("premierDuMoisSuivant(aujourdhuiParis())");
    expect(source).not.toMatch(/dateActuelle|new Date\(\)\.get(?:Full)?(?:Year|Month)/);
  });
});
