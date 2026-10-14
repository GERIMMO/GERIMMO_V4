/**
 * Lot « fiscal-charges », décisions du dirigeant du 14/10/2026 sur la régularisation des charges :
 *  · D38 (CHF-02, option A) : régulariser un exercice non terminé exige un avertissement fort et une confirmation explicite
 *    (« exercice non terminé : comparaison non homogène »), vérifiée côté serveur : une requête directe sans confirmation est refusée.
 *    L'option B (refus avant le 31/12) est différée (avis spécialisé).
 *  · D40 (CHF-06, option A) : à l'émission, le message dit « ce solde n'est pas appelé : il sera repris au décompte de sortie »
 *    et une alerte est créée par le mécanisme d'alertes existant. L'option B (appel complémentaire, avoir) est différée.
 *
 * Jeu de référence de la fiche CHF-02 : provisions 600,00 (10 mois à 60 €) contre charges réelles 640,00, en octobre 2026.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  rpc: vi.fn(),
  insert: vi.fn(),
  depot: vi.fn(),
  abandon: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "https://recette.test" }) }));
vi.mock("@/lib/ged-depot", () => ({
  deposerFichierGed: banc.depot,
  preparerFichierGed: banc.depot,
  abandonnerPieceGed: banc.abandon,
}));
vi.mock("@/lib/email", () => ({ envoyerEmail: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    user: { id: "gerant-test" },
    supabase: { rpc: banc.rpc, from: (table: string) => ({ insert: (valeurs: unknown) => banc.insert(table, valeurs) }) },
  }),
}));

import { regulariserCharges } from "@/app/actions/loyers";
import { cheminFicheAlerte, gesteAlerte } from "@/lib/chemin-alerte";
import { avertissementExerciceNonTermine, exerciceNonTermine } from "@/lib/baux";

const MESSAGE_SOLDE = "Ce solde n’est pas appelé : il sera repris au décompte de sortie.";

function saisie(annee: string, extra: Record<string, string> = {}) {
  const f = new FormData();
  f.set("annee", annee);
  f.set("charges_reelles", "640,00");
  f.set("justificatif", new File(["justificatif local"], "charges.pdf", { type: "application/pdf" }));
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
}
const maintenant = (iso: string) => vi.setSystemTime(new Date(iso));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  maintenant("2026-10-14T10:00:00Z");
  banc.rpc.mockResolvedValue({ data: -40, error: null });
  banc.insert.mockResolvedValue({ error: null });
  banc.depot.mockResolvedValue({ fichier: { chemin: "org-test/decompte.pdf", mime: "application/pdf", taille: 18, empreinte: "e".repeat(64) } });
  banc.abandon.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("D38 (CHF-02, option A) : l'exercice non terminé se régularise sur confirmation explicite", () => {
  it("l'exercice se termine le 31/12 au soir, heure de Paris", () => {
    expect(exerciceNonTermine(2026, "2026-10-14")).toBe(true);
    expect(exerciceNonTermine(2026, "2026-12-31")).toBe(true);
    expect(exerciceNonTermine(2026, "2027-01-01")).toBe(false);
    expect(exerciceNonTermine(2025, "2026-01-01")).toBe(false);
    expect(exerciceNonTermine(2027, "2026-10-14")).toBe(true);
  });

  it("l'avertissement dit le constat et la conséquence, sans jargon", () => {
    const texte = avertissementExerciceNonTermine(2026);
    expect(texte).toContain("Exercice 2026 non terminé : comparaison non homogène.");
    expect(texte).toContain("ne se modifie plus");
    expect(texte).toContain("décompte de sortie");
  });

  it("sans confirmation, l'exercice en cours est refusé avant tout dépôt ou écriture (requête directe comprise)", async () => {
    const r = await regulariserCharges("org-test", "bail-test", {}, saisie("2026"));
    expect(r.succes).toBeUndefined();
    expect(r.erreur).toContain("Exercice 2026 non terminé : comparaison non homogène.");
    expect(r.erreur).toContain("Cochez la confirmation");
    expect(r.valeurs?.annee).toBe("2026");
    expect(banc.depot).not.toHaveBeenCalled();
    expect(banc.rpc).not.toHaveBeenCalled();
    expect(banc.insert).not.toHaveBeenCalled();
  });

  it.each(["", "on", "true", "non", "1"])("une confirmation autre que « oui » (%j) ne vaut pas confirmation", async (valeur) => {
    const r = await regulariserCharges("org-test", "bail-test", {}, saisie("2026", { confirmer_exercice_en_cours: valeur }));
    expect(r.erreur).toContain("non terminé");
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("avec la confirmation, la régularisation est enregistrée et le message garde la mise en garde", async () => {
    const r = await regulariserCharges("org-test", "bail-test", {}, saisie("2026", { confirmer_exercice_en_cours: "oui" }));
    expect(r.erreur).toBeUndefined();
    expect(banc.rpc).toHaveBeenCalledWith("regulariser_charges_avec_justificatif", expect.objectContaining({ p_annee: 2026, p_charges_reelles: 640 }));
    expect(r.succes).toContain("Complément de 40,00");
    expect(r.succes).toContain("exercice non terminé");
  });

  it("un exercice terminé n'a besoin d'aucune confirmation", async () => {
    const r = await regulariserCharges("org-test", "bail-test", {}, saisie("2025"));
    expect(r.erreur).toBeUndefined();
    expect(banc.rpc).toHaveBeenCalledOnce();
    expect(r.succes).not.toContain("exercice non terminé");
  });

  it("la frontière est le jour de Paris : à 23 h 30 le 31/12 l'exercice court encore, à 0 h 30 le 1er janvier il est terminé", async () => {
    maintenant("2026-12-31T22:30:00Z"); // 23 h 30 à Paris
    const avant = await regulariserCharges("org-test", "bail-test", {}, saisie("2026"));
    expect(avant.erreur).toContain("non terminé");
    maintenant("2026-12-31T23:30:00Z"); // 0 h 30 le 1er janvier à Paris
    const apres = await regulariserCharges("org-test", "bail-test", {}, saisie("2026"));
    expect(apres.erreur).toBeUndefined();
  });

  it("un exercice futur reste refusé par la base, la confirmation n'y change rien", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: { message: "Exercice invalide : on ne régularise qu'un exercice commencé" } });
    const r = await regulariserCharges("org-test", "bail-test", {}, saisie("2027", { confirmer_exercice_en_cours: "oui" }));
    expect(r.erreur).toContain("exercice commencé");
    expect(banc.abandon).toHaveBeenCalledOnce();
  });
});

describe("D40 (CHF-06, option A) : le solde non appelé est dit à l'émission et signalé par une alerte", () => {
  it("complément dû : message complété et alerte créée avec le bail, l'année et le montant", async () => {
    const r = await regulariserCharges("org-test", "bail-test", {}, saisie("2025"));
    expect(r.succes).toMatch(/^Complément de 40,00\s*€ dû par le locataire\. Ce solde n’est pas appelé : il sera repris au décompte de sortie\.$/);
    expect(banc.insert).toHaveBeenCalledOnce();
    const [table, valeurs] = banc.insert.mock.calls[0] as [string, Record<string, unknown>];
    expect(table).toBe("alerts");
    expect(valeurs).toMatchObject({
      organization_id: "org-test",
      type: "regularisation_non_appelee",
      criticite: "normale",
      details: { bail_id: "bail-test", annee: 2025, ecart: -40, libelle: MESSAGE_SOLDE },
    });
    expect(String(valeurs.titre)).toMatch(/Régularisation des charges 2025 : complément de 40,00\s*€ dû par le locataire/);
    // Une alerte confiée à personne en particulier est vue de tous, comme toutes les alertes système.
    expect(valeurs.assigned_all ?? true).toBe(true);
  });

  it("trop-perçu : même message, alerte au bon sens", async () => {
    banc.rpc.mockResolvedValue({ data: 80, error: null });
    const r = await regulariserCharges("org-test", "bail-test", {}, saisie("2025"));
    expect(r.succes).toContain("Trop-perçu de");
    expect(r.succes).toContain(MESSAGE_SOLDE);
    const valeurs = banc.insert.mock.calls[0][1] as Record<string, unknown>;
    expect(valeurs.details).toMatchObject({ ecart: 80 });
    expect(String(valeurs.titre)).toMatch(/trop-perçu de 80,00\s*€ à rendre au locataire/);
  });

  it("étalement sur douze mois : le message garde sa mention et ajoute la même phrase", async () => {
    const r = await regulariserCharges("org-test", "bail-test", {}, saisie("2025", { etaler: "on" }));
    expect(r.succes).toContain("étalé sur 12 mensualités");
    expect(r.succes).toContain(MESSAGE_SOLDE);
  });

  it("charges équilibrées : rien n'est dû, ni phrase ni alerte", async () => {
    banc.rpc.mockResolvedValue({ data: 0, error: null });
    const r = await regulariserCharges("org-test", "bail-test", {}, saisie("2025"));
    expect(r.succes).toBe("Charges équilibrées (aucun écart).");
    expect(banc.insert).not.toHaveBeenCalled();
  });

  it("une alerte qui ne s'enregistre pas ne défait pas la régularisation, et le dit", async () => {
    banc.insert.mockResolvedValue({ error: { message: "indisponible" } });
    const r = await regulariserCharges("org-test", "bail-test", {}, saisie("2025"));
    expect(r.erreur).toBeUndefined();
    expect(r.succes).toContain("Complément de");
    expect(r.succes).toContain(MESSAGE_SOLDE);
    expect(r.succes).toContain("l’alerte n’a pas pu être créée");
  });

  it("une régularisation refusée par la base ne crée aucune alerte", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: { message: "Une régularisation existe déjà pour l'exercice 2025" } });
    const r = await regulariserCharges("org-test", "bail-test", {}, saisie("2025"));
    expect(r.erreur).toContain("existe déjà");
    expect(banc.insert).not.toHaveBeenCalled();
  });

  it("l'alerte mène à la carte des loyers du bail, là où la régularisation se lit", () => {
    const alerte = { type: "regularisation_non_appelee", details: { bail_id: "bail" } };
    expect(cheminFicheAlerte(alerte, "agence")).toBe("/agence/agence/baux/bail#loyers");
    expect(gesteAlerte(alerte, "agence")).toMatchObject({ seFermeSeule: false });
    expect(cheminFicheAlerte({ type: "regularisation_non_appelee", details: null }, "agence")).toBeNull();
  });
});
