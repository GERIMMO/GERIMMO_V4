/**
 * Audit #264, DOC-05 et DOC-11 — un document déposé depuis la fiche d'un lot
 * est rattaché à ce lot, après vérification du lot dans le même espace ; un
 * fichier choisi mais vide reçoit un message à lui.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deposerDocument } from "@/app/actions/ged";

const LOT = "4c5d22ec-c77d-4150-b2b5-f82dfa483034";
const m = vi.hoisted(() => ({
  acces: vi.fn(),
  transit: vi.fn(),
  limite: vi.fn(),
  depot: vi.fn(),
  lot: vi.fn(),
  lien: vi.fn(),
  filtres: [] as [string, string, unknown][],
}));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("@/lib/depot-direct", () => ({ resoudreDepotsFormulaire: m.transit, limiteFichierDepose: m.limite }));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: m.depot }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function formulaire(lot?: string, fichier = new File(["%PDF-1.7 %%EOF"], "releve.pdf", { type: "application/pdf" })) {
  const form = new FormData();
  form.set("fichier", fichier);
  form.set("type", "autre");
  if (lot !== undefined) form.set("lot", lot);
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  m.filtres = [];
  const requete: Record<string, unknown> = {};
  for (const operateur of ["eq", "neq"]) requete[operateur] = (colonne: string, valeur: unknown) => { m.filtres.push([operateur, colonne, valeur]); return requete; };
  requete.select = () => requete;
  requete.maybeSingle = m.lot;
  const from = (table: string) => {
    if (table === "lots") return requete;
    if (table === "document_liens") return { insert: m.lien };
    throw new Error(`Table inattendue : ${table}`);
  };
  m.acces.mockResolvedValue({ supabase: { from }, user: { id: "proprietaire" } });
  m.transit.mockResolvedValue(null);
  m.limite.mockReturnValue(10 * 1024 * 1024);
  m.depot.mockResolvedValue({ documentId: "document" });
  m.lot.mockResolvedValue({ data: { id: LOT }, error: null });
  m.lien.mockResolvedValue({ error: null });
});

describe("dépôt depuis la fiche d’un lot", () => {
  it("vérifie le lot dans cet espace avant le dépôt, puis l’y rattache", async () => {
    const resultat = await deposerDocument("org", {}, formulaire(LOT));
    expect(m.filtres).toEqual(expect.arrayContaining([["eq", "id", LOT], ["eq", "organization_id", "org"], ["neq", "etat", "archive"]]));
    expect(m.lot.mock.invocationCallOrder[0]).toBeLessThan(m.depot.mock.invocationCallOrder[0]);
    expect(m.lien).toHaveBeenCalledWith({ document_id: "document", organization_id: "org", entite: "lot", entite_id: LOT });
    expect(resultat).toEqual({ succes: "Document déposé.", documentId: "document", lotLie: true });
  });

  it("refuse le lot d’un autre espace (ou hors portefeuille) sans rien enregistrer", async () => {
    m.lot.mockResolvedValue({ data: null, error: null });
    const resultat = await deposerDocument("org", {}, formulaire(LOT));
    expect(resultat.erreur).toMatch(/lot n’est plus disponible dans cet espace/);
    expect(resultat.valeurs?.lot).toBe(LOT);
    expect(m.depot).not.toHaveBeenCalled();
    expect(m.lien).not.toHaveBeenCalled();
  });

  it("ignore en base un identifiant de lot mal formé et le refuse", async () => {
    const resultat = await deposerDocument("org", {}, formulaire("../autre-espace"));
    expect(resultat.erreur).toMatch(/lot n’est plus disponible/);
    expect(m.lot).not.toHaveBeenCalled();
    expect(m.depot).not.toHaveBeenCalled();
  });

  it("ne confond pas une panne de vérification avec un lot valide", async () => {
    m.lot.mockResolvedValue({ data: null, error: { message: "Indisponible" } });
    const resultat = await deposerDocument("org", {}, formulaire(LOT));
    expect(resultat.erreur).toMatch(/Impossible de vérifier le lot/);
    expect(m.depot).not.toHaveBeenCalled();
  });

  it("garde le document si seul le lien au lot échoue, sans annoncer de rattachement", async () => {
    m.lien.mockResolvedValue({ error: { message: "Service temporairement indisponible" } });
    const resultat = await deposerDocument("org", {}, formulaire(LOT));
    expect(resultat.succes).toBe("Document déposé.");
    expect(resultat.lotLie).toBeUndefined();
    expect(resultat.avertissement).toMatch(/lien avec le lot.*fiche du document/);
  });

  it("sans lot coché, aucun lien de lot n’est créé", async () => {
    const resultat = await deposerDocument("org", {}, formulaire());
    expect(m.lot).not.toHaveBeenCalled();
    expect(m.lien).not.toHaveBeenCalled();
    expect(resultat).toEqual({ succes: "Document déposé.", documentId: "document" });
  });
});

describe("fichier vide", () => {
  it("dit que le fichier choisi est vide, sans demander d’en choisir un", async () => {
    const resultat = await deposerDocument("org", {}, formulaire(undefined, new File([], "VDD-vide.pdf", { type: "application/pdf" })));
    expect(resultat.erreur).toBe("Ce fichier est vide : choisissez le document complet.");
    expect(m.depot).not.toHaveBeenCalled();
  });

  it("garde « Choisissez un fichier » quand aucun fichier n’est joint", async () => {
    const resultat = await deposerDocument("org", {}, formulaire(undefined, new File([], "", { type: "application/octet-stream" })));
    expect(resultat.erreur).toBe("Choisissez un fichier.");
  });
});
