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
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: mocks.service }));
vi.mock("@/lib/email", () => ({ envoyerEmail: mocks.envoyerEmail }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import {
  construireLien,
  envoyerLienMotDePasse,
  inscrireEtEnvoyerConfirmation,
  LIMITE_INVITATIONS_PAR_ORGANISATION,
  MESSAGE_TROP_D_INVITATIONS,
  MESSAGE_TROP_DE_DEMANDES,
} from "../src/lib/lien-mot-de-passe";
import { GET, POST } from "../src/app/auth/confirm/route";
import { COOKIE_CONFIRMATION, jetonConfirmationValide } from "../src/lib/jeton-confirmation";

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
  mocks.service.mockReturnValue({ auth: { admin: { generateLink } }, rpc });
  return { generateLink, rpc };
}

beforeEach(() => {
  vi.resetAllMocks();
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

  it("POST d'une confirmation d'inscription : type signup, destination /espaces", async () => {
    const auth = supabase();
    const r = await POST(post(champs({ type: "signup", next: "/espaces" })));
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: EMPREINTE });
    expect(new URL(r.headers.get("location")!).pathname).toBe("/espaces");
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
