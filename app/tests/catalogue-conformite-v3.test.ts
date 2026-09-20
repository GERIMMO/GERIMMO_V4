import { describe, expect, it } from "vitest";
import { CATALOGUE_DOCUMENTS } from "@/lib/documents/catalogue";
import { MODELES } from "@/lib/documents/modeles";
import { filtrerCibles } from "@/lib/documents/catalogue-cibles";

// Jeu de dossiers mêlés : la sélection doit être utile avant même de générer.
function dossiers(etats: string[]) {
  const q = { lignes: etats.map((etat, id) => ({ id, etat })),
    in(_champ: string, valeurs: string[]) { q.lignes = q.lignes.filter(l => valeurs.includes(l.etat)); return q; },
  };
  return q;
}

describe("Catalogue — périmètre et dossiers du cahier maître V3", () => {
  it("ne propose ni n'enregistre de nouvelle génération de bon de visite", () => {
    expect(CATALOGUE_DOCUMENTS.some(m => m.id === "bon_visite")).toBe(false);
    expect(Object.hasOwn(MODELES, "bon_visite")).toBe(false);
  });
  it.each(["attestation_loyer", "attestation_caf"])("%s ne propose que les locations en cours", id => {
    const modele = CATALOGUE_DOCUMENTS.find(m => m.id === id)!;
    const q = filtrerCibles(dossiers(["brouillon", "signe", "actif", "preavis", "termine"]), modele);
    expect(q.lignes.map(l => l.etat)).toEqual(["actif", "preavis"]);
  });
  it("le dossier documentaire concerne le locataire choisi", () => {
    expect(CATALOGUE_DOCUMENTS.find(m => m.id === "liste_dossier")?.description).toContain("locataire retenu");
  });
});
