/**
 * Brouillon local de la grille d'EDL (module 19 — RM-19.1.x) :
 * empreinte de l'état serveur, comptage des lignes à synchroniser.
 */
import { describe, expect, it } from "vitest";
import { empreinteGrille, lignesEnAttente } from "../src/lib/edl-brouillon";

describe("EDL — brouillon local (module 19)", () => {
  const lignes = [
    { id: "a", etat: "bon", commentaire: null },
    { id: "b", etat: null, commentaire: "rayure" },
  ];

  it("l'empreinte est stable, insensible à l'ordre des lignes", () => {
    const inverse = [...lignes].reverse();
    expect(empreinteGrille(lignes)).toBe(empreinteGrille(inverse));
  });

  it("l'empreinte change dès qu'un état ou un commentaire change", () => {
    const avant = empreinteGrille(lignes);
    expect(empreinteGrille([{ ...lignes[0], etat: "mauvais" }, lignes[1]])).not.toBe(avant);
    expect(
      empreinteGrille([lignes[0], { ...lignes[1], commentaire: "rayure profonde" }])
    ).not.toBe(avant);
  });

  it("zéro ligne en attente quand la saisie égale la référence", () => {
    const saisie = { etats: { a: "bon", b: "" }, commentaires: { a: "", b: "rayure" } };
    expect(lignesEnAttente(saisie, saisie)).toBe(0);
  });

  it("compte les lignes modifiées, pas les champs (état + commentaire = 1)", () => {
    const reference = { etats: { a: "bon", b: "" }, commentaires: { a: "", b: "" } };
    const saisie = { etats: { a: "mauvais", b: "" }, commentaires: { a: "fissure", b: "" } };
    expect(lignesEnAttente(saisie, reference)).toBe(1);
  });

  it("une ligne inconnue de la référence (grille régénérée) compte comme en attente", () => {
    const reference = { etats: { a: "bon" }, commentaires: {} };
    const saisie = { etats: { a: "bon", c: "neuf" }, commentaires: {} };
    expect(lignesEnAttente(saisie, reference)).toBe(1);
  });

  it("indifférent à '' contre absent (les champs vides ne comptent pas)", () => {
    const reference = { etats: { a: "bon" }, commentaires: { a: "" } };
    const saisie = { etats: { a: "bon", b: "" }, commentaires: { a: "", b: "" } };
    expect(lignesEnAttente(saisie, reference)).toBe(0);
  });
});
