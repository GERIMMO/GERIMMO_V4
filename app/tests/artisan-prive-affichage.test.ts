/**
 * Audit du 13/10/2026 (ARC-02, ARC-03, ARC-10) : l'espace privé de l'artisan (clients externes, règlements) affichait
 * les heures dans le fuseau du serveur (UTC sur Vercel), l'état d'un chantier par son code interne, et calculait la
 * date du jour en UTC — entre minuit et 2 h à Paris, « aujourd'hui » était donc hier.
 *
 * Les pages sont des composants serveur : on les appelle comme Next le fait, puis on rend l'arbre obtenu. Le serveur
 * est simulé en UTC, l'horloge à 01:47 à Paris (23:47 UTC la veille).
 */
process.env.TZ = "UTC";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({ activite: null as unknown }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {} }),
  notFound: () => { throw new Error("notFound"); },
}));
vi.mock("@/app/artisan/acces", () => ({
  verifierAccesArtisan: async () => ({}),
  chargerAgenda: async () => ({ lignes: [] }),
}));
vi.mock("@/lib/artisan-prive", async () => {
  const reel = await vi.importActual<typeof import("@/lib/artisan-prive")>("@/lib/artisan-prive");
  return {
    ...reel,
    environnementArtisanLocal: () => true,
    activationModuleArtisan: () => true,
    chargerActivitePrivee: async () => ({ data: etat.activite }),
  };
});

import { ChantiersDansAgenda } from "@/app/artisan/clients/resumes";
import PageChantier from "@/app/artisan/chantiers/[chantierId]/page";
import PageFacture from "@/app/artisan/facturation/[factureId]/page";
import PageClient from "@/app/artisan/clients/[clientId]/page";

const entreprise = { nom: "Atelier TEST", siret: "12345678901234", telephone: null, email: null, adresse: "2 rue de l’Atelier", mentions: "" };

function activite() {
  return {
    clients: [{ id: "c1", nom: "Mme Test", type: "particulier", email: "", telephone: "", adresse: "1 rue des Tests", revision: 1, archive_le: null }],
    chantiers: [{ id: "h1", client_id: "c1", titre: "Chantier TEST", adresse: "1 rue des Tests", description: "Fuite sous l’évier", statut: "planifie", revision: 3, bilan: null, photo_id: null }],
    devis: [{
      id: "d1", chantier_id: "h1", version: 1, statut: "valide", description: "Réparation", lignes: [], montant_ht_cents: 10000,
      montant_tva_cents: 2000, montant_ttc_cents: 12000, entreprise, client: { nom: "Mme Test" }, valide_jusqu_au: "2026-11-12",
      pdf_id: null, preuve_acceptation_id: null, created_at: "2026-10-13T20:00:00.000Z",
    }],
    // 22/10/2026 de 09:00 à 11:00, heure de Paris : 07:00Z - 09:00Z.
    rendez_vous: [{ id: "r1", chantier_id: "h1", debut: "2026-10-22T07:00:00.000Z", fin: "2026-10-22T09:00:00.000Z", statut: "retenu", motif: "", conflit_motif: null }],
    factures: [{ id: "f1", origine: "externe", chantier_id: "h1", numero: "F-TEST-1", montant_ttc_cents: 10000, piece_id: "p1", client: "Mme Test", created_at: "2026-10-13T23:30:00.000Z" }],
    pieces: [],
    reglements: [{
      id: "g1", facture_externe_id: "f1", facture_gerimmo_id: null, montant_cents: 2000, date_reglement: "2026-10-13", moyen: "virement",
      reference: "Virement TEST", preuve_id: "p2", auteur: "a1", created_at: "2026-10-13T23:33:15.000Z", annule_le: null,
      annulation_motif: null, annulation_preuve_id: null,
    }],
    // Créé à 23:14 UTC le 13/10, soit 01:14 le 14/10 à Paris.
    evenements: [{ id: "e1", objet_id: "h1", action: "chantier", created_at: "2026-10-13T23:14:14.000Z", auteur: "a1", details: {} }],
    activation: { clients: true, reglements: true },
  };
}

const html = async (element: unknown) => renderToStaticMarkup((await element) as never);

beforeEach(() => {
  etat.activite = activite();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T23:47:00.000Z"));
});
afterEach(() => vi.useRealTimers());

describe("heures de l'espace privé : toujours à l'heure de Paris, sans secondes (ARC-02)", () => {
  it("agenda : le chantier externe planifié à 09:00 s'affiche 09:00 — 11:00", async () => {
    const page = await html(ChantiersDansAgenda());
    expect(page).toContain("22/10/2026 09:00 — 11:00");
    expect(page).not.toContain("07:00");
  });

  it("fiche du chantier : rendez-vous actuel et historique à l'heure de Paris", async () => {
    const page = await html(PageChantier({ params: Promise.resolve({ chantierId: "h1" }) }));
    expect(page).toContain("Rendez-vous actuel\u00a0: 22/10/2026 09:00 — 11:00");
    expect(page).toContain("14/10/2026 01:14 · Chantier créé");
    expect(page).not.toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it("fiche facture : « Enregistré le » à l'heure de Paris", async () => {
    const page = await html(PageFacture({ params: Promise.resolve({ factureId: "f1" }) }));
    expect(page).toContain("Enregistré le 14/10/2026 01:33");
    expect(page).not.toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});

describe("état d'un chantier : un libellé, jamais le code interne (ARC-03)", () => {
  it("agenda : « Planifié »", async () => {
    const page = await html(ChantiersDansAgenda());
    expect(page).toContain("Client externe · Mme Test · Planifié");
    expect(page).not.toContain("· planifie<");
  });

  it("fiche du client : la liste de ses chantiers dit « Planifié »", async () => {
    const page = await html(PageClient({ params: Promise.resolve({ clientId: "c1" }) }));
    expect(page).toContain("Chantier TEST · Planifié");
  });
});

describe("date du jour : celle de Paris, pas celle d'UTC (ARC-10)", () => {
  it("règlement : date proposée et plafond = 14/10 à 01:47 à Paris", async () => {
    const page = await html(PageFacture({ params: Promise.resolve({ factureId: "f1" }) }));
    const champ = page.match(/<input[^>]*name="date"[^>]*>/)?.[0] ?? "";
    expect(champ).toContain('value="2026-10-14"');
    expect(champ).toContain('max="2026-10-14"');
  });

  it("chantier : accord du client = jour de Paris ; validité du devis = jour de Paris + 30 jours", async () => {
    etat.activite = { ...(activite() as object), chantiers: [{ ...activite().chantiers[0], statut: "accepte" }] };
    const page = await html(PageChantier({ params: Promise.resolve({ chantierId: "h1" }) }));
    const accord = page.match(/<input[^>]*name="date"[^>]*>/)?.[0] ?? "";
    expect(accord).toContain('value="2026-10-14"');
    expect(accord).toContain('max="2026-10-14"');
    const validite = page.match(/<input[^>]*name="valide_jusqu_au"[^>]*>/)?.[0] ?? "";
    expect(validite).toContain('value="2026-11-13"');
    expect(validite).toContain('min="2026-10-14"');
  });
});
