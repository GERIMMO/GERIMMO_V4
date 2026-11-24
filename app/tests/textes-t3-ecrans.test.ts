/**
 * Textes officiels, lot T3 — écran des loyers d'un bail : régularisation d'un exercice de plus de trois ans (R16-A1) et rappel
 * d'information de la caution (R24-A1). Rendu serveur (sans navigateur), comme lot-fiscal-charges-form-regularisation.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EtatLoyers } from "@/app/actions/loyers";

const etatSimule = vi.hoisted(() => ({ valeur: {} as EtatLoyers }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: () => [etatSimule.valeur, () => {}, false] };
});
vi.mock("@/app/actions/loyers", () => ({ ajouterEncaissement: vi.fn(), reviserLoyer: vi.fn(), ajouterRelance: vi.fn(), regulariserCharges: vi.fn() }));
vi.mock("@/components/bouton-generer-document", () => ({ BoutonGenererDocument: () => null }));
vi.mock("@/components/input-date-jour", async () => {
  const { createElement } = await import("react");
  return { InputDateJour: (props: { name: string }) => createElement("input", { name: props.name, type: "date" }) };
});

import { FormulaireLoyers } from "@/app/agence/[orgId]/baux/[bailId]/formulaire-loyers";

beforeEach(() => { etatSimule.valeur = {}; });
const texteDe = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;|’/g, "'").replace(/[  ]/g, " ").replace(/\s+/g, " ");
const bloc = (html: string, attribut: string) => new RegExp(`<div[^>]*${attribut}[^>]*>([\\s\\S]*?)</div>`).exec(html)?.[1] ?? "";

function rendre(extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(FormulaireLoyers, {
    orgId: "org-test", bailId: "bail-test", echeancier: [], encaissements: [], quittances: [], revisionIrl: false, irlReference: null,
    irlTrimestre: null, revisions: [], relances: [], regularisations: [], chargesForfait: false, dateDebut: "2019-01-01",
    aujourdhui: "2026-11-24", ...extra,
  } as never));
}

describe("R16-A1 — formulaire « Régulariser »", () => {
  it("exercice de plus de trois ans (bail fini en 2021) : avertissement « peut-être prescrit » et case obligatoire, sous le nom que le serveur vérifie", () => {
    const html = rendre({ dateFin: "2021-06-30" });
    const alerte = bloc(html, "data-exercice-ancien");
    expect(texteDe(alerte)).toContain("Exercice 2021 clos depuis plus de trois ans : un complément de charges à la charge du locataire est peut-être prescrit.");
    const caseAConfirmer = alerte.match(/<input\b[^>]*>/)?.[0] ?? "";
    expect(caseAConfirmer).toContain('name="confirmer_exercice_ancien"');
    expect(caseAConfirmer).toContain('value="oui"');
    expect(caseAConfirmer).toContain("required");
  });
  it("exercice récent : ni avertissement ni case ; la note ne dit plus « ne se réclame plus au-delà de trois ans »", () => {
    const html = rendre();
    expect(html).not.toContain("data-exercice-ancien");
    expect(html).not.toContain("confirmer_exercice_ancien");
    expect(texteDe(html)).not.toContain("Un complément ne se réclame plus au-delà de trois ans");
    expect(texteDe(html)).toContain("Un complément se prescrit par trois ans à compter du jour où le bailleur a connu les dépenses (art. 7-1) : pour un exercice de plus de trois ans, Gerimmo avertit et demande une confirmation.");
  });
  it("après un refus pour une autre raison, la case cochée est reposée", () => {
    etatSimule.valeur = { erreur: "Le justificatif est obligatoire.", valeurs: { annee: "2021", confirmer_exercice_ancien: "oui" } };
    expect(bloc(rendre({ dateFin: "2021-06-30" }), "data-exercice-ancien")).toMatch(/<input\b[^>]*checked/);
  });
});

describe("R24-A1 — rappel d'information de la caution sur les loyers du bail", () => {
  const impaye = { appel_id: "a1", periode: "2026-11-01", date_echeance: "2026-11-05", montant_du: 650, montant_couvert: 0, statut: "impaye" };
  it("bail avec caution et loyer impayé : la date à ne pas dépasser, le texte, et ce que Gerimmo ne fait pas", () => {
    const texte = texteDe(bloc(rendre({ echeancier: [impaye], cautionAuBail: true }), "data-information-caution"));
    expect(texte).toContain("Ce bail a une caution : par prudence, informez-la du loyer impayé exigible le 05/11/2026 au plus tard le 05/12/2026 (un mois après l'échéance).");
    expect(texte).toContain("Article 2303 du code civil : le créancier professionnel doit informer la caution personne physique dès le premier incident de paiement non régularisé dans le mois de son exigibilité");
    expect(texte).toContain("Gerimmo ne sait pas si cette règle vous concerne (elle vise le créancier professionnel) et ne vérifie pas que la caution a été informée.");
    expect(texte).not.toMatch(/conforme/i);
  });
  it("délai dépassé : le rappel le dit sans calculer d'intérêts ni de pénalités", () => {
    const texte = texteDe(bloc(rendre({ echeancier: [{ ...impaye, periode: "2026-10-01", date_echeance: "2026-10-05" }], cautionAuBail: true }), "data-information-caution"));
    expect(texte).toContain("le loyer exigible le 05/10/2026 est impayé depuis plus d'un mois. Si elle n'a pas été informée, informez-la sans attendre.");
    expect(texte).not.toMatch(/\d+,\d{2} €/);
  });
  it("pas de caution, pas d'impayé, ou décompte de sortie finalisé : aucun rappel", () => {
    expect(rendre({ echeancier: [impaye] })).not.toContain("data-information-caution");
    expect(rendre({ echeancier: [{ ...impaye, montant_couvert: 650, statut: "paye" }], cautionAuBail: true })).not.toContain("data-information-caution");
    expect(rendre({ echeancier: [impaye], cautionAuBail: true, decompteSortie: "finalise" })).not.toContain("data-information-caution");
  });
});
