/**
 * Filtre de pertinence de la veille (06/10/2026).
 *
 * Le 29/09, le journal a relayé un guide de décarbonation pour les
 * entreprises : hors cible. Le filtre lit titre et résumé, applique des mots
 * inclus et exclus réglables, et exige un public du journal. Les cas
 * ci-dessous sont les six veilles réelles du mois, telles qu'elles ont été
 * étudiées.
 *
 * 14/10/2026 (décision D33, fiche EDI-01) : la ligne éditoriale vise le
 * périmètre de la V1 publique — bailleurs, locataires, artisans. « agence »
 * n'en fait plus partie : un sujet réservé aux agences ne passe plus le filtre.
 */
import { describe, expect, it } from "vitest";
import { PUBLICS_JOURNAL, evaluerPertinence, lireMots, motsTrouves, normaliserTexte } from "@/lib/pertinence-veille";

const MOTS = {
  inclus: ["logement", "location", "loyer", "bail", "locataire", "bailleur", "trêve hivernale", "expulsion", "apl", "crédit immobilier", "taux d'usure", "artisan"],
  exclus: ["décarbonation", "micro-entreprise", "carburant", "consommateurs", "neuroatypique"],
};

describe("evaluerPertinence", () => {
  it("écarte le guide de décarbonation du 29/09, même marqué bailleur et agence", () => {
    const v = evaluerPertinence({
      titre: "Amorcer un plan de décarbonation : un guide national vient d’être publié pour aider les entreprises",
      resume: "Un guide national français, présenté comme volontaire, aide les organisations à construire un plan de décarbonation.",
      publics: ["artisan", "bailleur", "agence"],
    }, MOTS);
    expect(v.pertinent).toBe(false);
    expect(v.motif).toContain("décarbonation");
  });
  it("retient la trêve hivernale du 06/10", () => {
    const v = evaluerPertinence({
      titre: "Trêve hivernale 2026-2027 : ce que vous devez savoir",
      resume: "Les expulsions locatives sont en principe suspendues du 1er novembre 2026 au 31 mars 2027.",
      publics: ["bailleur", "agence", "locataire"],
    }, MOTS);
    expect(v.pertinent).toBe(true);
  });
  it("écarte un sujet sans mot du logement, ou qui porte un mot exclu, même pour les artisans", () => {
    expect(evaluerPertinence({ titre: "Financement du CPF : évolution du montant de la participation", publics: ["artisan"] }, MOTS).pertinent).toBe(false);
    expect(evaluerPertinence({ titre: "Artisans : aide au carburant pour les entreprises du bâtiment", publics: ["artisan"] }, MOTS).pertinent).toBe(false);
  });
  it("ne laisse plus un résumé IA requalifier un titre générique, et ignore accents et pluriels", () => {
    expect(evaluerPertinence({ titre: "Ce qui change au 1er octobre", resume: "Les LOYERS des logements sociaux…", publics: [] }, MOTS).pertinent).toBe(false);
    expect(motsTrouves("Credit immobilier : les plafonds du taux d’usure", MOTS.inclus)).toEqual(["crédit immobilier", "taux d'usure"]);
    expect(normaliserTexte("  Trêve  HIVERNALE ")).toBe("treve hivernale");
  });
  it("un mot-clé est un mot entier : « bail » ne matche pas « bailliage »", () => {
    expect(motsTrouves("Le bailliage de Caen", ["bail"])).toEqual([]);
    expect(motsTrouves("Les baux commerciaux", ["bail", "baux"])).toEqual(["baux"]);
  });
});

// D33 (14/10/2026) : le public du journal est celui de la V1 publique.
describe("la ligne éditoriale vise le périmètre V1 : bailleurs, locataires, artisans", () => {
  it("liste les trois publics de la V1, et plus « agence »", () => {
    expect([...PUBLICS_JOURNAL]).toEqual(["bailleur", "artisan", "locataire"]);
    expect(PUBLICS_JOURNAL).not.toContain("agence");
  });

  it("écarte un sujet qui ne vise que les agences, même sur un mot du logement", () => {
    const v = evaluerPertinence({
      titre: "Location : nouvelle obligation pour les agences immobilières",
      resume: "Les loyers des mandats de gestion sont concernés.",
      publics: ["agence"],
    }, MOTS);
    expect(v.pertinent).toBe(false);
    expect(v.motif).toBe("publics hors journal : agence");
  });

  it("retient un sujet qui vise les artisans, seuls ou avec d'autres publics", () => {
    for (const publics of [["artisan"], ["artisan", "agence"], ["bailleur", "agence"], ["locataire"]]) {
      expect(evaluerPertinence({ titre: "Artisans : nouvelle obligation sur les chantiers de logements", publics }, MOTS).pertinent).toBe(true);
    }
  });

  it("un sujet sans public renseigné reste jugé sur ses mots", () => {
    expect(evaluerPertinence({ titre: "Les loyers des logements sociaux", publics: [] }, MOTS).pertinent).toBe(true);
    expect(evaluerPertinence({ titre: "Les loyers des logements sociaux", publics: null }, MOTS).pertinent).toBe(true);
  });
});

it("lireMots nettoie la saisie du superviseur", () => {
  expect(lireMots("logement, loyer ; bail\n\n loyer, x")).toEqual(["logement", "loyer", "bail"]);
});
