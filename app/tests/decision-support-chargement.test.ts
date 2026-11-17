import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DecisionRetour } from "@/app/admin/retours/decisions-retour";
import type { RetourUtilisateur } from "@/lib/retours";

const page = vi.hoisted(() => ({ prete: false }));
vi.mock("@/lib/use-hydrate", async importer => ({
  ...await importer<typeof import("@/lib/use-hydrate")>(),
  useHydrate: () => page.prete,
}));
vi.mock("@/lib/use-action-retour", () => ({
  useActionRetour: () => ({ etat: {}, soumettre: vi.fn(), enCours: false }),
}));
vi.mock("@/app/actions/retours", () => ({
  deciderRetour: vi.fn(), cloreRevue: vi.fn(), regrouperRetours: vi.fn(),
}));

const retour: RetourUtilisateur = {
  id: "incident-fictif", nature: "probleme", titre: "Justificatif",
  description: "Dépense fictive", attendu: null, ecran: "assistance", action_origine: "navigation",
  etat: "en_examen", gravite: "mineur", reponse: null, reexaminer_le: null,
  version: 1, cree_le: "2026-11-17", organization_id: null, groupe_id: null, publication_id: null,
};

describe("Décision de support du superadministrateur", () => {
  it.each([false, true])("le choix est utilisable dès que la page est prête (%s)", prete => {
    page.prete = prete;
    const html = renderToStaticMarkup(createElement(DecisionRetour, { retour }));
    const choix = html.match(/<select\b[^>]*\bname="etat"[^>]*>/)?.[0];
    expect(choix).toBeDefined();
    expect(/\bdisabled\b/.test(choix!)).toBe(!prete);
    expect(html).toContain('value="resolu"');
  });
});
