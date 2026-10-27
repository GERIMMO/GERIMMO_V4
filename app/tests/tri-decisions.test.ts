import { describe, expect, it } from "vitest";
import { filtreDecision, rechercherDecisions, trierDecisions } from "../src/lib/tri-decisions";
import type { DecisionDeFile } from "../src/lib/decisions-attendues";

const d = (cle: string, source: DecisionDeFile["source"], lien = "/admin/veille"): DecisionDeFile => ({ cle, source, source_id: cle, lien, titre: cle, pourquoi: "", equipe: "conformite" });
describe("La file de direction privilégie les problèmes sans décider à la place du dirigeant", () => {
  it("conserve chaque sujet et place un ancien N1 avant les N2 et les trente actualités", () => {
    const source = [...Array.from({ length: 30 }, (_, i) => d(`actualité-${i}`, "veille")), d("N1 ancien", "retour", "/admin/retours?nature=bug"), d("N2 récent", "retour", "/admin/retours?nature=bug"), d("artisan", "artisan"), d("idée", "retour", "/admin/retours?nature=idee")];
    const entrees = trierDecisions(source, [{ cle: "sante", titre: "Santé", detail: "Lecture indisponible", action: "Examiner" }]);
    expect(entrees.map(e => e.cle).slice(0, 5)).toEqual(["signal:sante", "N1 ancien", "N2 récent", "artisan", "idée"]);
    expect(entrees).toHaveLength(source.length + 1);
    expect(source[0].cle).toBe("actualité-0");
    expect(entrees.filter(e => e.categorie === "contenus")).toHaveLength(30);
  });
  it("garde publications, demandes commerciales et alertes dans leur catégorie", () => {
    const entrees = trierDecisions([d("publication", "publication"), d("évolution", "developpement")], [
      { cle: "devis", titre: "Devis", detail: "", action: "Répondre" },
      { cle: "alertes", titre: "Alertes", detail: "", action: "Ouvrir" },
    ]);
    expect(entrees.map(e => [e.cle, e.categorie])).toEqual([["signal:alertes", "incidents"], ["signal:devis", "accords"], ["évolution", "accords"], ["publication", "contenus"]]);
  });
  it("cherche sans accents et n'efface pas les autres catégories", () => {
    const entrees = trierDecisions([d("Réviser le loyer", "veille"), d("Bail à signer", "publication")], []);
    expect(rechercherDecisions(entrees, "contenus", "reviser LOYER").map(e => e.cle)).toEqual(["Réviser le loyer"]);
    expect(rechercherDecisions(entrees, "incidents", "")).toEqual([]);
    expect(rechercherDecisions(entrees, "tout", "")).toHaveLength(2);
    expect(filtreDecision("inconnu")).toBe("tout");
  });
});
