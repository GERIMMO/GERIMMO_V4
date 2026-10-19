/**
 * Audit du 19/10 (lot mineurs, g) : /nouveau-mot-de-passe pose un mot de passe SANS demander l'ancien. Ce geste n'a
 * de sens que pour une session née d'un lien reçu par e-mail (récupération, invitation, confirmation). La page
 * n'exigeait qu'une session : connecté par mot de passe, on pouvait y changer son mot de passe sans l'ancien, alors
 * que « Mon compte » l'exige. La preuve durable de l'origine de la session est la revendication `amr` du jeton.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: (chemin: string) => { throw new Error(`REDIRECT ${chemin}`); } }));
vi.mock("@/components/coquille-auth", () => ({ CoquilleAuth: () => null }));
vi.mock("../src/app/nouveau-mot-de-passe/formulaire-nouveau-mot-de-passe", () => ({ FormulaireNouveauMotDePasse: () => null }));
import PageNouveauMotDePasse from "../src/app/nouveau-mot-de-passe/page";
import { METHODES_LIEN_EMAIL, methodesDeLaSession, sessionIssueDUnLien } from "../src/lib/session-lien-email";

describe("sessionIssueDUnLien lit la revendication amr", () => {
  it("format détaillé : une entrée { method, timestamp } par méthode", () => {
    expect(sessionIssueDUnLien([{ method: "recovery", timestamp: 1 }])).toBe(true);
    expect(sessionIssueDUnLien([{ method: "password", timestamp: 1 }])).toBe(false);
  });

  it("format RFC 8176 : des chaînes", () => {
    expect(sessionIssueDUnLien(["magiclink"])).toBe(true);
    expect(sessionIssueDUnLien(["password"])).toBe(false);
  });

  it.each(["recovery", "invite", "magiclink", "email/signup", "email_change", "otp"])("%s : né d'un lien ou d'un code reçu par e-mail", (methode) => {
    expect(METHODES_LIEN_EMAIL.has(methode)).toBe(true);
    expect(sessionIssueDUnLien([{ method: methode, timestamp: 1 }])).toBe(true);
  });

  it.each(["password", "oauth", "sso/saml", "totp", "anonymous", "token_refresh", "web3"])("%s : pas un lien", (methode) => {
    expect(sessionIssueDUnLien([{ method: methode, timestamp: 1 }])).toBe(false);
  });

  it("mot de passe puis second facteur : toujours pas un lien", () => {
    expect(sessionIssueDUnLien([{ method: "password", timestamp: 1 }, { method: "totp", timestamp: 2 }])).toBe(false);
  });

  it("absent, vide ou mal formé : non", () => {
    expect(sessionIssueDUnLien(undefined)).toBe(false);
    expect(sessionIssueDUnLien(null)).toBe(false);
    expect(sessionIssueDUnLien([])).toBe(false);
    expect(sessionIssueDUnLien("recovery")).toBe(false);
    expect(sessionIssueDUnLien([{ timestamp: 1 }, 42, null])).toBe(false);
    expect(methodesDeLaSession([{ method: "recovery" }, "otp", { timestamp: 1 }, 42])).toEqual(["recovery", "otp"]);
  });
});

describe("la page /nouveau-mot-de-passe", () => {
  const utilisateur = { id: "u1", email: "personne@example.com", user_metadata: {} };
  let adhesion: ReturnType<typeof vi.fn>;
  let auth: { getUser: ReturnType<typeof vi.fn>; getClaims: ReturnType<typeof vi.fn> };
  const page = (motif?: string) => PageNouveauMotDePasse({ searchParams: Promise.resolve(motif ? { motif } : {}) });

  beforeEach(() => {
    mocks.createClient.mockReset();
    auth = { getUser: vi.fn().mockResolvedValue({ data: { user: utilisateur } }), getClaims: vi.fn() };
    adhesion = vi.fn().mockResolvedValue({ data: null, error: null });
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: adhesion };
    mocks.createClient.mockResolvedValue({ auth, from: vi.fn().mockReturnValue(query) });
  });

  it("connecté par mot de passe : renvoyé vers « Mon compte », où le mot de passe actuel est demandé", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "u1", amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null });
    await expect(page()).rejects.toThrow("REDIRECT /compte");
  });

  it("session née d'un lien de récupération : la page s'affiche", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "u1", amr: [{ method: "recovery", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null });
    await expect(page()).resolves.toBeTruthy();
  });

  it("confirmation d'inscription (motif=inscription) : la page s'affiche", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "u1", amr: [{ method: "email/signup", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null });
    await expect(page("inscription")).resolves.toBeTruthy();
  });

  it("sans revendication lisible : pas de changement sans l'ancien mot de passe", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: { message: "jeton illisible" } });
    await expect(page()).rejects.toThrow("REDIRECT /compte");
  });

  it("une preuve ancienne renvoie au compte", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "u1", amr: [{ method: "recovery", timestamp: 1 }] } }, error: null });
    await expect(page()).rejects.toThrow("REDIRECT /compte");
  });

  it("un superviseur doit confirmer son second facteur avant le formulaire", async () => {
    adhesion.mockResolvedValue({ data: { id: "superviseur" }, error: null });
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "u1", amr: [{ method: "recovery", timestamp: Math.floor(Date.now() / 1000) }], aal: "aal1" } }, error: null });
    await expect(page()).rejects.toThrow("REDIRECT /securite?suite=");
  });

  it("sans session : vers la connexion, comme avant", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(page()).rejects.toThrow("REDIRECT /connexion?raison=lien-invalide");
    expect(auth.getClaims).not.toHaveBeenCalled();
  });
});
