import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlanApurementLocataire } from "@/components/plan-apurement-locataire";
import { FilMessages, SUGGESTIONS } from "@/app/locataire/[orgId]/contact/fil-messages";
import { AIDE_BOUTON_EN_ATTENTE } from "@/lib/use-hydrate";

vi.mock("@/app/actions/plan-apurement", () => ({ demanderPlanApurement: vi.fn() }));
vi.mock("@/app/actions/messages", () => ({ envoyerMessageLocataire: vi.fn() }));

describe("commandes du locataire avant le chargement du navigateur", () => {
  it("attend que le formulaire de demande de plan puisse être ouvert avant de proposer la commande", () => {
    const html = renderToStaticMarkup(createElement(PlanApurementLocataire, {orgId: "fictif", plan: null, demandeEnCours: false, detteEchue: 1100}));
    const bouton = html.match(/<button[^>]*>Demander un plan de paiement<\/button>/)?.[0];
    expect(bouton).toContain('disabled=""');
    expect(bouton).toContain(AIDE_BOUTON_EN_ATTENTE);
  });
  it("attend que les suggestions puissent effectivement remplir le brouillon", () => {
    const html = renderToStaticMarkup(createElement(FilMessages, {orgId: "fictif", messages: [], agence: "Gestion fictive"}));
    const boutons = [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)]
      .filter(([, , texte]) => SUGGESTIONS.includes(texte.replaceAll("&#x27;", "'")));
    expect(boutons).toHaveLength(3);
    for (const [, attributs] of boutons) {
      expect(attributs).toContain('disabled=""');
      expect(attributs).toContain(AIDE_BOUTON_EN_ATTENTE);
    }
  });
});
