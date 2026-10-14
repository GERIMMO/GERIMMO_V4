import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/app/actions/edl", () => ({ majGrilleEdl: vi.fn() }));
import { GrilleEdl } from "@/app/agence/[orgId]/baux/[bailId]/edl/[edlId]/grille-edl";

it("garde toutes les pièces d’un état des lieux signé consultables", () => {
  const html = renderToStaticMarkup(createElement(GrilleEdl, {
    orgId: "org", bailId: "bail", edlId: "edl", compteId: "compte", signe: true,
    lignes: ["Cuisine", "Chambre", "Séjour"].map((piece, i) => ({
      id: `ligne-${i}`, piece, categorie: "general", libelle: "Sols", etat: "bon", commentaire: null,
    })),
  }));
  expect(html).toContain("Cuisine");
  expect(html).toContain("Chambre");
  expect(html).toContain("Séjour");
  expect(html).not.toMatch(/<div[^>]+hidden/);
});
