/**
 * L'action qui note une erreur d'écran — ce qu'elle écrit, et ce qu'elle tait.
 *
 * Trois choses à tenir : rien sans utilisateur connecté ; jamais un identifiant
 * dans la route consignée ; et un capteur qui casse ne casse rien d'autre.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), utilisateur: null as null | { id: string } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.utilisateur } }) },
    rpc: mocks.rpc,
  }),
}));

import { signalerErreurEcran } from "../src/app/actions/erreurs";

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ error: null });
  mocks.utilisateur = null;
});

describe("signaler une erreur d'écran", () => {
  it("ne consigne rien sans utilisateur connecté", async () => {
    await signalerErreurEcran({ digest: "abc", chemin: "/connexion" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("consigne le condensé, l'espace et la route sans ses identifiants", async () => {
    mocks.utilisateur = { id: "u1" };
    const id = "7f4a2b1c-0d3e-4f5a-9b8c-1d2e3f4a5b6c";
    await signalerErreurEcran({ digest: "abc", chemin: `/agence/${id}/baux/${id}` });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = mocks.rpc.mock.calls[0] as [string, { evenement: string; details: Record<string, unknown> }];
    expect(fn).toBe("log_tech");
    expect(args.evenement).toBe("erreur_ecran");
    expect(args.details.digest).toBe("abc");
    expect(args.details.espace).toBe("agence");
    expect(String(args.details.ecran)).not.toContain(id);
    expect(String(args.details.ecran)).toMatch(/^\/agence\//);
  });

  it("range un chemin hors des espaces sous « autre », et accepte l'absence de condensé", async () => {
    mocks.utilisateur = { id: "u1" };
    await signalerErreurEcran({ chemin: "/journal/un-article" });
    const [, args] = mocks.rpc.mock.calls[0] as [string, { details: Record<string, unknown> }];
    expect(args.details.espace).toBe("autre");
    expect(args.details.digest).toBeNull();
  });

  it("ne lève jamais, même si la trace échoue", async () => {
    mocks.utilisateur = { id: "u1" };
    mocks.rpc.mockRejectedValue(new Error("base injoignable"));
    await expect(signalerErreurEcran({ digest: "x", chemin: "/locataire/o/loyers" })).resolves.toBeUndefined();
  });
});
