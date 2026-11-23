/**
 * Phase 3, lot 44 (reprise, C65) : la rubrique « Relances » de la page du bail sous plan d'apurement en cours.
 *
 * Constat des relecteurs : le formulaire proposait toujours « Relance 1 », « Relance 2 » et « Mise en demeure (recommandé) »
 * avec « Enregistrer la relance », et le serveur refusait ensuite à chaque fois — même une mise en demeure envoyée AVANT le
 * plan, dont la date de première présentation ne pouvait plus être consignée. Désormais : le formulaire dit, sous plan, que
 * les relances sont suspendues et qu'une relance envoyée avant l'activation peut encore être enregistrée ; le serveur
 * n'accepte que celle-là (tests/loyers-saisies-et-envoi.test.ts). Sans plan, rien ne change.
 * Rendu serveur (sans navigateur), comme tests/lot-fiscal-charges-form-regularisation.test.ts.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { EtatDecompteSortie } from "@/lib/baux";
import { relancesSuspenduesDepuis, RELANCES_SUSPENDUES_SOUS_PLAN } from "@/lib/paliers-reception-loyer";

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: () => [{}, () => {}, false] };
});
vi.mock("@/app/actions/loyers", () => ({
  ajouterEncaissement: vi.fn(),
  reviserLoyer: vi.fn(),
  ajouterRelance: vi.fn(),
  regulariserCharges: vi.fn(),
}));
vi.mock("@/components/bouton-generer-document", () => ({ BoutonGenererDocument: () => null }));
vi.mock("@/components/input-date-jour", async () => {
  const { createElement } = await import("react");
  return { InputDateJour: (props: { name: string }) => createElement("input", { name: props.name, type: "date" }) };
});

import { FormulaireLoyers } from "@/app/agence/[orgId]/baux/[bailId]/formulaire-loyers";

const texteDe = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;/g, "'").replace(/\s+/g, " ");

function rendre(extra: { planApurement?: { depuis: string | null } | null; decompteSortie?: EtatDecompteSortie } = {}) {
  return renderToStaticMarkup(createElement(FormulaireLoyers, {
    orgId: "org-test",
    bailId: "bail-test",
    echeancier: [],
    encaissements: [],
    quittances: [],
    revisionIrl: false,
    irlReference: null,
    irlTrimestre: null,
    revisions: [],
    relances: [],
    regularisations: [],
    chargesForfait: false,
    dateDebut: "2026-01-01",
    aujourdhui: "2026-11-23",
    ...extra,
  }));
}

describe("Relances du bail sous plan d'apurement en cours", () => {
  it("sans plan : le formulaire d'avant, sans phrase de suspension", () => {
    const texte = texteDe(rendre());
    expect(texte).toContain("Enregistrer la relance");
    expect(texte).not.toContain("Plan d’apurement en cours");
    expect(texte).not.toContain("antérieure au plan");
  });

  it("sous plan activé le 20/11 : la suspension est dite, et ce qui reste possible (une relance envoyée avant)", () => {
    const html = rendre({ planApurement: { depuis: "2026-11-20" } });
    const texte = texteDe(html);
    expect(texte).toContain(
      "Plan d’apurement en cours depuis le 20/11/2026 : les relances sont suspendues jusqu’à sa fin (dette soldée, plan caduc ou annulé). Seule une relance envoyée avant cette date (une mise en demeure et sa date de première présentation, par exemple) peut encore être enregistrée."
    );
    expect(html).toContain("data-relances-sous-plan");
    // Le bouton dit ce qu'il enregistre ; « Enregistrer la relance » ne se propose plus comme une relance du jour.
    expect(texte).toContain("Enregistrer une relance antérieure au plan");
    expect(texte).not.toContain("Enregistrer la relance");
    // Le formulaire reste : c'est le seul moyen de consigner la date de première présentation d'une mise en demeure.
    expect(html).toContain('name="date_premiere_presentation"');
    expect(html).toContain('name="numero_recommande"');
  });

  it("sous plan sans jour d'activation connu : la phrase de suspension du suivi", () => {
    expect(relancesSuspenduesDepuis(null)).toBe(RELANCES_SUSPENDUES_SOUS_PLAN);
    expect(texteDe(rendre({ planApurement: { depuis: null } }))).toContain(RELANCES_SUSPENDUES_SOUS_PLAN);
  });

  it("décompte de sortie finalisé : ni formulaire ni phrase (le recouvrement est clos), comme avant", () => {
    const texte = texteDe(rendre({ planApurement: { depuis: "2026-11-20" }, decompteSortie: "finalise" }));
    expect(texte).not.toContain("Plan d’apurement en cours");
    expect(texte).not.toContain("Enregistrer une relance");
  });

  // La page est un composant serveur sans banc de rendu : on vérifie le branchement dans sa source (même méthode que
  // tests/lot-fiscal-charges-form-regularisation.test.ts).
  it("la page du bail lit le plan en cours du bail et le passe au formulaire des loyers", () => {
    const page = fs.readFileSync(path.join(__dirname, "../src/app/agence/[orgId]/baux/[bailId]/page.tsx"), "utf8");
    expect(page).toMatch(/lirePlanApurementDuBail\(supabase, orgId, bailId\)/);
    expect(page).toMatch(/<FormulaireLoyers[\s\S]*?planApurement=\{planApurement\.enCours \? \{ depuis: planApurement\.depuis \} : null\}[\s\S]*?\/>/);
    expect(page).toContain("noter(\"le plan d’apurement\", planApurement.error)");
  });
});
