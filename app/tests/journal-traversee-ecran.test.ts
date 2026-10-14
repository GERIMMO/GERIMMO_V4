/**
 * D08 (audit du 13/10, SA-01) — le journal d'audit de la console montre, pour une entrée du super-administrateur
 * dans un espace client, la page, la rubrique et le résultat, en français : « résultat : autorisé · requête :
 * action · rubrique : baux ». Jamais l'identifiant de l'objet, l'adresse ni l'empreinte technique de l'action.
 * Les autres lignes d'audit gardent leur lecture d'avant (mois, fin d'essai, motif).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "f2cb7540-d6f9-471d-bd6e-44b6d9e7ea39";
const BAIL = "0b6e1d6e-7c1a-4b5e-9a3d-5f2f3d9a1c11";

const mocks = vi.hoisted(() => ({ audit: [] as unknown[] }));
vi.mock("next/navigation", () => ({
  redirect: (cible: string) => { throw new Error(`REDIRECT:${cible}`); },
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/admin/journaux",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async () => ({ data: true, error: null }),
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "ilike", "eq", "gte", "lte", "range", "is", "in", "limit"]) q[m] = () => q;
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: table === "audit_log" ? mocks.audit : [], error: null, count: 0 }).then(resolve);
      return q;
    },
  }),
}));

import PageJournaux from "../src/app/admin/journaux/page";

const ligne = (action: string, details: Record<string, unknown>) => ({
  action, details, created_at: "2026-10-14T15:19:00Z", organisation: { name: "Agence Alpha" }, compte: { email: "superadmin@gerimmo-demo.fr" },
});
async function ecran() {
  return renderToStaticMarkup(createElement("div", null, await PageJournaux({ searchParams: Promise.resolve({}) })));
}
const texte = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

beforeEach(() => { mocks.audit = []; });

describe("D08 — le journal d'audit lit la trace d'une traversée", () => {
  it("montre le résultat, la requête et la rubrique, sans identifiant ni adresse ni empreinte", async () => {
    mocks.audit = [
      ligne("traversee_action", { resultat: "autorise", requete: "action_serveur", rubrique: "baux", objet_id: BAIL, route: `/agence/${ORG}/baux/${BAIL}`, action_ref: "7f3a9c0d2e4b5a69" }),
      ligne("traversee_espace", { resultat: "refuse", requete: "page", motif: "organisation_introuvable", rubrique: "parc", route: `/agence/${ORG}/parc` }),
    ];
    const t = texte(await ecran());
    expect(t).toContain("Action dans un espace client par la supervision (écriture possible)");
    expect(t).toContain("résultat : autorisé · requête : action · rubrique : baux");
    expect(t).toContain("Consultation d’un espace client par la supervision");
    expect(t).toContain("résultat : refusé · requête : page · motif : organisation introuvable · rubrique : parc");
    expect(t).not.toContain(BAIL);
    expect(t).not.toContain(ORG);
    expect(t).not.toContain("7f3a9c0d2e4b5a69");
    expect(t).not.toContain("/agence/");
    expect(t).not.toContain("organisation_introuvable");
  });

  it("une ancienne ligne vide reste lisible, sans précision inventée", async () => {
    mocks.audit = [ligne("traversee_espace", {})];
    const t = texte(await ecran());
    expect(t).toContain("Consultation d’un espace client par la supervision");
    expect(t).not.toContain("résultat");
  });

  it("les autres lignes d'audit gardent leur lecture (motif, mois)", async () => {
    mocks.audit = [ligne("organisation_suspendue", { motif: "Impayé constaté" }), ligne("mois_reouvert", { mois: "2026-09-01" })];
    const t = texte(await ecran());
    expect(t).toContain("motif : Impayé constaté");
    expect(t).toContain("mois de septembre 2026");
  });
});
