import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ acces: vi.fn(), rpc: vi.fn(), notifier: vi.fn(), config: vi.fn(), creer: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notifierSignatureDemandee: m.notifier }));
vi.mock("@/lib/youtrust", () => ({ configurationYoutrust: m.config, creerDemandeYoutrust: m.creer, annulerDemandeYoutrust: vi.fn(), ErreurYoutrust: class extends Error {} }));
import { envoyerPourSignature } from "@/app/actions/signature";
beforeEach(() => {
  vi.resetAllMocks();
  m.acces.mockResolvedValue({ user: { id: "gestionnaire" }, supabase: { rpc: m.rpc } });
  m.rpc.mockResolvedValue({ data: "demande", error: null });
  m.config.mockReturnValue(null);
  m.notifier.mockResolvedValue({ envoyee: true });
});
describe("fin des nouveaux envois manuels", () => {
  it("redirige vers Zoho sans créer de demande ni envoyer de message", async () => {
    const resultat=await envoyerPourSignature("org","document","personne");
    expect(resultat.erreur).toContain("Zoho");
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.notifier).not.toHaveBeenCalled();
    expect(m.creer).not.toHaveBeenCalled();
  });
});
