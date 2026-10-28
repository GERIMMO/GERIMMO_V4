/**
 * L'action « se reconnecter pour l'archive » (relecture adverse du 24/10, R2-7) : elle ferme la session, retire le témoin
 * d'activité et renvoie vers /connexion avec le retour sur la section « Archive complète ». Audit final du 27/10 (COD-15) :
 * aucun test ne la citait. Sans base : client de session et cookies simulés.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ signOut: vi.fn(), supprimer: vi.fn(), redirect: vi.fn((url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ delete: m.supprimer }) }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signOut: m.signOut } }) }));

import { seReconnecterPourArchive } from "@/app/actions/archive-identite";
import { ACTIVITY_COOKIE } from "@/lib/session-policy";

beforeEach(() => { vi.clearAllMocks(); m.signOut.mockResolvedValue({ error: null }); });

describe("se reconnecter pour préparer l'archive complète", () => {
  it("ferme la session, retire le témoin d'activité, puis renvoie vers la connexion avec le retour sur l'archive", async () => {
    await expect(seReconnecterPourArchive()).rejects.toMatchObject({ url: `/connexion?suite=${encodeURIComponent("/compte/donnees#archive")}` });
    expect(m.signOut).toHaveBeenCalledTimes(1);
    expect(m.supprimer).toHaveBeenCalledWith(ACTIVITY_COOKIE);
    // La fermeture précède la redirection : revenir sur /connexion avec une session vivante renverrait vers les espaces.
    expect(m.signOut.mock.invocationCallOrder[0]).toBeLessThan(m.redirect.mock.invocationCallOrder[0]);
  });
});
