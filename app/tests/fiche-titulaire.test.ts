/**
 * 26/11/2026 : quoi recopier de l'adresse du bailleur sur la fiche « personne » de son compte (lib/fiche-titulaire.ts).
 * Règle de SCI-2 : les seuls champs vides, et seulement si les champs remplis concordent avec la saisie.
 */
import { describe, expect, it } from "vitest";
import { adresseFicheComplete, champsAdresseARecopier, type FicheTitulaire } from "@/lib/fiche-titulaire";

const saisie = { address_line1: "5 rue des Lilas", postal_code: "69003", city: "Lyon" };
const fiche = (f: Partial<FicheTitulaire> = {}): FicheTitulaire => ({ id: "f", qualite: "Personne physique", address_line1: null, postal_code: null, city: null, ...f });

describe("champsAdresseARecopier", () => {
  it("fiche vide d'un particulier : les trois champs", () => {
    expect(champsAdresseARecopier(fiche(), saisie)).toEqual(saisie);
  });
  it.each(["SCI", "SCI familiale", "Personne morale"])("%s : rien (SCI-2 s'en charge)", (qualite) => {
    expect(champsAdresseARecopier(fiche({ qualite }), saisie)).toBeNull();
  });
  it("adresse déjà complète : rien", () => {
    expect(champsAdresseARecopier(fiche(saisie), saisie)).toBeNull();
  });
  it("champ rempli concordant (casse, espaces) : seuls les vides", () => {
    expect(champsAdresseARecopier(fiche({ city: " LYON  " }), saisie)).toEqual({ address_line1: "5 rue des Lilas", postal_code: "69003" });
    expect(champsAdresseARecopier(fiche({ address_line1: "5  Rue des lilas" }), saisie)).toEqual({ postal_code: "69003", city: "Lyon" });
  });
  it("champ rempli discordant : rien, jamais par-dessus une autre adresse", () => {
    expect(champsAdresseARecopier(fiche({ city: "Villeurbanne" }), saisie)).toBeNull();
    expect(champsAdresseARecopier(fiche({ postal_code: "69100" }), saisie)).toBeNull();
  });
  it("saisie incomplète ou code postal refusé par la règle des fiches : rien", () => {
    expect(champsAdresseARecopier(fiche(), { ...saisie, city: " " })).toBeNull();
    expect(champsAdresseARecopier(fiche(), { ...saisie, postal_code: "AB" })).toBeNull();
    expect(champsAdresseARecopier(fiche(), { ...saisie, postal_code: "75700 CEDEX 07" })).toBeNull();
  });
  it("codes postaux étrangers acceptés comme pour une fiche", () => {
    expect(champsAdresseARecopier(fiche(), { ...saisie, postal_code: "B-1000", city: "Bruxelles" })).toEqual({ ...saisie, postal_code: "B-1000", city: "Bruxelles" });
  });
});

describe("adresseFicheComplete", () => {
  it("vraie seulement avec rue, code postal et ville", () => {
    expect(adresseFicheComplete(saisie)).toBe(true);
    expect(adresseFicheComplete({ ...saisie, postal_code: "" })).toBe(false);
    expect(adresseFicheComplete({ address_line1: null, postal_code: null, city: null })).toBe(false);
  });
});
