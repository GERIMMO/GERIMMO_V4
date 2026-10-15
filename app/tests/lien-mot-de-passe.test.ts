/**
 * Les liens « créer / choisir mon mot de passe » (incident de production du
 * 30/09/2026) et, depuis l'audit du même jour, le lien de confirmation
 * d'inscription.
 *
 * `resetPasswordForEmail` (flux PKCE) fabriquait des liens qui ne marchaient
 * que dans le navigateur de CELUI QUI LES DEMANDAIT : une invitation envoyée
 * par le super admin était morte chez son destinataire. Désormais le jeton
 * vient de l'API d'administration, le lien est le nôtre (token_hash), et il
 * n'est consommé qu'au clic sur un bouton (POST) — jamais à l'ouverture, que
 * les analyseurs de messagerie font à la place du destinataire. Le bouton
 * exige un double jeton (cookie posé par le GET, champ caché) : c'est lui qui
 * permet d'accepter `Origin: null` sans ouvrir la porte à une connexion forcée.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  service: vi.fn(),
  envoyerEmail: vi.fn(),
  headers: vi.fn(),
  cookies: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: mocks.service }));
vi.mock("@/lib/email", () => ({ envoyerEmail: mocks.envoyerEmail }));
vi.mock("next/headers", () => ({ headers: mocks.headers, cookies: mocks.cookies }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import {
  construireLien,
  envoyerLienMotDePasse,
  inscrireEtEnvoyerConfirmation,
  metadonneesRemplacees,
  LIMITE_INVITATIONS_PAR_ORGANISATION,
  MESSAGE_TROP_D_INVITATIONS,
  MESSAGE_TROP_DE_DEMANDES,
} from "../src/lib/lien-mot-de-passe";
import { GET, POST } from "../src/app/auth/confirm/route";
import { COOKIE_CONFIRMATION, jetonConfirmationValide } from "../src/lib/jeton-confirmation";
import { COOKIE_INSCRIPTION, empreinteTemoinInscription, temoinInscriptionValide } from "../src/lib/temoin-inscription";

const EMPREINTE = "a".repeat(56);
const ORG = "11111111-1111-4111-8111-111111111111";

type ReponseLien = { data: { properties: { hashed_token: string; action_link: string } | null; user: Record<string, unknown> | null }; error: { message: string; code?: string } | null };

function admin(opts: { erreurLien?: string; codeErreur?: string; autorise?: boolean; erreurRpc?: string; utilisateur?: Record<string, unknown> } = {}) {
  const generateLink = vi.fn(async (): Promise<ReponseLien> =>
    opts.erreurLien
      ? { data: { properties: null, user: null }, error: { message: opts.erreurLien, code: opts.codeErreur } }
      : {
          data: {
            properties: { hashed_token: EMPREINTE, action_link: "https://projet.supabase.co/auth/v1/verify?token=x" },
            user: opts.utilisateur ?? { id: "u1", email_confirmed_at: null },
          },
          error: null,
        }
  );
  const rpc = vi.fn(async () => ({ data: opts.autorise ?? true, error: opts.erreurRpc ? { message: opts.erreurRpc } : null }));
  // Doublure de `auth.admin.updateUserById` (relecture du 15/10/2026) : informations, témoin et mot de passe d'une
  // inscription non confirmée.
  const updateUserById = vi.fn(
    async (_id: string, _attributs: Record<string, unknown>): Promise<{ data: { user: Record<string, unknown> | null }; error: { message: string; code?: string } | null }> =>
      ({ data: { user: { id: _id } }, error: null })
  );
  mocks.service.mockReturnValue({ auth: { admin: { generateLink, updateUserById } }, rpc });
  return { generateLink, rpc, updateUserById };
}

const jarre = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookies.mockResolvedValue(jarre);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app");
  mocks.envoyerEmail.mockResolvedValue({ id: "courriel" });
  mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
});

describe("le lien fabriqué", () => {
  it("porte le token_hash, le type recovery et une destination interne", () => {
    const url = new URL(construireLien("https://www.gerimmo.app", EMPREINTE, "/nouveau-mot-de-passe"));
    expect(url.origin + url.pathname).toBe("https://www.gerimmo.app/auth/confirm");
    expect(url.searchParams.get("token_hash")).toBe(EMPREINTE);
    expect(url.searchParams.get("type")).toBe("recovery");
    expect(url.searchParams.get("next")).toBe("/nouveau-mot-de-passe");
    expect(url.searchParams.has("code")).toBe(false);
  });

  it("neutralise une destination externe", () => {
    for (const piege of ["https://pirate.example", "//pirate.example", "javascript:alert(1)"]) {
      const url = new URL(construireLien("https://www.gerimmo.app", EMPREINTE, piege));
      expect(url.searchParams.get("next")).toBe("/nouveau-mot-de-passe");
      const inscription = new URL(construireLien("https://www.gerimmo.app", EMPREINTE, piege, "signup"));
      expect(inscription.searchParams.get("next")).toBe("/espaces");
    }
  });

  it("porte le type signup pour une confirmation d'inscription", () => {
    const url = new URL(construireLien("https://www.gerimmo.app", EMPREINTE, "/espaces", "signup"));
    expect(url.searchParams.get("type")).toBe("signup");
    expect(url.searchParams.get("next")).toBe("/espaces");
  });
});

describe("envoyerLienMotDePasse — invitations", () => {
  it("génère un lien de récupération par l'API d'administration et l'envoie par l'expéditeur du produit", async () => {
    const { generateLink, rpc } = admin();
    const r = await envoyerLienMotDePasse({ email: " Resp@Agence.fr ", motif: "invitation_responsable", next: "/nouveau-mot-de-passe" });
    expect(r).toEqual({});
    expect(generateLink).toHaveBeenCalledWith({ type: "recovery", email: "resp@agence.fr" });
    // Une invitation vient d'un geste autorisé : pas de limite anonyme ; sans
    // organisation désignée, pas de limite par organisation non plus.
    expect(rpc).not.toHaveBeenCalled();
    const courrier = mocks.envoyerEmail.mock.calls[0][0];
    expect(courrier.to).toBe("resp@agence.fr");
    expect(courrier.subject).toBe("Votre espace Gerimmo est prêt — créez votre mot de passe");
    expect(courrier.html).toContain(`https://www.gerimmo.app/auth/confirm?token_hash=${EMPREINTE}&amp;type=recovery&amp;next=%2Fnouveau-mot-de-passe`);
    expect(courrier.html).toContain("Créer mon mot de passe");
    expect(courrier.html).toContain("valable pour une durée limitée");
    expect(courrier.html).not.toContain("action_link");
    expect(courrier.html).not.toContain("supabase.co");
  });

  it("remonte l'erreur à celui qui invite quand le compte est introuvable", async () => {
    admin({ erreurLien: "User with this email not found" });
    const r = await envoyerLienMotDePasse({ email: "inconnu@agence.fr", motif: "invitation_agent" });
    expect(r.erreur).toBeTruthy();
    expect(mocks.envoyerEmail).not.toHaveBeenCalled();
  });

  it("remonte l'échec de l'e-mail", async () => {
    admin();
    mocks.envoyerEmail.mockResolvedValue({ erreur: "Le service d’e-mail a refusé l’envoi." });
    const r = await envoyerLienMotDePasse({ email: "loc@exemple.fr", motif: "invitation_locataire" });
    expect(r.erreur).toMatch(/refusé/);
  });

  it("dit que l'envoi n'est pas configuré sans clé de service", async () => {
    mocks.service.mockReturnValue(null);
    expect((await envoyerLienMotDePasse({ email: "a@b.fr", motif: "renvoi_supervision" })).erreur).toMatch(/pas configuré/);
  });
});

describe("envoyerLienMotDePasse — limite par organisation (audit 30/09, M4)", () => {
  it("compte l'invitation dans la limite de l'organisation : 30 par heure", async () => {
    const { rpc, generateLink } = admin();
    expect(await envoyerLienMotDePasse({ email: "agent@agence.fr", motif: "invitation_agent", organisation: ORG })).toEqual({});
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("autoriser_lien_mot_de_passe_cle", { p_cle: `organisation:${ORG}`, p_max: LIMITE_INVITATIONS_PAR_ORGANISATION });
    expect(LIMITE_INVITATIONS_PAR_ORGANISATION).toBe(30);
    expect(generateLink).toHaveBeenCalled();
  });

  it("refuse au-delà de la limite, sans fabriquer de lien, et le dit à celui qui invite", async () => {
    const { generateLink } = admin({ autorise: false });
    const r = await envoyerLienMotDePasse({ email: "loc@exemple.fr", motif: "invitation_locataire", organisation: ORG });
    expect(r).toEqual({ erreur: MESSAGE_TROP_D_INVITATIONS, limite: true });
    expect(generateLink).not.toHaveBeenCalled();
    expect(mocks.envoyerEmail).not.toHaveBeenCalled();
  });

  it("refuse quand la limite ne peut pas être lue (fermé par défaut)", async () => {
    const { generateLink } = admin({ erreurRpc: "panne" });
    expect((await envoyerLienMotDePasse({ email: "loc@exemple.fr", motif: "renvoi_supervision", organisation: ORG })).erreur).toBeTruthy();
    expect(generateLink).not.toHaveBeenCalled();
  });
});

describe("envoyerLienMotDePasse — mot de passe oublié (anonyme)", () => {
  it("passe d'abord par la limite, avec l'adresse et l'IP du visiteur", async () => {
    const { rpc, generateLink } = admin();
    expect(await envoyerLienMotDePasse({ email: "moi@exemple.fr", motif: "mot_de_passe_oublie" })).toEqual({});
    expect(rpc).toHaveBeenCalledWith("autoriser_lien_mot_de_passe", { p_email: "moi@exemple.fr", p_ip: "203.0.113.7" });
    expect(generateLink).toHaveBeenCalled();
    expect(mocks.envoyerEmail).toHaveBeenCalledTimes(1);
  });

  it("répond comme pour un compte existant quand l'adresse est inconnue", async () => {
    admin({ erreurLien: "User with this email not found" });
    expect(await envoyerLienMotDePasse({ email: "personne@exemple.fr", motif: "mot_de_passe_oublie" })).toEqual({});
    expect(mocks.envoyerEmail).not.toHaveBeenCalled();
  });

  it("refuse au-delà de la limite, sans fabriquer de lien", async () => {
    const { generateLink } = admin({ autorise: false });
    const r = await envoyerLienMotDePasse({ email: "moi@exemple.fr", motif: "mot_de_passe_oublie" });
    expect(r).toEqual({ erreur: MESSAGE_TROP_DE_DEMANDES, limite: true });
    expect(generateLink).not.toHaveBeenCalled();
    expect(mocks.envoyerEmail).not.toHaveBeenCalled();
  });

  it("refuse aussi quand la limite ne peut pas être lue (fermé par défaut)", async () => {
    const { generateLink } = admin({ erreurRpc: "panne" });
    expect((await envoyerLienMotDePasse({ email: "moi@exemple.fr", motif: "compte_existant" })).erreur).toBeTruthy();
    expect(generateLink).not.toHaveBeenCalled();
  });
});

describe("inscrireEtEnvoyerConfirmation — l'inscription (audit 30/09, H1/H2)", () => {
  const metadonnees = { nom: "Martin", prenom: "Camille", espace: "proprietaire_direct", cgu_version: "2026-09" };
  const inscrire = (email = "Camille@Exemple.fr") =>
    inscrireEtEnvoyerConfirmation({ email, motDePasse: "un-mot-de-passe-long", metadonnees, next: "/espaces" });

  it("crée le compte par generateLink type signup (métadonnées comprises) et envoie NOTRE lien de confirmation", async () => {
    const { generateLink, rpc } = admin();
    expect(await inscrire()).toEqual({ etat: "confirmation_envoyee" });
    // Demande anonyme : la limite d'abord.
    expect(rpc).toHaveBeenCalledWith("autoriser_lien_mot_de_passe", { p_email: "camille@exemple.fr", p_ip: "203.0.113.7" });
    expect(generateLink).toHaveBeenCalledTimes(1);
    expect(generateLink).toHaveBeenCalledWith({
      type: "signup",
      email: "camille@exemple.fr",
      password: "un-mot-de-passe-long",
      options: { data: metadonnees },
    });
    const courrier = mocks.envoyerEmail.mock.calls[0][0];
    expect(courrier.to).toBe("camille@exemple.fr");
    expect(courrier.subject).toBe("Confirmez votre adresse — Gerimmo");
    expect(courrier.html).toContain(`https://www.gerimmo.app/auth/confirm?token_hash=${EMPREINTE}&amp;type=signup&amp;next=%2Fespaces`);
    expect(courrier.html).toContain("Confirmer mon adresse");
    expect(courrier.html).toContain("aucun compte ne sera ouvert");
    expect(courrier.html).not.toContain("Mot de passe oublié");
    expect(courrier.html).not.toContain("supabase.co");
  });

  it("adresse déjà confirmée (email_exists) : le titulaire reçoit un lien de reconnexion, la limite n'est comptée qu'une fois", async () => {
    const { generateLink, rpc } = admin();
    generateLink.mockResolvedValueOnce({
      data: { properties: null, user: null },
      error: { code: "email_exists", message: "A user with this email address has already been registered" },
    });
    expect(await inscrire()).toEqual({ etat: "compte_existant" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(generateLink).toHaveBeenCalledTimes(2);
    expect(generateLink).toHaveBeenLastCalledWith({ type: "recovery", email: "camille@exemple.fr" });
    const courrier = mocks.envoyerEmail.mock.calls[0][0];
    expect(courrier.subject).toBe("Vous avez déjà un compte Gerimmo");
    expect(courrier.html).toContain("type=recovery");
    expect(courrier.html).toContain("next=%2Fnouveau-mot-de-passe");
  });

  it("reconnaît aussi l'ancien libellé « User already registered »", async () => {
    const { generateLink } = admin();
    generateLink.mockResolvedValueOnce({ data: { properties: null, user: null }, error: { code: "user_already_exists", message: "User already registered" } });
    expect(await inscrire()).toEqual({ etat: "compte_existant" });
  });

  it("compte existant : si le lien de reconnexion ne peut pas être fabriqué, la réponse reste la même", async () => {
    const { generateLink } = admin();
    generateLink
      .mockResolvedValueOnce({ data: { properties: null, user: null }, error: { code: "email_exists", message: "already registered" } })
      .mockResolvedValueOnce({ data: { properties: null, user: null }, error: { message: "panne" } });
    expect(await inscrire()).toEqual({ etat: "compte_existant" });
    expect(mocks.envoyerEmail).not.toHaveBeenCalled();
  });

  it("une inscription interrompue (compte non confirmé) reçoit un nouveau lien de confirmation, pas de récupération", async () => {
    // Auth accepte `signup` pour un compte encore non confirmé : nouveau jeton.
    const { generateLink } = admin({ utilisateur: { id: "u1", email_confirmed_at: null } });
    expect(await inscrire()).toEqual({ etat: "confirmation_envoyee" });
    expect(generateLink).toHaveBeenCalledTimes(1);
    expect(mocks.envoyerEmail.mock.calls[0][0].subject).toBe("Confirmez votre adresse — Gerimmo");
  });

  /**
   * Relecture du 15/10/2026 (invitation d'artisan, compte pré-inscrit). Pour une adresse inscrite mais jamais confirmée,
   * Auth renouvelle le jeton et GARDE le mot de passe de la première inscription. Un invitant qui connaît l'adresse
   * pouvait donc créer le compte avant l'artisan avec SON mot de passe : l'artisan confirmait sa boîte, le compte
   * s'ouvrait avec le mot de passe d'un tiers. Le mot de passe choisi à CETTE inscription remplace l'ancien AVANT l'envoi.
   */
  it("compte non confirmé : les informations, le témoin du navigateur et le mot de passe de CETTE inscription sont posés AVANT l'envoi du nouveau lien", async () => {
    const { generateLink, updateUserById } = admin({
      utilisateur: { id: "u-pre-inscrit", email_confirmed_at: null, user_metadata: { espace: "artisan", code_parrainage: "AAAA1111", sub: "u-pre-inscrit", email_verified: false } },
    });
    expect(await inscrire()).toEqual({ etat: "confirmation_envoyee" });
    expect(updateUserById).toHaveBeenCalledTimes(2);
    // 1. Les informations de cette inscription remplacent celles d'avant (les clés d'Auth restent) ; l'empreinte du témoin.
    const [id1, attributs1] = updateUserById.mock.calls[0];
    expect(id1).toBe("u-pre-inscrit");
    expect(attributs1.user_metadata).toEqual({ ...metadonnees, code_parrainage: null });
    const empreinte = (attributs1.app_metadata as Record<string, string>).empreinte_inscription;
    expect(empreinte).toMatch(/^[0-9a-f]{64}$/);
    // 2. Le mot de passe choisi à cette inscription.
    expect(updateUserById.mock.calls[1]).toEqual(["u-pre-inscrit", { password: "un-mot-de-passe-long" }]);
    // 3. Le témoin, en cookie httpOnly limité à /auth, dont l'empreinte est celle gardée dans le compte.
    expect(jarre.set).toHaveBeenCalledTimes(1);
    const [nom, temoin, options] = jarre.set.mock.calls[0];
    expect(nom).toBe(COOKIE_INSCRIPTION);
    expect(empreinteTemoinInscription(temoin)).toBe(empreinte);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/auth" });
    // Ordre : le jeton (qui rend caducs les liens précédents), le compte, le mot de passe, le témoin, puis le courrier.
    const ordre = (f: { mock: { invocationCallOrder: number[] } }, n = 0) => f.mock.invocationCallOrder[n];
    expect(ordre(generateLink)).toBeLessThan(ordre(updateUserById));
    expect(ordre(updateUserById, 1)).toBeLessThan(ordre(jarre.set));
    expect(ordre(jarre.set)).toBeLessThan(ordre(mocks.envoyerEmail));
  });

  it("compte non confirmé : si les informations ou le témoin ne peuvent pas être posés, aucun lien ne part", async () => {
    const { updateUserById } = admin();
    updateUserById.mockResolvedValueOnce({ data: { user: null }, error: { message: "Database error updating user" } });
    expect(await inscrire()).toEqual({ erreur: "Le service est momentanément indisponible. Réessayez dans un instant." });
    expect(updateUserById).toHaveBeenCalledTimes(1);
    expect(mocks.envoyerEmail).not.toHaveBeenCalled();
  });

  it("compte non confirmé : si le mot de passe ne peut pas être remplacé, aucun lien ne part", async () => {
    const { updateUserById } = admin();
    updateUserById
      .mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null })
      .mockResolvedValueOnce({ data: { user: null }, error: { message: "Database error updating user" } });
    expect(await inscrire()).toEqual({ erreur: "Le service est momentanément indisponible. Réessayez dans un instant." });
    expect(mocks.envoyerEmail).not.toHaveBeenCalled();
  });

  it("compte non confirmé : un nouveau mot de passe refusé par Auth garde son code (classé « mot de passe refusé »), sans courrier", async () => {
    const { updateUserById } = admin();
    updateUserById
      .mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null })
      .mockResolvedValueOnce({ data: { user: null }, error: { message: "Password is too weak", code: "weak_password" } });
    expect(await inscrire()).toEqual({ erreur: "Password is too weak", code: "weak_password" });
    expect(mocks.envoyerEmail).not.toHaveBeenCalled();
  });

  it("compte neuf : si Auth répond que c'est déjà ce mot de passe (same_password), le lien part quand même", async () => {
    const { updateUserById } = admin();
    updateUserById
      .mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null })
      .mockResolvedValueOnce({ data: { user: null }, error: { message: "New password should be different from the old password.", code: "same_password" } });
    expect(await inscrire()).toEqual({ etat: "confirmation_envoyee" });
    expect(mocks.envoyerEmail).toHaveBeenCalledTimes(1);
  });

  it("sans cookie posable, le lien part quand même : la confirmation fera choisir le mot de passe", async () => {
    admin();
    jarre.set.mockImplementationOnce(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler");
    });
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await inscrire()).toEqual({ etat: "confirmation_envoyee" });
    expect(mocks.envoyerEmail).toHaveBeenCalledTimes(1);
    erreur.mockRestore();
  });

  it("les informations remplacées : toute clé d'une autre inscription est effacée, jamais celles d'Auth", () => {
    expect(metadonneesRemplacees({ espace: "proprietaire_direct", nom: "X", code_parrainage: "A", sub: "s", email: "e", email_verified: true, phone_verified: false }, { espace: "artisan" }))
      .toEqual({ nom: null, code_parrainage: null, espace: "artisan" });
    expect(metadonneesRemplacees(undefined, { espace: "artisan" })).toEqual({ espace: "artisan" });
  });

  it("le remplacement ne touche jamais un compte confirmé : ni adresse déjà confirmée, ni projet sans confirmation", async () => {
    const { generateLink, updateUserById } = admin({ utilisateur: { id: "u1", email_confirmed_at: "2026-09-30T10:00:00Z" } });
    expect(await inscrire()).toEqual({ etat: "deja_confirme" });
    generateLink.mockResolvedValueOnce({ data: { properties: null, user: null }, error: { code: "email_exists", message: "already registered" } });
    expect(await inscrire()).toEqual({ etat: "compte_existant" });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("remonte le code d'un mot de passe refusé, sans courrier", async () => {
    admin({ erreurLien: "Password is too weak", codeErreur: "weak_password" });
    expect(await inscrire()).toEqual({ erreur: "Password is too weak", code: "weak_password" });
    expect(mocks.envoyerEmail).not.toHaveBeenCalled();
  });

  it("projet sans confirmation d'adresse : dit que le compte est déjà confirmé, sans courrier", async () => {
    admin({ utilisateur: { id: "u1", email_confirmed_at: "2026-09-30T10:00:00Z" } });
    expect(await inscrire()).toEqual({ etat: "deja_confirme" });
    expect(mocks.envoyerEmail).not.toHaveBeenCalled();
  });

  it("applique la limite anonyme avant toute création de compte", async () => {
    const { generateLink } = admin({ autorise: false });
    expect(await inscrire()).toEqual({ erreur: MESSAGE_TROP_DE_DEMANDES, limite: true });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("remonte l'échec de l'e-mail : l'inscrit doit savoir qu'il n'a rien reçu", async () => {
    admin();
    mocks.envoyerEmail.mockResolvedValue({ erreur: "Le service d’e-mail a refusé l’envoi." });
    expect(await inscrire()).toEqual({ erreur: "Le service d’e-mail a refusé l’envoi." });
  });

  it("dit que l'envoi n'est pas configuré sans clé de service ou sans adresse du site", async () => {
    mocks.service.mockReturnValue(null);
    expect((await inscrire()) as { erreur?: string }).toMatchObject({ erreur: expect.stringMatching(/pas configuré/) });
    admin();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect((await inscrire()) as { erreur?: string }).toMatchObject({ erreur: expect.stringMatching(/pas configuré/) });
  });
});

describe("/auth/confirm", () => {
  function supabase() {
    const auth = { verifyOtp: vi.fn(async () => ({ error: null })), exchangeCodeForSession: vi.fn(async () => ({ error: null })) };
    mocks.createClient.mockResolvedValue({ auth });
    return auth;
  }
  const cookieDe = (r: Response) => r.headers.get("set-cookie") ?? "";

  it("GET avec token_hash ne consomme PAS le jeton : il mène à la page du bouton, pose le double jeton, sans cache", async () => {
    const auth = supabase();
    const r = await GET(new NextRequest(`https://www.gerimmo.app/auth/confirm?token_hash=${EMPREINTE}&type=recovery&next=/nouveau-mot-de-passe`));
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    const cible = new URL(r.headers.get("location")!);
    expect(cible.pathname).toBe("/auth/confirmer");
    expect(cible.searchParams.get("token_hash")).toBe(EMPREINTE);
    expect(cible.searchParams.get("type")).toBe("recovery");
    expect(cible.searchParams.get("next")).toBe("/nouveau-mot-de-passe");
    expect(r.headers.get("cache-control")).toBe("no-store");
    const cookie = cookieDe(r);
    expect(cookie).toMatch(new RegExp(`^${COOKIE_CONFIRMATION}=[A-Za-z0-9_-]{20,}`));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\/auth/);
    expect(cookie).toMatch(/Max-Age=900/);
  });

  it("GET accepte un lien de confirmation d'inscription (type signup)", async () => {
    supabase();
    const r = await GET(new NextRequest(`https://www.gerimmo.app/auth/confirm?token_hash=${EMPREINTE}&type=signup&next=/espaces`));
    const cible = new URL(r.headers.get("location")!);
    expect(cible.pathname).toBe("/auth/confirmer");
    expect(cible.searchParams.get("type")).toBe("signup");
    expect(cible.searchParams.get("next")).toBe("/espaces");
  });

  it("GET neutralise une destination externe et un type inconnu", async () => {
    supabase();
    const r = await GET(new NextRequest(`https://www.gerimmo.app/auth/confirm?token_hash=${EMPREINTE}&type=recovery&next=https://pirate.example`));
    expect(new URL(r.headers.get("location")!).searchParams.get("next")).toBe("/espaces");
    const r2 = await GET(new NextRequest(`https://www.gerimmo.app/auth/confirm?token_hash=${EMPREINTE}&type=nimporte`));
    expect(r2.headers.get("location")).toContain("/connexion?raison=lien-invalide");
    expect(r2.headers.get("cache-control")).toBe("no-store");
  });

  it("GET garde les anciens liens ?code= (PKCE) et renvoie vers « lien invalide » s'ils échouent", async () => {
    const auth = supabase();
    const ok = await GET(new NextRequest("https://www.gerimmo.app/auth/confirm?code=abc&next=/nouveau-mot-de-passe"));
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(new URL(ok.headers.get("location")!).pathname).toBe("/nouveau-mot-de-passe");
    expect(ok.headers.get("cache-control")).toBe("no-store");
    auth.exchangeCodeForSession.mockResolvedValueOnce({ error: { message: "code verifier" } } as never);
    const ko = await GET(new NextRequest("https://www.gerimmo.app/auth/confirm?code=abc"));
    expect(ko.headers.get("location")).toContain("/connexion?raison=lien-invalide");
  });

  const NONCE = "jeton-de-confirmation-aleatoire";
  const post = (
    champs: Record<string, string>,
    entetes: Record<string, string> = { origin: "https://www.gerimmo.app", "sec-fetch-site": "same-origin" },
    cookie: string | null = NONCE
  ) => {
    const corps = new URLSearchParams(champs);
    return new NextRequest("https://www.gerimmo.app/auth/confirm", {
      method: "POST",
      body: corps,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        host: "www.gerimmo.app",
        ...(cookie === null ? {} : { cookie: `${COOKIE_CONFIRMATION}=${cookie}` }),
        // (une valeur « nonce; autre=… » ajoute un second cookie à la requête)
        ...entetes,
      },
    });
  };
  const champs = (extra: Record<string, string> = {}) => ({ token_hash: EMPREINTE, type: "recovery", next: "/nouveau-mot-de-passe", confirmation: NONCE, ...extra });

  it("POST vérifie le jeton puis mène à la destination (303), et efface le double jeton", async () => {
    const auth = supabase();
    const r = await POST(post(champs()));
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: EMPREINTE });
    expect(r.status).toBe(303);
    expect(new URL(r.headers.get("location")!).pathname).toBe("/nouveau-mot-de-passe");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(cookieDe(r)).toMatch(new RegExp(`${COOKIE_CONFIRMATION}=;.*Max-Age=0`));
  });

  it("POST d'une confirmation d'inscription dans le navigateur de l'inscription : destination /espaces, témoin effacé", async () => {
    const auth = supabase();
    const temoin = "temoin-de-l-inscription";
    const { updateUserById } = admin();
    auth.verifyOtp.mockResolvedValueOnce({
      data: { user: { id: "u1", app_metadata: { empreinte_inscription: empreinteTemoinInscription(temoin) } } },
      error: null,
    } as never);
    const requete = post(champs({ type: "signup", next: "/espaces" }), undefined, `${NONCE}; ${COOKIE_INSCRIPTION}=${temoin}`);
    const r = await POST(requete);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: EMPREINTE });
    expect(new URL(r.headers.get("location")!).pathname).toBe("/espaces");
    // L'empreinte est effacée, le mot de passe choisi à l'inscription est gardé.
    expect(updateUserById).toHaveBeenCalledWith("u1", { app_metadata: { empreinte_inscription: null } });
    expect(cookieDe(r)).toMatch(new RegExp(`${COOKIE_INSCRIPTION}=;.*Max-Age=0`));
  });

  it("POST d'une confirmation d'inscription hors du navigateur de l'inscription : mot de passe inconnu posé, puis choix du mot de passe", async () => {
    const auth = supabase();
    const { updateUserById } = admin();
    auth.verifyOtp.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { empreinte_inscription: empreinteTemoinInscription("temoin-d-un-autre-navigateur") } } },
      error: null,
    } as never);
    for (const cookie of [NONCE, `${NONCE}; ${COOKIE_INSCRIPTION}=temoin-de-ce-navigateur`]) {
      updateUserById.mockClear();
      const r = await POST(post(champs({ type: "signup", next: "/artisan/inscription?invitation=6f1e2d3c-4b5a-4968-8778-695a4b3c2d1e" }), undefined, cookie));
      const cible = new URL(r.headers.get("location")!);
      expect(cible.pathname).toBe("/nouveau-mot-de-passe");
      expect(cible.searchParams.get("motif")).toBe("inscription");
      expect(cible.searchParams.get("suite")).toBe("/artisan/inscription?invitation=6f1e2d3c-4b5a-4968-8778-695a4b3c2d1e");
      const [id, attributs] = updateUserById.mock.calls[0];
      expect(id).toBe("u1");
      expect(attributs).toMatchObject({ app_metadata: { empreinte_inscription: null } });
      expect(String(attributs.password)).toMatch(/^Aa1!-[A-Za-z0-9_-]{60,}$/);
      expect(String(attributs.password).length).toBeLessThanOrEqual(72);
    }
  });

  it("POST d'un lien de mot de passe (recovery) : aucune vérification de témoin, rien n'est modifié dans le compte", async () => {
    supabase();
    const { updateUserById } = admin();
    const r = await POST(post(champs()));
    expect(new URL(r.headers.get("location")!).pathname).toBe("/nouveau-mot-de-passe");
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("POST d'un jeton mort : « lien invalide »", async () => {
    const auth = supabase();
    auth.verifyOtp.mockResolvedValueOnce({ error: { message: "One-time token not found" } } as never);
    const r = await POST(post(champs()));
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toContain("/connexion?raison=lien-invalide");
  });

  it("POST venu d'un autre site : refusé sans toucher au jeton, même avec le double jeton", async () => {
    const auth = supabase();
    const r = await POST(post(champs(), { origin: "https://pirate.example", "sec-fetch-site": "cross-site" }));
    expect(r.status).toBe(403);
    const r2 = await POST(post(champs(), { origin: "https://pirate.example" }));
    expect(r2.status).toBe(403);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("POST sans double jeton, ou avec un champ qui ne vaut pas le cookie : refusé (audit 30/09, M1)", async () => {
    const auth = supabase();
    // Cookie absent : un formulaire posté depuis ailleurs n'a pas notre cookie.
    expect((await POST(post(champs(), undefined, null))).status).toBe(403);
    // Champ absent.
    const { confirmation: _c, ...sansChamp } = champs();
    void _c;
    expect((await POST(post(sansChamp))).status).toBe(403);
    // Champ différent du cookie.
    expect((await POST(post(champs({ confirmation: "autre-valeur" })))).status).toBe(403);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("POST avec Origin: null (page no-referrer, vieux navigateur sans Sec-Fetch-Site) : accepté SEULEMENT avec le double jeton", async () => {
    const auth = supabase();
    const ok = await POST(post(champs(), { origin: "null" }));
    expect(ok.status).toBe(303);
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
    const ko = await POST(post(champs(), { origin: "null" }, null));
    expect(ko.status).toBe(403);
    const ko2 = await POST(post(champs({ confirmation: "devine" }), { origin: "null" }));
    expect(ko2.status).toBe(403);
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
  });
});

describe("POST /auth/confirm — contrôle d'origine (30/09)", () => {
  it("Origin: null ou absent ne passe plus qu'avec le double jeton ; Sec-Fetch-Site fait toujours foi", async () => {
    const { requeteMemeOrigine } = await import("@/lib/meme-origine");
    const r = (h: Record<string, string>) => new Request("https://www.gerimmo.app/auth/confirm", { method: "POST", headers: h });
    expect(requeteMemeOrigine(r({ origin: "null" }))).toBe(false);
    expect(requeteMemeOrigine(r({ origin: "null" }), true)).toBe(true);
    expect(requeteMemeOrigine(r({ host: "www.gerimmo.app" }))).toBe(false);
    expect(requeteMemeOrigine(r({ host: "www.gerimmo.app" }), true)).toBe(true);
    expect(requeteMemeOrigine(r({ "sec-fetch-site": "same-origin", origin: "null" }))).toBe(true);
    expect(requeteMemeOrigine(r({ origin: "https://www.gerimmo.app", host: "www.gerimmo.app" }))).toBe(true);
    expect(requeteMemeOrigine(r({ "sec-fetch-site": "cross-site", origin: "null" }), true)).toBe(false);
    expect(requeteMemeOrigine(r({ origin: "https://evil.example", host: "www.gerimmo.app" }), true)).toBe(false);
  });

  it("le double jeton se compare en temps constant et refuse l'absence", () => {
    expect(jetonConfirmationValide("abc", "abc")).toBe(true);
    expect(jetonConfirmationValide("abc", "abd")).toBe(false);
    expect(jetonConfirmationValide("abc", "abcd")).toBe(false);
    expect(jetonConfirmationValide(undefined, "abc")).toBe(false);
    expect(jetonConfirmationValide("abc", "")).toBe(false);
    expect(jetonConfirmationValide("", "")).toBe(false);
  });
});

/**
 * Troisième relecture du 15/10/2026 (constat « compte pré-inscrit », deux relecteurs). Le correctif précédent faisait
 * remplacer le mot de passe à CHAQUE inscription d'une adresse non confirmée : la course était déplacée, pas fermée. Si
 * l'invitant (qui connaît l'adresse) s'inscrit APRÈS l'artisan, son mot de passe remplace celui de l'artisan, le lien
 * de l'artisan devient caduc, et le seul lien valide, arrivé dans la boîte de l'artisan, ouvre le compte avec le mot
 * de passe de l'invitant.
 *
 * Ici, Auth est SIMULÉE avec ses règles réelles (GoTrue) : `generateLink` signup crée le compte ou, pour un compte non
 * confirmé, renouvelle le jeton en GARDANT mot de passe et métadonnées ; `updateUserById` fusionne les métadonnées (une
 * valeur nulle efface la clé) ; `verifyOtp` confirme l'adresse et ouvre la session. Chaque personne a son navigateur
 * (ses cookies). Les liens sont ceux des courriels envoyés, cliqués par GET puis par le bouton (POST).
 */
describe("compte pré-inscrit : aucun mot de passe choisi par un autre que celui qui confirme n'ouvre le compte", () => {
  type Compte = {
    id: string;
    email: string;
    password: string;
    confirme: boolean;
    user_metadata: Record<string, unknown>;
    app_metadata: Record<string, unknown>;
    jeton: string | null;
  };
  type Navigateur = Map<string, string>;
  const ADRESSE = "artisan@entreprise.test";
  let comptes: Map<string, Compte>;
  let courant: Navigateur;

  function authSimulee() {
    comptes = new Map();
    let n = 0;
    const parEmail = (email: string) => [...comptes.values()].find((c) => c.email === email);
    const vue = (c: Compte) => ({
      id: c.id,
      email: c.email,
      email_confirmed_at: c.confirme ? "2026-10-15T10:00:00Z" : null,
      user_metadata: { ...c.user_metadata },
      app_metadata: { ...c.app_metadata },
    });
    const fusion = (cible: Record<string, unknown>, maj: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(maj)) {
        if (v === null) delete cible[k];
        else cible[k] = v;
      }
    };
    const generateLink = vi.fn(async (p: { type: string; email: string; password?: string; options?: { data?: Record<string, unknown> } }) => {
      if (p.type !== "signup") return { data: { properties: null, user: null }, error: { message: "type non simulé" } };
      let c = parEmail(p.email);
      if (c?.confirme) return { data: { properties: null, user: null }, error: { code: "email_exists", message: "already registered" } };
      if (!c) {
        c = { id: `compte-${++n}`, email: p.email, password: p.password ?? "", confirme: false, user_metadata: { ...(p.options?.data ?? {}) }, app_metadata: { provider: "email", providers: ["email"] }, jeton: null };
        comptes.set(c.id, c);
      }
      c.jeton = `jeton-${++n}`;
      return { data: { properties: { hashed_token: c.jeton, action_link: "https://projet.supabase.co/x" }, user: vue(c) }, error: null };
    });
    const updateUserById = vi.fn(async (id: string, attributs: { password?: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }) => {
      const c = comptes.get(id);
      if (!c) return { data: { user: null }, error: { message: "User not found" } };
      if (attributs.password !== undefined) c.password = attributs.password;
      if (attributs.user_metadata) fusion(c.user_metadata, attributs.user_metadata);
      if (attributs.app_metadata) fusion(c.app_metadata, attributs.app_metadata);
      return { data: { user: vue(c) }, error: null };
    });
    const verifyOtp = vi.fn(async (p: { type: string; token_hash: string }) => {
      const c = [...comptes.values()].find((x) => x.jeton !== null && x.jeton === p.token_hash);
      if (!c || p.type !== "signup") return { data: { user: null, session: null }, error: { message: "Token has expired or is invalid" } };
      c.confirme = true;
      c.jeton = null;
      return { data: { user: vue(c), session: { access_token: "session" } }, error: null };
    });
    mocks.service.mockReturnValue({ auth: { admin: { generateLink, updateUserById } }, rpc: async () => ({ data: true, error: null }) });
    mocks.createClient.mockResolvedValue({ auth: { verifyOtp } });
    mocks.cookies.mockImplementation(async () => ({
      get: (nom: string) => (courant.has(nom) ? { name: nom, value: courant.get(nom)! } : undefined),
      set: (nom: string, valeur: string, options?: { maxAge?: number }) => {
        if (!valeur || options?.maxAge === 0) courant.delete(nom);
        else courant.set(nom, valeur);
      },
      delete: (nom: string) => courant.delete(nom),
    }));
  }

  /** Ce que peut faire, avec le mot de passe saisi, quelqu'un qui le connaît : ouvrir le compte ? */
  const ouvre = (motDePasse: string) => {
    const c = [...comptes.values()].find((x) => x.email === ADRESSE);
    return Boolean(c?.confirme && c.password === motDePasse);
  };
  const compte = () => [...comptes.values()].find((x) => x.email === ADRESSE)!;

  async function inscrireDepuis(navigateur: Navigateur, motDePasse: string, metadonnees: Record<string, unknown>, next = "/artisan/inscription") {
    courant = navigateur;
    return inscrireEtEnvoyerConfirmation({ email: ADRESSE, motDePasse, metadonnees, next });
  }
  /** Le lien du DERNIER courriel arrivé dans la boîte de l'artisan (le seul valide). */
  const dernierLien = () => {
    const courriers = mocks.envoyerEmail.mock.calls.map((c) => c[0]).filter((c) => c.to === ADRESSE);
    const html = courriers.at(-1)!.html as string;
    return /href="([^"]+)"/.exec(html)![1].replace(/&amp;/g, "&");
  };
  const premierLien = () => {
    const html = mocks.envoyerEmail.mock.calls.map((c) => c[0]).filter((c) => c.to === ADRESSE)[0].html as string;
    return /href="([^"]+)"/.exec(html)![1].replace(/&amp;/g, "&");
  };
  /** Ouvrir le lien (GET), puis cliquer le bouton (POST), dans CE navigateur : la destination. */
  async function cliquer(navigateur: Navigateur, lien: string) {
    const get = await GET(new NextRequest(lien));
    const nonce = get.cookies.get(COOKIE_CONFIRMATION)!.value;
    navigateur.set(COOKIE_CONFIRMATION, nonce);
    const page = new URL(get.headers.get("location")!);
    const corps = new URLSearchParams({
      token_hash: page.searchParams.get("token_hash")!,
      type: page.searchParams.get("type")!,
      next: page.searchParams.get("next")!,
      confirmation: nonce,
    });
    const cookie = [...navigateur].map(([k, v]) => `${k}=${v}`).join("; ");
    const r = await POST(
      new NextRequest("https://www.gerimmo.app/auth/confirm", {
        method: "POST",
        body: corps,
        headers: { "content-type": "application/x-www-form-urlencoded", host: "www.gerimmo.app", origin: "https://www.gerimmo.app", "sec-fetch-site": "same-origin", cookie },
      })
    );
    for (const c of r.cookies.getAll()) {
      if (!c.value) navigateur.delete(c.name);
      else navigateur.set(c.name, c.value);
    }
    return new URL(r.headers.get("location")!);
  }

  const ARTISAN = { espace: "artisan", nom: "Martin" };
  const INVITANT = { espace: "proprietaire_direct", nom: "Invitant", code_parrainage: "AAAA1111" };

  beforeEach(() => {
    authSimulee();
  });

  it("l'artisan s'inscrit (V), l'invitant réinscrit l'adresse APRÈS lui (A), l'artisan clique le seul lien valide : ni V ni A n'ouvrent le compte", async () => {
    const chezArtisan: Navigateur = new Map();
    const chezInvitant: Navigateur = new Map();
    expect(await inscrireDepuis(chezArtisan, "mot-de-passe-artisan-V", ARTISAN)).toEqual({ etat: "confirmation_envoyee" });
    const l1 = premierLien();
    expect(await inscrireDepuis(chezInvitant, "mot-de-passe-invitant-A", INVITANT)).toEqual({ etat: "confirmation_envoyee" });
    // L1 est caduc : seul le dernier lien confirme la boîte.
    expect((await cliquer(chezArtisan, l1)).searchParams.get("raison")).toBe("lien-invalide");
    const destination = await cliquer(chezArtisan, dernierLien());
    expect(compte().confirme).toBe(true);
    expect(ouvre("mot-de-passe-invitant-A")).toBe(false);
    expect(ouvre("mot-de-passe-artisan-V")).toBe(false);
    // La personne qui a confirmé choisit maintenant SON mot de passe ; elle repart ensuite où le lien menait.
    expect(destination.pathname).toBe("/nouveau-mot-de-passe");
    expect(destination.searchParams.get("motif")).toBe("inscription");
    expect(destination.searchParams.get("suite")).toBe("/artisan/inscription");
  });

  it("l'invitant inscrit seul l'adresse de l'artisan, qui clique le lien reçu sans s'être inscrit : le mot de passe de l'invitant n'ouvre pas le compte", async () => {
    const chezArtisan: Navigateur = new Map();
    const chezInvitant: Navigateur = new Map();
    await inscrireDepuis(chezInvitant, "mot-de-passe-invitant-A", INVITANT);
    const destination = await cliquer(chezArtisan, dernierLien());
    expect(compte().confirme).toBe(true);
    expect(ouvre("mot-de-passe-invitant-A")).toBe(false);
    expect(destination.pathname).toBe("/nouveau-mot-de-passe");
  });

  it("l'invitant s'inscrit d'abord, l'artisan ensuite et confirme dans SON navigateur : son mot de passe et ses informations, pas ceux de l'invitant", async () => {
    const chezArtisan: Navigateur = new Map();
    const chezInvitant: Navigateur = new Map();
    await inscrireDepuis(chezInvitant, "mot-de-passe-invitant-A", INVITANT);
    await inscrireDepuis(chezArtisan, "mot-de-passe-artisan-V", ARTISAN);
    const destination = await cliquer(chezArtisan, dernierLien());
    expect(destination.pathname).toBe("/artisan/inscription");
    expect(ouvre("mot-de-passe-artisan-V")).toBe(true);
    expect(ouvre("mot-de-passe-invitant-A")).toBe(false);
    // Les informations de la première inscription (espace, nom, code de parrainage) ne survivent pas.
    expect(compte().user_metadata).toEqual(ARTISAN);
    // L'empreinte du témoin ne reste pas dans le compte (ni dans le jeton de session) une fois la boîte confirmée.
    expect(Object.keys(compte().app_metadata).sort()).toEqual(["provider", "providers"]);
  });

  it("le cas ordinaire est inchangé : inscrit et confirmé dans le même navigateur, le compte s'ouvre avec le mot de passe choisi, sans étape de plus", async () => {
    const chezArtisan: Navigateur = new Map();
    await inscrireDepuis(chezArtisan, "mot-de-passe-artisan-V", ARTISAN, "/artisan/invitation/6f1e2d3c-4b5a-4968-8778-695a4b3c2d1e");
    const destination = await cliquer(chezArtisan, dernierLien());
    expect(destination.pathname).toBe("/artisan/invitation/6f1e2d3c-4b5a-4968-8778-695a4b3c2d1e");
    expect(ouvre("mot-de-passe-artisan-V")).toBe(true);
  });

  it("inscrit sur un appareil, confirmé sur un autre : l'adresse est confirmée et la personne choisit son mot de passe", async () => {
    const telephone: Navigateur = new Map();
    const ordinateur: Navigateur = new Map();
    await inscrireDepuis(telephone, "mot-de-passe-artisan-V", ARTISAN);
    const destination = await cliquer(ordinateur, dernierLien());
    expect(compte().confirme).toBe(true);
    expect(destination.pathname).toBe("/nouveau-mot-de-passe");
    expect(ouvre("mot-de-passe-artisan-V")).toBe(false);
  });
});


describe("le témoin d'inscription", () => {
  it("se compare à l'empreinte en temps constant, et refuse l'absence ou une empreinte mal formée", () => {
    const empreinte = empreinteTemoinInscription("temoin");
    expect(temoinInscriptionValide("temoin", empreinte)).toBe(true);
    expect(temoinInscriptionValide("autre", empreinte)).toBe(false);
    expect(temoinInscriptionValide(undefined, empreinte)).toBe(false);
    expect(temoinInscriptionValide("temoin", undefined)).toBe(false);
    expect(temoinInscriptionValide("temoin", "zz")).toBe(false);
    expect(temoinInscriptionValide("temoin", empreinte.toUpperCase())).toBe(false);
  });
});

describe("/nouveau-mot-de-passe après une confirmation d'inscription ouverte ailleurs", () => {
  it("dit que l'adresse est confirmée et pourquoi le mot de passe est demandé ; garde la destination", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "u1", email: "artisan@entreprise.test" } } }) } });
    const { default: Page } = await import("../src/app/nouveau-mot-de-passe/page");
    const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/&#x27;/g, "'");
    const apres = texte(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ motif: "inscription", suite: "/artisan/inscription" }) })));
    expect(apres).toContain("Choisissez votre mot de passe");
    expect(apres).toContain("Votre adresse artisan@entreprise.test est confirmée");
    expect(apres).toContain("ouvert dans un autre navigateur que celui de l'inscription");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ motif: "inscription", suite: "/artisan/inscription" }) }));
    expect(html).toMatch(/name="suite" value="\/artisan\/inscription"/);
    // Sans motif : l'écran ordinaire du mot de passe oublié.
    const ordinaire = texte(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) })));
    expect(ordinaire).toContain("Nouveau mot de passe");
    expect(ordinaire).not.toContain("est confirmée");
  });
});
