import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DiagnosticsBail } from "@/app/agence/[orgId]/baux/[bailId]/diagnostics-bail";
import { FournisseurRacineEspace } from "@/components/racine-espace-contexte";
import type { DiagnosticBail } from "@/lib/documents-bail";

const props = {
  orgId: "org", bailId: "bail", bienId: "bien", lotId: "lot", aujourdhui: "2026-10-27",
  contexte: { typeBien: "appartement", anneeConstruction: 2005, qualifications: [], referenceDate: "2026-10-27" },
};
const diagnostic = (id: string, date: string): DiagnosticBail => ({ id, type: "dpe", niveau: "lot", date_realisation: date, date_expiration: "2035-01-01", document_id: id, classe_dpe: "B" });

it("rend les manquants avec des actions conservant le retour à l’étape Documents du bail propriétaire", () => {
  const html = renderToStaticMarkup(createElement(FournisseurRacineEspace, { racine: "/espace" }, createElement(DiagnosticsBail, { ...props, diagnostics: [] })));
  expect(html).toContain("DPE");
  expect(html).toContain("Électricité");
  expect(html).toContain("ERP — état des risques");
  expect(html).toContain('aria-label="Ajouter le rapport : DPE"');
  expect(html).toContain('aria-label="Préciser l’installation : Gaz"');
  expect(html).toContain('/espace/org/parc/bien/lots/lot?parcours=1&amp;etape=diagnostics&amp;retourBail=bail&amp;retourEtape=5');
  expect(html).not.toContain("Aucun diagnostic enregistré");
});

it("replie les anciens rapports et ouvre l’aperçu par un bouton sans nouvel onglet", () => {
  const html = renderToStaticMarkup(createElement(DiagnosticsBail, { ...props, diagnostics: [diagnostic("ancien", "2025-01-01"), diagnostic("recent", "2026-01-01")] }));
  expect(html).toContain("Rapports précédents · 1");
  expect(html).toMatch(/<details[^>]*><summary/);
  expect(html).not.toMatch(/<details[^>]*\sopen/);
  expect(html).toContain('aria-label="Voir DPE"');
  expect(html).toContain('aria-label="Voir DPE du 01/01/2025"');
  expect(html).not.toContain('target="_blank"');
});

it("rend une erreur de contexte explicite sans afficher un état vert", () => {
  const html = renderToStaticMarkup(createElement(DiagnosticsBail, { ...props, diagnostics: [diagnostic("recent", "2026-01-01")], erreurContexte: true }));
  expect(html).toContain('role="alert"');
  expect(html).not.toContain('data-ton="ok"');
  expect(html).toContain('aria-label="Voir DPE"');
});
