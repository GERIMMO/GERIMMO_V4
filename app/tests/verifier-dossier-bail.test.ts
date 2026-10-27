import { expect, it, vi, beforeEach } from "vitest";

const banc = vi.hoisted(() => ({ user: true, supabase: {}, verifier: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: async () => ({ user: banc.user ? { id: "u" } : null, supabase: banc.supabase }) }));
vi.mock("@/lib/documents/completude-brouillon-bail", () => ({ verifierCompletudeBrouillonBail: banc.verifier }));
import { verifierDossierBail } from "@/app/agence/[orgId]/baux/[bailId]/verifier-dossier";

beforeEach(() => {
  vi.clearAllMocks();
  banc.user = true;
  banc.verifier.mockResolvedValue({ manquants: ["surface", "chauffage"] });
});

it("transmet au contrôle du brouillon le client autorisé, l’organisation et le bail", async () => {
  expect(await verifierDossierBail("org", "bail")).toEqual({ manquants: ["surface", "chauffage"] });
  expect(banc.verifier).toHaveBeenCalledWith(banc.supabase, "org", "bail");
});

it("refuse une session absente avant toute lecture", async () => {
  banc.user = false;
  expect(await verifierDossierBail("org", "bail")).toEqual({ erreur: "Accès refusé.", manquants: [] });
  expect(banc.verifier).not.toHaveBeenCalled();
});

it("ne présente pas une erreur de lecture comme un dossier complet", async () => {
  banc.verifier.mockResolvedValue({ erreur: "Lecture refusée", manquants: [] });
  expect(await verifierDossierBail("org", "bail")).toEqual({ erreur: "Lecture refusée", manquants: [] });
});

it("garde la vérification indisponible si une source lève une exception", async () => {
  banc.verifier.mockRejectedValue(new Error("réseau indisponible"));
  expect(await verifierDossierBail("org", "bail")).toEqual({ erreur: "La vérification est indisponible. Réessayez.", manquants: [] });
});
