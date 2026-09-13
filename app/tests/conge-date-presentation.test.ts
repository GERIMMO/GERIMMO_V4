import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EtatBail } from "@/app/actions/baux";

const banc = vi.hoisted(() => ({
  etat: {} as EtatBail,
  rpc: vi.fn(),
  depot: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: () => [banc.etat, () => {}, false] };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ user: { id: "gerant-test" }, supabase: { rpc: banc.rpc } }),
}));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: banc.depot }));
vi.mock("@/app/actions/edl", () => ({ creerEdl: vi.fn() }));
// Après hydratation, InputDateJour choisit aujourd'hui. Le rendu initial
// seul, encore vide, ne reproduirait pas le défaut du congé.
vi.mock("@/components/input-date-jour", async () => {
  const { createElement } = await import("react");
  return {
    InputDateJour: ({ valeurSoumise, ...props }: { valeurSoumise?: string; name: string }) =>
      createElement("input", { ...props, type: "date", defaultValue: valeurSoumise ?? "2026-09-13" }),
  };
});

import { enregistrerConge } from "@/app/actions/baux";
import { FormulaireConge } from "@/app/agence/[orgId]/baux/[bailId]/formulaires-bail";

beforeEach(() => {
  vi.clearAllMocks();
  banc.etat = {};
  banc.rpc.mockResolvedValue({ error: null });
});

function champDate(type = "nu") {
  const html = renderToStaticMarkup(createElement(FormulaireConge, {
    orgId: "org-test",
    bailId: "bail-test",
    type,
  }));
  return html.match(/<input\b[^>]*>/g)?.find((input) => input.includes('name="date_presentation"')) ?? "";
}

describe("Congé : la date qui déclenche le préavis doit être saisie explicitement", () => {
  it.each(["nu", "meuble"])("le congé %s présente une date obligatoire et vide", (type) => {
    const champ = champDate(type);
    expect(champ).toContain('required=""');
    expect(champ).not.toMatch(/value="[^"]+"/);
  });

  it("conserve la date réelle quand l'enregistrement a été refusé", () => {
    banc.etat = { erreur: "Erreur de recette", valeurs: { date_presentation: "2026-09-09" } };
    expect(champDate()).toContain('value="2026-09-09"');
  });

  it.each([undefined, "", "   "])("l'action refuse une date absente %j avant tout effet", async (date) => {
    const saisie = new FormData();
    saisie.set("par", "locataire");
    if (date !== undefined) saisie.set("date_presentation", date);
    const resultat = await enregistrerConge("org-test", "bail-test", {}, saisie);
    expect(resultat.erreur).toBe("Indiquez la date de réception du congé.");
    expect(resultat.valeurs?.par).toBe("locataire");
    expect(banc.depot).not.toHaveBeenCalled();
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("transmet la date confirmée sans lui substituer le jour de saisie", async () => {
    const saisie = new FormData();
    saisie.set("par", "locataire");
    saisie.set("date_presentation", "2026-09-09");
    saisie.set("preavis_mois", "3");
    const resultat = await enregistrerConge("org-test", "bail-test", {}, saisie);
    expect(resultat.erreur).toBeUndefined();
    expect(banc.rpc).toHaveBeenCalledWith("enregistrer_conge", {
      p_bail: "bail-test",
      p_par: "locataire",
      p_date_presentation: "2026-09-09",
      p_preavis_mois: 3,
      p_motif: null,
      p_justificatif: null,
    });
  });
});
