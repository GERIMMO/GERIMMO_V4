import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const banc = vi.hoisted(() => ({
  role: "admin_agence", proprietaire: false, erreur: false,
  portefeuille: null as Set<string> | null,
}));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspace: async () => ({
    role: banc.role, estProprietaire: banc.proprietaire, user: { id: "user" },
    supabase: {
      from: (table: string) => {
        const data = table === "ecritures" ? Array.from({ length: 45 }, (_, i) => ({
          id: `e${i}`, categorie: "travaux", sens: "depense", montant: 10,
          date_piece: "2026-09-10", date_imputation: "2026-09-10",
          libelle: `ligne-${String(i).padStart(3, "0")}`, systeme: false,
          contre_ecriture_de: null, encaissement_id: null, depot_encaissement_id: null,
          lot_id: i % 2 ? "autre" : "lot",
        })) : [];
        const result = { data, error: banc.erreur && table === "ecritures" ? { message: "lecture refusée" } : null };
        const query: Record<string, unknown> = {};
        for (const method of ["select", "eq", "order", "limit", "in"]) query[method] = () => query;
        query.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
        return query;
      },
      rpc: async () => ({ data: { recettes: 900, depenses: 450 }, error: null }),
    },
  }),
}));
vi.mock("@/lib/portefeuille", () => ({ lotsDuPortefeuille: async () => banc.portefeuille }));
vi.mock("@/lib/quittancement-du-mois", () => ({ chargerQuittancementDuMois: async () => ({ mois: "2026-09", lignes: [], error: null }) }));
vi.mock("@/app/agence/[orgId]/comptabilite/formulaire-compta", () => ({
  FormulaireEcriture: () => createElement("form", { "aria-label": "Saisie test" }),
  FormulaireVentilation: () => createElement("form", { "aria-label": "Ventilation test" }),
  FormulaireCloture: () => createElement("form", { "aria-label": "Clôture test" }),
  RapportsGestion: () => createElement("div", null, "Rapports test"),
  BoutonContre: () => createElement("button", null, "Annuler"),
}));
import PageComptabilite from "@/app/agence/[orgId]/comptabilite/page";
const rendre = async (search: { vue?: string | string[]; page?: string | string[] } = {}) =>
  renderToStaticMarkup(await PageComptabilite({ params: Promise.resolve({ orgId: "org" }), searchParams: Promise.resolve(search) }));
beforeEach(() => { banc.role = "admin_agence"; banc.proprietaire = false; banc.erreur = false; banc.portefeuille = null; });

describe("comptabilité par action", () => {
  it("ouvre le journal sans imposer les formulaires et limite sa première page", async () => {
    const html = await rendre();
    expect(html).toContain("ligne-000");
    expect(html).toContain("ligne-019");
    expect(html).not.toContain("ligne-020");
    expect(html).not.toContain("Saisie test");
    expect(html).not.toContain("Clôture test");
    expect(html).not.toContain("Rapports test");
    expect(html).toContain("Page 1 sur 3");
    expect(html).toContain("aria-current=\"page\"");
  });
  it("permet de lire les écritures suivantes sans perdre les totaux", async () => {
    const html = await rendre({ page: "2" });
    expect(html).toContain("ligne-020");
    expect(html).toContain("ligne-039");
    expect(html).not.toContain("ligne-000");
    expect(html).not.toContain("ligne-040");
    expect(html).toContain("Recettes");
    expect(html).toContain("Page 2 sur 3");
  });
  it.each(["NaN", "-8", "1.5"])("ramène une page invalide (%s) au début", async (page) => {
    expect(await rendre({ page })).toContain("Page 1 sur 3");
  });
  it("borne une page trop grande sans masquer les dernières écritures", async () => {
    const html = await rendre({ page: "999" });
    expect(html).toContain("ligne-044");
    expect(html).toContain("Page 3 sur 3");
  });
  it("sépare la saisie du journal et conserve la ventilation", async () => {
    const html = await rendre({ vue: "saisie" });
    expect(html).toContain("Saisie test");
    expect(html).toContain("Ventilation test");
    expect(html).not.toContain("ligne-000");
    expect(html).not.toContain("Clôture test");
  });
  it("conserve l'avertissement irréversible au moment de clôturer", async () => {
    const html = await rendre({ vue: "cloture" });
    expect(html).toContain("Clôture test");
    expect(html).toContain("irréversible");
    expect(html).not.toContain("Saisie test");
  });
  it("ne propose pas de rapports aux propriétaires directs", async () => {
    banc.proprietaire = true;
    const html = await rendre({ vue: "rapports" });
    expect(html).not.toContain("Rapports test");
    expect(html).not.toContain("?vue=rapports");
    expect(html).toContain("ligne-000");
  });
  it("préserve les restrictions de l'agent, y compris par URL directe", async () => {
    banc.role = "agent"; banc.portefeuille = new Set(["lot"]);
    const html = await rendre({ vue: "cloture" });
    expect(html).not.toContain("Clôture test");
    expect(html).not.toContain("?vue=cloture");
    expect(html).not.toContain("ligne-001");
    expect(html).toContain("ligne-038");
    expect(html).toContain("Page 1 sur 2");
  });
  it("rend les rapports seuls lorsqu'ils sont demandés", async () => {
    const html = await rendre({ vue: "rapports" });
    expect(html).toContain("Rapports test");
    expect(html).not.toContain("ligne-000");
    expect(html).not.toContain("Saisie test");
  });
  it("ne transforme pas un échec de lecture en journal vide", async () => {
    banc.erreur = true;
    const html = await rendre();
    expect(html).toContain("role=\"alert\"");
    expect(html).not.toContain("Aucune écriture");
  });
});
