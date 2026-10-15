/**
 * Audit du 13/10/2026 (ARC-01, ARC-06) : dans l'espace privé de l'artisan, l'échec du rendu PDF montrait le nom d'une
 * variable d'environnement, un client en doublon parlait de « cette facture » et un nom resté vide demandait de
 * « joindre votre justificatif ».
 *
 * On appelle l'action serveur réelle, avec une base et un moteur PDF simulés qui échouent comme sur le banc.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
  rpc: vi.fn(),
  rendrePdf: vi.fn(),
  activite: null as unknown,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/artisan/acces", () => ({
  verifierArtisanMutation: async () => ({ supabase: { rpc: sim.rpc, storage: {} }, fiche: { artisan_id: "a1" } }),
}));
vi.mock("@/lib/artisan-prive", () => ({
  activationArtisanLocale: () => true,
  chargerActivitePrivee: async () => ({ data: sim.activite }),
}));
vi.mock("@/lib/documents/rendu", () => ({ rendrePdf: sim.rendrePdf }));

import { enregistrerActivitePrivee } from "@/app/artisan/clients/actions";
import { messageErreurPrive } from "@/lib/artisan-prive-erreurs";

const CHANTIER = "00000000-0000-0000-0000-0000000000a1";
const entreprise = { nom: "Atelier TEST", siret: "12345678901234", telephone: null, email: null, adresse: "2 rue de l’Atelier", mentions: "" };

function formulaire(champs: Record<string, string>) {
  const f = new FormData();
  f.set("cle", randomUUID());
  for (const [k, v] of Object.entries(champs)) f.set(k, v);
  return f;
}

function activiteAvecDevis(nomEntreprise = "Atelier TEST") {
  return {
    chantiers: [{ id: CHANTIER, titre: "Chantier TEST", adresse: "1 rue des Tests", revision: 3 }],
    devis: [{
      id: "d1", chantier_id: CHANTIER, version: 1, statut: "brouillon", description: "Réparation", lignes: [],
      montant_ht_cents: 10000, montant_tva_cents: 2000, montant_ttc_cents: 12000, entreprise: { ...entreprise, nom: nomEntreprise },
      client: { nom: "Mme Test" }, valide_jusqu_au: "2026-11-12", pdf_id: null, created_at: "2026-10-13T20:00:00.000Z",
    }],
  };
}

/** Les appels qui écrivent : la garde d'exclusion (D25-B, ARC-08) précède chaque écriture et n'en est pas une. */
const ecritures = () => sim.rpc.mock.calls.filter(([nom]) => nom !== "artisan_exclusion_plateforme");

beforeEach(() => {
  sim.rpc.mockReset();
  sim.rpc.mockImplementation(async (nom: string) => (nom === "artisan_exclusion_plateforme" ? { data: null, error: null } : undefined));
  sim.rendrePdf.mockReset();
  sim.activite = activiteAvecDevis();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("devis externe : le rendu PDF échoue (ARC-01)", () => {
  const valider = () => enregistrerActivitePrivee(formulaire({ action: "valider_devis", id: CHANTIER, revision: "3", devis_id: "d1" }));

  it("l'artisan lit un message métier avec une référence, pas le texte technique", async () => {
    sim.rendrePdf.mockRejectedValue(new Error("Chrome introuvable pour le rendu PDF : installez Google Chrome ou renseignez GERIMMO_CHROME."));
    const r = await valider();
    expect(r.erreur).toMatch(/PDF du devis n’a pas pu être généré \(réf\. DOC-[A-Z0-9]+\)/);
    expect(r.erreur).not.toMatch(/Chrome|GERIMMO|installez|variable/i);
    expect(ecritures()).toHaveLength(0);
  });

  it("le détail technique reste au journal du serveur, sous la même référence", async () => {
    const technique = new Error("Navigation timeout of 30000 ms exceeded");
    sim.rendrePdf.mockRejectedValue(technique);
    const r = await valider();
    const reference = /réf\. (DOC-[A-Z0-9]+)/.exec(r.erreur ?? "")?.[1];
    expect(reference).toBeTruthy();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(reference!), technique);
    expect(r.erreur).not.toMatch(/timeout/i);
  });

  it("un devis incomplet reste un refus métier lisible, sans passer par le moteur PDF", async () => {
    sim.activite = activiteAvecDevis("");
    const r = await valider();
    expect(r.erreur).toMatch(/Nom de l’artisan/);
    expect(r.erreur).not.toMatch(/réf\. DOC-/);
    expect(sim.rendrePdf).not.toHaveBeenCalled();
  });
});

describe("clients, chantiers, factures : un message par action (ARC-06)", () => {
  const champsClient = { action: "client", nom: "Mme Test", type: "particulier", email: "", telephone: "", adresse: "1 rue des Tests" };

  it("client en doublon : on parle du client, pas d'une facture", async () => {
    sim.rpc.mockResolvedValue({ data: null, error: { message: "Ce dossier ou cette facture existe déjà. Rechargez avant de recommencer" } });
    const r = await enregistrerActivitePrivee(formulaire(champsClient));
    expect(r.erreur).toMatch(/Ce client existe déjà/);
    expect(r.erreur).not.toMatch(/facture|dossier/i);
  });

  it("facture en doublon : on parle du numéro de facture", async () => {
    sim.rpc.mockResolvedValue({ data: null, error: { message: "Ce dossier ou cette facture existe déjà. Rechargez avant de recommencer" } });
    const r = await enregistrerActivitePrivee(formulaire({ action: "facture", id: CHANTIER, revision: "3", numero: "F-1", montant: "100" }));
    expect(r.erreur).toMatch(/numéro de facture/);
  });

  it("nom du client fait d'espaces : « Indiquez le nom du client », sans justificatif", async () => {
    sim.rpc.mockResolvedValue({ data: null, error: { message: 'new row for relation "artisan_clients" violates check constraint "artisan_clients_nom_check"' } });
    const r = await enregistrerActivitePrivee(formulaire({ ...champsClient, nom: "   " }));
    expect(r.erreur).toBe("Indiquez le nom du client.");
    expect(ecritures()[0][1].p_donnees.nom).toBe("");
  });

  it("une phrase métier de la base passe telle quelle", async () => {
    sim.rpc.mockResolvedValue({ data: null, error: { message: "La fiche a changé : rechargez avant de continuer" } });
    const r = await enregistrerActivitePrivee(formulaire(champsClient));
    expect(r.erreur).toBe("La fiche a changé : rechargez avant de continuer");
  });
});

describe("messageErreurPrive : par contrainte et par action", () => {
  const contrainte = (nom: string, table = "artisan_clients") => `new row for relation "${table}" violates check constraint "${nom}"`;

  it.each([
    ["client", contrainte("artisan_clients_adresse_check"), "Indiquez l’adresse du client."],
    ["client", contrainte("artisan_clients_email_check"), "L’adresse e-mail du client n’est pas valide."],
    ["chantier", contrainte("artisan_chantiers_titre_check", "artisan_chantiers"), "Indiquez le titre du chantier."],
    ["devis", contrainte("artisan_devis_externes_description_check", "artisan_devis_externes"), "Décrivez les travaux proposés."],
    ["facture", contrainte("artisan_factures_externes_numero_check", "artisan_factures_externes"), "Indiquez le numéro figurant sur la facture."],
    ["reglement", contrainte("artisan_reglements_reference_check", "artisan_reglements"), "Indiquez la référence ou la description du règlement."],
  ])("%s : %s", (action, message, attendu) => {
    expect(messageErreurPrive(action, message)).toBe(attendu);
  });

  it("champ absent : on nomme le champ", () => {
    expect(messageErreurPrive("chantier", 'null value in column "adresse" of relation "artisan_chantiers" violates not-null constraint'))
      .toBe("Complétez l’adresse.");
  });

  it("contrainte inconnue : le justificatif n'est évoqué que pour les actions qui en demandent un", () => {
    const inconnue = contrainte("artisan_x_y_check");
    expect(messageErreurPrive("client", inconnue)).toBe("Complétez tous les champs obligatoires.");
    expect(messageErreurPrive("facture", inconnue)).toBe("Complétez tous les champs et joignez votre justificatif.");
  });

  it("doublon : un message par action, un message neutre sinon", () => {
    const doublon = "Ce dossier ou cette facture existe déjà. Rechargez avant de recommencer";
    expect(messageErreurPrive("modifier_client", doublon)).toMatch(/autre client actif/);
    expect(messageErreurPrive("archiver_client", doublon)).toMatch(/réactivé/);
    expect(messageErreurPrive("planning", doublon)).toMatch(/rendez-vous retenu/);
    expect(messageErreurPrive("chantier", doublon)).toBe("Cet enregistrement existe déjà. Rechargez la page avant de recommencer.");
    expect(messageErreurPrive("reglement", 'duplicate key value violates unique constraint "artisan_evenements_prives_artisan_id_cle_key"'))
      .toBe("Cet enregistrement existe déjà. Rechargez la page avant de recommencer.");
  });
});
