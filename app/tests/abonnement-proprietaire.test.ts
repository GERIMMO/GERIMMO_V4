import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/espace", () => ({ verifierAccesEspace: async () => ({ supabase: { rpc: mocks.rpc }, organisation: { type: "proprietaire_direct", name: "Parc de test" }, role: "proprietaire_direct" }) }));
vi.mock("@/lib/stripe", () => ({ configurationStripe: () => ({ pret: false }), clientStripe: vi.fn() }));
vi.mock("@/app/actions/abonnement", () => ({ demarrerAbonnement: vi.fn(), confirmerHausse: vi.fn(), demanderPeriodicite: vi.fn(), ouvrirPortailAbonnement: vi.fn(), resilierAbonnement: vi.fn() }));
import { PageAbonnement2026 } from "@/app/agence/[orgId]/abonnement/abonnement-2026";

const etatInitial = { statut: "essai", ecriture_ouverte: true, essai_fin: "2099-10-24", jours_essai_restants: 13, public_tarif: "proprietaire_direct", unites_a_couvrir: 3, unites_souscrites: null };
const paiementInitial = { souscrit: false, paye: false, paiement_en_retard: false, annulation_demandee: false, formule: null, periodicite: "mensuel", unites_souscrites: null, montant_periode_cents: null, periode_fin: null, periodicite_suivante: null };
let etat: Record<string, unknown>;
let paiement: Record<string, unknown>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-10-10T23:30:00Z")); // Le 11 à Paris : 13 jours avant le 24.
  etat = { ...etatInitial };
  paiement = { ...paiementInitial };
  mocks.rpc.mockImplementation(async (nom: string) => ({ data: [nom === "etat_abonnement" ? etat : paiement], error: null }));
});
afterEach(() => vi.useRealTimers());
async function rendre() {
  return renderToStaticMarkup(await PageAbonnement2026({ params: Promise.resolve({ orgId: "org-test" }), searchParams: Promise.resolve({}) }));
}
function abonner(changements = {}) {
  etat = { ...etat, statut: "actif" };
  paiement = { ...paiement, souscrit: true, paye: true, formule: "bailleur", unites_souscrites: 3, montant_periode_cents: 999, periode_fin: "2099-11-24", ...changements };
}

describe("présentation de l’abonnement propriétaire", () => {
  it("présente l’essai et le tarif proposé sans annoncer un abonnement payé", async () => {
    const html = await rendre();
    expect(html).toContain("Votre essai Gerimmo");
    expect(html).toContain("13 jours restants");
    expect(html).toContain("25 octobre 2099");
    expect(html).toContain("Zoho Sign");
    expect(html).not.toContain("signature électronique n’est pas encore proposée");
    expect(html).toContain("Choisir ma formule");
    expect(html).toContain("Sans souscription, aucun prélèvement");
    expect(html).not.toContain("Abonnement actif");
  });
  it("conserve le montant réellement facturé même si un avantage le réduit", async () => {
    abonner({ montant_periode_cents: 749 });
    const html = await rendre();
    expect(html).toContain("7,49");
    expect(html).toContain("votre avantage ou ancienne condition est conservé");
    expect(html).toContain("Abonnement actif");
    expect(html).not.toContain("Choisir ma formule");
  });
  it("distingue le prélèvement annuel des mensualités", async () => {
    abonner({ periodicite: "annuel", montant_periode_cents: 9990 });
    const html = await rendre();
    expect(html).toContain("99,90");
    expect(html).toContain("Facturation annuelle");
    expect(html).toContain("TTC / an");
  });
  it("ne remplace pas un montant indisponible par zéro", async () => {
    abonner({ montant_periode_cents: null });
    const html = await rendre();
    expect(html).toContain("À confirmer");
    expect(html).not.toContain("Sans souscription, aucun prélèvement");
  });
  it("garde visibles la fin de l’abonnement et la résiliation programmée", async () => {
    abonner({ annulation_demandee: true });
    const html = await rendre();
    expect(html).toContain("Fin de l’abonnement");
    expect(html).toContain("Résiliation au");
    expect(html).toContain("Annuler la résiliation");
  });
  it("annonce une erreur de lecture sans proposer une nouvelle souscription", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "indisponible" } });
    const html = await rendre();
    expect(html).toContain("Lecture impossible");
    expect(html).not.toContain("Choisir ma formule");
    expect(html).not.toContain("Aucun prélèvement");
  });
});
