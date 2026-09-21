import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  autorise: true,
  lignes: [{ id: "ligne-test" }] as { id: string }[] | null,
  mentions: {
    type: "entree",
    personnes_presentes: "Bailleur et locataire",
    detecteur_fumee_present: true,
    detecteur_fumee_etat: "Fonctionnel",
    attestation_assurance_fournie: true,
    adresse_restitution_depot: null,
    observations: "Néant",
  } as Record<string, unknown> | null,
  erreurLecture: null as { message: string } | null,
  rpc: vi.fn(),
  revalider: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: banc.revalider }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    user: banc.autorise ? { id: "agent-test" } : null,
    supabase: {
      rpc: banc.rpc,
      from: (table: string) => {
        const lecture = {
          select: () => lecture,
          eq: () => lecture,
          maybeSingle: async () => ({ data: banc.mentions, error: null }),
          then: (resoudre: (valeur: unknown) => unknown) =>
            Promise.resolve(
              table === "edl_lignes"
                ? { data: banc.lignes, error: banc.erreurLecture }
                : { data: banc.mentions, error: null }
            ).then(resoudre),
        };
        return lecture;
      },
    },
  }),
}));

import { majGrilleEdl } from "@/app/actions/edl";

beforeEach(() => {
  vi.clearAllMocks();
  banc.autorise = true;
  banc.lignes = [{ id: "ligne-test" }];
  banc.mentions = {
    type: "entree",
    personnes_presentes: "Bailleur et locataire",
    detecteur_fumee_present: true,
    detecteur_fumee_etat: "Fonctionnel",
    attestation_assurance_fournie: true,
    adresse_restitution_depot: null,
    observations: "Néant",
  };
  banc.erreurLecture = null;
  banc.rpc.mockResolvedValue({ error: null });
});

function saisie(signer = false) {
  const form = new FormData();
  form.set("etat_ligne-test", "bon");
  form.set("commentaire_ligne-test", "  Observation conservée  ");
  if (signer) form.set("signer", "1");
  return form;
}

const enregistrer = (form = saisie()) => majGrilleEdl("org-test", "bail-test", "edl-test", {}, form);

describe("Enregistrement EDL : un succès correspond à une grille effectivement transmise", () => {
  it.each([false, true])("ne sauvegarde ni ne signe si la lecture échoue (signer=%s)", async (signer) => {
    banc.lignes = null;
    banc.erreurLecture = { message: "lecture indisponible" };
    const resultat = await enregistrer(saisie(signer));
    expect(resultat.erreur).toContain("Impossible de lire la grille");
    expect(resultat.succes).toBeUndefined();
    expect(banc.rpc).not.toHaveBeenCalled();
    expect(banc.revalider).not.toHaveBeenCalled();
  });

  it("ne confirme pas l'enregistrement d'une grille vide", async () => {
    banc.lignes = [];
    expect((await enregistrer()).erreur).toContain("Grille vide");
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("ne remet pas à zéro une ligne ajoutée après l'ouverture du formulaire", async () => {
    banc.lignes = [{ id: "ligne-test" }, { id: "nouvelle-ligne" }];
    expect((await enregistrer()).erreur).toContain("grille a changé");
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it.each([false, true])("transmet la saisie complète avec son intention de signature (%s)", async (signer) => {
    const resultat = await enregistrer(saisie(signer));
    expect(resultat.erreur).toBeUndefined();
    expect(banc.rpc).toHaveBeenCalledWith("enregistrer_grille_edl", {
      p_edl: "edl-test",
      p_lignes: [{ id: "ligne-test", etat: "bon", commentaire: "Observation conservée" }],
      p_signer: signer,
    });
    expect(resultat.succes).toBe(signer ? "État des lieux signé — il est figé." : "Grille enregistrée.");
  });

  it("autorise une ligne volontairement laissée sans état dans un brouillon", async () => {
    const form = saisie();
    form.set("etat_ligne-test", "");
    await enregistrer(form);
    expect(banc.rpc).toHaveBeenCalledWith("enregistrer_grille_edl", expect.objectContaining({
      p_lignes: [{ id: "ligne-test", etat: null, commentaire: "Observation conservée" }],
    }));
  });

  it("refuse la signature si une mention obligatoire du PDF manque", async () => {
    banc.mentions = { ...banc.mentions, observations: null };
    const resultat = await enregistrer(saisie(true));
    expect(resultat.erreur).toContain("mentions du document");
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("ne renvoie pas de succès après un refus métier", async () => {
    banc.rpc.mockResolvedValue({ error: { message: "EDL signé : les lignes sont figées" } });
    const resultat = await enregistrer();
    expect(resultat.erreur).toBeTruthy();
    expect(resultat.succes).toBeUndefined();
    expect(banc.revalider).not.toHaveBeenCalled();
  });

  it("refuse une session sans accès", async () => {
    banc.autorise = false;
    expect((await enregistrer()).erreur).toBe("Accès refusé.");
    expect(banc.rpc).not.toHaveBeenCalled();
  });
});
