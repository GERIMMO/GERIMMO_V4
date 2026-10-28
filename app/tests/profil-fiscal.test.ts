import { describe, expect, it } from "vitest";
import { csvPreparationFiscale, gardeAide2044, orientationFiscale, type ProfilFiscalDetenteur } from "../src/lib/profil-fiscal";

const profil: ProfilFiscalDetenteur = { id: "profil", person_id: "p", organization_id: "o", annee: 2026, version: 1, qualite: "Personne physique", imposition: "ir", location_nue: "reel", location_meublee: "non_concerne", justification: "Déclaration précédente", cree_le: "2026-10-28" };
const personne = { id: "p", nom: "Martin", prenom: "Paul", qualite: "Personne physique" };

describe("Profil fiscal du détenteur", () => {
  it("un propriétaire peut cumuler nu au réel et meublé micro sans mélanger les déclarations", () => {
    expect(orientationFiscale({ ...profil, location_meublee: "micro" }).formulaires).toEqual(["2044 puis 2042 — revenus fonciers", "2042-C-PRO — micro-BIC"]);
  });
  it.each([
    ["micro-foncier", { ...profil, location_nue: "micro" as const }, "2042 — micro-foncier"],
    ["BIC réel", { ...profil, location_nue: "non_concerne" as const, location_meublee: "reel" as const }, "2031 et liasse fiscale, puis 2042-C-PRO"],
    ["SCI IR", { ...profil, qualite: "SCI" }, "2072"],
    ["SCI IS", { ...profil, qualite: "SCI", imposition: "is" as const }, "2065 et liasse fiscale"],
  ])("%s n’autorise pas l’aide 2044 des particuliers", (_, p, formulaire) => {
    expect(orientationFiscale(p)).toMatchObject({ aide2044: false });
    expect(orientationFiscale(p).formulaires).toContain(formulaire);
    expect(gardeAide2044([personne], [p], 2026)).not.toBeNull();
  });
  it("SCI IR et activité meublée déclenche une vérification sans basculer automatiquement à l’IS", () => {
    const orientation = orientationFiscale({ ...profil, qualite: "SCI familiale" }, true);
    expect(orientation.formulaires).toContain("2072");
    expect(orientation.aVerifier.join(" ")).toContain("maintien de la SCI à l’IR");
  });
  it("profil absent ou d’une autre année ne donne pas accès au récapitulatif 2044", () => {
    expect(gardeAide2044([personne], [], 2026)).toContain("Confirmez");
    expect(gardeAide2044([personne], [{ ...profil, annee: 2025 }], 2026)).toContain("Confirmez");
  });
  it("une qualité corrigée en SCI invalide l’ancien profil particulier pour l’aide 2044", () => {
    expect(gardeAide2044([{ ...personne, qualite: "SCI" }], [profil], 2026)).toContain("a changé");
  });
  it("la dernière version de la bonne personne et de la bonne année fait foi", () => {
    expect(gardeAide2044([personne], [profil, { ...profil, version: 2, location_nue: "micro" }], 2026)).not.toBeNull();
    expect(gardeAide2044([personne], [profil, { ...profil, person_id: "autre", version: 2, location_nue: "micro" }], 2026)).toBeNull();
  });
  it("un seul détenteur incompatible bloque un faux total 2044 commun", () => {
    expect(gardeAide2044([personne, { ...personne, id: "sci" }], [profil, { ...profil, person_id: "sci", qualite: "SCI", imposition: "is" }], 2026)).not.toBeNull();
  });
  it("le dossier conserve les bruts et les contre-écritures et neutralise les formules de tableur", () => {
    const csv = csvPreparationFiscale(2026, [{ ...personne, nom: '=HYPERLINK("x")', prenom: null }], [profil], [{ id: "e", date_piece: "2026-02-01", lot_id: null, categorie: "Loyer", sens: "depense", montant: 840, libelle: "=1+1", contre_ecriture_de: "origine" }]);
    expect(csv).toContain("Ce fichier n’est ni une déclaration");
    expect(csv).toContain("avant affectation fiscale");
    expect(csv).toContain("'" + '=HYPERLINK');
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"840,00"');
    expect(csv).toContain('"origine"');
    expect(csv).toContain("À attribuer");
  });
});
