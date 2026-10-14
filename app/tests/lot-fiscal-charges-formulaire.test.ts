/**
 * Formulaire « Préparer un document » (rendu serveur, sans navigateur) :
 *  · D37 : le champ des intérêts d'emprunt est un texte décimal prérempli (jamais un champ « nombre » du navigateur) et dit d'où vient la valeur ;
 *  · D39 : le détail des dépenses d'une régularisation est obligatoire, sauf si la régularisation le porte déjà.
 * Le préremplissage lui-même (appel de `proposerInteretsEmprunt` au choix du lot) est testé côté serveur dans lot-fiscal-charges-proposition.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("@/app/actions/catalogue-documents", () => ({ genererDepuisCatalogue: vi.fn(), proposerInteretsEmprunt: vi.fn(async () => ({ montant: "2345,67", qualifie: true })) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

import { FormulaireCatalogue } from "@/app/agence/[orgId]/documents/catalogue/formulaire-catalogue";

const rendre = (modeleId: string, choix: { id: string; libelle: string; detailEnregistre?: boolean }[]) =>
  renderToStaticMarkup(createElement(FormulaireCatalogue, { orgId: "org", modeleId, choix }));
const champ = (html: string, nom: string) => html.match(new RegExp(`<(?:input|textarea)[^>]*name="${nom}"[^>]*>`))?.[0] ?? "";

describe("D37 : champ des intérêts d'emprunt", () => {
  const html = rendre("recap_fiscal_nu", [{ id: "lot", libelle: "Appartement Jardin" }]);

  it("est un texte décimal, lu comme un montant côté serveur", () => {
    const interets = champ(html, "interets_emprunt");
    expect(interets).toContain('type="text"');
    expect(interets).toContain('inputMode="decimal"');
    expect(interets).not.toContain('type="number"');
    expect(interets).toContain('value="0"');
  });

  it("l'aide dit que le montant vient du livre, que l'écart sera signalé, et ne dit plus que Gerimmo ne peut pas le lire", () => {
    expect(html).toContain("Prérempli avec le montant déjà qualifié en ligne 250 dans votre livre (modifiable)");
    expect(html).toContain("le PDF signale l’écart avec le livre");
    expect(html).not.toContain("ne peut pas déduire");
  });

  it("l'année est un champ contrôlé qui part de l'année en cours", () => {
    expect(champ(html, "annee")).toContain(`value="${new Date().getFullYear()}"`);
  });

  it("avec un seul lot, le bouton attend la lecture du livre avant d'être proposé", () => {
    expect(html).toContain("Lecture du montant du livre…");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*Générer le PDF/);
  });
});

describe("D39 : détail des dépenses d'une régularisation", () => {
  it("obligatoire tant que la régularisation ne porte pas son détail", () => {
    const html = rendre("decompte_charges", [{ id: "reg", libelle: "Appartement Jardin · 2025", detailEnregistre: false }]);
    expect(champ(html, "detail_depenses")).toContain("required");
    expect(html).toContain("Détail des dépenses par nature et clé de répartition");
    expect(html).toContain("la régularisation déjà enregistrée n’est pas modifiée");
    expect(html).not.toContain("laissez vide pour le reprendre");
  });

  it("facultatif quand la régularisation le porte déjà", () => {
    const html = rendre("regularisation_charges", [{ id: "reg", libelle: "Appartement Jardin · 2024", detailEnregistre: true }]);
    expect(champ(html, "detail_depenses")).not.toContain("required");
    expect(html).toContain("laissez vide pour le reprendre");
  });

  it("la consultation des justificatifs ne propose pas ce champ", () => {
    const html = rendre("consultation_charges", [{ id: "reg", libelle: "Appartement Jardin · 2025" }]);
    expect(champ(html, "detail_depenses")).toBe("");
    expect(champ(html, "consultation")).toContain("required");
  });
});
