import { describe, expect, it } from "vitest";
import { saisieCompteur, saisieContrat, saisieFacture } from "@/lib/saisie-consommations";
import { proposerPartsOccupation } from "@/lib/proposition-repartition";
const fd = (v: Record<string, string>) => { const f = new FormData(); for (const [k, x] of Object.entries(v)) f.set(k, x); return f; };
describe("saisie et répartition du patrimoine", () => {
  it("ne demande pas un nom déjà connu pour le compteur", () => {
    const r = saisieCompteur(fd({ type: "eau_froide", index_initial: "123,004", date_index_initial: "2026-10-01", prochaine_demande: "2026-11-01" }), "2026-10-28");
    expect(r).toMatchObject({ libelle: "Eau froide", index_initial: "123.004", periodicite_mois: 1, unite: "m3" });
  });
  it("refuse un relevé futur ou une fausse date", () => {
    expect(() => saisieCompteur(fd({ type: "eau_froide", index_initial: "1", date_index_initial: "2026-11-01", prochaine_demande: "2026-12-01" }), "2026-10-28")).toThrow(/futur/);
    expect(() => saisieCompteur(fd({ type: "eau_froide", index_initial: "1", date_index_initial: "2026-02-30", prochaine_demande: "2026-12-01" }), "2026-10-28")).toThrow(/dates/);
  });
  it("un contrat nécessite seulement le fournisseur et sa nature", () => expect(saisieContrat(fd({ fournisseur: "Eau locale", categorie: "eau" }))).toMatchObject({ montant_cents: null, echeance: null, preavis_jours: 30 }));
  it("conserve les centimes, isole les frais TEOM et refuse un montant illisible", () => {
    const f = { reference: "TEOM2026", periode_debut: "2026-01-01", periode_fin: "2026-12-31", total: "100,01", frais_gestion: "8,01" };
    expect(saisieFacture(fd(f))).toMatchObject({ total_cents: 10001, frais_gestion_cents: 801 });
    expect(() => saisieFacture(fd({ ...f, total: "100.001" }))).toThrow();
    expect(() => saisieFacture(fd({ ...f, frais_fixes: "99" }))).toThrow(/dépasser/);
  });
  it("répartit une occupation partielle et laisse la vacance au bailleur", () => {
    const r = proposerPartsOccupation([{ id: "a", nom: "T2", poids: 100 }], [{ id: "b", lot_id: "a", date_debut: "2026-01-11", date_fin: null, charges_mode: "provision" }], "2026-01-01", "2026-01-30", "eau", true);
    expect(r).toEqual([{ lot_id: "a", bail_id: "b", poids: 2000, poids_fixe: 2000, recuperable: true }, { lot_id: "a", bail_id: null, poids: 1000, poids_fixe: 1000, recuperable: false }]);
  });
  it("ne fait jamais payer une consommation privée ou un forfait", () => {
    const lots = [{ id: "a", nom: "T2", poids: 1 }];
    const baux = [{ id: "b", lot_id: "a", date_debut: "2025-01-01", date_fin: null, charges_mode: "forfait" }];
    expect(proposerPartsOccupation(lots, baux, "2026-01-01", "2026-01-31", "eau", true)[0].recuperable).toBe(false);
    expect(proposerPartsOccupation(lots, [{ ...baux[0], charges_mode: "provision" }], "2026-01-01", "2026-01-31", "electricite_privative", true)[0].recuperable).toBe(false);
  });
  it("ne double pas une part en présence de baux simultanés", () => expect(() => proposerPartsOccupation([{ id: "a", nom: "T2", poids: 1 }], [{ id: "b", lot_id: "a", date_debut: "2025-01-01", date_fin: null, charges_mode: "provision" }, { id: "c", lot_id: "a", date_debut: "2025-02-01", date_fin: null, charges_mode: "provision" }], "2026-01-01", "2026-01-31", "eau", true)).toThrow(/chevauchent/));
  it("une chambre vide garde sa part sans faire payer les colocataires présents", () => {
    const r = proposerPartsOccupation([{ id: "a", nom: "Colocation", poids: 1 }], [{ id: "b", lot_id: "a", chambre_id: "ch1", date_debut: "2025-01-01", date_fin: null, charges_mode: "provision" }], "2026-01-01", "2026-01-30", "eau", true, { mode: "egales", chambres: [{ id: "ch1", lot_id: "a", surface_m2: 10 }, { id: "ch2", lot_id: "a", surface_m2: 20 }] });
    expect(r).toEqual([{ lot_id: "a", bail_id: "b", poids: 1, poids_fixe: 1, recuperable: true }, { lot_id: "a", bail_id: null, poids: 1, poids_fixe: 1, recuperable: false }]);
  });
  it("la surface des chambres est une clé distincte confirmée, sans changer la part des autres logements", () => {
    const r = proposerPartsOccupation([{ id: "a", nom: "Colocation", poids: 1 }, { id: "z", nom: "T2", poids: 1 }], [{ id: "b", lot_id: "a", chambre_id: "ch1", date_debut: "2025-01-01", date_fin: null, charges_mode: "provision" }], "2026-01-01", "2026-01-30", "eau", true, { mode: "surfaces", chambres: [{ id: "ch1", lot_id: "a", surface_m2: 10 }, { id: "ch2", lot_id: "a", surface_m2: 30 }] });
    expect(r.map(p => p.poids)).toEqual([1, 3, 4]);
  });
});
