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
  creeParCetAppel,
  destinationApresConfirmation,
  envoyerLienMotDePasse,
  inscrireEtEnvoyerConfirmation,
  metadonneesRemplacees,
  LIMITE_INVITATIONS_PAR_ORGANISATION,
  MESSAGE_TROP_D_INVITATIONS,
  MESSAGE_TROP_DE_DEMANDES,
  premiereConfirmation,
} from "../src/lib/lien-mot-de-passe";
import { GET, POST } from "../src/app/auth/confirm/route";
import { COOKIE_CONFIRMATION, jetonConfirmationValide } from "../src/lib/jeton-confirmation";
import { COOKIE_INSCRIPTION, empreinteTemoinInscription, temoinInscriptionValide } from "../src/lib/temoin-inscription";

const EMPREINTE = "a".repeat(56);
// Comptes rendus par verifyOtp, instants relevés sur GoTrue v2.197.0 (banc du lot, 16/10/2026, vt-regle.log) :
// une confirmation efface TOUS les jetons du compte, donc un lien qui se vérifie a été fabriqué après toute confirmation.
/** Compte déjà confirmé avant la fabrication du lien de récupération (récupération ordinaire). */
const DEJA_CONFIRME = { id: "u1", user_metadata: {}, email_confirmed_at: "2026-10-16T05:38:26.636227Z", recovery_sent_at: "2026-10-16T05:38:26.714606Z" };
/** Compte jamais confirmé (créé par le /signup public), confirmé par CE clic sur un lien de récupération. */
const CONFIRME_PAR_CE_CLIC = {
  id: "u2",
  user_metadata: {},
  confirmation_sent_at: "2026-10-16T05:38:25.7583Z",
  recovery_sent_at: "2026-10-16T05:38:25.828731Z",
  email_confirmed_at: "2026-10-16T05:38:25.880904Z",
};
const ORG = "11111111-1111-4111-8111-111111111111";

type ReponseLien = {
  data: { properties: { hashed_token: string; action_link: string } | null; user: Record<string, unknown> | null };
  error: { message: string; code?: string; status?: number } | null;
};

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
  // Doublure de `auth.admin.updateUserById` : le repli « fermé par défaut » de la confirmation faite ailleurs. Jamais
  // appelée sur le chemin ordinaire (contre-relecture finale du 15/10/2026 : elle fermerait la session du bouton).
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

/**
 * Contre-relecture finale du 15/10/2026, prouvée sur GoTrue v2.197.0 : tout changement de mot de passe par l'API
 * d'administration (`UpdatePassword`) vide le jeton de confirmation, efface les jetons à usage unique et ferme les
 * sessions. Poser le mot de passe APRÈS `generateLink` tuait le lien envoyé, pour TOUTE inscription. D'où l'ordre :
 * recherche du compte (lien de récupération : « introuvable » pour une adresse neuve), puis soit la création seule
 * (aucun `updateUserById`), soit, pour une adresse pré-inscrite, le mot de passe AVANT le lien envoyé.
 */
describe("inscrireEtEnvoyerConfirmation — l'inscription (audit 30/09, H1/H2 ; contre-relecture finale du 15/10)", () => {
  const metadonnees = { nom: "Martin", prenom: "Camille", espace: "proprietaire_direct", cgu_version: "2026-09" };
  const inscrire = (email = "Camille@Exemple.fr") =>
    inscrireEtEnvoyerConfirmation({ email, motDePasse: "un-mot-de-passe-long", metadonnees, next: "/espaces" });
  const JETON_RECUPERATION = "b".repeat(56);
  /** Les instants qu'Auth rend : un compte créé par l'appel est postérieur à l'envoi relevé avant sa création. */
  const CREE_PAR_L_APPEL = { created_at: "2026-10-15T10:00:00.114601Z", confirmation_sent_at: "2026-10-15T10:00:00.015460852Z" };
  const EXISTAIT_DEJA = { created_at: "2026-10-14T08:00:00.114601Z", confirmation_sent_at: "2026-10-15T10:00:00.015460852Z" };
  type Erreur = { message: string; code?: string; status?: number };
  const introuvable: Erreur = { message: "User with this email not found", code: "user_not_found", status: 404 };

  /** Auth doublée selon ses règles : la recherche (recovery) dit si le compte existe ; signup crée ou renouvelle. */
  function auth(opts: { compte?: "aucun" | "non_confirme" | "confirme"; metadonneesExistantes?: Record<string, unknown>; autorise?: boolean } = {}) {
    const compte = opts.compte ?? "aucun";
    const existant = {
      id: "u-pre-inscrit",
      email_confirmed_at: compte === "confirme" ? "2026-09-30T10:00:00Z" : null,
      user_metadata: opts.metadonneesExistantes ?? { espace: "artisan", sub: "u-pre-inscrit", email_verified: false },
    };
    const generateLink = vi.fn(async (p: { type: string }): Promise<ReponseLien> => {
      if (p.type === "recovery") {
        if (compte === "aucun") return { data: { properties: null, user: null }, error: introuvable };
        return { data: { properties: { hashed_token: JETON_RECUPERATION, action_link: "x" }, user: existant }, error: null };
      }
      const user = compte === "aucun" ? { id: "u-neuf", email_confirmed_at: null, ...CREE_PAR_L_APPEL } : { ...existant, ...EXISTAIT_DEJA };
      return { data: { properties: { hashed_token: EMPREINTE, action_link: "x" }, user }, error: null };
    });
    const rpc = vi.fn(async () => ({ data: opts.autorise ?? true, error: null }));
    const updateUserById = vi.fn(
      async (id: string, _attributs: Record<string, unknown>): Promise<{ data: { user: Record<string, unknown> | null }; error: Erreur | null }> =>
        ({ data: { user: { id } }, error: null })
    );
    mocks.service.mockReturnValue({ auth: { admin: { generateLink, updateUserById } }, rpc });
    return { generateLink, rpc, updateUserById };
  }
  const ordre = (f: { mock: { invocationCallOrder: number[] } }, n = 0) => f.mock.invocationCallOrder[n];

  it("adresse neuve : recherche, puis création par generateLink signup (métadonnées et empreinte du témoin) ; NOTRE lien part", async () => {
    const { generateLink, rpc, updateUserById } = auth();
    expect(await inscrire()).toEqual({ etat: "confirmation_envoyee" });
    // Demande anonyme : la limite d'abord.
    expect(rpc).toHaveBeenCalledWith("autoriser_lien_mot_de_passe", { p_email: "camille@exemple.fr", p_ip: "203.0.113.7" });
    expect(generateLink).toHaveBeenCalledTimes(2);
    expect(generateLink.mock.calls[0]).toEqual([{ type: "recovery", email: "camille@exemple.fr" }]);
    const creation = generateLink.mock.calls[1][0] as unknown as { type: string; email: string; password: string; options: { data: Record<string, unknown> } };
    expect(creation).toMatchObject({ type: "signup", email: "camille@exemple.fr", password: "un-mot-de-passe-long" });
    const { empreinte_inscription: empreinte, ...donnees } = creation.options.data;
    expect(donnees).toEqual(metadonnees);
    expect(empreinte).toMatch(/^[0-9a-f]{64}$/);
    // Aucun appel d'administration après la création : il effacerait le jeton du lien (règle d'Auth).
    expect(updateUserById).not.toHaveBeenCalled();
    // Le témoin, en cookie httpOnly limité à /auth, dont l'empreinte est celle gardée dans le compte.
    const [nom, temoin, options] = jarre.set.mock.calls[0];
    expect(nom).toBe(COOKIE_INSCRIPTION);
    expect(empreinteTemoinInscription(temoin)).toBe(empreinte);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/auth" });
    const courrier = mocks.envoyerEmail.mock.calls[0][0];
    expect(courrier.to).toBe("camille@exemple.fr");
    expect(courrier.subject).toBe("Confirmez votre adresse — Gerimmo");
    expect(courrier.html).toContain(`https://www.gerimmo.app/auth/confirm?token_hash=${EMPREINTE}&amp;type=signup&amp;next=%2Fespaces`);
    expect(courrier.html).toContain("Confirmer mon adresse");
    expect(courrier.html).toContain("aucun compte ne sera ouvert");
    expect(courrier.html).not.toContain("Mot de passe oublié");
    expect(courrier.html).not.toContain("supabase.co");
    expect(ordre(jarre.set)).toBeLessThan(ordre(mocks.envoyerEmail));
  });

  it("adresse déjà confirmée : le lien de la recherche part à son titulaire (reconnexion), sans création ; la limite n'est comptée qu'une fois", async () => {
    const { generateLink, rpc, updateUserById } = auth({ compte: "confirme" });
    expect(await inscrire()).toEqual({ etat: "compte_existant" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(generateLink).toHaveBeenCalledTimes(1);
    expect(generateLink).toHaveBeenCalledWith({ type: "recovery", email: "camille@exemple.fr" });
    expect(updateUserById).not.toHaveBeenCalled();
    const courrier = mocks.envoyerEmail.mock.calls[0][0];
    expect(courrier.subject).toBe("Vous avez déjà un compte Gerimmo");
    expect(courrier.html).toContain(`token_hash=${JETON_RECUPERATION}&amp;type=recovery`);
    expect(courrier.html).toContain("next=%2Fnouveau-mot-de-passe");
    expect(jarre.set).not.toHaveBeenCalled();
  });

  it("adresse confirmée entre la recherche et la création (email_exists, ancien libellé compris) : même réponse, lien de reconnexion", async () => {
    for (const erreur of [
      { code: "email_exists", message: "A user with this email address has already been registered" },
      { code: "user_already_exists", message: "User already registered" },
    ]) {
      vi.clearAllMocks();
      const { generateLink } = auth();
      generateLink
        .mockResolvedValueOnce({ data: { properties: null, user: null }, error: introuvable })
        .mockResolvedValueOnce({ data: { properties: null, user: null }, error: erreur })
        .mockResolvedValueOnce({ data: { properties: { hashed_token: JETON_RECUPERATION, action_link: "x" }, user: { id: "u1" } }, error: null });
      expect(await inscrire()).toEqual({ etat: "compte_existant" });
      expect(generateLink).toHaveBeenLastCalledWith({ type: "recovery", email: "camille@exemple.fr" });
      expect(mocks.envoyerEmail.mock.calls[0][0].subject).toBe("Vous avez déjà un compte Gerimmo");
    }
  });

  it("compte existant : si le lien de reconnexion ne peut pas être fabriqué, la réponse reste la même, sans courrier", async () => {
    const { generateLink } = auth();
    generateLink
      .mockResolvedValueOnce({ data: { properties: null, user: null }, error: introuvable })
      .mockResolvedValueOnce({ data: { properties: null, user: null }, error: { code: "email_exists", message: "already registered" } })
      .mockResolvedValueOnce({ data: { properties: null, user: null }, error: { message: "panne" } });
    expect(await inscrire()).toEqual({ etat: "compte_existant" });
    expect(mocks.envoyerEmail).not.toHaveBeenCalled();
  });

  it("recherche impossible (Auth en panne) : rien n'est créé, rien ne part", async () => {
    const { generateLink } = auth();
    generateLink.mockResolvedValueOnce({ data: { properties: null, user: null }, error: { message: "Database error finding user", code: "unexpected_failure", status: 500 } });
    expect(await inscrire()).toEqual({ erreur: "Le service est momentanément indisponible. Réessayez dans un instant." });
    expect(generateLink).toHaveBeenCalledTimes(1);
    expect(mocks.envoyerEmail).not.toHaveBeenCalled();
  });

  /**
   * Relecture du 15/10/2026 (invitation d'artisan, compte pré-inscrit). Pour une adresse inscrite mais jamais confirmée,
   * Auth renouvelle le jeton et GARDE le mot de passe de la première inscription. Le mot de passe, les informations et
   * l'empreinte de CETTE inscription sont posés en UNE opération AVANT la demande du lien envoyé (qui, lui, vit).
   */
  it("compte non confirmé : mot de passe, informations et empreinte posés en une opération AVANT le lien envoyé, demandé sans l'empreinte", async () => {
    const { generateLink, updateUserById } = auth({
      compte: "non_confirme",
      metadonneesExistantes: { espace: "artisan", code_parrainage: "AAAA1111", empreinte_inscription: "c".repeat(64), sub: "u-pre-inscrit", email_verified: false },
    });
    expect(await inscrire()).toEqual({ etat: "confirmation_envoyee" });
    expect(updateUserById).toHaveBeenCalledTimes(1);
    const [id, attributs] = updateUserById.mock.calls[0];
    expect(id).toBe("u-pre-inscrit");
    expect(attributs.password).toBe("un-mot-de-passe-long");
    const { empreinte_inscription: empreinte, ...informations } = attributs.user_metadata as Record<string, unknown>;
    // Les informations de cette inscription remplacent celles d'avant (les clés d'Auth restent).
    expect(informations).toEqual({ ...metadonnees, code_parrainage: null });
    expect(empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinte).not.toBe("c".repeat(64));
    expect(attributs).not.toHaveProperty("app_metadata");
    // Ordre : recherche, couple (mot de passe, empreinte), PUIS le lien envoyé, témoin, courrier.
    expect(generateLink.mock.calls.map((c) => (c[0] as { type: string }).type)).toEqual(["recovery", "signup"]);
    expect(generateLink.mock.calls[1][0]).toEqual({ type: "signup", email: "camille@exemple.fr", password: "un-mot-de-passe-long", options: { data: metadonnees } });
    expect(ordre(updateUserById)).toBeLessThan(ordre(generateLink, 1));
    expect(ordre(generateLink, 1)).toBeLessThan(ordre(jarre.set));
    expect(ordre(jarre.set)).toBeLessThan(ordre(mocks.envoyerEmail));
    expect(empreinteTemoinInscription(jarre.set.mock.calls[0][1])).toBe(empreinte);
    expect(mocks.envoyerEmail.mock.calls[0][0].html).toContain(`token_hash=${EMPREINTE}&amp;type=signup`);
  });

  it("course à la création : la recherche ne trouvait rien, mais le compte rendu par signup existait déjà ; il est traité comme pré-inscrit", async () => {
    const { generateLink, updateUserById } = auth();
    generateLink
      .mockResolvedValueOnce({ data: { properties: null, user: null }, error: introuvable })
      .mockResolvedValueOnce({ data: { properties: { hashed_token: "jeton-du-tiers-recouvert", action_link: "x" }, user: { id: "u-tiers", email_confirmed_at: null, user_metadata: { nom: "Invitant" }, ...EXISTAIT_DEJA } }, error: null });
    expect(await inscrire()).toEqual({ etat: "confirmation_envoyee" });
    expect(updateUserById).toHaveBeenCalledTimes(1);
    expect(updateUserById.mock.calls[0][0]).toBe("u-tiers");
    expect(updateUserById.mock.calls[0][1]).toMatchObject({ password: "un-mot-de-passe-long" });
    expect(generateLink).toHaveBeenCalledTimes(3);
    expect(ordre(updateUserById)).toBeLessThan(ordre(generateLink, 2));
    const html = mocks.envoyerEmail.mock.calls[0][0].html as string;
    expect(html).not.toContain("jeton-du-tiers-recouvert");
    expect(html).toContain(`token_hash=${EMPREINTE}`);
  });

  it("garde de la course : seul un compte postérieur à l'envoi relevé par Auth est « créé par cet appel » ; le doute vaut « non »", () => {
    expect(creeParCetAppel(CREE_PAR_L_APPEL)).toBe(true);
    expect(creeParCetAppel(EXISTAIT_DEJA)).toBe(false);
    // À la microseconde : 2 µs d'écart suffisent, l'égalité ne suffit pas.
    expect(creeParCetAppel({ created_at: "2026-10-15T10:00:00.000002Z", confirmation_sent_at: "2026-10-15T10:00:00.000001999Z" })).toBe(true);
    expect(creeParCetAppel({ created_at: "2026-10-15T10:00:00.000001Z", confirmation_sent_at: "2026-10-15T10:00:00.000001Z" })).toBe(false);
    expect(creeParCetAppel({ created_at: "2026-10-15T12:00:00.5+02:00", confirmation_sent_at: "2026-10-15T10:00:00.4Z" })).toBe(true);
    expect(creeParCetAppel({ created_at: "2026-10-15T10:00:00Z" })).toBe(false);
    expect(creeParCetAppel({ created_at: "hier", confirmation_sent_at: "2026-10-15T10:00:00Z" })).toBe(false);
    expect(creeParCetAppel(null)).toBe(false);
  });

  it("compte non confirmé : si le couple ne peut pas être posé, aucun lien n'est demandé et rien ne part", async () => {
    const { generateLink, updateUserById } = auth({ compte: "non_confirme" });
    updateUserById.mockResolvedValueOnce({ data: { user: null }, error: { message: "Database error updating user", code: "unexpected_failure" } });
    expect(await inscrire()).toEqual({ erreur: "Le service est momentanément indisponible. Réessayez dans un instant." });
    expect(generateLink).toHaveBeenCalledTimes(1);
    expect(mocks.envoyerEmail).not.toHaveBeenCalled();
    expect(jarre.set).not.toHaveBeenCalled();
  });

  it("compte non confirmé : un nouveau mot de passe refusé par Auth garde son code (classé « mot de passe refusé »), sans courrier", async () => {
    const { updateUserById } = auth({ compte: "non_confirme" });
    updateUserById.mockResolvedValueOnce({ data: { user: null }, error: { message: "Password is too weak", code: "weak_password" } });
    expect(await inscrire()).toEqual({ erreur: "Password is too weak", code: "weak_password" });
    expect(mocks.envoyerEmail).not.toHaveBeenCalled();
  });

  it("sans cookie posable, le lien part quand même : la confirmation fera choisir le mot de passe", async () => {
    auth();
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

  it("projet sans confirmation d'adresse : dit que le compte est déjà confirmé, sans courrier ni appel d'administration", async () => {
    const { generateLink, updateUserById } = auth();
    generateLink
      .mockResolvedValueOnce({ data: { properties: null, user: null }, error: introuvable })
      .mockResolvedValueOnce({ data: { properties: { hashed_token: EMPREINTE, action_link: "x" }, user: { id: "u1", email_confirmed_at: "2026-09-30T10:00:00Z", ...CREE_PAR_L_APPEL } }, error: null });
    expect(await inscrire()).toEqual({ etat: "deja_confirme" });
    expect(mocks.envoyerEmail).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("remonte le code d'un mot de passe refusé à la création, sans courrier", async () => {
    const { generateLink } = auth();
    generateLink
      .mockResolvedValueOnce({ data: { properties: null, user: null }, error: introuvable })
      .mockResolvedValueOnce({ data: { properties: null, user: null }, error: { message: "Password is too weak", code: "weak_password" } });
    expect(await inscrire()).toEqual({ erreur: "Password is too weak", code: "weak_password" });
    expect(mocks.envoyerEmail).not.toHaveBeenCalled();
  });

  it("applique la limite anonyme avant toute recherche ou création de compte", async () => {
    const { generateLink } = auth({ autorise: false });
    expect(await inscrire()).toEqual({ erreur: MESSAGE_TROP_DE_DEMANDES, limite: true });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("remonte l'échec de l'e-mail : l'inscrit doit savoir qu'il n'a rien reçu", async () => {
    auth();
    mocks.envoyerEmail.mockResolvedValue({ erreur: "Le service d’e-mail a refusé l’envoi." });
    expect(await inscrire()).toEqual({ erreur: "Le service d’e-mail a refusé l’envoi." });
  });

  it("dit que l'envoi n'est pas configuré sans clé de service ou sans adresse du site", async () => {
    mocks.service.mockReturnValue(null);
    expect((await inscrire()) as { erreur?: string }).toMatchObject({ erreur: expect.stringMatching(/pas configuré/) });
    auth();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect((await inscrire()) as { erreur?: string }).toMatchObject({ erreur: expect.stringMatching(/pas configuré/) });
  });
});

describe("/auth/confirm", () => {
  function supabase() {
    const auth = {
      // Par défaut : un compte déjà confirmé, comme le rend Auth (récupération ordinaire).
      verifyOtp: vi.fn(async () => ({ data: { user: DEJA_CONFIRME }, error: null })),
      exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      // La session que verifyOtp vient d'ouvrir (contre-relecture finale : c'est elle qui pose le mot de passe provisoire).
      updateUser: vi.fn(async (_attributs: Record<string, unknown>) => ({ data: { user: null }, error: null })),
      signOut: vi.fn(async (_options: Record<string, unknown>) => ({ error: null })),
    };
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

  it("POST d'une confirmation d'inscription dans le navigateur de l'inscription : destination prévue, empreinte effacée PAR LA SESSION, témoin effacé", async () => {
    const auth = supabase();
    const temoin = "temoin-de-l-inscription";
    const { updateUserById } = admin();
    auth.verifyOtp.mockResolvedValueOnce({
      data: { user: { id: "u1", user_metadata: { espace: "proprietaire_direct", empreinte_inscription: empreinteTemoinInscription(temoin) } } },
      error: null,
    } as never);
    const requete = post(champs({ type: "signup", next: "/espaces" }), undefined, `${NONCE}; ${COOKIE_INSCRIPTION}=${temoin}`);
    const r = await POST(requete);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: EMPREINTE });
    expect(new URL(r.headers.get("location")!).pathname).toBe("/espaces");
    // Le mot de passe choisi à l'inscription est gardé ; seule l'empreinte est effacée, par la session (métadonnées).
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { empreinte_inscription: null } });
    // Jamais l'API d'administration : elle fermerait la session que le bouton vient d'ouvrir (règle d'Auth).
    expect(updateUserById).not.toHaveBeenCalled();
    expect(cookieDe(r)).toMatch(new RegExp(`${COOKIE_INSCRIPTION}=;.*Max-Age=0`));
  });

  it("POST d'une confirmation d'inscription hors du navigateur de l'inscription : mot de passe inconnu posé PAR LA SESSION, puis choix du mot de passe", async () => {
    const auth = supabase();
    const { updateUserById } = admin();
    auth.verifyOtp.mockResolvedValue({
      data: { user: { id: "u1", user_metadata: { empreinte_inscription: empreinteTemoinInscription("temoin-d-un-autre-navigateur") } } },
      error: null,
    } as never);
    for (const cookie of [NONCE, `${NONCE}; ${COOKIE_INSCRIPTION}=temoin-de-ce-navigateur`]) {
      auth.updateUser.mockClear();
      const r = await POST(post(champs({ type: "signup", next: "/artisan/inscription?invitation=6f1e2d3c-4b5a-4968-8778-695a4b3c2d1e" }), undefined, cookie));
      const cible = new URL(r.headers.get("location")!);
      expect(cible.pathname).toBe("/nouveau-mot-de-passe");
      expect(cible.searchParams.get("motif")).toBe("inscription");
      expect(cible.searchParams.get("suite")).toBe("/artisan/inscription?invitation=6f1e2d3c-4b5a-4968-8778-695a4b3c2d1e");
      expect(auth.updateUser).toHaveBeenCalledTimes(1);
      const [attributs] = auth.updateUser.mock.calls[0] as unknown as [{ password: string; data: Record<string, unknown> }];
      expect(attributs.data).toEqual({ empreinte_inscription: null });
      expect(attributs.password).toMatch(/^Aa1!-[A-Za-z0-9_-]{60,}$/);
      expect(attributs.password.length).toBeLessThanOrEqual(72);
      expect(auth.signOut).not.toHaveBeenCalled();
    }
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("POST hors du navigateur de l'inscription, la session ne peut pas poser le mot de passe : fermé par défaut (administration, déconnexion), nouvelle demande de lien", async () => {
    const auth = supabase();
    const { updateUserById } = admin();
    auth.verifyOtp.mockResolvedValueOnce({ data: { user: { id: "u1", user_metadata: {} } }, error: null } as never);
    auth.updateUser.mockResolvedValueOnce({ error: { message: "Internal Server Error", code: "unexpected_failure" } } as never);
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await POST(post(champs({ type: "signup", next: "/espaces" })));
    erreur.mockRestore();
    const cible = new URL(r.headers.get("location")!);
    expect(cible.pathname).toBe("/mot-de-passe-oublie");
    expect(cible.searchParams.get("raison")).toBe("adresse-confirmee");
    expect(updateUserById).toHaveBeenCalledTimes(1);
    const [id, attributs] = updateUserById.mock.calls[0];
    expect(id).toBe("u1");
    expect(String(attributs.password)).toMatch(/^Aa1!-[A-Za-z0-9_-]{60,}$/);
    expect(attributs.user_metadata).toEqual({ empreinte_inscription: null });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(cookieDe(r)).toMatch(new RegExp(`${COOKIE_INSCRIPTION}=;.*Max-Age=0`));
  });

  it("POST d'un lien de mot de passe (recovery) d'un compte DÉJÀ confirmé, sans inscription en cours : aucune vérification de témoin, rien n'est modifié dans le compte", async () => {
    const auth = supabase();
    const { updateUserById } = admin();
    auth.verifyOtp.mockResolvedValueOnce({ data: { user: { ...DEJA_CONFIRME, user_metadata: { espace: "proprietaire_direct" } } }, error: null } as never);
    const r = await POST(post(champs(), undefined, `${NONCE}; ${COOKIE_INSCRIPTION}=temoin-de-ce-navigateur`));
    expect(new URL(r.headers.get("location")!).pathname).toBe("/nouveau-mot-de-passe");
    expect(updateUserById).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(cookieDe(r)).not.toContain(COOKIE_INSCRIPTION);
  });

  // Constat P13 (relecture de non-régression du 15/10/2026, prouvé sur GoTrue v2.197.0) : Auth confirme l'adresse d'un
  // compte non confirmé en vérifiant AUSSI un lien de récupération (et un lien de connexion). Un compte pré-inscrit par un
  // tiers, puis « mot de passe oublié » cliqué par le titulaire qui ne va pas au bout, gardait le mot de passe du tiers.
  it("POST d'un lien de mot de passe (recovery) ou de connexion (magiclink, email) sur une inscription pas finie, hors de son navigateur : même règle qu'une confirmation, mot de passe inconnu posé PAR LA SESSION", async () => {
    for (const [type, next, attendu] of [
      // Quatrième relecture : le choix du mot de passe dit pourquoi (motif « confirmation »), la suite est gardée.
      ["recovery", "/nouveau-mot-de-passe", "/nouveau-mot-de-passe?motif=confirmation"],
      ["recovery", "/nouveau-mot-de-passe?suite=%2Finvitations%2Fabc", "/nouveau-mot-de-passe?suite=%2Finvitations%2Fabc&motif=confirmation"],
      ["magiclink", "/espaces", "/nouveau-mot-de-passe?motif=confirmation&suite=%2Fespaces"],
      ["email", "/espaces", "/nouveau-mot-de-passe?motif=confirmation&suite=%2Fespaces"],
    ] as const) {
      const auth = supabase();
      const { updateUserById } = admin();
      auth.verifyOtp.mockResolvedValueOnce({
        data: { user: { id: "u1", user_metadata: { espace: "artisan", empreinte_inscription: empreinteTemoinInscription("temoin-du-tiers") } } },
        error: null,
      } as never);
      const r = await POST(post(champs({ type, next }), undefined, `${NONCE}; ${COOKIE_INSCRIPTION}=temoin-de-ce-navigateur`));
      const cible = new URL(r.headers.get("location")!);
      expect(cible.pathname + cible.search).toBe(attendu);
      expect(auth.updateUser).toHaveBeenCalledTimes(1);
      const [attributs] = auth.updateUser.mock.calls[0] as unknown as [{ password: string; data: Record<string, unknown> }];
      expect(attributs.data).toEqual({ empreinte_inscription: null });
      expect(attributs.password).toMatch(/^Aa1!-[A-Za-z0-9_-]{60,}$/);
      expect(auth.signOut).not.toHaveBeenCalled();
      expect(updateUserById).not.toHaveBeenCalled();
      expect(cookieDe(r)).toMatch(new RegExp(`${COOKIE_INSCRIPTION}=;.*Max-Age=0`));
    }
  });

  it("POST d'un lien de mot de passe (recovery) sur une inscription pas finie, DANS son navigateur : le mot de passe d'inscription est gardé, l'empreinte effacée par la session", async () => {
    const auth = supabase();
    const temoin = "temoin-de-l-inscription";
    const { updateUserById } = admin();
    auth.verifyOtp.mockResolvedValueOnce({
      data: { user: { id: "u1", user_metadata: { empreinte_inscription: empreinteTemoinInscription(temoin) } } },
      error: null,
    } as never);
    const r = await POST(post(champs(), undefined, `${NONCE}; ${COOKIE_INSCRIPTION}=${temoin}`));
    expect(new URL(r.headers.get("location")!).pathname).toBe("/nouveau-mot-de-passe");
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { empreinte_inscription: null } });
    expect(updateUserById).not.toHaveBeenCalled();
    expect(cookieDe(r)).toMatch(new RegExp(`${COOKIE_INSCRIPTION}=;.*Max-Age=0`));
  });

  it("POST d'un lien de mot de passe (recovery) sur une inscription pas finie, la session ne peut pas poser le mot de passe : fermé par défaut, nouvelle demande de lien", async () => {
    const auth = supabase();
    const { updateUserById } = admin();
    auth.verifyOtp.mockResolvedValueOnce({
      data: { user: { id: "u1", user_metadata: { empreinte_inscription: empreinteTemoinInscription("temoin-du-tiers") } } },
      error: null,
    } as never);
    auth.updateUser.mockResolvedValueOnce({ error: { message: "Internal Server Error", code: "unexpected_failure" } } as never);
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await POST(post(champs()));
    erreur.mockRestore();
    const cible = new URL(r.headers.get("location")!);
    expect(cible.pathname).toBe("/mot-de-passe-oublie");
    expect(cible.searchParams.get("raison")).toBe("adresse-confirmee");
    expect(updateUserById).toHaveBeenCalledTimes(1);
    expect(updateUserById.mock.calls[0][1].user_metadata).toEqual({ empreinte_inscription: null });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  // Quatrième relecture (16/10/2026, prouvé sur GoTrue v2.197.0) : un tiers crée un compte NON confirmé par le /signup
  // public d'Auth (clé publique seule), donc SANS empreinte de Gerimmo, puis le titulaire de l'adresse clique un lien :
  // Auth confirme l'adresse au passage. La règle vaut pour tout lien qui confirme une adresse jusque-là non confirmée.
  it("POST d'un lien qui vient de confirmer un compte sans empreinte (récupération, invitation de locataire, connexion, confirmation envoyée par Auth) : mot de passe inconnu posé PAR LA SESSION, choix du mot de passe avec le motif « confirmation »", async () => {
    for (const [type, next, attendu] of [
      ["recovery", "/nouveau-mot-de-passe", "/nouveau-mot-de-passe?motif=confirmation"],
      ["recovery", "/nouveau-mot-de-passe?suite=%2Finvitations%2Fabc", "/nouveau-mot-de-passe?suite=%2Finvitations%2Fabc&motif=confirmation"],
      ["magiclink", "/espaces", "/nouveau-mot-de-passe?motif=confirmation&suite=%2Fespaces"],
      ["signup", "/espaces", "/nouveau-mot-de-passe?motif=confirmation&suite=%2Fespaces"],
    ] as const) {
      const auth = supabase();
      const { updateUserById } = admin();
      auth.verifyOtp.mockResolvedValueOnce({ data: { user: CONFIRME_PAR_CE_CLIC }, error: null } as never);
      // Un témoin présent dans ce navigateur (autre inscription) ne change rien : le compte ne porte aucune empreinte.
      const r = await POST(post(champs({ type, next }), undefined, `${NONCE}; ${COOKIE_INSCRIPTION}=temoin-de-ce-navigateur`));
      const cible = new URL(r.headers.get("location")!);
      expect(cible.pathname + cible.search, type).toBe(attendu);
      expect(auth.updateUser).toHaveBeenCalledTimes(1);
      const [attributs] = auth.updateUser.mock.calls[0] as unknown as [{ password: string; data: Record<string, unknown> }];
      expect(attributs.password).toMatch(/^Aa1!-[A-Za-z0-9_-]{60,}$/);
      expect(auth.signOut).not.toHaveBeenCalled();
      expect(updateUserById).not.toHaveBeenCalled();
    }
  });

  it("POST d'un lien de récupération sur un compte confirmé AVANT la fabrication du lien : rien n'est changé, la destination est gardée (récupération ordinaire)", async () => {
    const auth = supabase();
    const { updateUserById } = admin();
    auth.verifyOtp.mockResolvedValueOnce({ data: { user: DEJA_CONFIRME }, error: null } as never);
    const r = await POST(post(champs({ next: "/nouveau-mot-de-passe?suite=%2Finvitations%2Fabc" })));
    const cible = new URL(r.headers.get("location")!);
    expect(cible.pathname + cible.search).toBe("/nouveau-mot-de-passe?suite=%2Finvitations%2Fabc");
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("POST : un doute sur les instants d'Auth (absents, illisibles, ou aucun compte rendu) vaut « confirmé par ce clic » : fermé par défaut", async () => {
    for (const user of [{ id: "u1", user_metadata: {} }, { ...DEJA_CONFIRME, recovery_sent_at: "hier" }, undefined]) {
      const auth = supabase();
      admin();
      auth.verifyOtp.mockResolvedValueOnce({ data: { user }, error: null } as never);
      const r = await POST(post(champs()));
      expect(new URL(r.headers.get("location")!).searchParams.get("motif")).toBe("confirmation");
      expect(auth.updateUser).toHaveBeenCalledTimes(1);
    }
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
 * Troisième relecture du 15/10/2026 (constat « compte pré-inscrit », deux relecteurs), puis contre-relecture finale.
 * Si l'invitant (qui connaît l'adresse) inscrit l'adresse de l'artisan avant ou après lui, aucun mot de passe choisi par
 * un autre que la personne qui confirme ne doit ouvrir le compte ; et le lien envoyé doit VIVRE.
 *
 * Ici, Auth est SIMULÉE avec ses règles réelles (GoTrue v2.197.0 ; les mêmes scénarios sont prouvés contre ce GoTrue,
 * hors dépôt, dans le dossier de preuves du lot) :
 *  - `generateLink` recovery : « introuvable » pour une adresse sans compte ; sinon un jeton de récupération.
 *  - `generateLink` signup : crée le compte (mot de passe, `data`) ; pour un compte non confirmé, renouvelle le jeton (le
 *    lien précédent meurt), fusionne `data` (une valeur nulle efface la clé) et GARDE le mot de passe ; `email_exists`
 *    pour un compte confirmé. Un compte créé par l'appel est postérieur à son `confirmation_sent_at`.
 *  - `updateUserById` : fusionne les métadonnées ; un mot de passe (UpdatePassword) vide les jetons et ferme TOUTES les
 *    sessions du compte.
 *  - `verifyOtp` : confirme l'adresse, consomme le jeton et ouvre une session (cookie du navigateur).
 *  - `updateUser` (la session) : fusionne les métadonnées ; un mot de passe vide les jetons et ferme toutes les AUTRES
 *    sessions, celle qui parle survit. `getUser` exige une session vivante.
 * Chaque personne a son navigateur (ses cookies). Les liens sont ceux des courriels envoyés, cliqués par GET puis POST.
 */
describe("premiereConfirmation : ce clic vient-il de confirmer l'adresse ? (règle d'Auth : une confirmation efface tous les jetons)", () => {
  it("inscription et invitation : toujours (un tel jeton n'existe que sur un compte non confirmé)", () => {
    expect(premiereConfirmation("signup", DEJA_CONFIRME)).toBe(true);
    expect(premiereConfirmation("invite", undefined)).toBe(true);
  });
  it("récupération et connexion : confirmé après la fabrication du lien → oui ; avant → non", () => {
    expect(premiereConfirmation("recovery", CONFIRME_PAR_CE_CLIC)).toBe(true);
    expect(premiereConfirmation("magiclink", CONFIRME_PAR_CE_CLIC)).toBe(true);
    expect(premiereConfirmation("recovery", DEJA_CONFIRME)).toBe(false);
    expect(premiereConfirmation("magiclink", DEJA_CONFIRME)).toBe(false);
    // Égalité à la microseconde : le doute vaut « oui ».
    expect(premiereConfirmation("recovery", { email_confirmed_at: "2026-10-16T05:00:00.000001Z", recovery_sent_at: "2026-10-16T05:00:00.000001Z" })).toBe(true);
    // Fuseau exprimé autrement : même instant lu.
    expect(premiereConfirmation("recovery", { email_confirmed_at: "2026-10-16T07:00:00.5+02:00", recovery_sent_at: "2026-10-16T05:00:00.6Z" })).toBe(false);
  });
  it("lien « email » : comparé au plus ancien des envois connus", () => {
    expect(premiereConfirmation("email", CONFIRME_PAR_CE_CLIC)).toBe(true);
    expect(premiereConfirmation("email", DEJA_CONFIRME)).toBe(false);
    expect(premiereConfirmation("email", { email_confirmed_at: "2026-10-16T05:00:01Z", confirmation_sent_at: "2026-10-16T05:00:00Z", recovery_sent_at: "2026-10-16T05:00:02Z" })).toBe(true);
  });
  it("changement d'adresse : non (il ne confirme pas un compte)", () => {
    expect(premiereConfirmation("email_change", CONFIRME_PAR_CE_CLIC)).toBe(false);
  });
  it("doute : instant absent ou illisible, compte absent → oui (le mot de passe est remplacé, jamais gardé)", () => {
    expect(premiereConfirmation("recovery", { email_confirmed_at: "2026-10-16T05:00:00Z" })).toBe(true);
    expect(premiereConfirmation("recovery", { recovery_sent_at: "2026-10-16T05:00:00Z" })).toBe(true);
    expect(premiereConfirmation("recovery", { email_confirmed_at: "hier", recovery_sent_at: "2026-10-16T05:00:00Z" })).toBe(true);
    expect(premiereConfirmation("recovery", null)).toBe(true);
  });
});

describe("destinationApresConfirmation", () => {
  it("même navigateur : la destination prévue ; ailleurs : le choix du mot de passe et son motif ; refus d'Auth : nouvelle demande de lien", () => {
    expect(destinationApresConfirmation("meme_navigateur", "signup", "/artisan/inscription", true)).toBe("/artisan/inscription");
    expect(destinationApresConfirmation("mot_de_passe_a_choisir", "signup", "/espaces", true)).toBe("/nouveau-mot-de-passe?motif=inscription&suite=%2Fespaces");
    expect(destinationApresConfirmation("mot_de_passe_a_choisir", "signup", "/espaces", false)).toBe("/nouveau-mot-de-passe?motif=confirmation&suite=%2Fespaces");
    expect(destinationApresConfirmation("mot_de_passe_a_choisir", "recovery", "/nouveau-mot-de-passe?suite=%2Finvitations%2Fx", true)).toBe("/nouveau-mot-de-passe?suite=%2Finvitations%2Fx&motif=confirmation");
    expect(destinationApresConfirmation("mot_de_passe_a_redemander", "recovery", "/nouveau-mot-de-passe", false)).toBe("/mot-de-passe-oublie?raison=adresse-confirmee");
  });
});

describe("compte pré-inscrit : aucun mot de passe choisi par un autre que celui qui confirme n'ouvre le compte", () => {
  type Compte = {
    id: string;
    email: string;
    password: string;
    confirme: boolean;
    user_metadata: Record<string, unknown>;
    jeton: string | null;
    jetonRecuperation: string | null;
    creeLe: string;
    envoiLe: string | null;
    /** `email_confirmed_at` : l'instant de la confirmation, posé par Auth (règles de GoTrue v2.197.0). */
    confirmeLe: string | null;
    /** `recovery_sent_at` : l'instant du dernier lien de récupération fabriqué. */
    recuperationLe: string | null;
  };
  type Navigateur = Map<string, string>;
  const ADRESSE = "artisan@entreprise.test";
  const COOKIE_SESSION = "sb-session-simulee";
  let comptes: Map<string, Compte>;
  let sessions: Map<string, string>;
  let courant: Navigateur;
  let avantCreation: (() => Promise<void>) | null;
  /** Le /signup PUBLIC d'Auth (clé publique seule) : un compte non confirmé, sans empreinte de Gerimmo. */
  let signupPublic: (email: string, motDePasse: string) => void;
  /** Le /recover PUBLIC d'Auth, courrier rendu avec le modèle recovery.html du dépôt : le lien mène au bouton de Gerimmo. */
  let recuperationPublique: (email: string) => string;

  function authSimulee() {
    comptes = new Map();
    sessions = new Map();
    avantCreation = null;
    let n = 0;
    let horloge = 0;
    const maintenant = () => `2026-10-15T10:00:00.${String(++horloge).padStart(6, "0")}Z`;
    const parEmail = (email: string) => [...comptes.values()].find((c) => c.email === email);
    const vue = (c: Compte) => ({
      id: c.id,
      email: c.email,
      email_confirmed_at: c.confirmeLe,
      user_metadata: { ...c.user_metadata },
      created_at: c.creeLe,
      confirmation_sent_at: c.envoiLe ?? undefined,
      recovery_sent_at: c.recuperationLe ?? undefined,
    });
    const fusion = (cible: Record<string, unknown>, maj: Record<string, unknown> | undefined) => {
      for (const [k, v] of Object.entries(maj ?? {})) {
        if (v === null) delete cible[k];
        else cible[k] = v;
      }
    };
    /** UpdatePassword : jetons et instants d'envoi vidés, sessions fermées (toutes, ou toutes sauf celle qui parle). */
    const changerMotDePasse = (c: Compte, motDePasse: string, sessionGardee?: string) => {
      c.password = motDePasse;
      c.jeton = null;
      c.jetonRecuperation = null;
      c.envoiLe = null;
      c.recuperationLe = null;
      for (const [id, compte] of sessions) if (compte === c.id && id !== sessionGardee) sessions.delete(id);
    };
    const generateLink = vi.fn(async (p: { type: string; email: string; password?: string; options?: { data?: Record<string, unknown> } }) => {
      let c = parEmail(p.email);
      if (p.type === "recovery") {
        if (!c) return { data: { properties: null, user: null }, error: { code: "user_not_found", status: 404, message: "User with this email not found" } };
        c.jetonRecuperation = `recuperation-${++n}`;
        c.recuperationLe = maintenant();
        return { data: { properties: { hashed_token: c.jetonRecuperation, action_link: "x" }, user: vue(c) }, error: null };
      }
      if (p.type !== "signup") return { data: { properties: null, user: null }, error: { message: "type non simulé" } };
      if (avantCreation) {
        const geste = avantCreation;
        avantCreation = null;
        await geste();
        c = parEmail(p.email);
      }
      if (c?.confirme) return { data: { properties: null, user: null }, error: { code: "email_exists", message: "already registered" } };
      const envoi = maintenant();
      if (!c) {
        c = { id: `compte-${++n}`, email: p.email, password: p.password ?? "", confirme: false, user_metadata: { ...(p.options?.data ?? {}) }, jeton: null, jetonRecuperation: null, creeLe: maintenant(), envoiLe: null, confirmeLe: null, recuperationLe: null };
        comptes.set(c.id, c);
      } else {
        fusion(c.user_metadata, p.options?.data);
      }
      c.envoiLe = envoi;
      c.jeton = `jeton-${++n}`;
      return { data: { properties: { hashed_token: c.jeton, action_link: "x" }, user: vue(c) }, error: null };
    });
    const updateUserById = vi.fn(async (id: string, attributs: { password?: string; user_metadata?: Record<string, unknown> }) => {
      const c = comptes.get(id);
      if (!c) return { data: { user: null }, error: { message: "User not found" } };
      fusion(c.user_metadata, attributs.user_metadata);
      if (attributs.password !== undefined) changerMotDePasse(c, attributs.password);
      return { data: { user: vue(c) }, error: null };
    });
    /** Le client serveur d'une requête : la session est celle du cookie du navigateur courant. */
    const clientDuNavigateur = (navigateur: Navigateur) => {
      const compteDeLaSession = () => {
        const id = navigateur.get(COOKIE_SESSION);
        const compteId = id ? sessions.get(id) : undefined;
        return compteId ? { session: id!, compte: comptes.get(compteId)! } : null;
      };
      return {
        auth: {
          verifyOtp: vi.fn(async (p: { type: string; token_hash: string }) => {
            const c = [...comptes.values()].find((x) => (p.type === "signup" ? x.jeton : x.jetonRecuperation) === p.token_hash && p.token_hash);
            if (!c) return { data: { user: null, session: null }, error: { message: "Email link is invalid or has expired" } };
            // recoverVerify / signupVerify : un compte non confirmé l'est au passage (Confirm), et TOUS les jetons à usage
            // unique du compte sont effacés (Recover comme Confirm).
            if (!c.confirme) {
              c.confirme = true;
              c.confirmeLe = maintenant();
            }
            c.jeton = null;
            c.jetonRecuperation = null;
            const session = `session-${++n}`;
            sessions.set(session, c.id);
            navigateur.set(COOKIE_SESSION, session);
            return { data: { user: vue(c), session: { access_token: session } }, error: null };
          }),
          updateUser: vi.fn(async (attributs: { password?: string; data?: Record<string, unknown> }) => {
            const s = compteDeLaSession();
            if (!s) return { data: { user: null }, error: { message: "Auth session missing!" } };
            fusion(s.compte.user_metadata, attributs.data);
            if (attributs.password !== undefined) changerMotDePasse(s.compte, attributs.password, s.session);
            return { data: { user: vue(s.compte) }, error: null };
          }),
          getUser: vi.fn(async () => {
            const s = compteDeLaSession();
            return s ? { data: { user: vue(s.compte) }, error: null } : { data: { user: null }, error: { message: "Session from session_id claim in JWT does not exist" } };
          }),
          signOut: vi.fn(async () => {
            navigateur.delete(COOKIE_SESSION);
            return { error: null };
          }),
        },
      };
    };
    signupPublic = (email, motDePasse) => {
      expect(parEmail(email)).toBeUndefined();
      const c: Compte = { id: `compte-${++n}`, email, password: motDePasse, confirme: false, user_metadata: {}, jeton: `jeton-${++n}`, jetonRecuperation: null, creeLe: maintenant(), envoiLe: null, confirmeLe: null, recuperationLe: null };
      c.envoiLe = maintenant();
      comptes.set(c.id, c);
    };
    recuperationPublique = (email) => {
      const c = parEmail(email)!;
      c.jetonRecuperation = `recuperation-${++n}`;
      c.recuperationLe = maintenant();
      return `https://www.gerimmo.app/auth/confirm?token_hash=${c.jetonRecuperation}&type=recovery&next=/nouveau-mot-de-passe`;
    };
    mocks.service.mockReturnValue({ auth: { admin: { generateLink, updateUserById } }, rpc: async () => ({ data: true, error: null }) });
    mocks.createClient.mockImplementation(async () => clientDuNavigateur(courant));
    mocks.cookies.mockImplementation(async () => ({
      get: (nom: string) => (courant.has(nom) ? { name: nom, value: courant.get(nom)! } : undefined),
      set: (nom: string, valeur: string, options?: { maxAge?: number }) => {
        if (!valeur || options?.maxAge === 0) courant.delete(nom);
        else courant.set(nom, valeur);
      },
      delete: (nom: string) => courant.delete(nom),
    }));
    return { generateLink, updateUserById };
  }

  /** Ce que peut faire, avec le mot de passe saisi, quelqu'un qui le connaît : ouvrir le compte ? */
  const ouvre = (motDePasse: string) => {
    const c = [...comptes.values()].find((x) => x.email === ADRESSE);
    return Boolean(c?.confirme && c.password === motDePasse);
  };
  const compte = () => [...comptes.values()].find((x) => x.email === ADRESSE)!;
  /** La session de ce navigateur est-elle vivante (ce que /nouveau-mot-de-passe exige) ? */
  const sessionVivante = (navigateur: Navigateur) => {
    const id = navigateur.get(COOKIE_SESSION);
    return Boolean(id && sessions.get(id) === compte().id);
  };
  /** Le formulaire de /nouveau-mot-de-passe : la session pose le mot de passe choisi. */
  const choisir = (navigateur: Navigateur, motDePasse: string) => {
    const id = navigateur.get(COOKIE_SESSION);
    if (!id || sessions.get(id) !== compte().id) return false;
    compte().password = motDePasse;
    return true;
  };

  async function inscrireDepuis(navigateur: Navigateur, motDePasse: string, metadonnees: Record<string, unknown>, next = "/artisan/inscription") {
    courant = navigateur;
    return inscrireEtEnvoyerConfirmation({ email: ADRESSE, motDePasse, metadonnees, next });
  }
  const liens = () =>
    mocks.envoyerEmail.mock.calls
      .map((c) => c[0])
      .filter((c) => c.to === ADRESSE)
      .map((c) => /href="([^"]+)"/.exec(c.html as string)![1].replace(/&amp;/g, "&"));
  /** Le lien du DERNIER courriel arrivé dans la boîte de l'artisan (le seul valide). */
  const dernierLien = () => liens().at(-1)!;
  /** Ouvrir le lien (GET), puis cliquer le bouton (POST), dans CE navigateur : la destination. */
  async function cliquer(navigateur: Navigateur, lien: string) {
    courant = navigateur;
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

  it("inscription neuve : le lien du courrier VIT (aucun appel d'administration après sa création) et la session reste ouverte", async () => {
    const { updateUserById } = authSimulee();
    const chezArtisan: Navigateur = new Map();
    expect(await inscrireDepuis(chezArtisan, "mot-de-passe-artisan-V", ARTISAN)).toEqual({ etat: "confirmation_envoyee" });
    expect(updateUserById).not.toHaveBeenCalled();
    const destination = await cliquer(chezArtisan, dernierLien());
    expect(destination.pathname).toBe("/artisan/inscription");
    expect(compte().confirme).toBe(true);
    expect(sessionVivante(chezArtisan)).toBe(true);
    expect(ouvre("mot-de-passe-artisan-V")).toBe(true);
    expect(compte().user_metadata).toEqual(ARTISAN);
  });

  it("l'artisan s'inscrit (V), l'invitant réinscrit l'adresse APRÈS lui (A), l'artisan clique le seul lien valide : ni V ni A n'ouvrent le compte", async () => {
    const chezArtisan: Navigateur = new Map();
    const chezInvitant: Navigateur = new Map();
    expect(await inscrireDepuis(chezArtisan, "mot-de-passe-artisan-V", ARTISAN)).toEqual({ etat: "confirmation_envoyee" });
    const l1 = liens()[0];
    expect(await inscrireDepuis(chezInvitant, "mot-de-passe-invitant-A", INVITANT)).toEqual({ etat: "confirmation_envoyee" });
    // L1 est caduc : seul le dernier lien confirme la boîte.
    expect((await cliquer(chezArtisan, l1)).searchParams.get("raison")).toBe("lien-invalide");
    const destination = await cliquer(chezArtisan, dernierLien());
    expect(compte().confirme).toBe(true);
    expect(ouvre("mot-de-passe-invitant-A")).toBe(false);
    expect(ouvre("mot-de-passe-artisan-V")).toBe(false);
    // La personne qui a confirmé choisit maintenant SON mot de passe, dans la session restée ouverte.
    expect(destination.pathname).toBe("/nouveau-mot-de-passe");
    expect(destination.searchParams.get("motif")).toBe("inscription");
    expect(sessionVivante(chezArtisan)).toBe(true);
    expect(sessionVivante(chezInvitant)).toBe(false);
    expect(choisir(chezArtisan, "mot-de-passe-choisi-N")).toBe(true);
    expect(ouvre("mot-de-passe-choisi-N")).toBe(true);
  });

  it("l'invitant inscrit seul l'adresse de l'artisan, qui clique le lien reçu sans s'être inscrit : le mot de passe de l'invitant n'ouvre pas le compte", async () => {
    const chezArtisan: Navigateur = new Map();
    const chezInvitant: Navigateur = new Map();
    await inscrireDepuis(chezInvitant, "mot-de-passe-invitant-A", INVITANT);
    const destination = await cliquer(chezArtisan, dernierLien());
    expect(compte().confirme).toBe(true);
    expect(ouvre("mot-de-passe-invitant-A")).toBe(false);
    expect(destination.pathname).toBe("/nouveau-mot-de-passe");
    expect(sessionVivante(chezArtisan)).toBe(true);
  });

  it("l'invitant s'inscrit d'abord, l'artisan ensuite et confirme dans SON navigateur : son mot de passe et ses informations, pas ceux de l'invitant", async () => {
    const chezArtisan: Navigateur = new Map();
    const chezInvitant: Navigateur = new Map();
    await inscrireDepuis(chezInvitant, "mot-de-passe-invitant-A", INVITANT);
    const lienDeLInvitant = dernierLien();
    await inscrireDepuis(chezArtisan, "mot-de-passe-artisan-V", ARTISAN);
    // Le mot de passe posé avant le nouveau lien a tué celui de l'invitant ; le nouveau lien vit.
    expect((await cliquer(new Map(), lienDeLInvitant)).searchParams.get("raison")).toBe("lien-invalide");
    const destination = await cliquer(chezArtisan, dernierLien());
    expect(destination.pathname).toBe("/artisan/inscription");
    expect(ouvre("mot-de-passe-artisan-V")).toBe(true);
    expect(ouvre("mot-de-passe-invitant-A")).toBe(false);
    expect(sessionVivante(chezArtisan)).toBe(true);
    // Les informations de la première inscription (espace, nom, code de parrainage) ne survivent pas, l'empreinte non plus.
    expect(compte().user_metadata).toEqual(ARTISAN);
  });

  it("course à la création : l'invitant crée le compte entre la recherche et la création de l'artisan ; son mot de passe n'ouvre rien", async () => {
    const chezArtisan: Navigateur = new Map();
    const chezInvitant: Navigateur = new Map();
    avantCreation = async () => {
      courant = chezInvitant;
      await inscrireEtEnvoyerConfirmation({ email: ADRESSE, motDePasse: "mot-de-passe-invitant-A", metadonnees: INVITANT, next: "/espaces" });
      courant = chezArtisan;
    };
    expect(await inscrireDepuis(chezArtisan, "mot-de-passe-artisan-V", ARTISAN)).toEqual({ etat: "confirmation_envoyee" });
    const destination = await cliquer(chezArtisan, dernierLien());
    expect(destination.pathname).toBe("/artisan/inscription");
    expect(ouvre("mot-de-passe-artisan-V")).toBe(true);
    expect(ouvre("mot-de-passe-invitant-A")).toBe(false);
    expect(compte().user_metadata).toEqual(ARTISAN);
  });

  it("le cas ordinaire est inchangé : inscrit et confirmé dans le même navigateur, le compte s'ouvre avec le mot de passe choisi, sans étape de plus", async () => {
    const chezArtisan: Navigateur = new Map();
    await inscrireDepuis(chezArtisan, "mot-de-passe-artisan-V", ARTISAN, "/artisan/invitation/6f1e2d3c-4b5a-4968-8778-695a4b3c2d1e");
    const destination = await cliquer(chezArtisan, dernierLien());
    expect(destination.pathname).toBe("/artisan/invitation/6f1e2d3c-4b5a-4968-8778-695a4b3c2d1e");
    expect(ouvre("mot-de-passe-artisan-V")).toBe(true);
    expect(sessionVivante(chezArtisan)).toBe(true);
  });

  it("l'invitant inscrit l'adresse de l'artisan (A) et demande « mot de passe oublié » pour elle ; l'artisan clique le lien de récupération dans SON navigateur puis ferme l'onglet : A n'ouvre pas le compte", async () => {
    const chezArtisan: Navigateur = new Map();
    const chezInvitant: Navigateur = new Map();
    await inscrireDepuis(chezInvitant, "mot-de-passe-invitant-A", INVITANT);
    courant = chezInvitant;
    expect(await envoyerLienMotDePasse({ email: ADRESSE, motif: "mot_de_passe_oublie", next: "/nouveau-mot-de-passe" })).toEqual({});
    const lien = dernierLien();
    expect(new URL(lien).searchParams.get("type")).toBe("recovery");
    const destination = await cliquer(chezArtisan, lien);
    expect(destination.pathname).toBe("/nouveau-mot-de-passe");
    // L'artisan ferme l'onglet ici : l'adresse est confirmée (règle d'Auth), le mot de passe de l'invitant ne vaut plus rien.
    expect(compte().confirme).toBe(true);
    expect(ouvre("mot-de-passe-invitant-A")).toBe(false);
    expect(compte().user_metadata).not.toHaveProperty("empreinte_inscription");
    expect(sessionVivante(chezArtisan)).toBe(true);
    // S'il revient au formulaire, il choisit le sien.
    expect(choisir(chezArtisan, "mot-de-passe-choisi-N")).toBe(true);
    expect(ouvre("mot-de-passe-choisi-N")).toBe(true);
  });

  it("l'artisan s'inscrit, oublie son mot de passe et clique le lien de récupération dans le navigateur de l'inscription : son mot de passe reste valable", async () => {
    const chezArtisan: Navigateur = new Map();
    await inscrireDepuis(chezArtisan, "mot-de-passe-artisan-V", ARTISAN);
    courant = chezArtisan;
    await envoyerLienMotDePasse({ email: ADRESSE, motif: "mot_de_passe_oublie", next: "/nouveau-mot-de-passe" });
    const destination = await cliquer(chezArtisan, dernierLien());
    expect(destination.pathname).toBe("/nouveau-mot-de-passe");
    expect(compte().confirme).toBe(true);
    expect(ouvre("mot-de-passe-artisan-V")).toBe(true);
    expect(compte().user_metadata).toEqual(ARTISAN);
    expect(chezArtisan.has(COOKIE_INSCRIPTION)).toBe(false);
    expect(sessionVivante(chezArtisan)).toBe(true);
  });

  it("inscrit sur un appareil, confirmé sur un autre : l'adresse est confirmée, la session de l'autre appareil survit et la personne y choisit son mot de passe", async () => {
    const telephone: Navigateur = new Map();
    const ordinateur: Navigateur = new Map();
    await inscrireDepuis(telephone, "mot-de-passe-artisan-V", ARTISAN);
    const destination = await cliquer(ordinateur, dernierLien());
    expect(compte().confirme).toBe(true);
    expect(destination.pathname).toBe("/nouveau-mot-de-passe");
    expect(ouvre("mot-de-passe-artisan-V")).toBe(false);
    expect(sessionVivante(ordinateur)).toBe(true);
    expect(choisir(ordinateur, "mot-de-passe-choisi-N")).toBe(true);
    expect(ouvre("mot-de-passe-choisi-N")).toBe(true);
  });

  // Quatrième relecture (16/10/2026) : le compte est créé par le /signup PUBLIC d'Auth, sans passer par Gerimmo (aucune
  // empreinte, aucun témoin). Mêmes scénarios que T10, T10b et T12 de la contre-relecture, rejoués sur GoTrue réel.
  it("T10 : compte du /signup public (A), « mot de passe oublié » de Gerimmo, le titulaire clique chez lui et ferme l'onglet : A n'ouvre pas le compte", async () => {
    const chezTitulaire: Navigateur = new Map();
    signupPublic(ADRESSE, "mot-de-passe-du-tiers-A");
    expect(ouvre("mot-de-passe-du-tiers-A")).toBe(false);
    courant = new Map();
    expect(await envoyerLienMotDePasse({ email: ADRESSE, motif: "mot_de_passe_oublie", next: "/nouveau-mot-de-passe" })).toEqual({});
    const destination = await cliquer(chezTitulaire, dernierLien());
    expect(destination.pathname + destination.search).toBe("/nouveau-mot-de-passe?motif=confirmation");
    expect(compte().confirme).toBe(true);
    expect(ouvre("mot-de-passe-du-tiers-A")).toBe(false);
    expect(sessionVivante(chezTitulaire)).toBe(true);
    expect(choisir(chezTitulaire, "mot-de-passe-choisi-N")).toBe(true);
    expect(ouvre("mot-de-passe-choisi-N")).toBe(true);
  });

  it("T10b : compte du /signup public (A), puis invitation de locataire cliquée par le titulaire : A n'ouvre pas le compte, la suite de l'invitation est gardée", async () => {
    const chezLocataire: Navigateur = new Map();
    signupPublic(ADRESSE, "mot-de-passe-du-tiers-A");
    courant = new Map();
    const suite = "/invitations/6f1e2d3c-4b5a-4968-8778-695a4b3c2d1e";
    expect(await envoyerLienMotDePasse({ email: ADRESSE, motif: "invitation_locataire", next: `/nouveau-mot-de-passe?suite=${encodeURIComponent(suite)}`, organisation: ORG })).toEqual({});
    const destination = await cliquer(chezLocataire, dernierLien());
    expect(destination.pathname).toBe("/nouveau-mot-de-passe");
    expect(destination.searchParams.get("motif")).toBe("confirmation");
    expect(destination.searchParams.get("suite")).toBe(suite);
    expect(ouvre("mot-de-passe-du-tiers-A")).toBe(false);
    expect(sessionVivante(chezLocataire)).toBe(true);
  });

  it("T12 : compte du /signup public (A), puis /recover public dont le courrier (modèle du dépôt) mène au bouton de Gerimmo : A n'ouvre pas le compte", async () => {
    signupPublic(ADRESSE, "mot-de-passe-du-tiers-A");
    const destination = await cliquer(new Map(), recuperationPublique(ADRESSE));
    expect(destination.searchParams.get("motif")).toBe("confirmation");
    expect(ouvre("mot-de-passe-du-tiers-A")).toBe(false);
  });

  it("compte déjà confirmé : « mot de passe oublié » cliqué dans un autre navigateur ne change rien avant le choix (récupération ordinaire)", async () => {
    const chezArtisan: Navigateur = new Map();
    await inscrireDepuis(chezArtisan, "mot-de-passe-artisan-V", ARTISAN);
    await cliquer(chezArtisan, dernierLien());
    expect(ouvre("mot-de-passe-artisan-V")).toBe(true);
    courant = new Map();
    await envoyerLienMotDePasse({ email: ADRESSE, motif: "mot_de_passe_oublie", next: "/nouveau-mot-de-passe" });
    const ailleurs: Navigateur = new Map();
    const destination = await cliquer(ailleurs, dernierLien());
    expect(destination.pathname + destination.search).toBe("/nouveau-mot-de-passe");
    expect(ouvre("mot-de-passe-artisan-V")).toBe(true);
    expect(sessionVivante(ailleurs)).toBe(true);
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
    // Quatrième relecture : tout autre lien qui vient de confirmer l'adresse (motif « confirmation »).
    const confirmation = texte(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ motif: "confirmation", suite: "/invitations/x" }) })));
    expect(confirmation).toContain("Choisissez votre mot de passe");
    expect(confirmation).toContain("Votre adresse artisan@entreprise.test vient d'être confirmée par ce lien");
    expect(confirmation).toContain("un mot de passe choisi avant cette confirmation ne permet plus d'entrer");
    expect(confirmation).not.toContain("autre navigateur");
    // Sans motif : l'écran ordinaire du mot de passe oublié.
    const ordinaire = texte(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) })));
    expect(ordinaire).toContain("Nouveau mot de passe");
    expect(ordinaire).not.toContain("est confirmée");
  });
});

describe("/mot-de-passe-oublie après une confirmation faite ailleurs que la session n'a pas pu finir", () => {
  it("dit que l'adresse est confirmée et comment choisir le mot de passe ; sans motif, l'écran ordinaire", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: Page } = await import("../src/app/mot-de-passe-oublie/page");
    const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/&#x27;/g, "'");
    const apres = texte(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ raison: "adresse-confirmee" }) })));
    expect(apres).toContain("Choisissez votre mot de passe");
    expect(apres).toContain("Votre adresse est confirmée");
    expect(apres).toContain("le vôtre se choisit par un nouveau lien");
    const ordinaire = texte(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) })));
    expect(ordinaire).toContain("Mot de passe oublié");
    expect(ordinaire).not.toContain("est confirmée");
    expect(texte(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ raison: "autre" }) })))).not.toContain("est confirmée");
  });
});
