/**
 * D04 (1), fiche VER-TS-02 : l'APERÇU de la retenue (écran de restitution du dépôt) lit les trois champs comme l'action
 * serveur les lira (`lireMontant`, `lireDecimalFacultatif`), pas par `Number()`.
 *
 * Avant : « 840,50 » dans le coût donnait NaN (aucun aperçu), et « 1e3 » valait 1000. L'aperçu annonçait alors à
 * l'agent autre chose que ce que la base arrêterait.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/restitution", () => ({
  demarrerRestitution: vi.fn(),
  ajouterRetenue: vi.fn(),
  supprimerRetenue: vi.fn(),
  reArreterImpayes: vi.fn(),
  finaliserRestitution: vi.fn(),
  marquerRestitue: vi.fn(),
}));
vi.mock("@/components/bouton-generer-document", () => ({ BoutonGenererDocument: () => null }));
vi.mock("@/components/input-date-jour", () => ({ InputDateJour: () => null }));
vi.mock("@/components/champ-fichier", () => ({ ChampFichier: () => null }));

import { apercuDepuisSaisie } from "@/app/agence/[orgId]/baux/[bailId]/formulaire-restitution";

const saisie = (cout: string, duree_vie = "", age = "") => ({ cout, duree_vie, age });

describe("aperçu de la retenue : lu sur le texte tapé", () => {
  it("le coût se lit avec la virgule, comme le serveur : « 840,50 » vaut 840,50 (jamais NaN)", () => {
    expect(apercuDepuisSaisie(saisie("840,50"))).toEqual({ montant: 840.5, amorti: false });
    expect(apercuDepuisSaisie(saisie("840.50"))).toEqual({ montant: 840.5, amorti: false });
  });

  it("sans durée de vie ni âge, le coût est retenu en entier", () => {
    expect(apercuDepuisSaisie(saisie("120"))).toEqual({ montant: 120, amorti: false });
    expect(apercuDepuisSaisie(saisie("120", "10", ""))).toEqual({ montant: 120, amorti: false });
  });

  it("la vétusté se calcule sur une durée et un âge décimaux : 7,5 ans de vie, 2,5 ans d'âge", () => {
    // 600 × (7,5 − 2,5) / 7,5 = 400
    expect(apercuDepuisSaisie(saisie("600", "7,5", "2,5"))).toEqual({ montant: 400, amorti: false });
    expect(apercuDepuisSaisie(saisie("600", "7.5", "2.5"))).toEqual({ montant: 400, amorti: false });
  });

  it("« 7,5 » n'est ni 75 ni 7 : la virgule est lue", () => {
    // Si la durée était lue 75, l'aperçu serait 600 × (75 − 2,5) / 75 = 580.
    expect(apercuDepuisSaisie(saisie("600", "7,5", "2,5")).montant).not.toBe(580);
  });

  it("un élément amorti (âge ≥ durée de vie) est signalé, sans montant", () => {
    expect(apercuDepuisSaisie(saisie("600", "7", "7"))).toEqual({ montant: null, amorti: true });
    expect(apercuDepuisSaisie(saisie("600", "7,5", "8"))).toEqual({ montant: null, amorti: true });
  });

  it.each(["", "abc", "1e3", "0x10", "Infinity", "1 234,50", "1.234,50", "-5", "0", "12,345"])(
    "un coût illisible ou refusé par le serveur (« %s ») ne donne pas d'aperçu",
    (cout) => {
      expect(apercuDepuisSaisie(saisie(cout)).montant).toBeNull();
    }
  );

  it.each(["abc", "1e1", "0x7", "Infinity", "7,5,1"])(
    "une durée de vie illisible (« %s ») compte pour « non renseignée » : le coût est retenu en entier",
    (duree) => {
      expect(apercuDepuisSaisie(saisie("200", duree, "2"))).toEqual({ montant: 200, amorti: false });
    }
  );
});
