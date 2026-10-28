/**
 * Le premier mot de passe d'un invité (audit final du 27/10/2026, DRT-05).
 *
 * Le lien d'invitation (locataire, agent, responsable) est un lien de récupération dont la suite porte la page de
 * l'invitation : la page du bouton disait « Accéder à votre compte », celle du mot de passe « Nouveau mot de passe »
 * et « Changer le mot de passe », puis la personne était déconnectée et devait ressaisir ce qu'elle venait de créer.
 * La marque du premier mot de passe (app_metadata, posée par le service) fait dire « Créez votre mot de passe » et
 * garde la personne connectée vers sa suite ; la récupération ordinaire ne change pas.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  supprimerCookie: vi.fn(),
  cookieConfirmation: "" as string,
  updateUserById: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ auth: { admin: { updateUserById: mocks.updateUserById } } }) }));
vi.mock("@/lib/lien-mot-de-passe", () => ({ envoyerLienMotDePasse: vi.fn(), inscrireEtEnvoyerConfirmation: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ delete: mocks.supprimerCookie, get: (nom: string) => (nom === "gerimmo_confirmation" && mocks.cookieConfirmation ? { value: mocks.cookieConfirmation } : undefined) }),
}));
vi.mock("next/navigation", () => ({ redirect: (chemin: string) => { throw new Error(`REDIRECT ${chemin}`); } }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: () => [{}, () => {}, false] };
});

import { definirNouveauMotDePasse } from "../src/app/actions/auth";
import PageConfirmerLien from "../src/app/auth/confirmer/page";
import PageNouveauMotDePasse from "../src/app/nouveau-mot-de-passe/page";
import { FormulaireNouveauMotDePasse } from "../src/app/nouveau-mot-de-passe/formulaire-nouveau-mot-de-passe";
import { COOKIE_CONFIRMATION } from "../src/lib/jeton-confirmation";
import { CLE_PREMIER_MOT_DE_PASSE, premierMotDePasse } from "../src/lib/premier-mot-de-passe";

const MOT_DE_PASSE = "recette-premier-choix-invite-1";
const SUITE = "/invitations/5f1c1a52-6d2a-4e21-9f2e-0e2c1f8a9b11";

function formulaire(suite = SUITE) {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries({ mot_de_passe: MOT_DE_PASSE, confirmation: MOT_DE_PASSE, suite })) f.set(cle, valeur);
  return f;
}

let auth: Record<string, ReturnType<typeof vi.fn>>;
function compte(app_metadata: Record<string, unknown>) {
  auth.getUser.mockResolvedValue({ data: { user: { id: "u-invite", email: "invite@example.invalid", app_metadata, user_metadata: { nom: "Invité" } } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieConfirmation = "";
  mocks.updateUserById.mockResolvedValue({ data: { user: { id: "u-invite" } }, error: null });
  auth = {
    getUser: vi.fn(),
    getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: "u-invite", amr: [{ method: "recovery", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: { session: {}, user: { id: "u-invite" } }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  const requete = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
  mocks.client.mockResolvedValue({ auth, rpc: vi.fn().mockResolvedValue({ error: null }), from: vi.fn().mockReturnValue(requete) });
});

describe("la marque du premier mot de passe", () => {
  it("ne se lit que dans app_metadata, à vrai", () => {
    expect(premierMotDePasse({ app_metadata: { [CLE_PREMIER_MOT_DE_PASSE]: true } })).toBe(true);
    expect(premierMotDePasse({ app_metadata: { [CLE_PREMIER_MOT_DE_PASSE]: "true" } })).toBe(false);
    expect(premierMotDePasse({ app_metadata: { [CLE_PREMIER_MOT_DE_PASSE]: false } })).toBe(false);
    expect(premierMotDePasse({ app_metadata: {} })).toBe(false);
    expect(premierMotDePasse(null)).toBe(false);
  });
});

describe("la page du lien reçu (auth/confirmer)", () => {
  const rendre = async (next: string) => {
    mocks.cookieConfirmation = "jeton-double";
    expect(COOKIE_CONFIRMATION).toBe("gerimmo_confirmation");
    return renderToStaticMarkup(await PageConfirmerLien({ searchParams: Promise.resolve({ token_hash: "x", type: "recovery", next }) }));
  };
  it("un lien d'invitation, dont la suite est la page de l'invitation, parle du mot de passe", async () => {
    const html = await rendre(`/nouveau-mot-de-passe?suite=${encodeURIComponent(SUITE)}`);
    expect(html).toContain("Votre mot de passe");
    expect(html).toContain("Choisir mon mot de passe");
    expect(html).toContain("choisir votre mot de passe");
    expect(html).not.toContain("Accéder à votre compte");
  });
  it("une récupération ordinaire parle du mot de passe ; une autre suite reste neutre", async () => {
    expect(await rendre("/nouveau-mot-de-passe")).toContain("Votre mot de passe");
    const autre = await rendre("/espaces");
    expect(autre).toContain("Accéder à votre compte");
    expect(autre).not.toContain("Choisir mon mot de passe");
  });
});

describe("la page du nouveau mot de passe", () => {
  it("un invité crée son mot de passe : titre, libellé et bouton le disent", async () => {
    compte({ [CLE_PREMIER_MOT_DE_PASSE]: true });
    const html = renderToStaticMarkup(await PageNouveauMotDePasse({ searchParams: Promise.resolve({ suite: SUITE }) }));
    expect(html).toContain("Créez votre mot de passe");
    expect(html).toContain("il vous sera demandé à chaque connexion");
    expect(html).toContain(">Mot de passe</label>");
    expect(html).toContain("Créer mon mot de passe");
    expect(html).not.toContain("Nouveau mot de passe");
    expect(html).not.toContain("Changer le mot de passe");
  });
  it("une récupération ordinaire garde « Nouveau mot de passe » et « Changer le mot de passe »", async () => {
    compte({});
    const html = renderToStaticMarkup(await PageNouveauMotDePasse({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Nouveau mot de passe");
    expect(html).toContain("Changer le mot de passe");
    expect(html).not.toContain("Créez votre mot de passe");
  });
  it("le formulaire seul suit l'indicateur", () => {
    expect(renderToStaticMarkup(createElement(FormulaireNouveauMotDePasse, { suite: SUITE, premierChoix: true }))).toContain("Créer mon mot de passe");
    expect(renderToStaticMarkup(createElement(FormulaireNouveauMotDePasse, { suite: SUITE }))).toContain("Changer le mot de passe");
  });
});

describe("l'action : le premier mot de passe d'un invité", () => {
  it("ouvre une session « mot de passe », efface la marque par le service et mène à la page de l'invitation", async () => {
    compte({ [CLE_PREMIER_MOT_DE_PASSE]: true });
    await expect(definirNouveauMotDePasse({}, formulaire())).rejects.toThrow(`REDIRECT ${SUITE}`);
    expect(auth.updateUser).toHaveBeenCalledWith({ password: MOT_DE_PASSE });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "invite@example.invalid", password: MOT_DE_PASSE });
    expect(mocks.updateUserById).toHaveBeenCalledWith("u-invite", { app_metadata: { [CLE_PREMIER_MOT_DE_PASSE]: false } });
    // Les autres sessions (celle du lien comprise) sont fermées ; pas de déconnexion globale, pas de /connexion.
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(mocks.supprimerCookie).not.toHaveBeenCalled();
  });
  it("si la connexion avec le mot de passe choisi échoue, la récupération reprend : déconnexion et page de connexion, suite gardée", async () => {
    compte({ [CLE_PREMIER_MOT_DE_PASSE]: true });
    auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null, user: null }, error: { message: "limite" } });
    await expect(definirNouveauMotDePasse({}, formulaire())).rejects.toThrow(`REDIRECT /connexion?raison=mot-de-passe-modifie&suite=${encodeURIComponent(SUITE)}`);
    expect(auth.signOut).toHaveBeenCalledTimes(2);
  });
  it("une récupération ordinaire ne change pas : aucune connexion, déconnexion complète, page de connexion", async () => {
    compte({});
    await expect(definirNouveauMotDePasse({}, formulaire("/espaces"))).rejects.toThrow("REDIRECT /connexion?raison=mot-de-passe-modifie");
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.updateUserById).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledTimes(2);
  });
});
