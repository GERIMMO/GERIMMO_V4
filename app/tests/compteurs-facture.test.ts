import { describe, expect, it } from "vitest";
import { compteursPourFacture } from "../src/lib/compteurs-facture";
const facture = { periode_debut: "2026-01-01", periode_fin: "2026-02-01" };
const ancien = { id: "ancien", lot_id: "lot", type: "eau_froide", unite: "m3", date_index_initial: "2026-01-01", actif: false };
describe("compteurs documentant la facture", () => {
  it("reprend le compteur archivé qui couvre la facture, sans choisir son remplaçant", () => {
    const nouveau = { ...ancien, id: "nouveau", actif: true, date_index_initial: "2026-02-01" };
    expect(compteursPourFacture([ancien, nouveau], [{ compteur_id: "ancien", date_releve: "2026-02-01" }], facture, "eau", "lot")).toEqual([ancien]);
  });
  it("ne présente pas une période incomplète comme utilisable", () => {
    expect(compteursPourFacture([ancien], [{ compteur_id: "ancien", date_releve: "2026-01-31" }], facture, "eau", "lot")).toEqual([]);
  });
  it("conserve l’ambiguïté eau chaude/eau froide pour un choix explicite", () => {
    const chaud = { ...ancien, id: "chaud", type: "eau_chaude" };
    const relevés = [ancien, chaud].map(c => ({ compteur_id: c.id, date_releve: "2026-02-01" }));
    expect(compteursPourFacture([ancien, chaud], relevés, facture, "eau", "lot")).toHaveLength(2);
    expect(compteursPourFacture([ancien, chaud], relevés, facture, "electricite_commune", "lot")).toEqual([]);
    expect(compteursPourFacture([ancien, chaud], relevés, facture, "eau", "autre")).toEqual([]);
  });
});
