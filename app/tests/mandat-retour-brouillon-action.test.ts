import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  autorise: true,
  etatMandat: "a_signer",
  compter: vi.fn(),
  modifier: vi.fn(),
  lignesModifiees: [{ id: "mandat-test" }] as { id: string }[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    user: banc.autorise ? { id: "gerant-test" } : null,
    supabase: {
      from: (table: string) => {
        const filtres: Record<string, string | null> = {};
        const requete = {
          select: () => requete,
          eq: (cle: string, valeur: string) => {
            filtres[cle] = valeur;
            return requete;
          },
          is: (cle: string, valeur: null) => {
            filtres[cle] = valeur;
            return banc.compter(table, filtres);
          },
          maybeSingle: async () => ({ data: { etat: banc.etatMandat }, error: null }),
          update: (champs: { etat: string }) => {
            const miseAJour = {
              eq: (cle: string, valeur: string) => {
                filtres[cle] = valeur;
                return miseAJour;
              },
              select: async () => {
                banc.modifier(champs, filtres);
                return { data: banc.lignesModifiees, error: null };
              },
            };
            return miseAJour;
          },
        };
        return requete;
      },
    },
  }),
}));

import { changerEtatMandat } from "@/app/actions/mandats";

beforeEach(() => {
  vi.clearAllMocks();
  banc.autorise = true;
  banc.etatMandat = "a_signer";
  banc.lignesModifiees = [{ id: "mandat-test" }];
  banc.compter.mockResolvedValue({ count: 0, error: null });
});

const changer = (etat: string) => changerEtatMandat(
  "org-test", "personne-test", "mandat-test", etat, {}, new FormData()
);

describe("Mandat vide : le retour prévu en brouillon reste accessible", () => {
  it.each(["a_signer", "actif", "preavis"])("permet de recomposer le mandat vide %s", async (etat) => {
    banc.etatMandat = etat;
    const resultat = await changer("brouillon");
    expect(resultat.erreur).toBeUndefined();
    expect(resultat.succes).toBe("État du mandat mis à jour.");
    expect(banc.compter).toHaveBeenCalledExactlyOnceWith("mandat_lignes", {
      mandat_id: "mandat-test", organization_id: "org-test", date_fin: null,
    });
    expect(banc.modifier).toHaveBeenCalledWith({ etat: "brouillon" }, {
      id: "mandat-test", organization_id: "org-test", etat,
    });
  });

  it("refuse le retour d'un mandat qui porte encore un lot", async () => {
    banc.compter.mockResolvedValue({ count: 1, error: null });
    const resultat = await changer("brouillon");
    expect(resultat.erreur).toContain("Ce mandat porte des lots");
    expect(banc.modifier).not.toHaveBeenCalled();
  });

  it.each([
    ["brouillon", "a_signer"],
    ["a_signer", "actif"],
    ["actif", "preavis"],
    ["preavis", "resilie"],
  ])("refuse toujours la progression du mandat vide %s → %s", async (ancien, nouveau) => {
    banc.etatMandat = ancien;
    const resultat = await changer(nouveau);
    expect(resultat.erreur).toBeTruthy();
    expect(banc.modifier).not.toHaveBeenCalled();
  });

  it("un contrat avec un lot continue de suivre son cycle normal", async () => {
    banc.compter.mockResolvedValue({ count: 1, error: null });
    const resultat = await changer("actif");
    expect(resultat.erreur).toBeUndefined();
    expect(banc.modifier).toHaveBeenCalledWith({ etat: "actif" }, expect.objectContaining({ etat: "a_signer" }));
  });

  it.each([
    { count: null, error: null },
    { count: null, error: { message: "indisponible" } },
    { count: 0, error: { message: "lecture incomplète" } },
  ])("une lecture incertaine ne vaut pas un mandat vide (%j)", async (lecture) => {
    banc.compter.mockResolvedValue(lecture);
    const resultat = await changer("brouillon");
    expect(resultat.erreur).toBe("Impossible de vérifier les lots de ce mandat. Réessayez.");
    expect(banc.modifier).not.toHaveBeenCalled();
  });

  it("conserve l'interdiction de rouvrir un mandat résilié", async () => {
    banc.etatMandat = "resilie";
    const resultat = await changer("brouillon");
    expect(resultat.erreur).toContain("historisé");
    expect(banc.compter).not.toHaveBeenCalled();
    expect(banc.modifier).not.toHaveBeenCalled();
  });

  it("ne prétend pas avoir modifié un mandat changé entre-temps", async () => {
    banc.lignesModifiees = [];
    const resultat = await changer("brouillon");
    expect(resultat.erreur).toContain("a changé entre-temps");
    expect(resultat.succes).toBeUndefined();
  });

  it("refuse un compte sans accès avant toute lecture ou modification", async () => {
    banc.autorise = false;
    expect(await changer("brouillon")).toEqual({ erreur: "Accès refusé." });
    expect(banc.compter).not.toHaveBeenCalled();
    expect(banc.modifier).not.toHaveBeenCalled();
  });
});
