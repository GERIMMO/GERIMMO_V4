import { beforeEach, describe, expect, it, vi } from "vitest";
import { quittanceDocumentComplete } from "./fixtures/quittance-document";

const banc = vi.hoisted(() => ({
  autorise: true,
  rpc: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  depot: vi.fn(),
  abandon: vi.fn(),
  email: vi.fn(),
  erreurMemo: null as { message: string } | null,
  erreurLectureQuittance: null as { message: string } | null,
  quittanceVisible: true,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "https://recette.test" }),
}));
// Audit agence 27/09 : le décompte est PRÉPARÉ (octet monté), sa fiche naît
// dans la transaction de la régularisation, l'octet est abandonné si elle
// est refusée.
vi.mock("@/lib/ged-depot", () => ({
  deposerFichierGed: banc.depot,
  preparerFichierGed: banc.depot,
  abandonnerPieceGed: banc.abandon,
}));
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
  vi.unstubAllEnvs();
  // Les liens des e-mails suivent la configuration, jamais l'en-tête Origin.
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app");
  banc.autorise = true;
  banc.erreurMemo = null;
  banc.erreurLectureQuittance = null;
  banc.quittanceVisible = true;
  banc.rpc.mockResolvedValue({ data: 250, error: null });
  banc.insert.mockResolvedValue({ error: null });
  banc.depot.mockResolvedValue({
    fichier: { chemin: "org-test/decompte.pdf", mime: "application/pdf", taille: 18, empreinte: "e".repeat(64) },
  });
  banc.abandon.mockResolvedValue(undefined);
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
    expect(banc.rpc).toHaveBeenCalledWith("regulariser_charges_avec_justificatif", {
      p_bail: "bail-test",
      p_annee: 2025,
      p_charges_reelles: montant,
      p_note: null,
      p_storage_path: "org-test/decompte.pdf",
      p_mime: "application/pdf",
      p_taille: 18,
      p_empreinte: "e".repeat(64),
      p_etaler: false,
    });
    expect(banc.abandon).not.toHaveBeenCalled();
  });

  it("un refus de la base ne laisse pas le décompte en GED : l'octet part à la purge (audit 27/09)", async () => {
    banc.rpc.mockResolvedValue({
      data: null,
      error: { message: "Une régularisation existe déjà pour l'exercice 2025" },
    });
    const resultat = await regulariserCharges("org-test", "bail-test", {}, saisieCharges("120"));
    expect(resultat.erreur).toContain("existe déjà");
    expect(banc.abandon).toHaveBeenCalledOnce();
    expect(banc.abandon.mock.calls[0][1]).toMatchObject({ chemin: "org-test/decompte.pdf" });
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
  // Deux lectures : le détail (quittance_detail) et le document conforme
  // (quittance_document, 27/09) — complet par défaut.
  let detail: { data: unknown; error: unknown };
  let conforme: { data: unknown; error: unknown };
  beforeEach(() => {
    detail = { data: [{
      emetteur: "Agence de recette",
      periode: "2026-08-01",
      loyer_hc: 450,
      charges: 50,
      montant: 500,
      est_quittance: true,
    }], error: null };
    conforme = { data: quittanceDocumentComplete(), error: null };
    banc.rpc.mockImplementation(async (fn: string) => (fn === "quittance_document" ? conforme : detail));
  });

  it("n'envoie pas une quittance dont l'émetteur n'a pas d'adresse, et dit quoi compléter (27/09)", async () => {
    const incomplete = quittanceDocumentComplete();
    incomplete.organisation = { ...incomplete.organisation, adresse: null };
    conforme = { data: incomplete, error: null };
    const resultat = await envoyerQuittance("org-test", "bail-test", "quittance-test");
    expect(resultat.erreur).toContain("n'est pas envoyée");
    expect(resultat.erreur).toContain("domicile ou siège social");
    expect(banc.email).not.toHaveBeenCalled();
    expect(banc.update).not.toHaveBeenCalled();
  });

  it("chez un propriétaire direct, l'e-mail est signé du bailleur, pas du « parc » (27/09)", async () => {
    conforme = { data: quittanceDocumentComplete({
      organisation: { ...quittanceDocumentComplete().organisation, type: "proprietaire_direct", nom: "Parc de Claire Moreau", siret: null, carte_pro: null },
      bailleurs: [{ nom: "Moreau", prenom: "Claire" }],
    }), error: null };
    await envoyerQuittance("org-test", "bail-test", "quittance-test");
    const html = String(banc.email.mock.calls[0]?.[0]?.html ?? "");
    expect(html).toContain("— Moreau Claire");
    expect(html).not.toContain("Parc de Claire Moreau");
  });

  it("renvoie un succès et mémorise l'envoi normal", async () => {
    const resultat = await envoyerQuittance("org-test", "bail-test", "quittance-test");
    expect(resultat.succes).toContain("envoyée à locataire@recette.test");
    expect(banc.email).toHaveBeenCalledOnce();
    expect(banc.update).toHaveBeenCalledOnce();
    expect(String(banc.email.mock.calls[0]?.[0]?.html)).toContain("https://www.gerimmo.app/quittance/quittance-test");
  });

  it("sans adresse publique configurée, refuse d'envoyer plutôt qu'un lien relatif (audit 30/09, B4)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    const resultat = await envoyerQuittance("org-test", "bail-test", "quittance-test");
    expect(resultat.erreur).toContain("NEXT_PUBLIC_SITE_URL");
    expect(banc.email).not.toHaveBeenCalled();
    expect(banc.update).not.toHaveBeenCalled();
  });

  it("reste un succès explicite si l'email est parti mais sa mémorisation échoue", async () => {
    banc.erreurMemo = { message: "indisponibilité de la base" };
    const resultat = await envoyerQuittance("org-test", "bail-test", "quittance-test");
    expect(resultat.erreur).toBeUndefined();
    expect(resultat.succes).toContain("n'a pas pu être mémorisé");
    expect(banc.email).toHaveBeenCalledOnce();
  });

  it.each([false, true])("nomme le reçu partiel envoyé, même avec échec de mémorisation : %s", async (memoEnEchec) => {
    detail = { data: [{
      emetteur: "Agence de recette",
      periode: "2026-08-01",
      loyer_hc: 450,
      charges: 50,
      montant: 300,
      est_quittance: false,
    }], error: null };
    conforme = { data: quittanceDocumentComplete({ est_quittance: false, montant: 300 }), error: null };
    banc.erreurMemo = memoEnEchec ? { message: "indisponible" } : null;

    const resultat = await envoyerQuittance("org-test", "bail-test", "quittance-test");

    expect(resultat.succes).toContain("Reçu de paiement partiel envoyé à locataire@recette.test");
    expect(resultat.succes).not.toContain("Quittance");
    if (memoEnEchec) expect(resultat.succes).toContain("n'a pas pu être mémorisé");
    expect(banc.email).toHaveBeenCalledOnce();
  });

  it("ne présume pas qu'un document de paiement introuvable est une quittance", async () => {
    detail = { data: [], error: null };
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
    detail = { data: null, error: { message: "Accès refusé" } };
    const resultat = await envoyerQuittance("org-test", "bail-test", "quittance-test");
    expect(resultat.erreur).toContain("Impossible de lire le document");
    expect(banc.email).not.toHaveBeenCalled();
    expect(banc.update).not.toHaveBeenCalled();
  });
});
