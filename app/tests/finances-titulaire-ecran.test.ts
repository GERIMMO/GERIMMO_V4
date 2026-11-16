import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { baseSimulee, type BaseSimulee } from "./fixtures/base-simulee";
import type { EcritureFinances } from "@/lib/finances";
import { PageFinances } from "@/components/page-finances";

const banc = vi.hoisted(() => ({ db: null as BaseSimulee | null }));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspace: async () => ({ supabase: banc.db!.client }),
}));
vi.mock("@/components/recapitulatif-fiscal", () => ({ RecapitulatifFiscal: () => null }));
vi.mock("@/app/agence/[orgId]/comptabilite/quittancement-mois", () => ({ QuittancementMois: () => null }));
vi.mock("@/lib/entites-patrimoine", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/entites-patrimoine")>(),
  lireEntitesPatrimoine: async () => ({
    entites: [
      { id: "sci", nom: "SCI des Amandiers", qualite: "SCI", lots: ["A"] },
      { id: "perso", nom: "Claire", qualite: null, lots: ["B", "C"] },
    ],
    periodes: [
      { lot_id: "A", titulaire: "sci", quote_part: 100, date_debut: "2026-11-16", date_fin: null },
      { lot_id: "B", titulaire: "perso", quote_part: 100, date_debut: "2026-11-16", date_fin: null },
      { lot_id: "C", titulaire: "perso", quote_part: 100, date_debut: "2026-01-01", date_fin: null },
    ],
    erreur: false,
  }),
}));

function depense(id: string, lot: string | null, bien: string, date: string, montant: number): EcritureFinances {
  return { id, lot_id: lot, bien_id: bien, date_imputation: date, montant, sens: "depense",
    categorie: "travaux", libelle: id, contre_ecriture_de: null };
}

beforeEach(() => {
  const org = { organization_id: "parc" };
  banc.db = baseSimulee({
    biens: [{ ...org, id: "immeuble", nom: "Immeuble" }, { ...org, id: "maison", nom: "Maison" }],
    lots: [{ ...org, id: "A", bien_id: "immeuble" }, { ...org, id: "B", bien_id: "maison" },
      { ...org, id: "C", bien_id: "immeuble" }],
    journal_par_bien: [
      { ...org, ...depense("Facture eau avant acquisition", "A", "immeuble", "2026-11-05", 180) },
      { ...org, ...depense("Facture du seul autre patrimoine", "B", "maison", "2026-11-05", 75) },
      { ...org, ...depense("Facture d’un autre lot du même immeuble", "C", "immeuble", "2026-11-05", 90) },
      { organization_id: "tiers", ...depense("Confidentiel", "A", "immeuble", "2026-11-05", 100) },
    ],
  }, { rpc: { quittancement_mois: () => ({ data: [], error: null }) } });
});

async function operations() {
  const html = renderToStaticMarkup(await PageFinances({ orgId: "parc", recherche: { annee: "2026", entite: "sci" } }));
  return html.split('id="operations"')[1].split('id="declaration"')[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

it("montre la facture de 180 € antérieure à la détention sans la compter dans les dépenses de la SCI", async () => {
  const texte = await operations();
  expect(texte).toContain("Recettes 0,00 € Dépenses 0,00 € Solde 0,00 €");
  expect(texte).toContain("1 opération à rattacher");
  expect(texte).toContain("Facture eau avant acquisition");
  expect(texte).toContain("−180,00 €");
  expect(texte).not.toContain("Aucune opération");
  expect(texte).not.toMatch(/Confidentiel|Facture du seul autre patrimoine|Facture d’un autre lot/);
});

it("sépare les écritures certaines, les écritures communes du bâtiment mixte et les opérations annulées", async () => {
  const org = { organization_id: "parc" };
  banc.db!.tables.journal_par_bien.push(
    { ...org, ...depense("Dépense confirmée", "A", "immeuble", "2026-11-16", 40) },
    { ...org, ...depense("Réparation commune", null, "immeuble", "2026-11-20", 30) },
    { ...org, ...depense("Opération annulée", "A", "immeuble", "2026-11-06", 10) },
    { ...org, ...depense("Annulation", "A", "immeuble", "2027-01-01", 10), contre_ecriture_de: "Opération annulée" },
  );
  const texte = await operations();
  expect(texte).toContain("Recettes 0,00 € Dépenses 40,00 € Solde -40,00 €");
  expect(texte).toContain("2 opérations à rattacher");
  expect(texte).toContain("210,00 €");
  expect(texte).toContain("Réparation commune");
  expect(texte).not.toContain("Opération annulée");
});
