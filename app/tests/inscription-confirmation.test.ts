/**
 * L'inscription (propriétaire, artisan) confie la création du compte et le
 * lien de confirmation à la fabrique de liens (audit du 30/09, H1/H2) : plus
 * de `signUp` ni de lien PKCE limité au navigateur de la demande. L'écran dit
 * la même chose à une adresse neuve, à une adresse déjà inscrite et à une
 * inscription interrompue ; seule la limite de fréquence se dit.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ inscrire: vi.fn(), lien: vi.fn(), createClient: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/lien-mot-de-passe", () => ({
  inscrireEtEnvoyerConfirmation: mocks.inscrire,
  envoyerLienMotDePasse: mocks.lien,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mocks.redirect(...args);
    throw new Error("REDIRECT");
  },
}));

import { creerCompteArtisan, inscrireProprietaire } from "../src/app/actions/auth";
import { MESSAGE_BOITE_MAIL } from "../src/lib/inscription";
import { CONDITIONS_VERSION } from "../src/lib/editeur";

const MDP = "un-mot-de-passe-de-douze";

function formulaire(extra: Record<string, string> = {}) {
  const f = new FormData();
  const valeurs: Record<string, string> = {
    prenom: "Camille",
    nom: "Martin",
    email: " Camille@Exemple.fr ",
    mot_de_passe: MDP,
    confirmation: MDP,
    cgu: "on",
    telephone: "0600000000",
    ville: "Lyon",
    ...extra,
  };
  for (const [k, v] of Object.entries(valeurs)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.inscrire.mockResolvedValue({ etat: "confirmation_envoyee" });
});

describe("inscrireProprietaire", () => {
  it("crée le compte par la fabrique de liens, avec les métadonnées que les déclencheurs lisent", async () => {
    const r = await inscrireProprietaire({}, formulaire({ code_parrainage: "3fa2b9c0" }));
    expect(r).toEqual({ message: MESSAGE_BOITE_MAIL });
    expect(mocks.inscrire).toHaveBeenCalledTimes(1);
    const appel = mocks.inscrire.mock.calls[0][0];
    expect(appel.email).toBe("camille@exemple.fr");
    expect(appel.motDePasse).toBe(MDP);
    expect(appel.next).toBe("/espaces");
    expect(appel.metadonnees).toMatchObject({
      nom: "Martin",
      prenom: "Camille",
      espace: "proprietaire_direct",
      telephone: "0600000000",
      ville: "Lyon",
      cgu_version: CONDITIONS_VERSION,
      code_parrainage: "3FA2B9C0",
    });
    expect(appel.metadonnees.cgu_acceptee_le).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Plus aucun `signUp` : le lien PKCE de Supabase ne part plus.
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("une adresse déjà inscrite reçoit la MÊME réponse qu'une adresse neuve (énumération de comptes)", async () => {
    mocks.inscrire.mockResolvedValue({ etat: "compte_existant" });
    const r = await inscrireProprietaire({}, formulaire());
    expect(r).toEqual({ message: MESSAGE_BOITE_MAIL });
    expect(r.message).not.toMatch(/existe/i);
  });

  it("la limite de fréquence se dit — elle vaut pour toute adresse", async () => {
    mocks.inscrire.mockResolvedValue({ erreur: "Trop de demandes", limite: true });
    const r = await inscrireProprietaire({}, formulaire());
    expect(r.erreur).toBe("Trop de demandes");
    expect(r.valeurs?.email).toBeTruthy();
    expect(r.valeurs?.mot_de_passe).toBeUndefined();
  });

  it("un mot de passe refusé par Auth est classé et dit", async () => {
    mocks.inscrire.mockResolvedValue({ erreur: "Password is too weak", code: "weak_password" });
    const r = await inscrireProprietaire({}, formulaire());
    expect(r.erreur).toMatch(/Mot de passe refusé/);
  });

  it("une autre erreur (envoi impossible…) se dit sans jargon", async () => {
    mocks.inscrire.mockResolvedValue({ erreur: "Le service d’e-mail a refusé l’envoi." });
    const r = await inscrireProprietaire({}, formulaire());
    expect(r.erreur).toMatch(/^Inscription impossible : /);
    expect(r.erreur).toContain("refusé l’envoi");
  });

  it("projet sans confirmation d'adresse : ouvre la session par mot de passe et mène à /espaces", async () => {
    mocks.inscrire.mockResolvedValue({ etat: "deja_confirme" });
    const signInWithPassword = vi.fn(async () => ({ error: null }));
    mocks.createClient.mockResolvedValue({ auth: { signInWithPassword } });
    await expect(inscrireProprietaire({}, formulaire())).rejects.toThrow("REDIRECT");
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "camille@exemple.fr", password: MDP });
    expect(mocks.redirect).toHaveBeenCalledWith("/espaces");
  });

  it("garde ses contrôles de formulaire avant tout appel", async () => {
    expect((await inscrireProprietaire({}, formulaire({ nom: "" }))).erreur).toMatch(/nom/i);
    expect((await inscrireProprietaire({}, formulaire({ confirmation: "autre" }))).erreur).toMatch(/correspondent/);
    expect((await inscrireProprietaire({}, formulaire({ mot_de_passe: "court", confirmation: "court" }))).erreur).toMatch(/12 caractères/);
    const sansCgu = formulaire();
    sansCgu.delete("cgu");
    expect((await inscrireProprietaire({}, sansCgu)).erreur).toMatch(/conditions/);
    expect(mocks.inscrire).not.toHaveBeenCalled();
  });
});

describe("creerCompteArtisan", () => {
  it("marque le compte artisan et mène à l'inscription de l'entreprise", async () => {
    const r = await creerCompteArtisan({}, formulaire());
    expect(r).toEqual({ message: MESSAGE_BOITE_MAIL });
    const appel = mocks.inscrire.mock.calls[0][0];
    expect(appel.email).toBe("camille@exemple.fr");
    expect(appel.next).toBe("/artisan/inscription");
    expect(appel.metadonnees).toMatchObject({ espace: "artisan", cgu_version: CONDITIONS_VERSION });
    expect(appel.metadonnees.nom).toBeUndefined();
  });

  it("projet sans confirmation d'adresse : session puis /artisan/inscription", async () => {
    mocks.inscrire.mockResolvedValue({ etat: "deja_confirme" });
    mocks.createClient.mockResolvedValue({ auth: { signInWithPassword: vi.fn(async () => ({ error: null })) } });
    await expect(creerCompteArtisan({}, formulaire())).rejects.toThrow("REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/artisan/inscription");
  });

  it("adresse déjà inscrite : même écran", async () => {
    mocks.inscrire.mockResolvedValue({ etat: "compte_existant" });
    expect(await creerCompteArtisan({}, formulaire())).toEqual({ message: MESSAGE_BOITE_MAIL });
  });
});
