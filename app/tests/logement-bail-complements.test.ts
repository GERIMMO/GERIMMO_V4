import { describe, expect, it } from "vitest";
import { complementsLogementBail } from "../src/lib/logement-bail-complements";

const lot = { nom: "Appartement", identifiant_fiscal: "1234567890123", surface_m2: 32, pieces: 2, chauffage: "Individuel", eau_chaude: "Ballon", locaux_privatifs: "Néant", description: "Néant", etage: null, surface_carrez: null, tantieme: null, meuble: false };
const bien = { nom: "Résidence", address_line1: "12 rue du Test", postal_code: "69007", city: "Lyon", annee_construction: 2004, parties_communes: "Hall", acces_tic: "Fibre", address_line2: null, zone_tendue: null, copropriete: false };

describe("reprise du logement dans le bail", () => {
  it("ne redemande aucun champ pour un logement renseigné, même si les informations facultatives sont absentes", () => {
    expect(complementsLogementBail(lot, bien)).toEqual({ logement: [], batiment: [] });
  });
  it("isole les deux mentions manquantes du bâtiment sans réafficher toute son adresse", () => {
    expect(complementsLogementBail(lot, { ...bien, parties_communes: null, acces_tic: "  " })).toEqual({ logement: [], batiment: ["parties_communes", "acces_tic"] });
  });
  it("garde accessibles la surface invalide et les informations requises non saisies", () => {
    expect(complementsLogementBail({ ...lot, surface_m2: 0, chauffage: " " }, { ...bien, postal_code: "", annee_construction: 0 })).toEqual({ logement: ["surface_m2", "chauffage"], batiment: ["postal_code", "annee_construction"] });
  });
  it("retire les compléments après enregistrement sans modifier les données reçues", () => {
    const incomplet = Object.freeze({ ...bien, acces_tic: null });
    expect(complementsLogementBail(lot, incomplet).batiment).toEqual(["acces_tic"]);
    expect(complementsLogementBail(lot, { ...incomplet, acces_tic: "Néant" }).batiment).toEqual([]);
    expect(incomplet.acces_tic).toBeNull();
  });
});
