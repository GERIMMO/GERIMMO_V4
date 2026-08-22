/**
 * Conservation des saisies (recette 22/08) — le helper qui renvoie la saisie
 * au formulaire quand l'action échoue, pour que le reset React retombe dessus.
 */
import { describe, expect, it } from "vitest";
import { valeursDuFormulaire } from "../src/lib/formulaires";

describe("valeursDuFormulaire", () => {
  it("reprend les champs texte tels quels", () => {
    const fd = new FormData();
    fd.set("nom", "Malfoy");
    fd.set("prenom", "Drago");
    fd.set("email", "d.malfoy@test.local");
    expect(valeursDuFormulaire(fd)).toEqual({
      nom: "Malfoy",
      prenom: "Drago",
      email: "d.malfoy@test.local",
    });
  });

  it("ignore les fichiers (ils ne peuvent pas être reposés)", () => {
    const fd = new FormData();
    fd.set("titre", "CNI");
    fd.set("fichier", new File(["x"], "cni.pdf", { type: "application/pdf" }));
    expect(valeursDuFormulaire(fd)).toEqual({ titre: "CNI" });
  });

  it("garde la dernière valeur d'un champ répété", () => {
    const fd = new FormData();
    fd.append("choix", "a");
    fd.append("choix", "b");
    expect(valeursDuFormulaire(fd)).toEqual({ choix: "b" });
  });
});
