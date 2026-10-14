/**
 * Contre-proposition de créneaux du locataire : l'artisan n'est prévenu qu'une fois.
 *
 * `contre_proposer_creneaux` renvoie le nombre de créneaux qu'elle a enregistrés ; un second envoi
 * de la même liste (réponse perdue, double clic) ne change rien en base et renvoie 0 (VER-SQL-03).
 * L'action reste un succès pour le locataire, mais n'envoie pas un second e-mail « le locataire
 * propose d'autres créneaux ».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  verifier: vi.fn(),
  notifierEnCoulisses: vi.fn(),
  notifierContreProposition: vi.fn(),
}));
vi.mock("@/lib/ged-acces", () => ({ verifierLocataire: m.verifier }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/notifications", () => ({
  notifierEnCoulisses: m.notifierEnCoulisses,
  notifierContrePropositionLocataire: m.notifierContreProposition,
  notifierCreneauChoisi: vi.fn(),
}));

import { proposerMesCreneaux } from "@/app/actions/incidents-locataire";

/** Une date à venir à l'heure de Paris, comme l'action la contrôle. */
function dansNJours(n: number) {
  return new Date(Date.now() + n * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}
function saisie() {
  const f = new FormData();
  [3, 4, 5].forEach((n, i) => {
    f.set(`date-${i}`, dansNJours(n));
    f.set(`moment-${i}`, "matin");
  });
  return f;
}

describe("proposerMesCreneaux — notification de l'artisan", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.verifier.mockResolvedValue({ supabase: { rpc: m.rpc }, user: { id: "locataire-test" } });
    m.notifierEnCoulisses.mockResolvedValue(undefined);
  });

  it("un premier envoi enregistre trois créneaux et prévient l'artisan", async () => {
    m.rpc.mockResolvedValue({ data: 3, error: null });
    const retour = await proposerMesCreneaux("org-test", "intervention-test", {}, saisie());
    expect(retour.succes).toContain("transmises à l'artisan");
    expect(m.rpc).toHaveBeenCalledOnce();
    expect(m.rpc.mock.calls[0][0]).toBe("contre_proposer_creneaux");
    expect(m.notifierEnCoulisses).toHaveBeenCalledOnce();
  });

  it("un second envoi identique reste un succès mais ne prévient pas l'artisan une deuxième fois", async () => {
    m.rpc.mockResolvedValue({ data: 0, error: null });
    const retour = await proposerMesCreneaux("org-test", "intervention-test", {}, saisie());
    expect(retour.erreur).toBeUndefined();
    expect(retour.succes).toContain("transmises à l'artisan");
    expect(m.notifierEnCoulisses).not.toHaveBeenCalled();
  });

  it("une réponse sans compte lisible prévient quand même l'artisan (jamais de silence par défaut)", async () => {
    m.rpc.mockResolvedValue({ data: null, error: null });
    await proposerMesCreneaux("org-test", "intervention-test", {}, saisie());
    expect(m.notifierEnCoulisses).toHaveBeenCalledOnce();
  });

  it("un refus de la base ne prévient personne", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "Cette mission n'attend pas de contre-proposition" } });
    const retour = await proposerMesCreneaux("org-test", "intervention-test", {}, saisie());
    expect(retour.erreur).toBeTruthy();
    expect(m.notifierEnCoulisses).not.toHaveBeenCalled();
  });
});
