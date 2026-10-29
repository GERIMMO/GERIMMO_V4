import { avecDetenteursAuReel } from "./fixtures/profil-fiscal";
/**
 * D37 (CHF-01, option B) : le formulaire « Récapitulatif annuel · location nue » préremplit le champ « intérêts d'emprunt » avec le montant
 * que le livre porte en ligne 250. La proposition vient du serveur (elle dépend du lot et de l'année choisis), vérifiée comme la génération :
 * accès gérant, lot de l'organisation, année plausible.
 *
 * La base est SIMULÉE avec ses filtres (fixtures/base-simulee) : le jeu de données contient des lignes d'une autre organisation, d'une autre
 * année, d'un autre lot et d'un lot meublé. Un filtre retiré ou mal rempli (organisation, année, lot) change donc le montant proposé.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { baseSimulee, filtresDe, lecturesSansFiltreOrganisation, type BaseSimulee, type Ligne } from "./fixtures/base-simulee";

const banc = vi.hoisted(() => ({ base: null as unknown, autorise: true, organisationsVerifiees: [] as string[] }));

vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async (orgId: string) => {
    banc.organisationsVerifiees.push(orgId);
    return { supabase: (banc.base as BaseSimulee).client, user: banc.autorise ? { id: "u" } : null, role: "admin_agence" };
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { proposerInteretsEmprunt } from "@/app/actions/catalogue-documents";

const periodes = (annee: number, regime = "nu") => [{ debut: `${annee}-01-01`, fin: `${annee}-12-31`, quote_part: 100, regime }];
const exercice = (organization_id: string, lot_id: string, annee: number, version = 1, regime = "nu"): Ligne => ({
  organization_id, lot_id, annee, version, periodes: periodes(annee, regime), justification: "Lot nu", regularisation230: 0, quote_part230: 100, justification230: "Néant",
});
const interets = (organization_id: string, id: string, lot_id: string, montant: number, date_piece: string): Ligne => ({
  organization_id, id, lot_id, categorie: "Intérêts d'emprunt", sens: "depense", montant, date_piece,
});
const qualification = (organization_id: string, ecriture_id: string, lot_id: string, rubrique = "250", version = 1): Ligne => ({
  organization_id, ecriture_id, lot_id, nature: "deductible", rubrique, justification: "Tableau d'amortissement", version,
});

/** Le dossier de référence (organisation « org », lot « lot », 2026 : 2 345,67 €) entouré de lignes qui ne doivent JAMAIS compter. */
function tables(): Record<string, Ligne[]> {
  return {
    lots: [
      { organization_id: "org", id: "lot", nom: "Appartement Jardin", bien_id: "bien", meuble: false },
      { organization_id: "org", id: "lot-meuble", nom: "Studio meublé", bien_id: "bien", meuble: true },
      { organization_id: "org", id: "autre-lot", nom: "Studio Gare", bien_id: "bien", meuble: false },
      { organization_id: "autre-org", id: "lot-etranger", nom: "Lot d'une autre agence", bien_id: "bien-etranger", meuble: false },
    ],
    ecritures: [
      // Une pièce d'une autre organisation qui porte le MÊME identifiant de lot : seule l'organisation les sépare.
      interets("autre-org", "interets-etranger", "lot", 999, "2026-03-10"),
      interets("org", "interets", "lot", 2345.67, "2026-03-10"),
      // Une autre année du même lot, et un autre lot de la même année.
      interets("org", "interets-2025", "lot", 777, "2025-03-10"),
      interets("org", "interets-autre-lot", "autre-lot", 555, "2026-03-10"),
    ],
    fiscal_qualifications_ecritures: [
      qualification("autre-org", "interets-etranger", "lot"),
      // Même pièce, qualification plus récente d'une autre organisation : elle ne doit pas prendre le pas.
      qualification("autre-org", "interets", "lot", "224", 5),
      qualification("org", "interets", "lot"),
      qualification("org", "interets-2025", "lot"),
      qualification("org", "interets-autre-lot", "autre-lot"),
    ],
    fiscal_encaissements_composantes: [],
    fiscal_exercices_lots: [
      // Exercice plus récent d'une autre année, d'un autre lot, d'une autre organisation : aucun ne doit remplacer celui de « lot » 2026.
      exercice("org", "lot", 2025, 4),
      exercice("org", "lot-tiers", 2026, 5, "hors_perimetre"),
      exercice("autre-org", "lot", 2026, 6, "meuble"),
      exercice("org", "lot", 2026, 1),
      exercice("org", "autre-lot", 2026, 1),
    ],
  };
}

const lire = async (orgId: string, lot: string, annee: string) => {
  banc.base = baseSimulee(avecDetenteursAuReel(tables()));
  return proposerInteretsEmprunt(orgId, lot, annee);
};
const baseCourante = () => banc.base as BaseSimulee;

beforeEach(() => {
  banc.autorise = true;
  banc.organisationsVerifiees = [];
  banc.base = baseSimulee(avecDetenteursAuReel(tables()));
});

describe("D37 : proposition du montant des intérêts d'emprunt", () => {
  it("propose le montant qualifié en ligne 250, au format que la saisie relit", async () => {
    expect(await lire("org", "lot", "2026")).toEqual({ montant: "2345,67", qualifie: true });
    expect(banc.organisationsVerifiees).toEqual(["org"]);
  });

  it("ne mélange ni les années (2025 propose le montant de 2025), ni les lots, ni les organisations", async () => {
    expect(await lire("org", "lot", "2025")).toEqual({ montant: "777,00", qualifie: true });
    expect(await lire("org", "autre-lot", "2026")).toEqual({ montant: "555,00", qualifie: true });
    // Sans la pièce de 2026 ni son exercice, le lot n'a rien en 2026 : ni 999 € d'une autre agence, ni 777 € de l'an dernier.
    const t = tables();
    t.ecritures = t.ecritures.filter((e) => e.id !== "interets");
    t.fiscal_qualifications_ecritures = t.fiscal_qualifications_ecritures.filter((q) => q.ecriture_id !== "interets");
    banc.base = baseSimulee(avecDetenteursAuReel(t));
    expect(await proposerInteretsEmprunt("org", "lot", "2026")).toEqual({ montant: "0", qualifie: false });
  });

  it("toute lecture est bornée à l'organisation, l'année et le lot demandés", async () => {
    await lire("org", "lot", "2026");
    const base = baseCourante();
    expect(lecturesSansFiltreOrganisation(base, "org")).toEqual([]);
    expect(filtresDe(base, "fiscal_exercices_lots")).toContainEqual({ op: "eq", col: "annee", val: 2026 });
    const bornes = filtresDe(base, "ecritures");
    expect(bornes).toContainEqual({ op: "gte", col: "date_piece", val: "2026-01-01" });
    expect(bornes).toContainEqual({ op: "lt", col: "date_piece", val: "2027-01-01" });
    expect(filtresDe(base, "lots")).toContainEqual({ op: "eq", col: "id", val: "lot" });
  });

  it("aucune dépense qualifiée en 250 : propose 0 et dit que le livre n'en porte pas", async () => {
    const t = tables();
    t.fiscal_qualifications_ecritures = t.fiscal_qualifications_ecritures.filter((q) => q.organization_id !== "org");
    t.ecritures = [];
    banc.base = baseSimulee(avecDetenteursAuReel(t));
    expect(await proposerInteretsEmprunt("org", "lot", "2026")).toEqual({ montant: "0", qualifie: false });
  });

  it("une qualification en 250 ramenée à zéro par une annulation est un montant qualifié de 0", async () => {
    const t = tables();
    t.ecritures.push({ ...interets("org", "annulation", "lot", 2345.67, "2026-03-11"), sens: "recette", contre_ecriture_de: "interets" });
    banc.base = baseSimulee(avecDetenteursAuReel(t));
    expect(await proposerInteretsEmprunt("org", "lot", "2026")).toEqual({ montant: "0,00", qualifie: true });
  });

  it("refuse hors accès gérant, sans rien lire", async () => {
    banc.autorise = false;
    expect(await proposerInteretsEmprunt("org", "lot", "2026")).toEqual({ erreur: "Accès refusé." });
    expect(baseCourante().lectures).toEqual([]);
  });

  it.each(["", "abc", "20", "2026.5", "1969", "3000"])("refuse l'année illisible ou hors de portée (%j)", async (annee) => {
    const r = await proposerInteretsEmprunt("org", "lot", annee);
    expect(r).toEqual({ erreur: "Choisissez une année valide." });
    expect(baseCourante().lectures).toEqual([]);
  });

  it.each([
    ["un lot d'une autre organisation", "lot-etranger"],
    ["un lot meublé (autre récapitulatif)", "lot-meuble"],
    ["un lot qui n'existe pas", "inconnu"],
  ])("refuse %s", async (_libelle, lot) => {
    const r = await lire("org", lot, "2026");
    expect(r).toHaveProperty("erreur");
    expect((r as { erreur: string }).erreur).toMatch(/dossier/i);
    // Refusé avant toute lecture du livre.
    expect(baseCourante().lectures.map((l) => l.table)).toEqual(["lots"]);
  });

  it("le lot d'une autre organisation reste refusé même quand c'est cette organisation qui le demande en son nom", async () => {
    const r = await lire("autre-org", "lot", "2026");
    expect(r).toHaveProperty("erreur");
    expect(banc.organisationsVerifiees).toEqual(["autre-org"]);
  });
});
