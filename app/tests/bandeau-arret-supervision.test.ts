/**
 * Audit du 13/10/2026 (SA-04) : l'arrêt d'urgence et le mode relais n'étaient visibles que sur /admin/relais.
 */
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BandeauArretSupervision, type ArretEnCours, type RelaisEnCours } from "../src/components/bandeau-arret-supervision";

const rendre = (arrets: ArretEnCours[], relais: RelaisEnCours[]) =>
  renderToStaticMarkup(createElement(BandeauArretSupervision, { arrets, relais }));

describe("BandeauArretSupervision", () => {
  it("n'affiche rien quand tout est normal", () => {
    expect(rendre([], [])).toBe("");
  });

  it("dit l'arrêt d'urgence, son périmètre, sa date à l'heure de Paris et son motif", () => {
    const html = rendre([{ cle: "global", motif: "Essai de contrôle", modifie_le: "2026-10-13T22:42:00Z" }], []);
    expect(html).toContain("Arrêt d’urgence en cours : Tous les traitements contrôlés");
    expect(html).toContain("14/10/2026 00:42"); // 22 h 42 UTC = 00 h 42 à Paris
    expect(html).toContain("Essai de contrôle");
    expect(html).toContain('href="/admin/relais"');
    expect(html).toContain('role="status"');
  });

  it("dit le mode relais actif avec sa fin", () => {
    const html = rendre([], [{ fin: "2026-10-15T04:25:00Z" }]);
    expect(html).toContain("Mode relais actif");
    expect(html).toContain("15/10/2026 06:25");
  });
});
