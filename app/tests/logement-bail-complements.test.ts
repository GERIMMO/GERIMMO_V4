import { describe, expect, it } from "vitest";
import { complementsLogementBail, informationsLogementBail } from "../src/lib/logement-bail-complements";

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

describe("lecture des informations reprises", () => {
  it("nomme chaque information manquante du bâtiment tout en conservant les données connues", () => {
    const { batiment } = informationsLogementBail(lot, { ...bien, type: "immeuble", address_line2: "Entrée B", parties_communes: null, acces_tic: " " });
    expect(batiment.filter(l => l.etat === "manquant").map(l => [l.champ, l.libelle])).toEqual([
      ["parties_communes", "Parties communes"], ["acces_tic", "Internet, téléphone et TV"],
    ]);
    expect(batiment.find(l => l.champ === "address_line2")).toMatchObject({ valeur: "Entrée B", etat: "renseigne" });
    expect(batiment.find(l => l.champ === "type")).toMatchObject({ valeur: "Immeuble", etat: "renseigne" });
    expect(batiment.find(l => l.champ === "annee_construction")).toMatchObject({ valeur: "2004", etat: "renseigne" });
  });

  it("distingue une réponse non, une valeur à confirmer et une absence facultative", () => {
    const { logement, batiment } = informationsLogementBail(lot, { ...bien, copropriete: null, zone_tendue: false });
    expect(logement.find(l => l.champ === "meuble")).toMatchObject({ valeur: "Non meublé", etat: "renseigne" });
    expect(batiment.find(l => l.champ === "copropriete")).toMatchObject({ valeur: null, etat: "a_confirmer" });
    expect(batiment.find(l => l.champ === "zone_tendue")).toMatchObject({ valeur: "Non", etat: "renseigne" });
    expect(logement.find(l => l.champ === "etage")).toMatchObject({ valeur: null, etat: "facultatif" });
    expect(logement.find(l => l.champ === "locaux_privatifs")).toMatchObject({ valeur: "Néant", etat: "renseigne" });
  });

  it("conserve zéro à l’affichage et signale les valeurs requises invalides sans les effacer", () => {
    const { logement, batiment } = informationsLogementBail({ ...lot, surface_m2: 0, pieces: 0, surface_carrez: 0, tantieme: 0, etage: "0" }, { ...bien, annee_construction: 0 });
    expect(logement.find(l => l.champ === "surface_m2")).toMatchObject({ valeur: "0 m²", etat: "a_corriger" });
    expect(logement.find(l => l.champ === "pieces")).toMatchObject({ valeur: "0", etat: "a_corriger" });
    expect(logement.find(l => l.champ === "surface_carrez")).toMatchObject({ valeur: "0 m²", etat: "renseigne" });
    expect(logement.find(l => l.champ === "tantieme")).toMatchObject({ valeur: "0", etat: "renseigne" });
    expect(logement.find(l => l.champ === "etage")).toMatchObject({ valeur: "0", etat: "renseigne" });
    expect(batiment.find(l => l.champ === "annee_construction")).toMatchObject({ valeur: "0", etat: "a_corriger" });
  });

  it("affiche les références et annexes existantes sans exposer les colonnes internes", () => {
    const { logement, batiment } = informationsLogementBail({ ...lot, id: "uuid-lot", organization_id: "uuid-org", surface_carrez: 31.4, tantieme: 125, description: "Terrasse de 12 m²", locaux_privatifs: "Cave 4" }, { ...bien, commune_insee: "69387" });
    expect(logement.find(l => l.champ === "identifiant_fiscal")?.valeur).toBe("1234567890123");
    expect(logement.find(l => l.champ === "surface_carrez")?.valeur).toBe("31,4 m²");
    expect(logement.find(l => l.champ === "tantieme")?.valeur).toBe("125");
    expect(logement.find(l => l.champ === "description")?.valeur).toBe("Terrasse de 12 m²");
    expect(logement.find(l => l.champ === "locaux_privatifs")?.valeur).toBe("Cave 4");
    expect(batiment.find(l => l.champ === "commune_insee")?.valeur).toBe("69387");
    expect(logement.some(l => ["id", "organization_id"].includes(l.champ))).toBe(false);
  });
});
