/**
 * Décision D34 (SOR-04) — l'écran de clôture du bail : date de sortie réelle,
 * confirmation d'une clôture avant la fin du préavis, et ce que l'action envoie
 * à la base. La base (terminer_bail) reste seule juge : voir bail-sortie-lot.test.ts.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EtatBail } from "@/app/actions/baux";

const banc = vi.hoisted(() => ({
  etat: {} as EtatBail,
  rpc: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: () => [banc.etat, () => {}, false] };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ user: { id: "gerant-test" }, supabase: { rpc: banc.rpc } }),
}));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: vi.fn() }));
vi.mock("@/app/actions/edl", () => ({ creerEdl: vi.fn() }));
// Après hydratation, le champ pose la date du jour ; le rendu serveur seul, vide,
// ne reproduirait pas ce que voit l'agent.
vi.mock("@/components/input-date-jour", async () => {
  const { createElement } = await import("react");
  return {
    InputDateJour: ({
      valeurSoumise,
      surChangement: _surChangement,
      pasDansLeFutur: _pasDansLeFutur,
      ...props
    }: {
      valeurSoumise?: string;
      surChangement?: (v: string) => void;
      pasDansLeFutur?: boolean;
      name: string;
    }) => createElement("input", { ...props, type: "date", defaultValue: valeurSoumise ?? "2026-10-14" }),
  };
});

import { terminerBail } from "@/app/actions/baux";
import { BoutonTerminerBail } from "@/app/agence/[orgId]/baux/[bailId]/formulaires-bail";
import { CODE_CONFIRMATION_CLOTURE, clotureAnticipee, lireDateSortie } from "@/lib/cloture-bail";

beforeEach(() => {
  vi.clearAllMocks();
  banc.etat = {};
  banc.rpc.mockResolvedValue({ error: null });
});

function ecran(dateEffet: string | null = "2027-01-14") {
  return renderToStaticMarkup(
    createElement(BoutonTerminerBail, { orgId: "org-test", bailId: "bail-test", dateEffet })
  );
}

function formulaire(champs: Record<string, string>) {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) f.set(cle, valeur);
  return f;
}

describe("Clôture du bail : la date de sortie réelle (D34)", () => {
  it("demande le jour où le locataire a réellement quitté le logement, et le dit en clair", () => {
    const html = ecran();
    expect(html).toContain("Date de sortie réelle du locataire");
    expect(html).toMatch(/<input\b[^>]*name="date_sortie"/);
    expect(html).toContain("ne pourra pas commencer avant cette date");
    expect(html).toContain("Clôturer le bail");
  });

  it("ne réclame aucune confirmation tant que la sortie n'est pas avant la fin du préavis", () => {
    expect(ecran()).not.toContain("confirmer_anticipee");
  });

  it("une sortie antérieure à la date d'effet du préavis se confirme : la date d'effet est dite, au format français", () => {
    banc.etat = { valeurs: { date_sortie: "2026-10-14" } };
    const html = ecran("2027-01-14");
    expect(html).toContain('name="confirmer_anticipee"');
    expect(html).toContain("14/01/2027");
    expect(html).toContain("Je confirme la clôture avant la fin du préavis.");
    // La confirmation ne promet rien sur l'argent : elle dit seulement que rien ne change
    expect(html).toContain("ne change ni la date de fin du bail ni les montants appelés");
    expect(html).toMatch(/name="confirmer_anticipee"[^>]*required|required[^>]*name="confirmer_anticipee"/);
  });

  it("une sortie le jour de l'effet, ou après, n'a rien à confirmer", () => {
    banc.etat = { valeurs: { date_sortie: "2027-01-14" } };
    expect(ecran("2027-01-14")).not.toContain("confirmer_anticipee");
    banc.etat = { valeurs: { date_sortie: "2027-02-01" } };
    expect(ecran("2027-01-14")).not.toContain("confirmer_anticipee");
  });

  it("quand la base demande la confirmation, la case apparaît même si l'écran ne l'avait pas vu", () => {
    banc.etat = {
      erreur: "Clôture avant la fin du préavis : le préavis court jusqu'au 14/01/2027 …",
      confirmationRequise: true,
    };
    const html = ecran(null);
    expect(html).toContain('name="confirmer_anticipee"');
    expect(html).toContain("Cette sortie est antérieure à la fin du préavis.");
    expect(html).toContain("Clôture avant la fin du préavis");
  });
});

describe("Action terminerBail : ce qui part à la base", () => {
  it("envoie la date de sortie et la confirmation cochée", async () => {
    const r = await terminerBail("org-test", "bail-test", {}, formulaire({ date_sortie: "2026-10-12", confirmer_anticipee: "on" }));
    expect(banc.rpc).toHaveBeenCalledWith("terminer_bail", {
      p_bail: "bail-test",
      p_date_sortie: "2026-10-12",
      p_confirmer_anticipee: true,
    });
    expect(r.succes).toMatch(/Bail clôturé/);
  });

  it("sans date saisie, laisse la base prendre le jour de Paris ; sans case, pas de confirmation", async () => {
    await terminerBail("org-test", "bail-test", {}, formulaire({}));
    expect(banc.rpc).toHaveBeenCalledWith("terminer_bail", {
      p_bail: "bail-test",
      p_date_sortie: null,
      p_confirmer_anticipee: false,
    });
  });

  it("une date mal formée est refusée avant tout appel, la saisie est rendue", async () => {
    const r = await terminerBail("org-test", "bail-test", {}, formulaire({ date_sortie: "14/10/2026" }));
    expect(banc.rpc).not.toHaveBeenCalled();
    expect(r.erreur).toMatch(/pas une date valide/);
    expect(r.valeurs).toEqual({ date_sortie: "14/10/2026" });
  });

  it("le refus « confirmation requise » de la base fait apparaître la case et garde la saisie", async () => {
    banc.rpc.mockResolvedValue({
      error: { code: CODE_CONFIRMATION_CLOTURE, message: "Clôture avant la fin du préavis : le préavis court jusqu'au 14/01/2027, la sortie réelle serait datée du 14/10/2026. Confirmez la clôture anticipée pour l'enregistrer (la date de fin du bail ne change pas)." },
    });
    const r = await terminerBail("org-test", "bail-test", {}, formulaire({ date_sortie: "2026-10-14" }));
    expect(r.confirmationRequise).toBe(true);
    expect(r.erreur).toContain("avant la fin du préavis");
    expect(r.valeurs).toEqual({ date_sortie: "2026-10-14" });
  });

  it("un autre refus ne demande pas de confirmation", async () => {
    banc.rpc.mockResolvedValue({ error: { code: "P0001", message: "Clôture impossible sans état des lieux de sortie signé (RM-3.11.2)" } });
    const r = await terminerBail("org-test", "bail-test", {}, formulaire({ date_sortie: "2026-10-14" }));
    expect(r.confirmationRequise).toBeUndefined();
    expect(r.erreur).toBe("Clôture impossible sans état des lieux de sortie signé");
  });
});

describe("Règles pures de la clôture", () => {
  it("clotureAnticipee compare des dates AAAA-MM-JJ, sans date = pas d'avertissement", () => {
    expect(clotureAnticipee("2026-10-14", "2027-01-14")).toBe(true);
    expect(clotureAnticipee("2027-01-14", "2027-01-14")).toBe(false);
    expect(clotureAnticipee("2027-01-15", "2027-01-14")).toBe(false);
    expect(clotureAnticipee("", "2027-01-14")).toBe(false);
    expect(clotureAnticipee("2026-10-14", null)).toBe(false);
  });

  it("lireDateSortie n'accepte que le format du champ de date", () => {
    expect(lireDateSortie("2026-10-14")).toBe("2026-10-14");
    expect(lireDateSortie(" 2026-10-14 ")).toBe("2026-10-14");
    expect(lireDateSortie("")).toBeNull();
    expect(lireDateSortie("14/10/2026")).toBeNull();
    expect(lireDateSortie(null)).toBeNull();
  });
});
