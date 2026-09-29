/**
 * Audit gestion du 29/09 — réseau d'artisans : la commune du bien.
 *
 *  · la ville saisie se compare au référentiel sans buter sur la casse, les
 *    accents, les tirets, « St »/« Saint » ni l'arrondissement ;
 *  · une seule commune possible pour le code postal (ou une seule au nom de
 *    la ville) : elle s'impose, dans le formulaire comme dans la confirmation
 *    groupée des biens existants.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { communeEvidente, nomCommuneNormalise, type CommuneReseau } from "@/lib/reseau";

const banc = vi.hoisted(() => ({
  biens: [] as { id: string; postal_code: string | null; city: string | null }[],
  communes: [] as CommuneReseau[],
  rpc: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    user: { id: "agent" },
    supabase: {
      rpc: banc.rpc,
      from: (table: string) => {
        const requete = {
          select: () => requete,
          eq: () => requete,
          is: () => requete,
          limit: async () => ({ data: banc.biens, error: null }),
          overlaps: async () => ({ data: banc.communes, error: null }),
        };
        void table;
        return requete;
      },
    },
  }),
}));

import { confirmerCommunesEvidentes } from "@/app/actions/reseau";

const commune = (code: string, nom: string, cps: string[]): CommuneReseau => ({ code, nom, codes_postaux: cps, departement: code.slice(0, 2) });

describe("nomCommuneNormalise — même règle que reseau_nom_commune en base", () => {
  it.each([
    ["Saint-Étienne", "saintetienne"],
    ["ST ETIENNE", "saintetienne"],
    ["Ste-Foy-lès-Lyon", "saintefoyleslyon"],
    ["Paris 12e arrondissement", "paris"],
    ["Lyon Cedex 03", "lyon"],
    ["L'Haÿ-les-Roses", "lhaylesroses"],
    ["Cœuvres-et-Valsery", "coeuvresetvalsery"],
    ["Stains", "stains"],
  ])("%s → %s", (nom, attendu) => {
    expect(nomCommuneNormalise(nom)).toBe(attendu);
  });
});

describe("communeEvidente", () => {
  const massy = commune("91377", "Massy", ["91300"]);
  const deux = [commune("33063", "Bordeaux", ["33000"]), commune("33999", "Autre", ["33000"])];
  it("un code postal, une commune : elle s'impose", () => {
    expect(communeEvidente([massy], "")).toBe(massy);
  });
  it("plusieurs communes : seule celle au nom de la ville saisie", () => {
    expect(communeEvidente(deux, "BORDEAUX")?.code).toBe("33063");
    expect(communeEvidente(deux, "Mérignac")).toBeNull();
    expect(communeEvidente(deux, "")).toBeNull();
  });
});

describe("confirmation groupée des communes évidentes", () => {
  beforeEach(() => {
    banc.rpc.mockReset();
    banc.rpc.mockResolvedValue({ error: null });
  });
  it("confirme bien par bien les cas évidents et laisse les ambigus", async () => {
    banc.biens = [
      { id: "b-massy", postal_code: "91300", city: "Massy" },
      { id: "b-ambigu", postal_code: "33000", city: "Ailleurs" },
      { id: "b-refuse", postal_code: "42000", city: "Lyon" },
    ];
    banc.communes = [
      commune("91377", "Massy", ["91300"]),
      commune("33063", "Bordeaux", ["33000"]),
      commune("33999", "Autre", ["33000"]),
      commune("42218", "Saint-Étienne", ["42000"]),
    ];
    banc.rpc.mockImplementation(async (_fn: string, args: { p_bien: string }) =>
      args.p_bien === "b-refuse" ? { error: { message: "Complétez l’adresse du bien" } } : { error: null });
    const r = await confirmerCommunesEvidentes("org", {}, new FormData());
    expect(banc.rpc).toHaveBeenCalledWith("reseau_confirmer_commune", { p_org: "org", p_bien: "b-massy", p_commune: "91377" });
    expect(banc.rpc).toHaveBeenCalledTimes(2);
    expect(r.succes).toMatch(/^1 commune confirmée\. 2 biens à confirmer un par un/);
  });
});
