/**
 * Plan de conformité du 23/10/2026, lot 1A (R10, R60, R19) — les actions serveur, sans base.
 *
 *  - Premier choix du mot de passe : le document enregistré suit l'usage choisi (conditions clients, règles des espaces
 *    invités, conditions de l'espace artisan une fois publiées) ; une case affichée qui n'était pas celle de l'usage
 *    choisi est refusée, rien n'est enregistré, la case revient décochée. Les deux états des conditions artisans.
 *  - « J'accepte la nouvelle version » : version affichée vérifiée, document conditions_clients, confirmation qui dit
 *    quand l'abonnement est programmé pour finir.
 *  - La garde de l'espace artisan : inactive tant que la version n'est pas publiée ; publiée, la case est exigée.
 *  - Les formulaires rendent la case de l'usage choisi, et le champ caché qui le prouve.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({ version: null as string | null, date: null as string | null }));
vi.mock("@/lib/editeur", async (importer) => {
  const vrai = await importer<typeof import("@/lib/editeur")>();
  return {
    ...vrai,
    get CONDITIONS_ARTISANS_VERSION() {
      return etat.version;
    },
    get CONDITIONS_ARTISANS_DATE() {
      return etat.date;
    },
  };
});
const mocks = vi.hoisted(() => ({ client: vi.fn(), cookies: vi.fn(), revalider: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/lien-mot-de-passe", () => ({ envoyerLienMotDePasse: vi.fn(), inscrireEtEnvoyerConfirmation: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalider }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); } }));

import { definirNouveauMotDePasse } from "../src/app/actions/auth";
import { accepterConditionsArtisans, accepterNouvelleVersionConditions } from "../src/app/actions/acceptation-conditions";
import { CONDITIONS_VERSION } from "../src/lib/editeur";
import { ERREUR_CONDITIONS_PERIMEES } from "../src/lib/garde-souscription";
import { MESSAGE_CASE_A_REVOIR } from "../src/lib/conditions-acceptation";
import { FormulaireNouveauMotDePasse } from "../src/app/nouveau-mot-de-passe/formulaire-nouveau-mot-de-passe";
import { AcceptationConditionsArtisans } from "../src/app/artisan/acceptation-conditions-artisans";

const ORG = "11111111-1111-4111-8111-111111111111";
const revendications = { data: { claims: { sub: "u1", amr: [{ method: "recovery", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null };
let rpc: ReturnType<typeof vi.fn>;
let auth: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  etat.version = null;
  etat.date = null;
  auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1", email: "camille@example.invalid", user_metadata: { profil_a_confirmer: { nom: "Initial" } } } } }),
    getClaims: vi.fn().mockResolvedValue(revendications),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: { session: {}, user: { id: "u1" } }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
  mocks.client.mockResolvedValue({ auth, rpc, from: vi.fn().mockReturnValue(query) });
  mocks.cookies.mockResolvedValue({ delete: vi.fn() });
});

const formulaire = (valeurs: Record<string, string>) => {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries({ mot_de_passe: "nouveau-mot-de-passe-1", confirmation: "nouveau-mot-de-passe-1", nom: "Martin", cgu: "on", ...valeurs })) f.set(cle, valeur);
  return f;
};
const acceptation = () => rpc.mock.calls.find(([fn]) => fn === "accepter_cgu")?.[1];

describe("premier choix du mot de passe : le document suit l'usage (R10, R60)", () => {
  it("propriétaire : conditions clients, version en vigueur ; le profil garde la version et le document", async () => {
    await expect(definirNouveauMotDePasse({}, formulaire({ espace: "proprietaire_direct", cgu_document: "conditions_clients" }))).rejects.toThrow("REDIRECT");
    expect(acceptation()).toEqual({ p_version: CONDITIONS_VERSION, p_source: "compte", p_document: "conditions_clients" });
    expect(auth.updateUser).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cgu_version: CONDITIONS_VERSION, cgu_document: "conditions_clients" }) }));
  });

  it("personne invitée : règles des espaces invités, version des conditions générales qui les portent", async () => {
    await expect(definirNouveauMotDePasse({}, formulaire({ espace: "invite", cgu_document: "regles_invites" }))).rejects.toThrow("REDIRECT");
    expect(acceptation()).toEqual({ p_version: CONDITIONS_VERSION, p_source: "compte", p_document: "regles_invites" });
  });

  it("personne invitée sans case cochée : le refus parle des règles des espaces invités", async () => {
    const f = formulaire({ espace: "invite", cgu_document: "regles_invites" });
    f.delete("cgu");
    const r = await definirNouveauMotDePasse({}, f);
    expect(r).toMatchObject({ champ: "cgu", erreur: "Cochez la case pour confirmer que vous avez pris connaissance des règles d’utilisation des espaces invités." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("propriétaire sans case cochée : le libellé unique des conditions générales d'utilisation et de vente", async () => {
    const f = formulaire({ espace: "proprietaire_direct" });
    f.delete("cgu");
    expect((await definirNouveauMotDePasse({}, f)).erreur).toBe("Acceptez les conditions générales d’utilisation et de vente pour continuer.");
  });

  it("artisan, conditions artisans NON publiées : il accepte les conditions clients, comme avant", async () => {
    await expect(definirNouveauMotDePasse({}, formulaire({ espace: "artisan" }))).rejects.toThrow("REDIRECT");
    expect(acceptation()).toEqual({ p_version: CONDITIONS_VERSION, p_source: "compte", p_document: "conditions_clients" });
  });

  it("artisan, conditions artisans PUBLIÉES : conditions_artisans, leur version", async () => {
    etat.version = "2026-11-15";
    etat.date = "15 novembre 2026";
    await expect(definirNouveauMotDePasse({}, formulaire({ espace: "artisan", cgu_document: "conditions_artisans" }))).rejects.toThrow("REDIRECT");
    expect(acceptation()).toEqual({ p_version: "2026-11-15", p_source: "compte", p_document: "conditions_artisans" });
    expect(auth.updateUser).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cgu_version: "2026-11-15", cgu_document: "conditions_artisans" }) }));
  });

  it("une page qui affichait la case des conditions clients ne vaut pas acceptation des conditions artisans publiées", async () => {
    etat.version = "2026-11-15";
    // Champ absent : page servie avant le 24/10, qui ne montrait que la case des conditions clients.
    const r = await definirNouveauMotDePasse({}, formulaire({ espace: "artisan" }));
    expect(r.erreur).toBe(MESSAGE_CASE_A_REVOIR);
    expect(r.champ).toBe("cgu");
    expect(r.valeurs).toMatchObject({ espace: "artisan", nom: "Martin" });
    expect(r.valeurs?.cgu).toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("usage changé sans que la case suive (envoi sans script) : refus, rien d'enregistré, case décochée", async () => {
    const r = await definirNouveauMotDePasse({}, formulaire({ espace: "invite", cgu_document: "conditions_clients" }));
    expect(r.erreur).toBe(MESSAGE_CASE_A_REVOIR);
    expect(r.valeurs?.cgu).toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
    const inconnu = await definirNouveauMotDePasse({}, formulaire({ espace: "proprietaire_direct", cgu_document: "autre" }));
    expect(inconnu.erreur).toBe(MESSAGE_CASE_A_REVOIR);
  });
});

describe("« J'accepte la nouvelle version » (R19)", () => {
  const envoi = (version: string) => {
    const f = new FormData();
    f.set("cgu_version", version);
    return f;
  };

  it("version affichée périmée : refus, rien d'enregistré", async () => {
    expect(await accepterNouvelleVersionConditions(ORG, {}, envoi("2026-09-29"))).toEqual({ erreur: ERREUR_CONDITIONS_PERIMEES });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("enregistre les conditions clients en vigueur, source « compte »", async () => {
    const r = await accepterNouvelleVersionConditions(ORG, {}, envoi(CONDITIONS_VERSION));
    expect(acceptation()).toEqual({ p_version: CONDITIONS_VERSION, p_source: "compte", p_document: "conditions_clients" });
    expect(r.succes).toBe("Votre acceptation de la version du 30 septembre 2026 des conditions générales est enregistrée.");
  });

  it("abonnement déjà programmé pour finir : la confirmation le dit et renvoie à « Mon abonnement »", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "mon_abonnement"
        ? { data: [{ souscrit: true, periode_fin: "2027-03-01T10:00:00Z", annulation_demandee: true }], error: null }
        : { data: null, error: null }
    );
    const r = await accepterNouvelleVersionConditions(ORG, {}, envoi(CONDITIONS_VERSION));
    expect(r.succes).toContain("Votre abonnement est programmé pour prendre fin le 1 mars 2027 : vous pouvez le poursuivre depuis « Mon abonnement ».");
  });

  it("échec d'enregistrement : la phrase commune, pas de succès", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "indisponible" } });
    expect((await accepterNouvelleVersionConditions(ORG, {}, envoi(CONDITIONS_VERSION))).erreur).toContain("n’a pas pu être enregistrée");
  });

  it("espace mal formé ou session expirée : refus", async () => {
    expect((await accepterNouvelleVersionConditions("pas-un-uuid", {}, envoi(CONDITIONS_VERSION))).erreur).toBeTruthy();
    auth.getUser.mockResolvedValue({ data: { user: null } });
    expect((await accepterNouvelleVersionConditions(ORG, {}, envoi(CONDITIONS_VERSION))).erreur).toContain("reconnectez-vous");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("la garde de l'espace artisan (R10)", () => {
  const envoi = (valeurs: Record<string, string>) => {
    const f = new FormData();
    for (const [cle, valeur] of Object.entries(valeurs)) f.set(cle, valeur);
    return f;
  };

  it("non publiées : rien à accepter, rien d'enregistré", async () => {
    const r = await accepterConditionsArtisans({}, envoi({ cgu_version: "2026-11-15", cgu: "on" }));
    expect(r.erreur).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("publiées : version affichée et case exigées, puis conditions_artisans enregistrées et l'espace rafraîchi", async () => {
    etat.version = "2026-11-15";
    expect((await accepterConditionsArtisans({}, envoi({ cgu_version: "2026-11-01", cgu: "on" }))).erreur).toBe(ERREUR_CONDITIONS_PERIMEES);
    expect((await accepterConditionsArtisans({}, envoi({ cgu_version: "2026-11-15" }))).erreur).toBe("Acceptez les conditions de l’espace artisan pour continuer.");
    expect(rpc).not.toHaveBeenCalled();
    const r = await accepterConditionsArtisans({}, envoi({ cgu_version: "2026-11-15", cgu: "on" }));
    expect(r.succes).toBeTruthy();
    expect(acceptation()).toEqual({ p_version: "2026-11-15", p_source: "compte", p_document: "conditions_artisans" });
    expect(mocks.revalider).toHaveBeenCalledWith("/artisan", "layout");
  });

  it("la case de la garde : libellé, lien vers les conditions de l'espace artisan, version affichée", () => {
    const html = renderToStaticMarkup(createElement(AcceptationConditionsArtisans, { version: "2026-11-15", date: "15 novembre 2026" }));
    expect(html).toContain("J’accepte les ");
    expect(html).toContain('href="/conditions/artisans"');
    expect(html).toContain("conditions de l’espace artisan");
    expect(html).toContain('name="cgu_version" value="2026-11-15"');
    expect(html).toContain("dans leur version du 15 novembre 2026");
  });
});

describe("le formulaire du premier mot de passe rend la case de l'usage choisi", () => {
  const rendre = (espace: string) =>
    renderToStaticMarkup(createElement(FormulaireNouveauMotDePasse, { profilAConfirmer: { espace, nom: "Martin" } }));

  it("propriétaire : conditions générales d'utilisation et de vente", () => {
    const html = rendre("proprietaire_direct");
    expect(html).toContain('name="cgu_document" value="conditions_clients"');
    expect(html).toContain("conditions générales d’utilisation et de vente");
    expect(html).toContain('href="/conditions"');
  });

  it("personne invitée : règles des espaces invités (article 7)", () => {
    const html = rendre("invite");
    expect(html).toContain('name="cgu_document" value="regles_invites"');
    expect(html).toContain("J’ai pris connaissance des ");
    expect(html).toContain("règles d’utilisation des espaces invités");
    expect(html).toContain("(article 7 des conditions générales).");
  });

  it("artisan : conditions clients tant que les siennes ne sont pas publiées, puis les siennes", () => {
    expect(rendre("artisan")).toContain('name="cgu_document" value="conditions_clients"');
    etat.version = "2026-11-15";
    const html = rendre("artisan");
    expect(html).toContain('name="cgu_document" value="conditions_artisans"');
    expect(html).toContain('href="/conditions/artisans"');
  });
});
