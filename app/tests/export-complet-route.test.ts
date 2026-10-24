/**
 * Plan de conformité du 23/10/2026, R49 : la route /agence/[orgId]/export-complet (demande et téléchargement de l'archive
 * complète). Sans base : session, clé de service et préparation remplacées par des doublures. Aucune adresse réelle.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "44444444-4444-4444-8444-444444444444";
const EXPORT = "55555555-5555-4555-8555-555555555555";
const COMPTE = "66666666-6666-4666-8666-666666666666";

const r = vi.hoisted(() => ({
  claims: null as Record<string, unknown> | null,
  demande: { data: "77777777-7777-4777-8777-777777777777" as unknown, error: null as unknown },
  apres: [] as (() => unknown)[],
  lien: { url: "https://stockage.example.invalid/signe" } as { url: string } | { erreur: string },
  bloque: null as string | null,
  rpc: vi.fn(),
}));
vi.mock("next/server", async (importer) => ({ ...(await importer<typeof import("next/server")>()), after: (f: () => unknown) => { r.apres.push(f); } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: r.claims ? { claims: r.claims } : null, error: null }) },
    rpc: async (nom: string, args: unknown) => { r.rpc(nom, args); return r.demande; },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ service: true }) }));
vi.mock("@/lib/export-complet-serveur", async (importer) => ({
  ...(await importer<typeof import("@/lib/export-complet-serveur")>()),
  construireExportComplet: vi.fn(async () => ({ ok: true })),
  lienExportComplet: vi.fn(async () => r.lien),
  exportBloque: vi.fn(async () => r.bloque),
}));

describe("route /agence/[orgId]/export-complet", () => {
  beforeEach(() => {
    r.claims = null; r.apres = []; r.rpc.mockClear(); r.bloque = null;
    r.demande = { data: "77777777-7777-4777-8777-777777777777", error: null };
    r.lien = { url: "https://stockage.example.invalid/signe" };
  });
  const contexte = { params: Promise.resolve({ orgId: ORG }) };
  const lieu = (reponse: Response) => reponse.headers.get("location") ?? "";

  it("POST : identité non confirmée renvoyée vers la page, sans demande ; confirmée, demande puis préparation après la réponse", async () => {
    const { POST } = await import("../src/app/agence/[orgId]/export-complet/route");
    r.claims = { sub: COMPTE, aal: "aal1", amr: [] };
    let reponse = await POST(new Request(`https://site.example.com/agence/${ORG}/export-complet`, { method: "POST" }), contexte);
    expect(lieu(reponse)).toContain("archive=identite");
    expect(r.rpc).not.toHaveBeenCalled();
    r.claims = { sub: COMPTE, aal: "aal2" };
    reponse = await POST(new Request(`https://site.example.com/agence/${ORG}/export-complet`, { method: "POST" }), contexte);
    expect(lieu(reponse)).toContain("archive=demandee");
    expect(r.rpc).toHaveBeenCalledWith("demander_export_complet", { p_org: ORG });
    expect(r.apres).toHaveLength(1);
    r.demande = { data: null, error: { code: "23505", message: "déjà" } };
    reponse = await POST(new Request(`https://site.example.com/agence/${ORG}/export-complet`, { method: "POST" }), contexte);
    expect(lieu(reponse)).toContain("archive=en_cours");
    expect(r.apres).toHaveLength(1);
  });

  it("POST : une préparation interrompue (plus de quinze minutes) reprend au clic suivant, sans attendre la nuit (relecture du 24/10)", async () => {
    const { POST } = await import("../src/app/agence/[orgId]/export-complet/route");
    r.claims = { sub: COMPTE, aal: "aal2" };
    r.demande = { data: null, error: { code: "23505", message: "déjà" } };
    r.bloque = EXPORT;
    const reponse = await POST(new Request(`https://site.example.com/agence/${ORG}/export-complet`, { method: "POST" }), contexte);
    expect(lieu(reponse)).toContain("archive=relancee");
    expect(r.apres).toHaveLength(1);
  });

  it("GET : sans identité confirmée, retour à la page avec les gestes pour la confirmer ; sinon lien signé, sans cache ni référent", async () => {
    const { GET } = await import("../src/app/agence/[orgId]/export-complet/route");
    const url = `https://site.example.com/agence/${ORG}/export-complet?archive=${EXPORT}`;
    r.claims = { sub: COMPTE, aal: "aal1" };
    const refus = await GET(new Request(url), contexte);
    expect(refus.status).toBe(303);
    expect(lieu(refus)).toBe("https://site.example.com/compte/donnees?archive=identite#archive");
    r.claims = { sub: COMPTE, aal: "aal2" };
    const ok = await GET(new Request(url), contexte);
    expect(ok.status).toBe(303);
    expect(lieu(ok)).toBe("https://stockage.example.invalid/signe");
    expect(ok.headers.get("cache-control")).toContain("no-store");
    expect(ok.headers.get("referrer-policy")).toBe("no-referrer");
    r.lien = { erreur: "non" };
    expect(lieu(await GET(new Request(url), contexte))).toContain("archive=introuvable");
  });
});
