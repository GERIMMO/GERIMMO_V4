/**
 * D25-B (fiche ARC-08) : un artisan refusé par la plateforme, ou sur la liste noire globale, ne peut plus écrire dans
 * l'outil clients externes (client, chantier, devis, facture) ; il lit encore ses dossiers et exporte son registre.
 * Un artisan « en attente » garde l'outil.
 *
 * Écran : les pages d'écriture disent pourquoi la saisie est fermée et désactivent leurs formulaires, sans rien cacher
 * de la lecture. Action serveur : le refus tombe AVANT le rendu du PDF au gabarit Gerimmo et avant tout dépôt de pièce.
 */
process.env.TZ = "UTC";

import { renderToStaticMarkup } from "react-dom/server";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
  activite: null as unknown,
  exclusion: null as string | null,
  rpc: vi.fn(),
  rendrePdf: vi.fn(),
  televerse: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {} }),
  notFound: () => { throw new Error("notFound"); },
}));
vi.mock("@/app/artisan/acces", () => ({
  verifierAccesArtisan: async () => ({}),
  chargerAgenda: async () => ({ lignes: [] }),
  verifierArtisanMutation: async () => ({
    supabase: { rpc: sim.rpc, storage: { from: () => ({ upload: sim.televerse, download: async () => ({}), remove: async () => ({}) }) } },
    fiche: { artisan_id: "a1" },
  }),
}));
vi.mock("@/lib/artisan-prive", async () => {
  const reel = await vi.importActual<typeof import("@/lib/artisan-prive")>("@/lib/artisan-prive");
  return {
    ...reel,
    environnementArtisanLocal: () => true,
    activationModuleArtisan: () => true,
    chargerActivitePrivee: async () => ({ data: sim.activite }),
  };
});
vi.mock("@/lib/documents/rendu", () => ({ rendrePdf: sim.rendrePdf }));

import PageClients from "@/app/artisan/clients/page";
import PageClient from "@/app/artisan/clients/[clientId]/page";
import PageChantier from "@/app/artisan/chantiers/[chantierId]/page";
import PageDevis from "@/app/artisan/devis/nouveau/page";
import PageFacture from "@/app/artisan/facturation/[factureId]/page";
import { enregistrerActivitePrivee } from "@/app/artisan/clients/actions";
import { MESSAGE_ECRITURE_FERMEE, exclusionLue } from "@/lib/artisan-prive-exclusion";

const entreprise = { nom: "Atelier TEST", siret: "12345678901234", telephone: null, email: null, adresse: "2 rue de l’Atelier", mentions: "" };
function activite(exclusion: string | null) {
  return {
    clients: [{ id: "c1", nom: "Mme Test", type: "particulier", email: "", telephone: "", adresse: "1 rue des Tests", revision: 1, archive_le: null }],
    chantiers: [{ id: "h1", client_id: "c1", titre: "Chantier TEST", adresse: "1 rue des Tests", description: "Fuite sous l’évier", statut: "brouillon", revision: 3, bilan: null, photo_id: null }],
    devis: [{
      id: "d1", chantier_id: "h1", version: 1, statut: "brouillon", description: "Réparation", lignes: [], montant_ht_cents: 10000,
      montant_tva_cents: 2000, montant_ttc_cents: 12000, entreprise, client: { nom: "Mme Test" }, valide_jusqu_au: "2026-11-12",
      pdf_id: null, preuve_acceptation_id: null, created_at: "2026-10-13T20:00:00.000Z",
    }],
    rendez_vous: [],
    factures: [{ id: "f1", origine: "externe", chantier_id: "h1", numero: "F-TEST-1", montant_ttc_cents: 10000, piece_id: "p1", client: "Mme Test", created_at: "2026-10-13T23:30:00.000Z" }],
    pieces: [], reglements: [], evenements: [],
    activation: { clients: true, reglements: true, exclusion },
  };
}
const html = async (element: unknown) => renderToStaticMarkup((await element) as never);
const params = <T>(v: T) => ({ params: Promise.resolve(v) });
const pages: [string, () => Promise<string>][] = [
  ["liste des clients", () => html(PageClients({ searchParams: Promise.resolve({}) }))],
  ["fiche du client", () => html(PageClient(params({ clientId: "c1" })))],
  ["fiche du chantier", () => html(PageChantier(params({ chantierId: "h1" })))],
  ["nouveau chantier et devis", () => html(PageDevis({ searchParams: Promise.resolve({}) }))],
];
/**
 * Les formulaires d'écriture (FormulairePrive) enveloppent leurs champs dans un premier fieldset ; désactivé, le navigateur
 * ne laisse rien saisir ni envoyer dedans (les fieldset imbriqués, comme les prestations d'un devis, en héritent).
 * Les formulaires de recherche et de choix n'en ont pas : ils ne sont pas des écritures.
 */
function formulairesDEcriture(page: string) {
  return page.split("<form").slice(1).map((f) => f.match(/<fieldset[^>]*>/)?.[0]).filter((t): t is string => Boolean(t));
}
const fieldsetsActifs = (page: string) => formulairesDEcriture(page).filter((t) => !/disabled/.test(t)).length;
const fieldsetsFermes = (page: string) => formulairesDEcriture(page).filter((t) => /disabled/.test(t)).length;

describe("écran : la saisie est fermée à un artisan exclu, avec la raison", () => {
  it.each(pages)("%s — refusé : le message de refus, formulaires désactivés, lecture intacte", async (_nom, rendre) => {
    sim.activite = activite("refuse");
    const page = await rendre();
    expect(page).toContain(MESSAGE_ECRITURE_FERMEE.refuse);
    expect(fieldsetsActifs(page)).toBe(0);
    expect(fieldsetsFermes(page)).toBeGreaterThan(0);
    expect(page).not.toContain("Saisie désactivée. Vos dossiers");
  });

  it.each(pages)("%s — liste noire : le message de retrait du réseau", async (_nom, rendre) => {
    sim.activite = activite("liste_noire");
    const page = await rendre();
    expect(page).toContain(MESSAGE_ECRITURE_FERMEE.liste_noire);
    expect(fieldsetsActifs(page)).toBe(0);
  });

  it.each(pages)("%s — artisan en attente ou validé : aucun message, formulaires ouverts", async (_nom, rendre) => {
    sim.activite = activite(null);
    const page = await rendre();
    expect(page).not.toContain("Gerimmo : vous ne pouvez plus");
    expect(page).not.toContain("Saisie désactivée");
    expect(fieldsetsActifs(page)).toBeGreaterThan(0);
  });

  it("la lecture reste entière : clients, chantiers, devis et factures restent affichés", async () => {
    sim.activite = activite("refuse");
    expect(await html(PageClients({ searchParams: Promise.resolve({}) }))).toContain("Mme Test");
    const chantier = await html(PageChantier(params({ chantierId: "h1" })));
    expect(chantier).toContain("Chantier TEST");
    expect(chantier).toContain("Devis — version 1");
    expect(chantier).toContain("/api/artisan-prive/export");
  });

  it("l'export reste proposé", async () => {
    sim.activite = activite("liste_noire");
    expect(await html(PageClients({ searchParams: Promise.resolve({}) }))).toContain('href="/api/artisan-prive/export"');
  });

  it("les règlements déclarés ne sont pas concernés par cette décision (à confirmer par le dirigeant)", async () => {
    sim.activite = activite("refuse");
    const page = await html(PageFacture(params({ factureId: "f1" })));
    expect(page).not.toContain(MESSAGE_ECRITURE_FERMEE.refuse);
    expect(fieldsetsActifs(page)).toBeGreaterThan(0);
  });

  it("une valeur inconnue venue de la base n'ouvre ni ne ferme rien de plus : elle est ignorée", () => {
    expect(exclusionLue("refuse")).toBe("refuse");
    expect(exclusionLue("liste_noire")).toBe("liste_noire");
    for (const brut of [null, undefined, "", "valide", "en_attente", 1, {}]) expect(exclusionLue(brut)).toBeNull();
  });

  it("les deux textes disent qui ferme, ce qui est fermé et ce qui reste ouvert", () => {
    for (const texte of Object.values(MESSAGE_ECRITURE_FERMEE)) {
      expect(texte).toMatch(/Gerimmo/);
      expect(texte).toMatch(/clients, de chantiers, de devis ni de factures/);
      expect(texte).toMatch(/Vos dossiers, vos justificatifs et votre export restent consultables/);
      expect(texte).not.toMatch(/undefined|null|statut_plateforme|blacklist|RLS|RPC/i);
    }
  });
});

function formulaire(champs: Record<string, string>) {
  const f = new FormData();
  f.set("cle", randomUUID());
  for (const [k, v] of Object.entries(champs)) f.set(k, v);
  return f;
}
const ecritures = () => sim.rpc.mock.calls.filter(([nom]) => nom !== "artisan_exclusion_plateforme");

describe("action serveur : le refus tombe avant le PDF et avant toute pièce", () => {
  beforeEach(() => {
    sim.exclusion = null;
    sim.activite = activite(null);
    sim.rpc.mockReset();
    sim.rendrePdf.mockReset();
    sim.televerse.mockReset();
    sim.rpc.mockImplementation(async (nom: string) => (nom === "artisan_exclusion_plateforme" ? { data: sim.exclusion, error: null } : { data: "h1", error: null }));
    sim.televerse.mockResolvedValue({ error: null });
  });
  const valider = () => enregistrerActivitePrivee(formulaire({ action: "valider_devis", id: "h1", revision: "3", devis_id: "d1" }));

  it.each(["refuse", "liste_noire"] as const)("%s : valider un devis déjà en brouillon ne produit aucun PDF au gabarit Gerimmo", async (cas) => {
    sim.exclusion = cas;
    const r = await valider();
    expect(r).toEqual({ erreur: MESSAGE_ECRITURE_FERMEE[cas] });
    expect(sim.rendrePdf).not.toHaveBeenCalled();
    expect(sim.televerse).not.toHaveBeenCalled();
    expect(ecritures()).toHaveLength(0);
  });

  it.each([
    ["client", { nom: "Mme Test", type: "particulier", adresse: "1 rue des Tests" }],
    ["chantier", { id: "c1", titre: "T", adresse: "A", description: "D" }],
    ["devis", { id: "h1", revision: "3", description: "X", lignes: "[]", valide_jusqu_au: "2026-12-01" }],
    ["facture", { id: "h1", revision: "3", numero: "F-1", montant: "100,00" }],
    ["annuler", { id: "h1", revision: "3", motif: "Annulation de test" }],
  ])("%s : refusé avant tout appel d'écriture", async (action, champs) => {
    sim.exclusion = "refuse";
    const r = await enregistrerActivitePrivee(formulaire({ action, ...champs }));
    expect(r.erreur).toBe(MESSAGE_ECRITURE_FERMEE.refuse);
    expect(ecritures()).toHaveLength(0);
  });

  it("un artisan ouvert (en attente ou validé) écrit comme avant : l'écriture part", async () => {
    sim.exclusion = null;
    const r = await enregistrerActivitePrivee(formulaire({ action: "client", nom: "Mme Test", type: "particulier", adresse: "1 rue des Tests" }));
    expect(r.erreur).toBeUndefined();
    expect(ecritures()).toHaveLength(1);
    expect(ecritures()[0][0]).toBe("artisan_externe_ecrire");
  });

  it("les règlements déclarés ne sont pas contrôlés ici (hors de la décision) : la garde ne les interroge pas", async () => {
    sim.exclusion = "refuse";
    await enregistrerActivitePrivee(formulaire({ action: "reglement", origine: "externe", id: "f1", montant: "20,00", date: "2026-10-13", moyen: "virement", reference: "R" }));
    expect(sim.rpc.mock.calls.map(([nom]) => nom)).not.toContain("artisan_exclusion_plateforme");
    expect(ecritures()[0]?.[0]).toBe("artisan_reglement_ecrire");
  });

  it("si la garde ne répond pas, l'action continue : la base refusera elle-même (la garde de la base fait foi)", async () => {
    sim.rpc.mockImplementation(async (nom: string) => (nom === "artisan_exclusion_plateforme" ? { data: null, error: { message: "indisponible" } } : { data: null, error: { message: "Votre inscription a été refusée par Gerimmo : …" } }));
    const r = await enregistrerActivitePrivee(formulaire({ action: "client", nom: "Mme Test", type: "particulier", adresse: "1 rue des Tests" }));
    expect(r.erreur).toContain("refusée par Gerimmo");
    expect(ecritures()).toHaveLength(1);
  });
});
