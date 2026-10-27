import { beforeEach, describe, expect, it, vi } from "vitest";
import { deposerDocument } from "@/app/actions/ged";

const m = vi.hoisted(() => ({
  acces: vi.fn(),
  transit: vi.fn(),
  limite: vi.fn(),
  depot: vi.fn(),
  revalidate: vi.fn(),
  personne: vi.fn(),
  lien: vi.fn(),
  filtre: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("@/lib/depot-direct", () => ({
  resoudreDepotsFormulaire: m.transit,
  limiteFichierDepose: m.limite,
}));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: m.depot }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));

function formulaire(personne?: string) {
  const form = new FormData();
  form.set("fichier", new File(["contenu"], "assurance.pdf", { type: "application/pdf" }));
  form.set("titre", " Assurance habitation ");
  form.set("type", "justificatif");
  if (personne) form.set("personne", personne);
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  const requete = { select: vi.fn(), eq: m.filtre, maybeSingle: m.personne };
  requete.select.mockReturnValue(requete);
  m.filtre.mockReturnValue(requete);
  m.from.mockImplementation((table: string) => {
    if (table === "persons") return requete;
    if (table === "document_liens") return { insert: m.lien };
    throw new Error(`Table inattendue : ${table}`);
  });
  m.acces.mockResolvedValue({ supabase: { from: m.from }, user: { id: "proprietaire" } });
  m.personne.mockResolvedValue({ data: { id: "personne" }, error: null });
  m.transit.mockResolvedValue(null);
  m.limite.mockReturnValue(10 * 1024 * 1024);
  m.depot.mockResolvedValue({ documentId: "document" });
  m.lien.mockResolvedValue({ error: null });
});

describe("dépôt d’un document depuis la bibliothèque", () => {
  it("conserve la saisie après expiration de l’accès sans transférer le fichier", async () => {
    m.acces.mockResolvedValue({ user: null });
    const resultat = await deposerDocument("org", {}, formulaire("personne"));
    expect(resultat.erreur).toBe("Accès refusé.");
    expect(resultat.valeurs).toEqual({ titre: " Assurance habitation ", type: "justificatif", personne: "personne" });
    expect(m.transit).not.toHaveBeenCalled();
    expect(m.depot).not.toHaveBeenCalled();
  });

  it("conserve les champs après un échec du transit sans renvoyer son jeton", async () => {
    const form = formulaire("personne");
    form.set("fichier", "gerimmo-depot:transfert");
    form.set("__gerimmo_depot_fichier", "jeton");
    m.transit.mockResolvedValue("Le transfert est indisponible.");
    const resultat = await deposerDocument("org", {}, form);
    expect(resultat.erreur).toBe("Le transfert est indisponible.");
    expect(resultat.valeurs).toEqual({ titre: " Assurance habitation ", type: "justificatif", personne: "personne" });
    expect(m.depot).not.toHaveBeenCalled();
  });

  it.each(["fichier", "type", "taille"])("refuse un dépôt invalide (%s) avant toute écriture", async cas => {
    const form = formulaire();
    if (cas === "fichier") form.delete("fichier");
    if (cas === "type") form.set("type", "type_inconnu");
    if (cas === "taille") m.limite.mockReturnValue(1);
    const resultat = await deposerDocument("org", {}, form);
    expect(resultat.erreur).toBeTruthy();
    expect(resultat.valeurs?.titre).toBe(" Assurance habitation ");
    expect(m.depot).not.toHaveBeenCalled();
    expect(m.lien).not.toHaveBeenCalled();
  });

  it("refuse une personne absente de cet espace avant d’enregistrer le fichier", async () => {
    m.personne.mockResolvedValue({ data: null, error: null });
    const resultat = await deposerDocument("org", {}, formulaire("personne-autre-espace"));
    expect(resultat.erreur).toMatch(/personne.*cet espace/);
    expect(m.filtre).toHaveBeenCalledWith("id", "personne-autre-espace");
    expect(m.filtre).toHaveBeenCalledWith("organization_id", "org");
    expect(m.depot).not.toHaveBeenCalled();
    expect(m.lien).not.toHaveBeenCalled();
  });

  it("ne confond pas une panne de vérification avec une personne valide", async () => {
    m.personne.mockResolvedValue({ data: null, error: { message: "Indisponible" } });
    const resultat = await deposerDocument("org", {}, formulaire("personne"));
    expect(resultat.erreur).toMatch(/Impossible de vérifier/);
    expect(resultat.valeurs?.personne).toBe("personne");
    expect(m.depot).not.toHaveBeenCalled();
  });

  it("retourne le document déposé et actualise les deux espaces sans exiger de personne", async () => {
    const form = formulaire();
    const resultat = await deposerDocument("org", {}, form);
    expect(resultat).toEqual({ succes: "Document déposé.", documentId: "document" });
    expect(m.depot).toHaveBeenCalledWith(expect.anything(), { id: "proprietaire" }, "org", form.get("fichier"), "justificatif", "Assurance habitation");
    expect(m.personne).not.toHaveBeenCalled();
    expect(m.lien).not.toHaveBeenCalled();
    expect(m.revalidate.mock.calls).toEqual([["/agence/org/documents"], ["/espace/org/documents"]]);
  });

  it("lie une personne vérifiée après le dépôt, dans le même espace", async () => {
    await deposerDocument("org", {}, formulaire("personne"));
    expect(m.personne.mock.invocationCallOrder[0]).toBeLessThan(m.depot.mock.invocationCallOrder[0]);
    expect(m.depot.mock.invocationCallOrder[0]).toBeLessThan(m.lien.mock.invocationCallOrder[0]);
    expect(m.lien).toHaveBeenCalledWith({ document_id: "document", organization_id: "org", entite: "personne", entite_id: "personne" });
  });

  it("préserve le document créé si seul le lien échoue, pour éviter un second dépôt", async () => {
    m.lien.mockResolvedValue({ error: { message: "Service temporairement indisponible" } });
    m.depot.mockResolvedValue({ documentId: "document", avertissement: "Extension corrigée." });
    const resultat = await deposerDocument("org", {}, formulaire("personne"));
    expect(resultat.erreur).toBeUndefined();
    expect(resultat.succes).toBe("Document déposé.");
    expect(resultat.documentId).toBe("document");
    expect(resultat.avertissement).toMatch(/Extension corrigée.*lien.*fiche du document/);
    expect(m.revalidate).toHaveBeenCalledWith("/espace/org/documents");
  });

  it("ne crée aucun lien quand le dépôt est refusé", async () => {
    m.depot.mockResolvedValue({ erreur: "Document déjà présent." });
    const resultat = await deposerDocument("org", {}, formulaire("personne"));
    expect(resultat.erreur).toBe("Document déjà présent.");
    expect(resultat.documentId).toBeUndefined();
    expect(resultat.valeurs?.personne).toBe("personne");
    expect(m.lien).not.toHaveBeenCalled();
    expect(m.revalidate).not.toHaveBeenCalled();
  });
});
