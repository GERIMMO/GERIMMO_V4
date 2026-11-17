import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DocumentQuittance } from "@/app/quittance/[quittanceId]/document-quittance";

it("le cadre HTML est présent dès l’ouverture, l’impression attend son activation", () => {
  const rendu = renderToStaticMarkup(createElement(DocumentQuittance, {
    html: "<h1>Quittance fictive</h1>",
    titre: "Quittance de loyer",
    imprimerAuChargement: false,
  }));

  expect(rendu).toContain("allow-same-origin allow-modals");
  expect(rendu).toMatch(/<button\b[^>]*\bdisabled(?:=|\s|>)/);
});
