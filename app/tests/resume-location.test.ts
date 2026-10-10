import { describe, expect, it } from "vitest";
import { ageAu, personnesDuResume, type BailResume, type IdentiteResume } from "@/lib/resume-location";
const bail = (id: string, principal: string): BailResume => ({ id, locataire_principal: principal, date_debut: null, date_fin: null, loyer_hc: null, charges: null });
const personne = (id: string): IdentiteResume => ({ id, nom: id, prenom: null, date_naissance: null, telephone: null });
describe("Résumé de location", () => {
  it("calcule l’âge avant et le jour de l’anniversaire", () => {
    expect(ageAu("1990-10-08", "2026-10-07")).toBe(35);
    expect(ageAu("1990-10-07", "2026-10-07")).toBe(36);
    expect(ageAu("2000-02-29", "2026-02-28")).toBe(25);
  });
  it("ne fabrique pas d’âge depuis une date absente, impossible ou future", () => {
    for (const d of [null, "inconnue", "2000-02-30", "2027-01-01"]) expect(ageAu(d, "2026-10-07")).toBeNull();
  });
  it("déduplique le principal, conserve plusieurs locataires et plusieurs garants", () => {
    const liens = [
      { bail_id: "b", person_id: "p", role: "colocataire", garant_de: null, date_depart: null },
      { bail_id: "b", person_id: "c", role: "colocataire", garant_de: null, date_depart: "2026-08-01" },
      { bail_id: "b", person_id: "g1", role: "garant", garant_de: "p", date_depart: null },
      { bail_id: "b", person_id: "g2", role: "garant", garant_de: "c", date_depart: null },
    ];
    const r = personnesDuResume([bail("b", "p")], liens, ["p", "c", "g1", "g2"].map(personne));
    expect(r.locataires.map(p => p.person_id)).toEqual(["p", "c"]);
    expect(r.locataires[1].depart).toBe("2026-08-01");
    expect(r.garants.map(p => p.garant_de)).toEqual(["p", "c"]);
  });
  it("conserve le rattachement au contrat et exclut un bail étranger", () => {
    const r = personnesDuResume([bail("b1", "p"), bail("b2", "p")], [{ bail_id: "etranger", person_id: "x", role: "garant", garant_de: null, date_depart: null }], []);
    expect(r.locataires.map(l => l.bail_id)).toEqual(["b1", "b2"]);
    expect(r.locataires[0].personne).toBeNull();
    expect(r.garants).toEqual([]);
  });
});
