/**
 * Audit de la refonte #264, domaine diagnostics — rendus des fiches et de la bibliothèque, sans navigateur :
 *  - DOC-09 : sur la fiche bien (lignes non compactes), « Voir le document » ouvre l'aperçu intégré, comme sur la fiche
 *    lot, au lieu d'un nouvel onglet ;
 *  - DOC-12 : bâtiment construit il y a moins de quinze ans, l'année d'installation de l'électricité et du gaz est
 *    proposée d'après la construction, à confirmer (rien n'est enregistré sans « Enregistrer ») ; jamais une année à
 *    venir (bâtiment vendu sur plan), que le serveur refuserait ;
 *  - DOC-01 : une échéance passée se lit « Échu », même pour un diagnostic dont le fichier manque encore ;
 *  - DOC-04, DOC-N1, DOC-03 : un rapport de diagnostic dit son échéance réelle (plafond du DPE compris), le bien ou le
 *    lot qu'il sert et la fiche où le renouveler.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-action-formulaire", () => ({
  useActionFormulaire: () => ({ etat: {}, soumettre: vi.fn(), enCours: false, version: 0 }),
}));
vi.mock("@/app/actions/parc", () => ({ deposerDiagnostic: vi.fn() }));
vi.mock("@/app/actions/qualification-diagnostic", () => ({ enregistrerQualificationDiagnostic: vi.fn() }));
vi.mock("@/app/actions/classe-dpe-lot", () => ({ corrigerClasseDpeLot: vi.fn() }));

import { LignesDiagnostics } from "../src/app/agence/[orgId]/parc/[bienId]/lignes-diagnostics";
import { presentationRapport, syntheseRapport, type UsageRapport } from "../src/lib/rapports-diagnostic";
import { presentationDocument, jourAParis } from "../src/lib/presentation-document";

const ERP = { id: "erp", type: "erp", date_realisation: "2026-10-01", date_expiration: "2027-04-01", diagnostiqueur: null, document_id: "piece-erp" };

describe("DOC-09 : « Voir le document » de la fiche bien ouvre l'aperçu intégré", () => {
  it("rend un bouton, sans lien vers un nouvel onglet", () => {
    const html = renderToStaticMarkup(createElement(LignesDiagnostics, {
      orgId: "org", bienId: "bien", lotId: null, niveau: "bien", attendus: ["erp"], diagnostics: [ERP],
    }));
    expect(html).not.toContain('target="_blank"');
    const bouton = (html.match(/<button\b[^>]*>[^<]*<\/button>/g) ?? []).find((b) => b.includes("Voir le document : ERP"));
    expect(bouton).toContain(">Voir le document<");
  });
});

describe("DOC-01 : l'échéance passée d'un diagnostic se lit « Échu », fichier joint ou non", () => {
  it("un DPE ancien saisi sans rapport, plafonné au 31/12/2024, dit « Échu » et demande toujours son fichier", () => {
    const html = renderToStaticMarkup(createElement(LignesDiagnostics, {
      orgId: "org", bienId: "bien", lotId: "lot", niveau: "lot", attendus: ["dpe"],
      diagnostics: [{ id: "dpe", type: "dpe", date_realisation: "2019-05-10", date_expiration: "2024-12-31", diagnostiqueur: null, document_id: null, classe_dpe: "D" }],
    }));
    expect(html).toContain("Fichier à joindre");
    expect(html).toContain("Échu le 31/12/2024");
    expect(html).not.toContain("Échéance le 31/12/2024");
  });

  it("une échéance à venir reste une « Échéance »", () => {
    const html = renderToStaticMarkup(createElement(LignesDiagnostics, {
      orgId: "org", bienId: "bien", lotId: null, niveau: "bien", attendus: ["erp"], diagnostics: [{ ...ERP, date_expiration: "2099-04-01" }],
    }));
    expect(html).toContain("Échéance le 01/04/2099");
  });
});

describe("DOC-12 : l'année de construction d'un bâtiment récent est proposée pour l'installation", () => {
  const rendre = (anneeConstruction: number | null, qualifications: unknown[] = []) => renderToStaticMarkup(createElement(LignesDiagnostics, {
    orgId: "org", bienId: "bien", lotId: "lot", niveau: "lot", attendus: ["electricite", "gaz"], diagnostics: [],
    qualifications: qualifications as never, anneeConstruction,
  }));
  const annee = Number(jourAParis().slice(0, 4));

  it("bâtiment de moins de quinze ans : l'année est pré-remplie et l'aide demande de confirmer", () => {
    const html = rendre(annee - 5);
    expect(html.match(new RegExp(`name="annee_installation"[^>]*value="${annee - 5}"|value="${annee - 5}"[^>]*name="annee_installation"`, "g"))).toHaveLength(2);
    expect(html).toContain(`Proposée d’après la construction du bâtiment (${annee - 5}). Enregistrez pour confirmer.`);
    // Rien n'est tranché sans le geste de l'utilisateur.
    expect(html).toContain("À préciser");
  });

  it("bâtiment ancien ou année inconnue : rien n'est proposé", () => {
    for (const html of [rendre(annee - 30), rendre(null)]) {
      expect(html).not.toContain("Proposée d’après la construction");
      expect(html).toContain("Laissez vide si vous ne savez pas.");
    }
  });

  it("bâtiment pas encore livré (vente sur plan) : aucune année à venir n'est proposée, le serveur la refuserait", () => {
    const html = rendre(annee + 1);
    expect(html).not.toContain("Proposée d’après la construction");
    expect(html).not.toContain(`value="${annee + 1}"`);
    expect(html).toContain("Laissez vide si vous ne savez pas.");
  });

  it("une réponse déjà enregistrée n'est jamais remplacée par la proposition", () => {
    const html = rendre(annee - 5, [{ type: "electricite", situation: "annee_connue", date_installation: null, annee_installation: annee - 2 }]);
    expect(html).toContain(`Installation de ${annee - 2}.`);
  });
});

describe("DOC-04, DOC-N1, DOC-03 : un rapport de diagnostic vu depuis Documents", () => {
  const usage = (surcharge: Partial<UsageRapport> = {}): UsageRapport => ({
    document_id: "piece", type: "dpe", date_realisation: "2019-05-10", date_expiration: "2029-05-10", archived_at: null,
    lot_id: "lot-g", bien_id: null, lot: { nom: "Lot unique", bien_id: "bien-g", bien: { nom: "VDD Gambetta" } }, bien: null, ...surcharge,
  });

  it("prend l'échéance du diagnostic, plafond du DPE compris : un DPE de 2019 est expiré, pas « à vérifier »", () => {
    const rapport = syntheseRapport([usage()]);
    expect(rapport?.expireLe).toBe("2024-12-31");
    const presentation = presentationRapport({ expire_le: null }, rapport, presentationDocument);
    expect(presentation.libelle).toBe("Expiré");
    expect(presentation.detail).not.toMatch(/sans vérification ni échéance/);
  });

  it("nomme le bien et le lot, et la fiche où renouveler", () => {
    expect(syntheseRapport([usage()])?.rattachements).toEqual([
      { libelle: "VDD Gambetta · Lot unique", chemin: "/parc/bien-g/lots/lot-g#diagnostics", niveau: "lot" },
    ]);
    expect(syntheseRapport([usage({ type: "erp", lot_id: null, lot: null, bien_id: "bien-b", bien: { nom: "VDD Belleville" }, date_realisation: "2026-10-01", date_expiration: "2027-04-01" })])?.rattachements)
      .toEqual([{ libelle: "VDD Belleville", chemin: "/parc/bien-b#diagnostics", niveau: "bien" }]);
  });

  it("un rapport que plus aucun diagnostic actif ne cite est « Remplacé »", () => {
    const rapport = syntheseRapport([usage({ archived_at: "2026-10-20T10:00:00Z" })]);
    expect(rapport?.remplace).toBe(true);
    expect(presentationRapport({ expire_le: null }, rapport, presentationDocument).libelle).toBe("Remplacé");
  });

  it("une pièce qu'aucun diagnostic ne cite garde sa présentation", () => {
    expect(syntheseRapport([])).toBeNull();
    expect(presentationRapport({ expire_le: null }, null, presentationDocument).libelle).toBe("À vérifier");
  });
});
