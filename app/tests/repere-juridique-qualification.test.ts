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
import { FormulaireCloture, FormulaireQualification } from "@/app/agence/[orgId]/incidents/[incidentId]/actions-incident";

const rendre = (estProprietaire?: boolean, informeLocataire = true) =>
  renderToStaticMarkup(
    createElement(FormulaireQualification, { orgId: "org", incidentId: "inc", categorie: "plomberie_canalisation", informeLocataire, ...(estProprietaire === undefined ? {} : { estProprietaire }) }),
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
  it("ne promet pas d’informer un locataire sans personne rattachée au dossier du propriétaire", () => {
    expect(rendre(true)).toContain("seront visibles dans l’espace du locataire");
    expect(rendre(true, false)).not.toContain("seront visibles dans l’espace du locataire");
    expect(rendre(false, false)).toContain("Le locataire est informé immédiatement");
  });

  it("associe chaque libellé au bon champ quand plusieurs dossiers proposent une action sur le même écran", () => {
    const html = renderToStaticMarkup(createElement("div", null, ...["incident-1", "incident-2"].flatMap(incidentId => [
      createElement(FormulaireQualification, {
        key: `${incidentId}-qualification`, orgId: "org", incidentId, categorie: "plomberie_canalisation",
      }),
      createElement(FormulaireCloture, {
        key: `${incidentId}-cloture`, orgId: "org", incidentId, motifs: ["sans_suite", "transmis_syndic"],
      }),
    ])));
    const champs = [...html.matchAll(/<(?:textarea|select)\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]);
    const libelles = [...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map(match => match[1]);
    expect(champs).toHaveLength(6);
    expect(new Set(champs).size).toBe(6);
    expect(libelles.sort()).toEqual([...champs].sort());
    expect(html).not.toContain("checked=");
    for (const nom of ["justification", "motif", "commentaire"]) {
      expect(html.match(new RegExp(`name="${nom}"`, "g"))).toHaveLength(2);
    }
  });
});
