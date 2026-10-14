import { beforeEach, describe, expect, it, vi } from "vitest";

// SA-07 : sous une session de diagnostic, le formulaire de la fiche entreprise
// répondait « Connectez-vous à votre espace artisan. » alors que la garde
// (verifierArtisanMutation) donnait la vraie raison : lecture seule.
const m = vi.hoisted(() => ({ lecture: vi.fn(), mutation: vi.fn(), service: vi.fn(), rpc: vi.fn() }));
vi.mock("@/app/artisan/acces", () => ({ verifierArtisanLecture: m.lecture, verifierArtisanMutation: m.mutation, verifierArtisanAction: m.mutation }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: m.service }));
vi.mock("@/lib/proposition-devis-ia", () => ({ proposerDevis: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notifierDevisRecu: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import { accesPreparationDevis } from "../src/lib/parcours-devis-serveur";
import { enregistrerProfilDocuments, enregistrerBrouillonDevis, envoyerDevisValide, preparerPropositionDevis } from "../src/app/artisan/devis/actions-preparation";

const LECTURE_SEULE = "Le diagnostic est en lecture seule. Cette action exige le compte réel de l’artisan.";
beforeEach(() => {
  vi.clearAllMocks();
  m.rpc.mockResolvedValue({ data: [], error: null });
  m.mutation.mockResolvedValue({ fiche: null, supabase: { rpc: m.rpc }, erreur: LECTURE_SEULE });
});

describe("SA-07 : la vraie raison du refus sous diagnostic", () => {
  it("la fiche entreprise annonce la lecture seule", async () => {
    const r = await enregistrerProfilDocuments({}, new FormData());
    expect(r.erreur).toBe(LECTURE_SEULE);
    expect(r.erreur).not.toMatch(/Connectez-vous/);
    expect(m.service).not.toHaveBeenCalled();
  });

  it.each([
    ["proposition", () => preparerPropositionDevis("demande-A")],
    ["brouillon", () => enregistrerBrouillonDevis("demande-A", new FormData())],
    ["envoi", () => envoyerDevisValide("demande-A", {}, new FormData())],
  ])("le parcours de devis (%s) annonce lui aussi la lecture seule", async (_nom, agir) => {
    const r = await agir();
    expect(r.erreur).toBe(LECTURE_SEULE);
    expect(m.service).not.toHaveBeenCalled();
  });

  it("accesPreparationDevis relaie le motif de la garde", async () => {
    await expect(accesPreparationDevis("demande-A", true)).rejects.toThrow(LECTURE_SEULE);
  });

  it("sans motif de la garde, l’invitation à se connecter reste le repli", async () => {
    m.mutation.mockResolvedValue({ fiche: null, supabase: { rpc: m.rpc } });
    const r = await enregistrerProfilDocuments({}, new FormData());
    expect(r.erreur).toBe("Connectez-vous à votre espace artisan.");
    await expect(accesPreparationDevis("demande-A", true)).rejects.toThrow("Connectez-vous à votre espace artisan.");
  });
});
