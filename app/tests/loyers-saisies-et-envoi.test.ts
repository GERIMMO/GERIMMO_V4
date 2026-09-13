import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  autorise: true,
  rpc: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  depot: vi.fn(),
  email: vi.fn(),
  erreurMemo: null as { message: string } | null,
  erreurLectureQuittance: null as { message: string } | null,
  quittanceVisible: true,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "https://recette.test" }),
}));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: banc.depot }));
// Aucun email ne sort de ce banc : on observe seulement la demande d'envoi.
vi.mock("@/lib/email", () => ({ envoyerEmail: banc.email }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    user: banc.autorise ? { id: "gerant-test" } : null,
    supabase: {
      rpc: banc.rpc,
      from: (table: string) => {
        const filtres: Record<string, string> = {};
        const requete = {
          select: () => requete,
          eq: (colonne: string, valeur: string) => {
            filtres[colonne] = valeur;
            return requete;
          },
          maybeSingle: async () => {
            if (table === "quittances") {
              const quittance = { id: "quittance-test", bail_id: "bail-test", organization_id: "org-test" };
              const correspond = Object.entries(filtres).every(([colonne, valeur]) =>
                quittance[colonne as keyof typeof quittance] === valeur);
              return {
                data: banc.quittanceVisible && correspond && !banc.erreurLectureQuittance ? quittance : null,
                error: banc.erreurLectureQuittance,
              };
            }
            return {
              data: table === "baux"
                ? { locataire_principal: "locataire-test" }
                : { email: "locataire@recette.test", nom: "Test", prenom: "Camille" },
              error: null,
            };
          },
          insert: banc.insert,
          update: (valeurs: unknown) => {
            banc.update(valeurs);
            const miseAJour = {
              eq: () => miseAJour,
              then: (resoudre: (resultat: { error: typeof banc.erreurMemo }) => unknown) =>
                Promise.resolve({ error: banc.erreurMemo }).then(resoudre),
            };
            return miseAJour;
          },
        };
        return requete;
      },
    },
  }),
}));

import { ajouterRelance, envoyerQuittance, regulariserCharges } from "@/app/actions/loyers";

beforeEach(() => {
  vi.clearAllMocks();
  banc.autorise = true;
  banc.erreurMemo = null;
  banc.erreurLectureQuittance = null;
  banc.quittanceVisible = true;
  banc.rpc.mockResolvedValue({ data: 250, error: null });
  banc.insert.mockResolvedValue({ error: null });
  banc.depot.mockResolvedValue({ documentId: "justificatif-test" });
  banc.email.mockResolvedValue({});
});

function saisieCharges(montant?: string) {
  const saisie = new FormData();
  saisie.set("annee", "2025");
  if (montant !== undefined) saisie.set("charges_reelles", montant);
  saisie.set("justificatif", new File(["justificatif local"], "charges.pdf", { type: "application/pdf" }));
  return saisie;
}

describe("Régularisation : une absence de montant ne crée pas de remboursement", () => {
  it.each([undefined, "", "   "])("refuse le montant absent %j avant tout dépôt ou écriture", async (montant) => {
    const resultat = await regulariserCharges("org-test", "bail-test", {}, saisieCharges(montant));

    expect(resultat.erreur).toContain("Indiquez les charges réelles");
    expect(resultat.succes).toBeUndefined();
    expect(resultat.valeurs?.annee).toBe("2025");
    expect(banc.depot).not.toHaveBeenCalled();
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it.each(["-1", "Infinity", "NaN"])("refuse un montant invalide %s sans déposer de pièce", async (montant) => {
    const resultat = await regulariserCharges("org-test", "bail-test", {}, saisieCharges(montant));
    expect(resultat.erreur).toBe("Charges réelles invalides.");
    expect(banc.depot).not.toHaveBeenCalled();
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it.each([["0", 0], ["390.25", 390.25]])("accepte le montant explicitement saisi %s", async (saisie, montant) => {
    const resultat = await regulariserCharges("org-test", "bail-test", {}, saisieCharges(saisie));

    expect(resultat.erreur).toBeUndefined();
    expect(banc.depot).toHaveBeenCalledOnce();
    expect(banc.rpc).toHaveBeenCalledWith("regulariser_charges", {
      p_bail: "bail-test",
      p_annee: 2025,
      p_charges_reelles: montant,
      p_justificatif: "justificatif-test",
      p_note: null,
    });
  });
});

describe("Relance : seules les dates effectivement fournies sont enregistrées", () => {
  it("laisse la présentation absente pour une relance simple", async () => {
    const saisie = new FormData();
    saisie.set("niveau", "relance_1");
    saisie.set("date_envoi", "2026-09-10");
    saisie.set("date_premiere_presentation", "");

    const resultat = await ajouterRelance("org-test", "bail-test", {}, saisie);

    expect(resultat.succes).toBe("Relance enregistrée.");
    expect(banc.insert).toHaveBeenCalledWith(expect.objectContaining({
      date_envoi: "2026-09-10",
      date_premiere_presentation: null,
      numero_recommande: null,
    }));
  });

  it("conserve la présentation confirmée d'un recommandé", async () => {
    const saisie = new FormData();
    saisie.set("niveau", "mise_en_demeure");
    saisie.set("date_envoi", "2026-09-10");
    saisie.set("date_premiere_presentation", "2026-09-12");
    saisie.set("numero_recommande", "suivi-recette");

    await ajouterRelance("org-test", "bail-test", {}, saisie);

    expect(banc.insert).toHaveBeenCalledWith(expect.objectContaining({
      date_envoi: "2026-09-10",
      date_premiere_presentation: "2026-09-12",
      numero_recommande: "suivi-recette",
    }));
  });
});

describe("Email de quittance : distinguer un envoi refusé d'un envoi déjà parti", () => {
  beforeEach(() => {
    banc.rpc.mockResolvedValue({ data: [{
      emetteur: "Agence de recette",
      periode: "2026-08-01",
      loyer_hc: 450,
      charges: 50,
      montant: 500,
      est_quittance: true,
    }], error: null });
  });

  it("renvoie un succès et mémorise l'envoi normal", async () => {
    const resultat = await envoyerQuittance("org-test", "bail-test", "quittance-test");
    expect(resultat.succes).toContain("envoyée à locataire@recette.test");
    expect(banc.email).toHaveBeenCalledOnce();
    expect(banc.update).toHaveBeenCalledOnce();
  });

  it("reste un succès explicite si l'email est parti mais sa mémorisation échoue", async () => {
    banc.erreurMemo = { message: "indisponibilité de la base" };
    const resultat = await envoyerQuittance("org-test", "bail-test", "quittance-test");
    expect(resultat.erreur).toBeUndefined();
    expect(resultat.succes).toContain("n'a pas pu être mémorisé");
    expect(banc.email).toHaveBeenCalledOnce();
  });

  it.each([false, true])("nomme le reçu partiel envoyé, même avec échec de mémorisation : %s", async (memoEnEchec) => {
    banc.rpc.mockResolvedValue({ data: [{
      emetteur: "Agence de recette",
      periode: "2026-08-01",
      loyer_hc: 450,
      charges: 50,
      montant: 300,
      est_quittance: false,
    }], error: null });
    banc.erreurMemo = memoEnEchec ? { message: "indisponible" } : null;

    const resultat = await envoyerQuittance("org-test", "bail-test", "quittance-test");

    expect(resultat.succes).toContain("Reçu de paiement partiel envoyé à locataire@recette.test");
    expect(resultat.succes).not.toContain("Quittance");
    if (memoEnEchec) expect(resultat.succes).toContain("n'a pas pu être mémorisé");
    expect(banc.email).toHaveBeenCalledOnce();
  });

  it("ne présume pas qu'un document de paiement introuvable est une quittance", async () => {
    banc.rpc.mockResolvedValue({ data: [], error: null });
    const resultat = await envoyerQuittance("org-test", "bail-test", "quittance-test");
    expect(resultat.erreur).toBe("Document de paiement introuvable.");
    expect(banc.email).not.toHaveBeenCalled();
  });

  it("un refus d'envoi permet une nouvelle tentative sans marquer le document envoyé", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    banc.email.mockResolvedValue({ erreur: "Envoi refusé pour la recette" });
    try {
      const resultat = await envoyerQuittance("org-test", "bail-test", "quittance-test");
      expect(resultat.erreur).toBe("Envoi refusé pour la recette");
      expect(resultat.succes).toBeUndefined();
      expect(banc.update).not.toHaveBeenCalled();
    } finally {
      journal.mockRestore();
    }
  });

  it("un compte non autorisé n'envoie rien", async () => {
    banc.autorise = false;
    expect(await envoyerQuittance("org-test", "bail-test", "quittance-test"))
      .toEqual({ erreur: "Accès refusé." });
    expect(banc.email).not.toHaveBeenCalled();
  });

  it.each([
    ["org-test", "autre-bail", "quittance-test"],
    ["autre-org", "bail-test", "quittance-test"],
    ["org-test", "bail-test", "document-inconnu"],
  ])("refuse le trio incohérent %s / %s / %s avant tout envoi", async (orgId, bailId, quittanceId) => {
    const resultat = await envoyerQuittance(orgId, bailId, quittanceId);
    expect(resultat.erreur).toContain("introuvable ou inaccessible pour ce bail");
    expect(resultat.succes).toBeUndefined();
    expect(banc.rpc).not.toHaveBeenCalled();
    expect(banc.email).not.toHaveBeenCalled();
    expect(banc.update).not.toHaveBeenCalled();
  });

  it("n'envoie pas une quittance que la lecture avec RLS ne retourne pas", async () => {
    banc.quittanceVisible = false;
    const resultat = await envoyerQuittance("org-test", "bail-test", "quittance-test");
    expect(resultat.erreur).toContain("introuvable ou inaccessible");
    expect(banc.email).not.toHaveBeenCalled();
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("une panne de lecture ne permet pas de poursuivre l'envoi", async () => {
    banc.erreurLectureQuittance = { message: "indisponible" };
    const resultat = await envoyerQuittance("org-test", "bail-test", "quittance-test");
    expect(resultat.erreur).toContain("Impossible de vérifier le document");
    expect(banc.email).not.toHaveBeenCalled();
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("un refus de lecture du détail bloque l'envoi après vérification du bail", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: { message: "Accès refusé" } });
    const resultat = await envoyerQuittance("org-test", "bail-test", "quittance-test");
    expect(resultat.erreur).toContain("Impossible de lire le document");
    expect(banc.email).not.toHaveBeenCalled();
    expect(banc.update).not.toHaveBeenCalled();
  });
});
