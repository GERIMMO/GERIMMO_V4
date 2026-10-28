import { beforeEach, describe, expect, it, vi } from "vitest";
import { choisirPersonneBail, creerPersonneBail, modifierPersonneBail, enregistrerProprietairesBail, retirerPersonneBail } from "@/app/actions/personnes-bail";
const m = vi.hoisted(() => ({ acces: vi.fn(), rpc: vi.fn(), creer: vi.fn(), modifier: vi.fn(), retirer: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("@/app/actions/personnes", () => ({ creerPersonne: m.creer, modifierPersonne: m.modifier }));
vi.mock("@/app/actions/baux", () => ({ supprimerBailPersonne: m.retirer }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
function acces({ user = true, etat = "brouillon", absent = false } = {}) {
  const eq = vi.fn(); const q = { select: () => q, eq, maybeSingle: async () => ({ data: absent ? null : { id: "bail", lot_id: "lot", etat }, error: null }) }; eq.mockReturnValue(q);
  m.acces.mockResolvedValue({ user: user ? { id: "moi" } : null, supabase: { from: () => q, rpc: m.rpc } });
  return eq;
}
function form(champs: Record<string, string> = {}) { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.set(k, v); return f; }
beforeEach(() => { vi.clearAllMocks(); acces(); m.rpc.mockResolvedValue({ error: null }); });
describe("étape Personnes du bail", () => {
  it("refuse une session absente sans créer de fiche", async () => {
    acces({ user: false }); expect(await creerPersonneBail("org", "bail", {}, form())).toHaveProperty("erreur"); expect(m.creer).not.toHaveBeenCalled();
  });
  it.each(["actif", "preavis", "termine"])("ne modifie pas une personne via un bail %s", async etat => {
    acces({ etat }); expect(await modifierPersonneBail("org", "bail", "personne", {}, form())).toHaveProperty("erreur"); expect(m.modifier).not.toHaveBeenCalled();
  });
  it("limite la lecture au brouillon de l’organisation autorisée", async () => {
    const eq = acces(); await choisirPersonneBail("org", "bail", {}, form({ person_id: "p", role: "principal" }));
    expect(eq).toHaveBeenCalledWith("organization_id", "org"); expect(eq).toHaveBeenCalledWith("id", "bail");
  });
  it("transmet le locataire attendu et le garant couvert à la mutation atomique", async () => {
    expect(await choisirPersonneBail("org", "bail", {}, form({ person_id: "g", role: "garant", garant_de: "l", principal_attendu: "l" }))).toHaveProperty("succes");
    expect(m.rpc).toHaveBeenCalledWith("choisir_personne_bail", { p_bail: "bail", p_person: "g", p_role: "garant", p_garant_de: "l", p_principal_attendu: "l" });
  });
  it("réutilise la création de l’annuaire, sans redirection ni détention cachée", async () => {
    m.creer.mockResolvedValue({ succes: "Fiche créée.", personneCreee: { id: "nouvelle" } });
    const f = form({ nom: "Test", role: "proprietaire_mandant", lot_id: "autre-lot", creation_id: "67360dd2-c21d-4d8e-9b5a-ed389c3448d3" });
    expect(await creerPersonneBail("org", "bail", {}, f)).toHaveProperty("personneCreee.id", "nouvelle");
    expect(f.get("rester_dans_parcours")).toBe("1"); expect(f.has("role")).toBe(false); expect(f.has("lot_id")).toBe(false);
    expect(m.creer.mock.calls[0][2].get("creation_id")).toBe("67360dd2-c21d-4d8e-9b5a-ed389c3448d3");
    expect(m.revalidate).toHaveBeenCalledWith("/agence/org/baux/bail");
  });
  it("conserve l’erreur et la saisie renvoyées par la création", async () => {
    const retour = { erreur: "Adresse déjà utilisée.", valeurs: { nom: "Test" } }; m.creer.mockResolvedValue(retour);
    expect(await creerPersonneBail("org", "bail", {}, form())).toEqual(retour); expect(m.revalidate).not.toHaveBeenCalled();
  });
  it("refuse une répartition illisible avant de toucher à la base", async () => {
    expect(await enregistrerProprietairesBail("org", "bail", {}, form({ proprietaires: "invalide" }))).toHaveProperty("erreur"); expect(m.rpc).not.toHaveBeenCalled();
  });
  it("ne confirme pas une répartition refusée et garde le contrôle de concurrence", async () => {
    m.rpc.mockResolvedValue({ error: { message: "La répartition a changé." } });
    const parts = [{ person_id: "moi", quote_part: 60 }, { person_id: "autre", quote_part: 40 }];
    expect(await enregistrerProprietairesBail("org", "bail", {}, form({ proprietaires: JSON.stringify(parts), attendus: "[]" }))).toHaveProperty("erreur");
    expect(m.rpc).toHaveBeenCalledWith("enregistrer_proprietaires_bail", { p_bail: "bail", p_proprietaires: parts, p_attendus: [] }); expect(m.revalidate).not.toHaveBeenCalled();
  });
  it("ne retire pas une personne d’un bail inaccessible", async () => {
    acces({ absent: true }); expect(await retirerPersonneBail("org", "bail", "ligne")).toHaveProperty("erreur"); expect(m.retirer).not.toHaveBeenCalled();
  });
});

describe("créer une personne depuis l’assistant la rattache au bail dans le même geste (audit final, BAIL-24, BAIL-07)", () => {
  it("crée la fiche puis l’ajoute comme garant, sans second clic", async () => {
    m.creer.mockResolvedValue({ succes: "Fiche créée.", personneCreee: { id: "garant" } });
    const r = await creerPersonneBail("org", "bail", {}, form({ nom: "Durand", prenom: "Paul", date_naissance: "1970-01-01", role: "garant", garant_de: "loc", principal_attendu: "loc" }));
    expect(m.rpc).toHaveBeenCalledWith("choisir_personne_bail", { p_bail: "bail", p_person: "garant", p_role: "garant", p_garant_de: "loc", p_principal_attendu: "loc" });
    expect(r).toMatchObject({ rattachee: true, succes: "Fiche créée. Garant ajouté au bail." });
    expect(r.avertissement).toBeUndefined();
    expect(m.creer.mock.calls[0][2].has("role")).toBe(false);
  });
  it("un garant mineur est ajouté avec un avertissement fort, pas refusé", async () => {
    m.creer.mockResolvedValue({ succes: "Fiche créée.", personneCreee: { id: "enfant" } });
    const r = await creerPersonneBail("org", "bail", {}, form({ nom: "Petit", prenom: "Léo", date_naissance: "2015-01-01", role: "garant", garant_de: "loc", principal_attendu: "loc" }));
    expect(r.rattachee).toBe(true);
    expect(r.avertissement).toMatch(/Petit Léo est mineur·e .* Un garant doit en principe être majeur/);
  });
  it("une demande renvoyée après une réponse perdue : la fiche déjà rattachée avec ce rôle est un succès (relecture)", async () => {
    m.creer.mockResolvedValue({ succes: "Fiche créée.", personneCreee: { id: "garant" } });
    m.rpc.mockResolvedValue({ error: { message: "Cette personne figure déjà dans ce bail." } });
    const q: Record<string, unknown> = {}; Object.assign(q, { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: "bail", lot_id: "lot", etat: "brouillon", role: "garant" }, error: null }) });
    m.acces.mockResolvedValue({ user: { id: "moi" }, supabase: { from: () => q, rpc: m.rpc } });
    const r = await creerPersonneBail("org", "bail", {}, form({ nom: "Durand", prenom: "Paul", role: "garant", garant_de: "loc", principal_attendu: "loc" }));
    expect(r).toMatchObject({ rattachee: true, succes: "Fiche créée. Garant ajouté au bail." });
  });
  it("si le rattachement échoue, la fiche créée est signalée et proposée à la sélection", async () => {
    m.creer.mockResolvedValue({ succes: "Fiche créée.", personneCreee: { id: "garant" } });
    m.rpc.mockResolvedValue({ error: { message: "Le locataire a changé depuis votre ouverture. Rechargez le dossier." } });
    const r = await creerPersonneBail("org", "bail", {}, form({ nom: "Durand", prenom: "Paul", role: "garant", garant_de: "loc", principal_attendu: "loc" }));
    expect(r.rattachee).toBeUndefined();
    expect(r.avertissement).toMatch(/n’a pas pu être ajoutée au bail/);
  });
});
