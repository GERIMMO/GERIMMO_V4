import { describe, expect, it } from "vitest";
import { titreDepuisFichier, typeDepotAutorise, typeSuggereParNom } from "../src/lib/preparation-depot-document";

describe("Préparation du dépôt depuis le nom du fichier", () => {
  it.each([
    ["Attestation_assurance_2026.PDF", "attestation_assurance"],
    ["CNI recto Moreau.jpg", "piece_identite"],
    ["Carte nationale d’identité.png", "piece_identite"],
    ["Justificatif_de_domicile.pdf", "justificatif"],
    ["Bulletin de paie octobre.pdf", "justificatif"],
    ["Avis d’imposition 2026.pdf", "justificatif"],
    ["Lettre locataire.pdf", "courrier"],
  ])("suggère un type explicable pour %s", (nom, attendu) => {
    expect(typeSuggereParNom(nom)).toBe(attendu);
  });
  it.each(["scan.pdf", "DPE 2026.pdf", "courrier assurance.pdf", "CNI justificatif.pdf", "assurancesociale.pdf"])("ne devine pas un type pour %s", (nom) => {
    expect(typeSuggereParNom(nom)).toBe("");
  });
  it("prépare un titre lisible sans détruire les dates ou les accents", () => {
    expect(titreDepuisFichier("  Attestation__Été_2026-07-01.PDF")).toBe("Attestation Été 2026-07-01");
    expect(titreDepuisFichier("rapport.v2.pdf")).toBe("rapport.v2");
    expect(titreDepuisFichier("x".repeat(250) + ".png")).toHaveLength(200);
  });
  it("reprend seulement un filtre compatible avec le dépôt", () => {
    expect(typeDepotAutorise("attestation_assurance")).toBe("attestation_assurance");
    expect(typeDepotAutorise("diagnostic")).toBe("");
    expect(typeDepotAutorise("document_test")).toBe("");
    expect(typeDepotAutorise()).toBe("");
  });
});
