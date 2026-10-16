import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Les gestes serveur ne servent pas au rendu : on les remplace par des fonctions vides.
vi.mock("@/app/actions/incidents", () => ({
  attribuerIncident: vi.fn(),
  cloturerIncident: vi.fn(),
  joindrePhotoIncident: vi.fn(),
  qualifierIncident: vi.fn(),
  rouvrirIncident: vi.fn(),
}));
import { FormulaireQualification } from "@/app/agence/[orgId]/incidents/[incidentId]/actions-incident";

const rendre = (estProprietaire?: boolean) =>
  renderToStaticMarkup(
    createElement(FormulaireQualification, { orgId: "org", incidentId: "inc", categorie: "plomberie_canalisation", ...(estProprietaire === undefined ? {} : { estProprietaire }) }),
  );

describe("Qualification d'un incident : le repère juridique parle à la bonne personne", () => {
  it("le propriétaire direct lit « C'est vous qui décidez qui paie »", () => {
    const html = rendre(true);
    expect(html).toContain("C&#x27;est vous qui décidez qui paie.");
    expect(html).not.toContain("tranchez à la qualification");
  });
  it("le gestionnaire d'agence garde « C'est vous qui tranchez à la qualification »", () => {
    for (const html of [rendre(false), rendre()]) {
      expect(html).toContain("C&#x27;est vous qui tranchez à la qualification.");
      expect(html).not.toContain("décidez qui paie");
    }
  });
});
