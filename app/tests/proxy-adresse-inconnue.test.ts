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

  // Audit final du 27/10 (PUB-14) : un fichier inconnu à la racine, /.well-known et la page interne /_introuvable ne
  // mènent plus à la connexion.
  it.each(["/humans.txt", "/manifest.webmanifest", "/.well-known/security.txt", "/_introuvable", "/_autre/x", "/wp-login.php"])(
    "%s : statut 404 sans détour par la connexion",
    async (chemin) => {
      const r = await proxy(new NextRequest(`https://gerimmo.test${chemin}`));
      expect(r.status).toBe(404);
      expect(r.headers.get("location")).toBeNull();
    },
  );

  it.each(readdirSync(new URL("../public", import.meta.url), { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name))(
    "/%s (fichier de public/) n'est pas déclaré introuvable",
    async (fichier) => {
      const r = await proxy(new NextRequest(`https://gerimmo.test/${fichier}`));
      expect(r.status).not.toBe(404);
    },
  );

  it("les adresses internes de Next.js restent à Next.js", async () => {
    for (const chemin of ["/_next/data/x.json", "/__nextjs_original-stack-frame"]) {
      expect((await proxy(new NextRequest(`https://gerimmo.test${chemin}`))).status).not.toBe(404);
    }
  });

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
