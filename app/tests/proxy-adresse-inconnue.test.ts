/**
 * Sans session, une adresse qui n'existe pas affiche la page « introuvable »
 * (recette de production du 27/09) au lieu de mener à la connexion. Une
 * adresse privée qui existe, elle, mène toujours à la connexion.
 */
import { readdirSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));
import { proxy } from "../src/proxy";

const dossiers = (rel: string) =>
  readdirSync(new URL(rel, import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("("))
    .map((d) => d.name);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null } }) } });
});

describe("sans session, une adresse inconnue", () => {
  it.each(["/nimporte-quoi", "/cgu", "/agenceX/1"])("%s : statut 404 et page « introuvable »", async (chemin) => {
    const r = await proxy(new NextRequest(`https://gerimmo.test${chemin}`));
    expect(r.status).toBe(404);
    expect(r.headers.get("x-middleware-rewrite")).toContain("/_introuvable");
    expect(r.headers.get("location")).toBeNull();
  });

  it.each([...dossiers("../src/app"), ...dossiers("../public")])(
    "/%s existe : il n'est pas déclaré introuvable",
    async (segment) => {
      const r = await proxy(new NextRequest(`https://gerimmo.test/${segment}/x`));
      expect(r.status).not.toBe(404);
    },
  );

  it("une adresse privée existante mène toujours à la connexion, destination gardée", async () => {
    const r = await proxy(new NextRequest("https://gerimmo.test/agence/123/biens"));
    expect(r.headers.get("location")).toContain("/connexion?suite=%2Fagence%2F123%2Fbiens");
  });

  it("les fichiers à la racine restent à Next.js", async () => {
    const r = await proxy(new NextRequest("https://gerimmo.test/robots.txt"));
    expect(r.status).not.toBe(404);
  });

  it.each(["/robots.txt", "/sitemap.xml"])("%s est servi sans session, sans détour par la connexion", async (chemin) => {
    const r = await proxy(new NextRequest(`https://gerimmo.test${chemin}`));
    expect(r.status).toBe(200);
    expect(r.headers.get("location")).toBeNull();
  });
});
