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

// Audit palier 1 du 22/11/2026, P2-01 : signé, la photo d'un élément se consulte et ne se modifie plus.
it("état des lieux signé : la photo d’un élément se consulte, sans bouton pour l’ajouter, la remplacer ou la retirer", () => {
  const html = renderToStaticMarkup(createElement(GrilleEdl, {
    orgId: "org", bailId: "bail", edlId: "edl", compteId: "compte", signe: true,
    lignes: [
      { id: "ligne-0", piece: "Séjour", categorie: "piece", libelle: "Sols", etat: "bon", commentaire: null, photo_document_id: "doc-1" },
      { id: "ligne-1", piece: "Séjour", categorie: "piece", libelle: "Murs", etat: "bon", commentaire: null, photo_document_id: null },
    ],
  }));
  expect(html.match(/data-photo-ligne="oui"/g)).toHaveLength(1);
  expect(html).not.toContain('data-photo-ligne="non"');
  expect(html).toMatch(/href="[^"]*\/documents\/doc-1\/fichier"/);
  expect(html).toContain("Voir la photo");
  expect(html).not.toMatch(/Ajouter une photo|Remplacer la photo|Retirer la photo|type="file"/);
});
