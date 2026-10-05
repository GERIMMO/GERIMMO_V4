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
describe("demande de signature manuelle", () => {
  it.each([null, { environnement: "sandbox" }])("annonce le parcours manuel sans appeler le prestataire (%j)", async (config) => {
    m.config.mockReturnValue(config);
    const resultat = await envoyerPourSignature("org", "document", "personne");
    expect(resultat.succes).toContain("signature manuelle");
    expect(resultat.succes).toContain("télécharger");
    expect(resultat.succes).toContain("déposer la copie signée");
    expect(resultat.succes).toContain("prévenu par e-mail");
    expect(resultat.avertissement).toBeUndefined();
    expect(m.creer).not.toHaveBeenCalled();
    expect(m.notifier).toHaveBeenCalledWith({ rpc: m.rpc }, "org", "personne", "document", "demande");
  });
  it.each(["sans_adresse", "erreur_envoi"])("conserve la demande mais signale l'absence d'e-mail (%s)", async (motif) => {
    m.notifier.mockResolvedValue({ envoyee: false, motif });
    const resultat = await envoyerPourSignature("org", "document", "personne");
    expect(resultat.succes).toContain("signature manuelle");
    expect(resultat.succes).not.toContain("prévenu par e-mail");
    expect(resultat.avertissement).toBeTruthy();
    expect(m.creer).not.toHaveBeenCalled();
    expect(m.rpc).toHaveBeenCalledTimes(1);
  });
  it("n'annonce ni demande ni envoi si la création est refusée", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "Accès refusé" } });
    const resultat = await envoyerPourSignature("org", "document", "personne");
    expect(resultat.erreur).toBeTruthy();
    expect(resultat.succes).toBeUndefined();
    expect(m.notifier).not.toHaveBeenCalled();
    expect(m.creer).not.toHaveBeenCalled();
  });
});
