/**
 * D37 (CHF-01, option B) : le formulaire « Récapitulatif annuel · location nue » préremplit le champ « intérêts d'emprunt » avec le montant
 * que le livre porte en ligne 250. La proposition vient du serveur (elle dépend du lot et de l'année choisis), vérifiée comme la génération :
 * accès gérant, lot de l'organisation, année plausible.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
const banc = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, autorise: true }));

function mockDb(): SupabaseClient {
  const query = (table: string) => {
    const q: Record<string, unknown> = { then: (resolve: (x: unknown) => unknown) => Promise.resolve({ data: banc.tables[table] ?? [], error: null }).then(resolve) };
    for (const op of ["select", "eq", "is", "in", "not", "or", "order", "limit", "range", "gte", "lt"]) q[op] = () => q;
    return q;
  };
  return { from: query } as unknown as SupabaseClient;
}
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ supabase: mockDb(), user: banc.autorise ? { id: "u" } : null, role: "admin_agence" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { proposerInteretsEmprunt } from "@/app/actions/catalogue-documents";

const exercice = { lot_id: "lot", annee: 2026, version: 1, periodes: [{ debut: "2026-01-01", fin: "2026-12-31", quote_part: 100, regime: "nu" }], justification: "Lot nu", regularisation230: 0, quote_part230: 100, justification230: "Néant" };

beforeEach(() => {
  banc.autorise = true;
  banc.tables = {
    lots: [{ id: "lot", nom: "Appartement Jardin", bien_id: "bien", meuble: false }],
    ecritures: [{ id: "interets", lot_id: "lot", categorie: "Intérêts d'emprunt", sens: "depense", montant: 2345.67, date_piece: "2026-03-10" }],
    fiscal_qualifications_ecritures: [{ ecriture_id: "interets", lot_id: "lot", nature: "deductible", rubrique: "250", justification: "Tableau d'amortissement", version: 1 }],
    fiscal_encaissements_composantes: [],
    fiscal_exercices_lots: [exercice],
  };
});

describe("D37 : proposition du montant des intérêts d'emprunt", () => {
  it("propose le montant qualifié en ligne 250, au format que la saisie relit", async () => {
    const r = await proposerInteretsEmprunt("org", "lot", "2026");
    expect(r).toEqual({ montant: "2345,67", qualifie: true });
  });

  it("aucune dépense qualifiée en 250 : propose 0 et dit que le livre n'en porte pas", async () => {
    banc.tables.fiscal_qualifications_ecritures = [];
    banc.tables.ecritures = [];
    expect(await proposerInteretsEmprunt("org", "lot", "2026")).toEqual({ montant: "0", qualifie: false });
  });

  it("une qualification en 250 ramenée à zéro par une annulation est un montant qualifié de 0", async () => {
    banc.tables.ecritures = [
      ...banc.tables.ecritures,
      { id: "annulation", lot_id: "lot", categorie: "Intérêts d'emprunt", sens: "recette", montant: 2345.67, date_piece: "2026-03-11", contre_ecriture_de: "interets" },
    ];
    expect(await proposerInteretsEmprunt("org", "lot", "2026")).toEqual({ montant: "0,00", qualifie: true });
  });

  it("refuse hors accès gérant, sans rien lire", async () => {
    banc.autorise = false;
    expect(await proposerInteretsEmprunt("org", "lot", "2026")).toEqual({ erreur: "Accès refusé." });
  });

  it.each(["", "abc", "20", "2026.5", "1969", "3000"])("refuse l'année illisible ou hors de portée (%j)", async (annee) => {
    const r = await proposerInteretsEmprunt("org", "lot", annee);
    expect(r).toEqual({ erreur: "Choisissez une année valide." });
  });

  it("refuse un lot qui n'est pas un lot nu de l'organisation", async () => {
    banc.tables.lots = [];
    const r = await proposerInteretsEmprunt("org", "autre-lot", "2026");
    expect(r).toHaveProperty("erreur");
    expect((r as { erreur: string }).erreur).toMatch(/dossier/i);
  });
});
