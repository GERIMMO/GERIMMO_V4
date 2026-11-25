/**
 * Phase 3, lot 50 (reprise) — le manquant « IBAN » d'un contrat payé par virement mène au profil de l'espace, où l'IBAN se
 * saisit, et non à la rubrique des clauses du bail. Avant la reprise, cibleChampBail renvoyait « #complements-conditions »
 * (étape « clauses ») et le repère « profil » ne s'allumait pas.
 */
import { describe, expect, it } from "vitest";
import { LIBELLE_COORDONNEES_BANCAIRES } from "@/lib/documents/modeles/communs";
import { cibleChampBail } from "@/lib/documents/champs-bail-parcours";
import { champsManquantsBail } from "@/lib/reperes-bail";

describe("lot 50, reprise — le manquant IBAN du bail mène au profil", () => {
  it("cibleChampBail renvoie le profil de l'espace (agence et propriétaire)", () => {
    expect(cibleChampBail(LIBELLE_COORDONNEES_BANCAIRES, "org")).toEqual({ href: "/agence/org/profil", etape: "personnes" });
    expect(cibleChampBail(LIBELLE_COORDONNEES_BANCAIRES, "org", "/espace").href).toBe("/espace/org/profil");
  });
  it("le repère du bail compte ce manquant dans le profil", () => {
    expect([...champsManquantsBail([LIBELLE_COORDONNEES_BANCAIRES])]).toEqual(["profil"]);
  });
  it("les autres manquants de paiement restent dans l'étape loyer", () => {
    expect(cibleChampBail("lieu et modalités de paiement", "org").href).toBe("#complements-paiement");
  });
});
