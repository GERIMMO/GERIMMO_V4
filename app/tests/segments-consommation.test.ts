import { expect, it } from "vitest";
import { segmentsConsommation } from "@/lib/segments-consommation";
const base = { lotId: "a", compteurId: "c", datesRelevees: ["2026-01-01", "2026-01-10", "2026-02-01"], debut: "2026-01-01", fin: "2026-02-01", categorie: "eau" as const, recuperable: true };
it("sépare deux occupants aux relevés réels et conserve leurs frais fixes", () => {
  const r = segmentsConsommation({ ...base, baux: [{ id: "b1", lot_id: "a", date_debut: "2025-01-01", date_fin: "2026-01-10", charges_mode: "provision" }, { id: "b2", lot_id: "a", date_debut: "2026-01-10", date_fin: null, charges_mode: "provision" }], partsFixes: [{ lot_id: "a", bail_id: "b1", poids: 10, poids_fixe: 10, recuperable: true }, { lot_id: "a", bail_id: "b2", poids: 22, poids_fixe: 22, recuperable: true }] });
  expect(r.map(s => [s.bail_id, s.periode_debut, s.periode_fin, s.poids_fixe])).toEqual([["b1", "2026-01-01", "2026-01-10", 10], ["b2", "2026-01-10", "2026-02-01", 22]]);
});
it("refuse de deviner une consommation lors d'un changement entre deux relevés", () => {
  expect(() => segmentsConsommation({ ...base, baux: [{ id: "b", lot_id: "a", date_debut: "2026-01-15", date_fin: null, charges_mode: "provision" }], partsFixes: [] })).toThrow(/Ajoutez le relevé/);
});
it("une borne de facture sans relevé reste bloquante", () => expect(() => segmentsConsommation({ ...base, datesRelevees: ["2026-01-10", "2026-02-01"], baux: [], partsFixes: [] })).toThrow(/début ou de fin/));
it("garde les fractions vacantes d'une colocation et ne régularise pas un forfait", () => {
  const r = segmentsConsommation({ ...base, baux: [{ id: "b", lot_id: "a", chambre_id: "ch1", date_debut: "2025-01-01", date_fin: null, charges_mode: "forfait" }], partsFixes: [{ lot_id: "a", bail_id: "b", poids: 1, poids_fixe: 1, recuperable: false }, { lot_id: "a", bail_id: null, poids: 1, poids_fixe: 1, recuperable: false }], colocation: { mode: "egales", chambres: [{ id: "ch1", lot_id: "a", surface_m2: 10 }, { id: "ch2", lot_id: "a", surface_m2: 15 }] } });
  expect(r).toHaveLength(4); expect(r.every(l => !l.recuperable)).toBe(true);
  for (const debut of ["2026-01-01", "2026-01-10"]) expect(r.filter(s => s.periode_debut === debut).reduce((sum, s) => sum + s.fraction_numerateur! / s.fraction_denominateur!, 0)).toBe(1);
  expect(r.reduce((sum, s) => sum + s.poids_fixe, 0)).toBe(2);
});
