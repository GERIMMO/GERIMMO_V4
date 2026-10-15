/**
 * Le chemin public du lien d'invitation d'un artisan (seconde relecture du 15/10/2026 du lot « invitation-artisan ») :
 * SEUL /artisan/invitation/<identifiant> est traversable sans session. Avant, le préfixe « /artisan/invitation »
 * ouvrait aussi « /artisan/invitations… », « /artisan/invitation-… » et tout sous-chemin : une page ajoutée plus tard
 * sous ce préfixe aurait été publique sans qu'on le décide.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));
import { proxy } from "../src/proxy";

const ID = "6f1e2d3c-4b5a-4968-8778-695a4b3c2d1e";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null } }) } });
});

const versConnexion = async (chemin: string) => {
  const reponse = await proxy(new NextRequest(`https://gerimmo.test${chemin}`));
  return reponse.headers.get("location")?.includes("/connexion") ?? false;
};

describe("sans session", () => {
  it("le lien de l'e-mail s'ouvre : /artisan/invitation/<identifiant>", async () => {
    expect(await versConnexion(`/artisan/invitation/${ID}`)).toBe(false);
    expect(await versConnexion(`/artisan/invitation/${ID.toUpperCase()}`)).toBe(false);
  });

  it.each([
    "/artisan/invitation",
    "/artisan/invitation/",
    `/artisan/invitation/${ID}/autre`,
    "/artisan/invitation/pas-un-identifiant",
    "/artisan/invitations",
    `/artisan/invitations/${ID}`,
    "/artisan/invitation-piege",
    "/artisan",
    "/artisan/agenda",
  ])("%s mène à la connexion", async (chemin) => {
    expect(await versConnexion(chemin)).toBe(true);
  });

  it("l'inscription de l'artisan reste publique", async () => {
    expect(await versConnexion("/artisan/inscription")).toBe(false);
  });
});
