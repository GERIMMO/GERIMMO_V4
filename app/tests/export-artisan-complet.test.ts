import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lecture: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/artisan-prive", () => ({ chargerActivitePrivee: mocks.lecture }));
import { GET } from "@/app/api/artisan-prive/export/route";

const registre = { clients: [], chantiers: [], devis: [], activation: { clients: false, reglements: false } };
const plateforme = { fiche: { nom: "Artisan d’essai" }, interventions: [] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.lecture.mockResolvedValue({ data: registre, supabase: { rpc: mocks.rpc } });
  mocks.rpc.mockResolvedValue({ data: plateforme, error: null });
});

describe("Export complet de l’artisan", () => {
  it("exporte aussi les deux registres vides quand la saisie privée est désactivée", async () => {
    const reponse = await GET();
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("Content-Disposition")).toContain("attachment");
    expect(reponse.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await reponse.json()).toMatchObject({ ...registre, plateforme });
    expect(mocks.rpc).toHaveBeenCalledWith("export_artisan_plateforme");
  });

  it.each(["erreur privée", "réponse privée absente", "erreur plateforme", "réponse plateforme absente"])(
    "refuse un téléchargement tronqué : %s", async (cas) => {
      if(cas.includes("privée")) mocks.lecture.mockResolvedValue({
        data: null, erreur: cas.startsWith("erreur") ? "Erreur de lecture" : undefined,
        supabase: { rpc: mocks.rpc },
      });
      else mocks.rpc.mockResolvedValue({ data: null, error: cas.startsWith("erreur") ? { code: "57014", message: "Détail interne" } : null });
      const reponse = await GET();
      expect(reponse.status).toBe(503);
      expect(reponse.headers.get("Content-Disposition")).toBeNull();
      expect(reponse.headers.get("Cache-Control")).toBe("private, no-store");
      expect(reponse.headers.get("Retry-After")).toBe("30");
      expect(await reponse.text()).toBe("Votre export complet n’a pas pu être préparé. Réessayez dans quelques instants.");
    },
  );

  it("refuse l’accès à un compte non autorisé sans restituer de données privées", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Réservé à un compte d’artisan" } });
    const reponse = await GET();
    expect(reponse.status).toBe(403);
    expect(reponse.headers.get("Content-Disposition")).toBeNull();
    expect(await reponse.text()).toBe("Accès refusé");
  });
});
