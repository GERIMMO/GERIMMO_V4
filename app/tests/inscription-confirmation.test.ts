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
  // Audit du 13/10/2026 (AUD-B-02) : un nom de 24 000 caractères était accepté,
  // puis tous les cookies de session pesaient 77 Ko et le site répondait 431.
  it.each([
    ["nom", "x".repeat(24_000), /nom est trop long/],
    ["prenom", "y".repeat(101), /prénom est trop long/],
    ["adresse", "z".repeat(201), /adresse est trop longue/],
    ["ville", "v".repeat(101), /ville est trop longue/],
  ])("refuse un champ « %s » démesuré, sans créer de compte ni renvoyer 24 000 caractères", async (champ, valeur, message) => {
    const r = await inscrireProprietaire({}, formulaire({ [champ]: valeur }));
    expect(r.erreur).toMatch(message);
    expect(mocks.inscrire).not.toHaveBeenCalled();
    expect([...(r.valeurs?.[champ] ?? "")].length).toBeLessThanOrEqual(300);
  });

  it("crée le compte par la fabrique de liens, avec les métadonnées que les déclencheurs lisent", async () => {
    const r = await inscrireProprietaire({}, formulaire({ code_parrainage: "3fa2b9c0" }));
    expect(r).toEqual({ message: MESSAGE_BOITE_MAIL });
    expect(mocks.inscrire).toHaveBeenCalledTimes(1);
    const appel = mocks.inscrire.mock.calls[0][0];
    expect(appel.email).toBe("camille@exemple.fr");
    expect(appel.motDePasse).toBeUndefined();
    expect(appel.next).toBe("/espaces");
    expect(appel.metadonnees).toMatchObject({
      nom: "Martin",
      prenom: "Camille",
      espace: "proprietaire_direct",
      telephone: "0600000000",
      ville: "Lyon",
      code_parrainage: "3FA2B9C0",
    });
    expect(appel.metadonnees.cgu_acceptee_le).toBeUndefined();
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

  it("la réponse de confirmation reste uniforme", async () => {
    mocks.inscrire.mockResolvedValue({ erreur: "Password is too weak", code: "weak_password" });
    const r = await inscrireProprietaire({}, formulaire());
    expect(r).toEqual({ message: MESSAGE_BOITE_MAIL });
  });

  it("une autre erreur (envoi impossible…) se dit sans jargon", async () => {
    mocks.inscrire.mockResolvedValue({ erreur: "Le service d’e-mail a refusé l’envoi." });
    const r = await inscrireProprietaire({}, formulaire());
    expect(r.erreur).toMatch(/^Inscription impossible : /);
    expect(r.erreur).toContain("refusé l’envoi");
  });

  it("ne crée jamais de session avant le courrier", async () => {
    expect(await inscrireProprietaire({}, formulaire())).toEqual({ message: MESSAGE_BOITE_MAIL });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("garde ses contrôles de formulaire avant tout appel", async () => {
    expect((await inscrireProprietaire({}, formulaire({ nom: "" }))).erreur).toMatch(/nom/i);
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
    expect(appel.metadonnees).toEqual({ espace: "artisan" });
    expect(appel.metadonnees.nom).toBeUndefined();
  });

  it("demande le courrier sans mot de passe ni acceptation initiale", async () => {
    const f = new FormData(); f.set("email", "delivered+inscription@resend.dev");
    expect(await creerCompteArtisan({}, f)).toEqual({ message: MESSAGE_BOITE_MAIL });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.inscrire.mock.calls[0][0]).not.toHaveProperty("motDePasse");
  });

  it("adresse déjà inscrite : même écran", async () => {
    mocks.inscrire.mockResolvedValue({ etat: "compte_existant" });
    expect(await creerCompteArtisan({}, formulaire())).toEqual({ message: MESSAGE_BOITE_MAIL });
  });
});
