/**
 * « Mot de passe oublié » passe par la fabrique de liens (30/09/2026) : réponse
 * neutre quel que soit le compte, seule la limite de fréquence se dit.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lien: vi.fn() }));
vi.mock("@/lib/lien-mot-de-passe", () => ({ envoyerLienMotDePasse: mocks.lien }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { demanderReinitialisation } from "../src/app/actions/auth";

const form = (email: string) => { const f = new FormData(); f.set("email", email); return f; };

beforeEach(() => vi.resetAllMocks());

describe("demanderReinitialisation", () => {
  it("envoie le lien « mot de passe oublié » et répond de façon neutre", async () => {
    mocks.lien.mockResolvedValue({});
    const r = await demanderReinitialisation({}, form(" moi@exemple.fr "));
    expect(mocks.lien).toHaveBeenCalledWith({ email: "moi@exemple.fr", motif: "mot_de_passe_oublie", next: "/nouveau-mot-de-passe" });
    expect(r.message).toMatch(/Si un compte existe/);
  });

  it("garde la réponse neutre quand l'envoi échoue autrement que par la limite", async () => {
    mocks.lien.mockResolvedValue({ erreur: "Service indisponible" });
    expect((await demanderReinitialisation({}, form("moi@exemple.fr"))).message).toMatch(/Si un compte existe/);
  });

  // Audit final du 27/10 (PUB-16) : la panne d'envoi, annoncée pour toute adresse, se dit ; jamais « vient d'être envoyé ».
  it("dit la panne d'envoi annoncée par la fabrique de liens", async () => {
    mocks.lien.mockResolvedValue({ erreur: "L’envoi des e-mails est momentanément indisponible.", indisponible: true });
    expect(await demanderReinitialisation({}, form("moi@exemple.fr"))).toEqual({ erreur: "L’envoi des e-mails est momentanément indisponible." });
  });

  it("dit la limite de fréquence", async () => {
    mocks.lien.mockResolvedValue({ erreur: "Trop de demandes", limite: true });
    expect(await demanderReinitialisation({}, form("moi@exemple.fr"))).toEqual({ erreur: "Trop de demandes" });
  });
});
