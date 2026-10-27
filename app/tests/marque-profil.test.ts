import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verifier: vi.fn(), update: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: mocks.verifier }));
import { modifierProfilOrganisation } from "../src/app/actions/organisation";

function formulaire() {
  const f = new FormData();
  Object.entries({ name: "Agence Alpha", address_line1: "12 rue des Lilas", postal_code: "75001", city: "Paris", email_contact: "contact@alpha.fr", siret: "12345678900000", carte_pro: "Carte CPI", garantie_financiere: "Garant", tva_franchise: "on", couleur_primaire: "#2457f5", couleur_secondaire: "#0f2352", nom_portail: "Alpha" }).forEach(([k,v]) => f.set(k,v));
  return f;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockReturnValue({ eq: () => ({ select: async () => ({ data: [{ id: "org" }], error: null }) }) });
  // L'action lit d'abord l'état de l'abonnement (audit final du 27/10, DRT-V01) : ici l'écriture est ouverte.
  mocks.verifier.mockResolvedValue({ user: { id: "admin" }, role: "admin_agence", supabase: { from: () => ({ update: mocks.update }), rpc: async () => ({ data: [{ ecriture_ouverte: true }], error: null }) } });
});
describe("la fiche en lecture seule (audit final du 27/10, DRT-V01)", () => {
  it("refuse l'enregistrement, sans écrire, quand l'écriture de l'organisation est fermée", async () => {
    mocks.verifier.mockResolvedValue({ user: { id: "admin" }, role: "admin_agence", supabase: { from: () => ({ update: mocks.update }), rpc: async () => ({ data: [{ ecriture_ouverte: false }], error: null }) } });
    const r = await modifierProfilOrganisation("org", {}, formulaire());
    expect(r.erreur).toMatch(/lecture seule/);
    expect(r.valeurs?.name).toBe("Agence Alpha");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("laisse écrire quand l'état ne peut pas être lu : la base garde la porte", async () => {
    mocks.verifier.mockResolvedValue({ user: { id: "admin" }, role: "admin_agence", supabase: { from: () => ({ update: mocks.update }), rpc: async () => ({ data: null, error: { message: "panne" } }) } });
    expect((await modifierProfilOrganisation("org", {}, formulaire())).erreur).toBeUndefined();
    expect(mocks.update).toHaveBeenCalled();
  });
});
describe("enregistrer la marque", () => {
  it("refuse un agent même si le formulaire est complet", async () => {
    mocks.verifier.mockResolvedValue({ user: { id: "agent" }, role: "agent" });
    expect((await modifierProfilOrganisation("org", {}, formulaire())).erreur).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([["domaine_personnalise", "https://mon-site.fr"], ["email_expediteur", "gestion@alpha.fr\r\nBcc:pirate@test.fr"], ["couleur_primaire", "red;content:url(test)"]])("refuse %s invalide avant écriture", async (cle, valeur) => {
    const f = formulaire(); f.set(cle, valeur);
    expect((await modifierProfilOrganisation("org", {}, f)).erreur).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("préserve le logo existant et n'accepte aucune preuve de vérification du navigateur", async () => {
    const f = formulaire();
    f.set("email_expediteur_verifie_le", "2026-09-22T10:00:00Z");
    f.set("domaine_personnalise_verifie_le", "2026-09-22T10:00:00Z");
    f.set("logo_url", "https://pirate.fr/image.svg");
    const resultat = await modifierProfilOrganisation("org", {}, f);
    expect(resultat.succes).toBeTruthy();
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("email_expediteur_verifie_le");
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("domaine_personnalise_verifie_le");
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("logo_url");
  });
  it("refuse un faux PNG et un logo trop lourd", async () => {
    const f = formulaire(); f.set("logo_fichier", new File(["<svg>test</svg>"], "logo.png", { type: "image/png" }));
    expect((await modifierProfilOrganisation("org", {}, f)).erreur).toMatch(/PNG, JPEG ou WebP/);
    f.set("logo_fichier", new File([new Uint8Array(205000)], "logo.png", { type: "image/png" }));
    expect((await modifierProfilOrganisation("org", {}, f)).erreur).toMatch(/200 Ko/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("la marque agence ne modifie pas le profil propriétaire", async () => {
    mocks.verifier.mockResolvedValue({ user: { id: "proprietaire" }, role: "proprietaire_direct", supabase: { from: () => ({ update: mocks.update }), rpc: async () => ({ data: [{ ecriture_ouverte: true }], error: null }) } });
    expect((await modifierProfilOrganisation("org", {}, formulaire())).succes).toBeTruthy();
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("couleur_primaire");
  });
});
