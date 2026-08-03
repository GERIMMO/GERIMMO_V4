/**
 * Proposition de pièces d'après le nombre de pièces du lot.
 *
 * Le but n'est pas d'être exact — chaque logement est un cas — mais d'éviter la
 * page blanche : un agent qui doit tout écrire à la main saute l'étape, et la
 * grille d'état des lieux retombe sur sept lignes génériques.
 */
import { describe, expect, it } from "vitest";
import { piecesHabituelles } from "../src/lib/pieces";

describe("piecesHabituelles", () => {
  it("propose une pièce unique pour un studio", () => {
    expect(piecesHabituelles(1)).toEqual([
      "Pièce principale",
      "Cuisine",
      "Salle d'eau",
      "WC",
    ]);
  });

  it("ne numérote pas la chambre quand il n'y en a qu'une", () => {
    // « 2 pièces » = séjour + 1 chambre. « Chambre 1 » sans « Chambre 2 » gêne.
    expect(piecesHabituelles(2)).toEqual([
      "Entrée",
      "Séjour",
      "Chambre",
      "Cuisine",
      "Salle de bain",
      "WC",
    ]);
  });

  it("numérote dès qu'il y a plusieurs chambres", () => {
    const p = piecesHabituelles(4);
    expect(p).toContain("Chambre 1");
    expect(p).toContain("Chambre 3");
    expect(p).not.toContain("Chambre 4"); // 4 pièces = séjour + 3 chambres
  });

  it("ne compte ni la cuisine ni la salle de bain dans le nombre de pièces", () => {
    // Convention française : un T3 a 3 pièces principales, pas 6.
    const p = piecesHabituelles(3);
    expect(p.filter((x) => x.startsWith("Chambre"))).toHaveLength(2);
    expect(p).toContain("Séjour");
  });

  it("reste utilisable sans nombre de pièces renseigné", () => {
    expect(piecesHabituelles(null)).toEqual(piecesHabituelles(1));
    expect(piecesHabituelles(undefined)).toEqual(piecesHabituelles(1));
  });

  it("borne les valeurs aberrantes plutôt que de produire une liste absurde", () => {
    expect(piecesHabituelles(0)).toEqual(piecesHabituelles(1));
    expect(piecesHabituelles(-3)).toEqual(piecesHabituelles(1));
    expect(piecesHabituelles(500).length).toBeLessThan(20);
  });
});
