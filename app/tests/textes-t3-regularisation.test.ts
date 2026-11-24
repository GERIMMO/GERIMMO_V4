/**
 * Textes officiels, lot T3 (R16-A1, ARGENT) — complément de charges d'un exercice clos depuis plus de trois ans, côté serveur.
 *
 * Avant : la base refusait (« Exercice prescrit ») en comptant depuis le 31 décembre de l'exercice ; l'écran affirmait « Un
 * complément ne se réclame plus au-delà de trois ans ». L'article 7-1 de la loi du 6 juillet 1989 (recueil fourni par le
 * dirigeant) fait courir le délai du jour où le bailleur a connu les dépenses. Après : la base ne refuse plus
 * (textes-t3-base.test.ts) ; l'action avertit et exige une confirmation explicite, vérifiée ICI ; le montant enregistré est
 * celui que rend la base, sans retouche.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ base: null as unknown, rpc: vi.fn(), insert: vi.fn(), depot: vi.fn(), abandon: vi.fn(), pdf: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "https://recette.test" }) }));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: banc.depot, preparerFichierGed: banc.depot, abandonnerPieceGed: banc.abandon }));
vi.mock("@/lib/email", () => ({ envoyerEmail: vi.fn() }));
vi.mock("@/lib/documents/rendu", () => ({ rendrePdf: banc.pdf }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ user: { id: "gerant-test" }, supabase: (banc.base as BaseSimulee).client }),
}));

import { baseSimulee, type BaseSimulee, type Ligne } from "./fixtures/base-simulee";
import { regulariserCharges } from "@/app/actions/loyers";
import { emettreRegularisationFournitures } from "@/app/actions/regularisation-fournitures";
import { LIBELLE_CONFIRMATION_EXERCICE_ANCIEN, avertissementExerciceAncien, exerciceDePlusDeTroisAns } from "@/lib/baux";

/** Les montants sont imprimés avec des espaces insécables : ramenés à des espaces simples pour la comparaison. */
const net = (t: string | undefined) => (t ?? "").replace(/[\u202f\u00a0]/g, " ");
const BAIL = "11111111-1111-4111-8111-111111111111", BROUILLON = "22222222-2222-4222-8222-222222222222";

function saisie(annee: string, extra: Record<string, string> = {}) {
  const f = new FormData();
  f.set("annee", annee);
  f.set("charges_reelles", "1234,56");
  f.set("justificatif", new File(["justificatif local"], "charges.pdf", { type: "application/pdf" }));
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
}
function poserBase(tables: Record<string, Ligne[]> = {}) {
  banc.base = baseSimulee({ restitutions: [], ...tables }, {
    rpc: {
      regulariser_charges_avec_justificatif: (args) => banc.rpc("regulariser_charges_avec_justificatif", args),
      emettre_regularisation_fourniture: (args) => banc.rpc("emettre_regularisation_fourniture", args),
    },
    inserer: (table, valeurs) => banc.insert(table, valeurs),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  poserBase();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-24T10:00:00Z"));
  banc.rpc.mockResolvedValue({ data: -1234.56, error: null });
  banc.insert.mockResolvedValue({ error: null });
  banc.depot.mockResolvedValue({ fichier: { chemin: "org-test/decompte.pdf", mime: "application/pdf", taille: 18, empreinte: "e".repeat(64) } });
  banc.abandon.mockResolvedValue(undefined);
  banc.pdf.mockResolvedValue(Buffer.from("%PDF-1.4 test"));
});
afterEach(() => vi.useRealTimers());

describe("R16-A1 — le seuil est celui de l'ancien refus de la base : le 31/12 de l'exercice a plus de trois ans", () => {
  it("au 24/11/2026 : 2022 et avant ; 2023 seulement à partir du 1er janvier 2027", () => {
    expect(exerciceDePlusDeTroisAns(2022, "2026-11-24")).toBe(true);
    expect(exerciceDePlusDeTroisAns(2023, "2026-11-24")).toBe(false);
    expect(exerciceDePlusDeTroisAns(2023, "2026-12-31")).toBe(false);
    expect(exerciceDePlusDeTroisAns(2023, "2027-01-01")).toBe(true);
    expect(exerciceDePlusDeTroisAns(2019, "2026-11-24")).toBe(true);
    expect(exerciceDePlusDeTroisAns(2026, "2026-11-24")).toBe(false);
  });
  it("l'avertissement dit « peut-être prescrit », cite le point de départ du texte, et n'affirme rien", () => {
    const texte = avertissementExerciceAncien(2021);
    expect(texte).toContain("Exercice 2021 clos depuis plus de trois ans : un complément de charges à la charge du locataire est peut-être prescrit.");
    expect(texte).toContain("court du jour où le bailleur a connu ou aurait dû connaître ces dépenses (article 7-1 de la loi du 6 juillet 1989)");
    expect(texte).toContain("Gerimmo ne connaît pas ce jour et ne se prononce pas.");
    expect(texte).not.toMatch(/ne se réclame plus|est prescrit\b|conforme/);
    expect(LIBELLE_CONFIRMATION_EXERCICE_ANCIEN).toContain("peut-être prescrit");
  });
});

describe("R16-A1 — régularisation saisie à la main (regulariserCharges)", () => {
  it("exercice 2021 sans confirmation : refusé avant tout dépôt de pièce et avant tout appel à la base", async () => {
    const r = await regulariserCharges("org-test", BAIL, {}, saisie("2021"));
    expect(r.erreur).toContain("Exercice 2021 clos depuis plus de trois ans");
    expect(r.erreur).toContain("Cochez la confirmation pour l’enregistrer malgré tout.");
    expect(r.valeurs?.charges_reelles).toBe("1234,56"); // la saisie est rendue
    expect(banc.depot).not.toHaveBeenCalled();
    expect(banc.rpc).not.toHaveBeenCalled();
  });
  it("exercice 2021 confirmé : la base reçoit 1 234,56 € tels que saisis ; le message annonce le complément rendu par la base et sa réserve", async () => {
    const r = await regulariserCharges("org-test", BAIL, {}, saisie("2021", { confirmer_exercice_ancien: "oui" }));
    expect(r.erreur).toBeUndefined();
    expect(banc.rpc).toHaveBeenCalledWith("regulariser_charges_avec_justificatif", expect.objectContaining({ p_bail: BAIL, p_annee: 2021, p_charges_reelles: 1234.56, p_etaler: false }));
    expect(net(r.succes)).toContain("Complément de 1 234,56 € dû par le locataire.");
    expect(r.succes).toContain("Exercice clos depuis plus de trois ans : ce complément est peut-être prescrit (article 7-1 de la loi du 6 juillet 1989).");
  });
  it("exercice 2021 confirmé, trop-perçu : aucune réserve de prescription (elle ne vise qu'un complément)", async () => {
    banc.rpc.mockResolvedValue({ data: 50, error: null });
    const r = await regulariserCharges("org-test", BAIL, {}, saisie("2021", { confirmer_exercice_ancien: "oui" }));
    expect(net(r.succes)).toContain("Trop-perçu de 50,00 € en faveur du locataire.");
    expect(r.succes).not.toContain("prescrit");
  });
  it("exercice récent (2024) : rien de changé — ni confirmation demandée, ni réserve, même montant", async () => {
    const r = await regulariserCharges("org-test", BAIL, {}, saisie("2024"));
    expect(r.erreur).toBeUndefined();
    expect(banc.rpc).toHaveBeenCalledWith("regulariser_charges_avec_justificatif", expect.objectContaining({ p_annee: 2024, p_charges_reelles: 1234.56 }));
    expect(net(r.succes)).toContain("Complément de 1 234,56 € dû par le locataire.");
    expect(r.succes).not.toContain("prescrit");
  });
});

describe("R16-A1 — régularisation tirée des factures (emettreRegularisationFournitures)", () => {
  const brouillon = (annee: number, ecart: number): Ligne => ({
    id: BROUILLON, organization_id: "org-test", bail_id: BAIL, annee, empreinte: "empreinte-1", regularisation_id: null,
    source: { bailleur: "Moreau Claire", annee, locataire: "Martin Paul", logement: "Lot", adresse: "1 rue", provisions: 600, charges_reelles: 600 - ecart, ecart, factures: [] },
  });
  const form = (extra: Record<string, string> = {}) => { const f = new FormData(); f.set("empreinte", "empreinte-1"); f.set("complet", "on"); for (const [k, v] of Object.entries(extra)) f.set(k, v); return f; };

  it("complément de 2021 sans confirmation : refusé, aucun PDF produit, aucun appel à la base", async () => {
    poserBase({ brouillons_regularisation_fourniture: [brouillon(2021, -321.09)], organizations: [{ id: "org-test", type: "proprietaire_direct" }] });
    const r = await emettreRegularisationFournitures("org-test", BAIL, BROUILLON, {}, form());
    expect(r.erreur).toContain("Exercice 2021 clos depuis plus de trois ans");
    expect(banc.pdf).not.toHaveBeenCalled();
    expect(banc.rpc).not.toHaveBeenCalled();
  });
  it("trop-perçu de 2021, ou complément de 2024 : aucune confirmation demandée (le refus ne vient pas de ce contrôle)", async () => {
    for (const b of [brouillon(2021, 80), brouillon(2024, -321.09)]) {
      poserBase({ brouillons_regularisation_fourniture: [b], organizations: [{ id: "org-test", type: "proprietaire_direct" }] });
      const r = await emettreRegularisationFournitures("org-test", BAIL, BROUILLON, {}, form());
      expect(r.erreur ?? "").not.toContain("plus de trois ans");
    }
  });
  it("complément de 2021 confirmé : le contrôle laisse passer, le PDF est produit puis la base appelée avec le brouillon inchangé", async () => {
    poserBase({ brouillons_regularisation_fourniture: [brouillon(2021, -321.09)], organizations: [{ id: "org-test", type: "proprietaire_direct" }] });
    banc.rpc.mockResolvedValue({ data: null, error: { message: "arrêt du test après l'appel" } });
    const r = await emettreRegularisationFournitures("org-test", BAIL, BROUILLON, {}, form({ exercice_ancien: "on" }));
    expect(r.erreur ?? "").not.toContain("plus de trois ans");
    expect(banc.pdf).toHaveBeenCalledTimes(1);
    expect(banc.rpc).toHaveBeenCalledWith("emettre_regularisation_fourniture", expect.objectContaining({ p_org: "org-test", p_brouillon: BROUILLON, p_empreinte: "empreinte-1", p_etaler: false }));
  });
});
