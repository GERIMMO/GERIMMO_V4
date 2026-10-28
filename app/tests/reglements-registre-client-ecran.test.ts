/**
 * Audit final (DOC-03) — « Ma facturation » de l'artisan : le bloc du registre ne dit plus « Aucun règlement déclaré ·
 * Solde 350,00 € » à côté de la carte « Réglée le 27/10/2026 (déclaré par votre client) ». Rendu du composant serveur.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({ activite: null as unknown }));
vi.mock("@/lib/artisan-prive", async () => {
  const reel = await vi.importActual<typeof import("@/lib/artisan-prive")>("@/lib/artisan-prive");
  return { ...reel, chargerActivitePrivee: async () => ({ data: sim.activite }) };
});
import { ReglementsDansFacturation } from "@/app/artisan/clients/resumes";
import type { FactureVueParArtisan } from "@/lib/reglement-facture";

const facture = { id: "f1", origine: "gerimmo", intervention_id: "i1", numero: "F-2026-001", montant_ttc_cents: 35000, client: "Agence Alpha", created_at: "2026-10-27T10:00:00Z" };
const declaration: FactureVueParArtisan = { facture_id: "f1", intervention_id: "i1", organization_id: "o1", numero: "F-2026-001", montant_ttc_cents: 35000, validee_le: "2026-10-27", etat: "reglee", reglee_le: "2026-10-27", reglements: [{ date_reglement: "2026-10-27", moyen: "virement" }] };

describe("Ma facturation — registre et déclaration du client", () => {
  it("rien pointé, client « réglée » : le registre le dit, sans « Aucun règlement déclaré »", async () => {
    sim.activite = { factures: [facture], reglements: [], avoirs: [], clients: [], chantiers: [], devis: [], rendez_vous: [], pieces: [], evenements: [], activation: { clients: true, reglements: true } };
    const html = renderToStaticMarkup(await ReglementsDansFacturation({ etatsClient: new Map([["i1", declaration]]) }));
    expect(html).toContain("Réglée le 27/10/2026 selon votre client · réception à pointer");
    expect(html).toContain("Reste à pointer 350,00");
    expect(html).not.toContain("Aucun règlement déclaré");
  });
  it("sans déclaration du client : comme avant", async () => {
    const html = renderToStaticMarkup(await ReglementsDansFacturation({}));
    expect(html).toContain("Aucun règlement déclaré");
    expect(html).toContain("Solde 350,00");
  });
});
