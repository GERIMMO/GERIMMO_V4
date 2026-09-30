/**
 * Les liens « créer / choisir mon mot de passe » (incident de production du
 * 30/09/2026).
 *
 * `resetPasswordForEmail` (flux PKCE) fabriquait des liens qui ne marchaient
 * que dans le navigateur de CELUI QUI LES DEMANDAIT : une invitation envoyée
 * par le super admin était morte chez son destinataire. Désormais le jeton
 * vient de l'API d'administration, le lien est le nôtre (token_hash), et il
 * n'est consommé qu'au clic sur un bouton (POST) — jamais à l'ouverture, que
 * les analyseurs de messagerie font à la place du destinataire.
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

import { construireLien, envoyerLienMotDePasse, MESSAGE_TROP_DE_DEMANDES } from "../src/lib/lien-mot-de-passe";
import { GET, POST } from "../src/app/auth/confirm/route";

const EMPREINTE = "a".repeat(56);

function admin(opts: { erreurLien?: string; autorise?: boolean; erreurRpc?: string } = {}) {
  const generateLink = vi.fn(async () =>
    opts.erreurLien
      ? { data: { properties: null, user: null }, error: { message: opts.erreurLien } }
      : { data: { properties: { hashed_token: EMPREINTE, action_link: "https://projet.supabase.co/auth/v1/verify?token=x" }, user: {} }, error: null }
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
    }
  });
});

describe("envoyerLienMotDePasse — invitations", () => {
  it("génère un lien de récupération par l'API d'administration et l'envoie par l'expéditeur du produit", async () => {
    const { generateLink, rpc } = admin();
    const r = await envoyerLienMotDePasse({ email: " Resp@Agence.fr ", motif: "invitation_responsable", next: "/nouveau-mot-de-passe" });
    expect(r).toEqual({});
    expect(generateLink).toHaveBeenCalledWith({ type: "recovery", email: "resp@agence.fr" });
    // Une invitation vient d'un geste autorisé : pas de limite anonyme.
    expect(rpc).not.toHaveBeenCalled();
    const courrier = mocks.envoyerEmail.mock.calls[0][0];
    expect(courrier.to).toBe("resp@agence.fr");
    expect(courrier.subject).toBe("Votre espace Gerimmo est prêt — créez votre mot de passe");
    expect(courrier.html).toContain(`https://www.gerimmo.app/auth/confirm?token_hash=${EMPREINTE}&amp;type=recovery&amp;next=%2Fnouveau-mot-de-passe`);
    expect(courrier.html).toContain("Créer mon mot de passe");
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

describe("/auth/confirm", () => {
  function supabase() {
    const auth = { verifyOtp: vi.fn(async () => ({ error: null })), exchangeCodeForSession: vi.fn(async () => ({ error: null })) };
    mocks.createClient.mockResolvedValue({ auth });
    return auth;
  }

  it("GET avec token_hash ne consomme PAS le jeton : il mène à la page du bouton", async () => {
    const auth = supabase();
    const r = await GET(new NextRequest(`https://www.gerimmo.app/auth/confirm?token_hash=${EMPREINTE}&type=recovery&next=/nouveau-mot-de-passe`));
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    const cible = new URL(r.headers.get("location")!);
    expect(cible.pathname).toBe("/auth/confirmer");
    expect(cible.searchParams.get("token_hash")).toBe(EMPREINTE);
    expect(cible.searchParams.get("type")).toBe("recovery");
    expect(cible.searchParams.get("next")).toBe("/nouveau-mot-de-passe");
  });

  it("GET neutralise une destination externe et un type inconnu", async () => {
    supabase();
    const r = await GET(new NextRequest(`https://www.gerimmo.app/auth/confirm?token_hash=${EMPREINTE}&type=recovery&next=https://pirate.example`));
    expect(new URL(r.headers.get("location")!).searchParams.get("next")).toBe("/espaces");
    const r2 = await GET(new NextRequest(`https://www.gerimmo.app/auth/confirm?token_hash=${EMPREINTE}&type=nimporte`));
    expect(r2.headers.get("location")).toContain("/connexion?raison=lien-invalide");
  });

  it("GET garde les anciens liens ?code= (PKCE) et renvoie vers « lien invalide » s'ils échouent", async () => {
    const auth = supabase();
    const ok = await GET(new NextRequest("https://www.gerimmo.app/auth/confirm?code=abc&next=/nouveau-mot-de-passe"));
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(new URL(ok.headers.get("location")!).pathname).toBe("/nouveau-mot-de-passe");
    auth.exchangeCodeForSession.mockResolvedValueOnce({ error: { message: "code verifier" } } as never);
    const ko = await GET(new NextRequest("https://www.gerimmo.app/auth/confirm?code=abc"));
    expect(ko.headers.get("location")).toContain("/connexion?raison=lien-invalide");
  });

  const post = (champs: Record<string, string>, entetes: Record<string, string> = { origin: "https://www.gerimmo.app", "sec-fetch-site": "same-origin" }) => {
    const corps = new URLSearchParams(champs);
    return new NextRequest("https://www.gerimmo.app/auth/confirm", {
      method: "POST",
      body: corps,
      headers: { "content-type": "application/x-www-form-urlencoded", host: "www.gerimmo.app", ...entetes },
    });
  };

  it("POST vérifie le jeton puis mène à la destination (303)", async () => {
    const auth = supabase();
    const r = await POST(post({ token_hash: EMPREINTE, type: "recovery", next: "/nouveau-mot-de-passe" }));
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: EMPREINTE });
    expect(r.status).toBe(303);
    expect(new URL(r.headers.get("location")!).pathname).toBe("/nouveau-mot-de-passe");
  });

  it("POST d'un jeton mort : « lien invalide »", async () => {
    const auth = supabase();
    auth.verifyOtp.mockResolvedValueOnce({ error: { message: "One-time token not found" } } as never);
    const r = await POST(post({ token_hash: EMPREINTE, type: "recovery", next: "/nouveau-mot-de-passe" }));
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toContain("/connexion?raison=lien-invalide");
  });

  it("POST venu d'un autre site : refusé sans toucher au jeton", async () => {
    const auth = supabase();
    const r = await POST(post({ token_hash: EMPREINTE, type: "recovery" }, { origin: "https://pirate.example", "sec-fetch-site": "cross-site" }));
    expect(r.status).toBe(403);
    const r2 = await POST(post({ token_hash: EMPREINTE, type: "recovery" }, { origin: "https://pirate.example" }));
    expect(r2.status).toBe(403);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
});

describe("POST /auth/confirm — contrôle d'origine (30/09)", () => {
  it("accepte Origin: null (page servie en no-referrer) et Sec-Fetch-Site same-origin", async () => {
    const { requeteMemeOrigine } = await import("@/lib/meme-origine");
    const r = (h: Record<string, string>) => new Request("https://www.gerimmo.app/auth/confirm", { method: "POST", headers: h });
    expect(requeteMemeOrigine(r({ origin: "null" }))).toBe(true);
    expect(requeteMemeOrigine(r({ "sec-fetch-site": "same-origin", origin: "null" }))).toBe(true);
    expect(requeteMemeOrigine(r({ origin: "https://www.gerimmo.app", host: "www.gerimmo.app" }))).toBe(true);
    expect(requeteMemeOrigine(r({ "sec-fetch-site": "cross-site", origin: "null" }))).toBe(false);
    expect(requeteMemeOrigine(r({ origin: "https://evil.example", host: "www.gerimmo.app" }))).toBe(false);
  });
});
