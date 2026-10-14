/**
 * Formulaire « Préparer un document » (rendu serveur, sans navigateur) :
 *  · D37 : le champ des intérêts d'emprunt est un texte décimal prérempli (jamais un champ « nombre » du navigateur) et dit d'où vient la valeur ;
 *  · D39 : le détail des dépenses d'une régularisation est obligatoire, sauf si la régularisation le porte déjà.
 * Ce fichier ne lit que le HTML d'un premier rendu (aucun effet, aucun changement d'état). Le préremplissage lui-même (appel de
 * `proposerInteretsEmprunt` au choix du lot, réponse, réponses qui se croisent) est joué dans lot-fiscal-charges-client ; la proposition
 * côté serveur dans lot-fiscal-charges-proposition.
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
// Le bouton « Générer le PDF » et son ATTRIBUT `disabled` : la classe Tailwind `disabled:opacity-50` que porte tout bouton ne compte pas.
const boutonGenerer = (html: string) => html.match(/<button\b[^>]*>(?=[^<]*Générer le PDF<\/button>)/)?.[0] ?? "";
const boutonAttend = (html: string) => /\sdisabled=""/.test(boutonGenerer(html));

describe("D37 : champ des intérêts d'emprunt", () => {
  const html = rendre("recap_fiscal_nu", [{ id: "lot", libelle: "Appartement Jardin" }]);

  it("est un texte décimal, lu comme un montant côté serveur", () => {
    const interets = champ(html, "interets_emprunt");
    expect(interets).toContain('type="text"');
    expect(interets).toContain('inputMode="decimal"');
    expect(interets).not.toContain('type="number"');
    expect(interets).toContain('value="0"');
    // Obligatoire : « 0 » se saisit, mais le champ ne part jamais vide (le serveur reprendrait alors le montant du livre sans que la personne l'ait vu).
    expect(interets).toContain('required=""');
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
    expect(html).toMatch(/<span role="status"[^>]*>Lecture du montant du livre…<\/span>/);
    expect(boutonGenerer(html)).not.toBe(""); // le bon bouton a été trouvé
    expect(boutonAttend(html)).toBe(true);
  });

  it("sans dossier choisi (plusieurs dossiers), le bouton attend aussi et aucune lecture n'est annoncée", () => {
    const deux = rendre("recap_fiscal_nu", [{ id: "a", libelle: "Appartement Jardin" }, { id: "b", libelle: "Studio Gare" }]);
    expect(boutonAttend(deux)).toBe(true);
    expect(deux).not.toContain("Lecture du montant du livre…");
  });

  it("un document qui ne lit pas le livre ne bloque pas son bouton (l'attribut disabled est bien absent quand rien n'attend)", () => {
    const libre = rendre("decompte_charges", [{ id: "reg", libelle: "Appartement Jardin · 2025" }]);
    expect(boutonGenerer(libre)).not.toBe("");
    expect(boutonAttend(libre)).toBe(false);
    expect(libre).not.toContain('role="status"');
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
