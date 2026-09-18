/**
 * Le gabarit de la balance d'ouverture, et le total qu'il représente (18/09).
 *
 * Deux choses se vérifient ici sans base de données. D'abord que le gabarit
 * SE RELIT LUI-MÊME : un modèle qu'on télécharge et que l'import refuse est
 * pire qu'une absence de modèle. Ensuite que le total de trésorerie calculé à
 * l'écran est celui que la base calculera — sans quoi l'agence verrait un écart
 * nul avant de se faire refuser la bascule.
 */
import { describe, expect, it } from "vitest";
import { gabaritCsv, lireCsv, tresorerieDuFichier, COLONNES } from "../src/lib/reprise-soldes";

describe("le gabarit se relit lui-même", () => {
  it("ses propres en-têtes sont tous reconnus", () => {
    const lecture = lireCsv(gabaritCsv());
    expect("erreur" in lecture).toBe(false);
    if ("erreur" in lecture) return;
    expect(lecture.inconnues).toEqual([]);
    expect(lecture.manquantes).toEqual([]);
    expect(lecture.lignes.length).toBe(1);
  });

  it("sa ligne d'exemple est une ligne valide", () => {
    const lecture = lireCsv(gabaritCsv());
    if ("erreur" in lecture) throw new Error("gabarit illisible");
    const [ligne] = lecture.lignes;
    expect(ligne.type).toBe("depot_garantie");
    expect(ligne.detenteur).toBe("agence");
    expect(Number(ligne.montant)).toBe(700);
  });

  it("les deux colonnes obligatoires sont le type et le montant", () => {
    const requises = COLONNES.filter(([, , r]) => r).map(([c]) => c);
    expect(requises).toEqual(["type", "montant"]);
  });
});

describe("le fichier d'une agence, tel qu'il arrive", () => {
  it("accepte les points-virgules d'Excel comme les virgules", () => {
    const avecVirgules = "type,montant,detenteur,locataire_email\ndepot_garantie,700,agence,a@b.fr\n";
    const lecture = lireCsv(avecVirgules);
    if ("erreur" in lecture) throw new Error(lecture.erreur);
    expect(lecture.lignes[0].montant).toBe("700");
  });

  it("reconnaît les en-têtes du gabarit comme les clés techniques", () => {
    const enClair = "Type (depot_garantie / solde_locataire / provision_charges / fonds_mandant);Montant (€)\nfonds_mandant;1500\n";
    const lecture = lireCsv(enClair);
    if ("erreur" in lecture) throw new Error(lecture.erreur);
    expect(lecture.lignes[0].type).toBe("fonds_mandant");
    expect(lecture.lignes[0].montant).toBe("1500");
  });

  it("signale les colonnes obligatoires absentes plutôt que de deviner", () => {
    const lecture = lireCsv("locataire_email;detenteur\na@b.fr;agence\n");
    if ("erreur" in lecture) throw new Error(lecture.erreur);
    expect(lecture.manquantes.length).toBe(2);
  });
});

describe("la trésorerie du fichier : seulement ce que l'agence détient", () => {
  it("compte les dépôts qu'elle garde, pas ceux du propriétaire", () => {
    expect(
      tresorerieDuFichier([
        { type: "depot_garantie", montant: "700", detenteur: "agence" },
        { type: "depot_garantie", montant: "900", detenteur: "proprietaire" },
      ])
    ).toBe(700);
  });

  it("compte l'avance d'un locataire, jamais sa dette", () => {
    // Une dette n'est pas de l'argent détenu : la faire entrer dans le total
    // creuserait un écart au premier rapprochement bancaire.
    expect(
      tresorerieDuFichier([
        { type: "solde_locataire", montant: "120" },
        { type: "solde_locataire", montant: "-450" },
      ])
    ).toBe(120);
  });

  it("lit la virgule décimale et l'espace des milliers du tableur français", () => {
    expect(tresorerieDuFichier([{ type: "fonds_mandant", montant: "1 234,56" }])).toBeCloseTo(
      1234.56,
      2
    );
  });

  it("ignore une ligne illisible au lieu de fausser le total", () => {
    expect(
      tresorerieDuFichier([
        { type: "fonds_mandant", montant: "abc" },
        { type: "fonds_mandant", montant: "100" },
      ])
    ).toBe(100);
  });

  it("ignore un type qu'elle ne connaît pas", () => {
    expect(tresorerieDuFichier([{ type: "caisse_noire", montant: "1000" }])).toBe(0);
  });
});
