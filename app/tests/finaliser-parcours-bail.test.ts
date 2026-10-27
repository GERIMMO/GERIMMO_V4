import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CompletudeBail } from "@/lib/suivi-enregistrement";
import { EtapeComplementsBail } from "@/lib/etape-complements-bail";

vi.mock("@/app/actions/documents-generes", () => ({ genererDocument: vi.fn() }));
vi.mock("@/components/signature-electronique-bail", () => ({ SignatureElectroniqueBail: vi.fn(() => createElement("div", null, "Suivi des signatures conservé")) }));
vi.mock("@/components/ouvrir-signature-document", () => ({ OuvrirSignatureDocument: () => createElement("button", { type: "button" }, "Signature de l’état des lieux") }));
vi.mock("@/components/racine-espace-contexte", () => ({ useBaseEspace: () => "/espace/org", useRacineEspace: () => "/espace" }));

import { FinaliserParcoursBail, PointsManquantsFinalisation, documentPdfCourant } from "../src/app/agence/[orgId]/baux/[bailId]/finaliser-parcours-bail";
import { SignatureElectroniqueBail } from "@/components/signature-electronique-bail";
const props = { orgId: "org", bailId: "bail", code: "bail_nu" as const, signataires: [], edlId: null, preparationEdl: createElement("button", null, "Préparer la grille"), signatureManuelle: null, proprietaireDirect: true };
function rendre(controle: { manquants: string[]; erreur?: string } | null = { manquants: [] }, supplement: Partial<Parameters<typeof FinaliserParcoursBail>[0]> = {}) {
  return renderToStaticMarkup(createElement(CompletudeBail.Provider, { value: controle },
    createElement(EtapeComplementsBail.Provider, { value: { etape: "recapitulatif", revision: 2, ouvrir: vi.fn() } }, createElement(FinaliserParcoursBail, { ...props, ...supplement }))));
}
function boutonBail(html: string) { return (html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []).find(b => b.includes("Générer le PDF du bail")); }

describe("finalisation du bail : contrôle avant génération et consultation sur place", () => {
  it("autorise la génération quand les informations du contrat sont complètes", () => {
    const html = rendre();
    expect(boutonBail(html)).toBeDefined(); expect(boutonBail(html)).not.toMatch(/\sdisabled(?:=|\s|>)/);
    expect(html).toContain("Suivi des signatures conservé");
  });
  it("désactive la génération même si seule la vérification est en erreur", () => {
    const html = rendre({ manquants: [], erreur: "Contrôle indisponible" }, { recapitulatifStructure: true });
    expect(boutonBail(html)).toMatch(/\sdisabled(?:=|\s|>)/); expect(html).toContain('href="#bilan-bail"');
    expect(html).toContain("Vérification nécessaire");
  });
  it("garde les champs manquants et leurs liens dans le mode de repli", () => {
    const html = rendre({ manquants: ["Surface habitable"] });
    expect(boutonBail(html)).toMatch(/\sdisabled(?:=|\s|>)/); expect(html).toContain("Surface habitable"); expect(html).toContain("À compléter avant le PDF");
  });
  it("évite la deuxième liste quand le bilan structuré fournit déjà les manquants", () => {
    const html = rendre({ manquants: ["Surface habitable"] }, { recapitulatifStructure: true });
    expect(boutonBail(html)).toMatch(/\sdisabled(?:=|\s|>)/); expect(html).not.toContain("Surface habitable");
    expect(html).not.toContain("À compléter avant le PDF"); expect(html).toContain('href="#bilan-bail"');
  });
  it("transmet au suivi de signature seulement les manquants présentés par le bilan structuré", () => {
    rendre({ manquants: ["Surface habitable"] }, { recapitulatifStructure: true });
    expect(vi.mocked(SignatureElectroniqueBail).mock.lastCall?.[0].manquantsDejaAffiches).toEqual(["Surface habitable"]);
    rendre({ manquants: ["Surface habitable"] });
    expect(vi.mocked(SignatureElectroniqueBail).mock.lastCall?.[0].manquantsDejaAffiches).toBeUndefined();
  });
  it("garde les nouveaux manquants de génération accessibles quand le bilan ne les connaît pas", () => {
    const html = renderToStaticMarkup(createElement(PointsManquantsFinalisation, {
      manquants: ["Surface habitable", "Commune de naissance du locataire"], manquantsRecap: ["Surface habitable"], recapitulatifStructure: true, orgId: "org", racine: "/espace",
    }));
    expect(html).toContain("Commune de naissance du locataire"); expect(html).toContain("Autres informations à compléter");
    expect(html).toContain('href="'); expect(html).not.toContain("Surface habitable");
  });
  it("ouvre le contrat signé dans une fenêtre sans lien vers un nouvel onglet", () => {
    const html = rendre({ manquants: [], erreur: "Contrôle indisponible" }, { documentSigne: "doc-signe" });
    expect(html).toContain("Consulter le bail signé"); expect(html).toContain('aria-haspopup="dialog"');
    expect(boutonBail(html)).toBeUndefined(); expect(html).not.toContain('target="_blank"');
  });
  it("en consultation, garde le contrat et la grille sans proposer de mutation", () => {
    const html = rendre(null, { lectureSeule: true, documentSigne: "doc-signe", edlId: "edl" });
    expect(html).toContain("Consulter le bail signé"); expect(html).toContain('href="/espace/org/baux/bail/edl/edl"');
    expect(html).not.toContain("Générer le PDF"); expect(html).not.toContain("Signature de l’état des lieux"); expect(html).not.toContain("Suivi des signatures conservé");
  });
  it("la grille et son circuit de signature gardent leurs accès", () => {
    const html = rendre({ manquants: [] }, { edlId: "edl" });
    expect(html).toContain("Grille disponible"); expect(html).toContain("Compléter la grille"); expect(html).toContain("Signature de l’état des lieux");
  });
  it("une grille absente reste honnête en consultation", () => {
    const html = rendre(null, { lectureSeule: true }); expect(html).toContain("Aucune grille disponible."); expect(html).not.toContain("Préparer la grille</button>");
  });
});

describe("validité de l’aperçu local", () => {
  const generation = { revision: 2, resultat: { documentId: "pdf", manquants: [] } };
  it("autorise uniquement le PDF de la révision courante", () => {
    expect(documentPdfCourant(generation, 2, { manquants: [] })).toBe("pdf");
    expect(documentPdfCourant(generation, 3, { manquants: [] })).toBeNull();
  });
  it("retire un PDF en cas d’erreur du contrôle ou de la génération", () => {
    expect(documentPdfCourant(generation, 2, { manquants: [], erreur: "Échec" })).toBeNull();
    expect(documentPdfCourant({ ...generation, resultat: { documentId: "pdf", erreur: "Rattachement impossible" } }, 2)).toBeNull();
  });
  it("ne présente jamais un PDF dont des informations restent manquantes", () => {
    expect(documentPdfCourant(generation, 2, { manquants: ["Surface"] })).toBeNull();
    expect(documentPdfCourant({ ...generation, resultat: { documentId: "pdf", manquants: ["Locataire"] } }, 2)).toBeNull();
    expect(documentPdfCourant(null, 2)).toBeNull();
  });
});
