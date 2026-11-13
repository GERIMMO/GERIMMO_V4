import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  verifier: vi.fn(), depot: vi.fn(), assembler: vi.fn(), liens: vi.fn(),
  revalider: vi.fn(), rendre: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalider }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.verifier }));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: m.depot }));
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: vi.fn() }));
vi.mock("@/lib/documents/marque", () => ({ appliquerMarqueDocument: (d: unknown) => d }));
vi.mock("@/lib/documents/rendu", () => ({ rendrePdf: m.rendre, copieDeTravail: vi.fn() }));
vi.mock("@/lib/documents/completude", () => ({ refusDocumentIncomplet: vi.fn(() => null) }));
vi.mock("@/lib/documents/modeles", () => ({ MODELES: { notice: { assembler: m.assembler, typeGed: "notice" } } }));
import { genererDocument } from "../src/app/actions/documents-generes";

const liens = [{ entite: "bail", entiteId: "bail-1" }, { entite: "personne", entiteId: "personne-1" }];
const generer = () => genererDocument("org-1", "notice", "bail-1", "/agence/org-1/baux/bail-1");
beforeEach(() => {
  vi.clearAllMocks();
  m.verifier.mockResolvedValue({ user: { id: "user-1" }, role: "proprietaire_direct", supabase: { from: () => ({ upsert: m.liens }) } });
  m.assembler.mockResolvedValue({ document: {}, liens, titreGed: "Notice", nomFichier: "notice" });
  m.rendre.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  m.depot.mockResolvedValue({ documentId: "doc-1" });
  m.liens.mockResolvedValue({ error: null });
});

describe("reprise d'un PDF déjà rangé", () => {
  it("partage le rendu simultané du même dossier, en gardant le contrôle des droits par appel", async () => {
    let terminer!: (valeur: Uint8Array) => void;
    m.rendre.mockImplementationOnce(() => new Promise<Uint8Array>(resolve => { terminer = resolve; }));
    const premiere = generer();
    const seconde = generer();
    await vi.waitFor(() => expect(m.assembler).toHaveBeenCalledTimes(2));
    expect(m.rendre).toHaveBeenCalledTimes(1);
    terminer(new Uint8Array([1]));
    expect((await Promise.all([premiere, seconde])).every(r => r.documentId === "doc-1")).toBe(true);
    expect(m.verifier).toHaveBeenCalledTimes(2);
  });
  it("sépare les dossiers et libère un rendu échoué pour une nouvelle tentative", async () => {
    m.rendre.mockRejectedValueOnce(new Error("panne fictive du moteur"));
    const [premier, autre] = await Promise.all([generer(), genererDocument("org-2", "notice", "bail-1", "/agence/org-2/documents")]);
    expect(premier.erreur).toMatch(/génération/);
    expect(autre.documentId).toBe("doc-1");
    expect((await generer()).documentId).toBe("doc-1");
    expect(m.rendre).toHaveBeenCalledTimes(3);
  });
  it("répare le rattachement après un premier échec sans créer un autre document", async () => {
    m.liens.mockResolvedValueOnce({ error: { message: "indisponible" } });
    expect((await generer()).erreur).toMatch(/rattachement/);
    m.depot.mockResolvedValue({ doublonId: "doc-1", erreur: "doublon" });
    const suite = await generer();
    expect(suite.erreur).toBeUndefined();
    expect(suite.documentId).toBe("doc-1");
    expect(suite.succes).toMatch(/rattaché à ce dossier/);
    expect(m.liens).toHaveBeenCalledTimes(2);
    expect(m.liens).toHaveBeenLastCalledWith(liens.map(l => ({ document_id: "doc-1", organization_id: "org-1", entite: l.entite, entite_id: l.entiteId })), { onConflict: "document_id,entite,entite_id", ignoreDuplicates: true });
    expect(m.revalider).toHaveBeenCalledWith("/agence/org-1/baux/bail-1");
  });
  it("ne prétend pas réussir si le rattachement du document réutilisé échoue encore", async () => {
    m.depot.mockResolvedValue({ doublonId: "doc-1", erreur: "doublon" });
    m.liens.mockResolvedValue({ error: { message: "refus" } });
    const r = await generer();
    expect(r.erreur).toMatch(/rattachement/);
    expect(r.succes).toBeUndefined();
  });
  it("un refus de dépôt sans document existant ne crée aucun rattachement", async () => {
    m.depot.mockResolvedValue({ erreur: "Stockage indisponible" });
    expect((await generer()).erreur).toBe("Stockage indisponible");
    expect(m.liens).not.toHaveBeenCalled();
  });
  it("un appel sans accès ne génère ni PDF ni lien", async () => {
    m.verifier.mockResolvedValue({ user: null });
    expect((await generer()).erreur).toBe("Accès refusé.");
    expect(m.assembler).not.toHaveBeenCalled();
    expect(m.depot).not.toHaveBeenCalled();
    expect(m.liens).not.toHaveBeenCalled();
  });
});
