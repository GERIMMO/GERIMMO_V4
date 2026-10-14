/**
 * D08 (audit du 13/10, SA-01 et SA-09), option A — la trace de l'entrée du super-administrateur dans un espace
 * client dit l'ACTION, l'OBJET et le RÉSULTAT, sans changer aucun droit.
 *
 * Avant : `traversee_action` sans détail, émise aussi à l'ouverture d'une page (le contrôle d'un dossier de
 * bail s'exécute au rendu), et `traversee_espace` vide, réécrite à chaque rendu (jusqu'à 15 par minute).
 * Maintenant :
 * - une ouverture de page ou un fichier lu → `traversee_espace` ; un geste (action serveur, formulaire en POST)
 *   → `traversee_action` ;
 * - les détails portent la page, l'objet (rubrique + identifiant) et la décision d'accès (autorisé / refusé) ;
 * - une demande vers une organisation inexistante laisse une ligne « refusé » ;
 * - un échec d'écriture de la trace ne bloque rien (comme avant) ; un membre ordinaire n'écrit aucune trace.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  entetes: {} as Record<string, string>,
  horsRequete: false,
  superAdmin: true,
  membre: null as { role: string } | null,
  organisation: { id: "o", type: "agence" } as Record<string, unknown> | null,
  traceEnPanne: false,
  rpc: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => {
    if (mocks.horsRequete) throw new Error("headers() a été appelé hors d'une requête");
    return new Headers(mocks.entetes);
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (cible: string) => { throw new Error(`REDIRECT:${cible}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "sa" } } }) },
    rpc: mocks.rpc,
    from: (table: string) => {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: table === "memberships" ? mocks.membre : mocks.organisation, error: null }),
      };
      return q;
    },
  }),
}));

import { decrireObjet, detailsTraversee, tracerTraversee, type ContexteRequete } from "../src/lib/traversee";
import { verifierAccesEspace } from "../src/lib/espace";
import { verifierGerant } from "../src/lib/ged-acces";

const ORG = "f2cb7540-d6f9-471d-bd6e-44b6d9e7ea39";
const BAIL = "0b6e1d6e-7c1a-4b5e-9a3d-5f2f3d9a1c11";
const ACTION = "7f3a9c0d2e4b5a69c8d7e6f5a4b3c2d1e0f9a8b7";

const appelsTrace = () => mocks.rpc.mock.calls.filter(([nom]) => nom === "log_sa_access");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.entetes = {};
  mocks.horsRequete = false;
  mocks.superAdmin = true;
  mocks.membre = null;
  mocks.organisation = { id: ORG, type: "agence" };
  mocks.traceEnPanne = false;
  mocks.rpc.mockImplementation(async (nom: string) => {
    if (nom === "is_super_admin") return { data: mocks.superAdmin, error: null };
    if (nom === "log_sa_access" && mocks.traceEnPanne) return { data: null, error: { message: "trace en panne" } };
    return { data: null, error: null };
  });
});

describe("D08 — décrire l'objet ouvert", () => {
  it.each([
    [`/agence/${ORG}/baux/${BAIL}`, { rubrique: "baux", objet_id: BAIL }],
    [`/agence/${ORG}/baux/${BAIL}/avenant`, { rubrique: "baux", objet_id: BAIL }],
    [`/agence/${ORG}/parc/${BAIL}`, { rubrique: "parc", objet_id: BAIL }],
    [`/agence/${ORG}/loyers`, { rubrique: "loyers", objet_id: null }],
    [`/agence/${ORG}`, { rubrique: "accueil", objet_id: null }],
    [`/agence/${ORG}/documents/${BAIL}/fichier`, { rubrique: "documents", objet_id: BAIL }],
    [`/agence/${ORG}/Parc/${BAIL.toUpperCase()}`, { rubrique: "parc", objet_id: BAIL }],
  ])("%s", (chemin, attendu) => {
    expect(decrireObjet(chemin, ORG)).toEqual({ route: chemin, ...attendu });
  });

  it("une adresse qui ne porte pas l'organisation (geste lancé d'ailleurs) garde sa première rubrique et son objet", () => {
    expect(decrireObjet(`/admin/organisations/${BAIL}`, ORG)).toEqual({ route: `/admin/organisations/${BAIL}`, rubrique: "admin", objet_id: BAIL });
    expect(decrireObjet("/compte", ORG)).toEqual({ route: "/compte", rubrique: "compte", objet_id: null });
  });

  it("sans adresse, rien n'est inventé", () => {
    expect(decrireObjet(null, ORG)).toEqual({ route: null, rubrique: null, objet_id: null });
  });

  it("une rubrique étrange est ramenée à « autre » : le code reste court et sans caractère libre", () => {
    expect(decrireObjet(`/agence/${ORG}/%3Cscript%3E/x`, ORG).rubrique).toBe("autre");
  });
});

describe("D08 — les détails de la ligne d'audit", () => {
  const contexte = (extra: Partial<ContexteRequete> = {}): ContexteRequete => ({
    chemin: `/agence/${ORG}/baux/${BAIL}`, actionServeur: false, ecriture: false, actionRef: null, ...extra,
  });

  it("une page : consultation, avec la page, l'objet et la décision", () => {
    expect(detailsTraversee({ orgId: ORG, nature: "espace", resultat: "autorise" }, contexte())).toEqual({
      action: "traversee_espace",
      details: { resultat: "autorise", requete: "page", rubrique: "baux", objet_id: BAIL, route: `/agence/${ORG}/baux/${BAIL}` },
    });
  });

  it("un geste lancé par une action serveur : « traversee_action », avec l'empreinte de l'action", () => {
    expect(detailsTraversee({ orgId: ORG, nature: "geste", resultat: "autorise" }, contexte({ actionServeur: true, ecriture: true, actionRef: "7f3a9c0d2e4b5a69" })))
      .toEqual({
        action: "traversee_action",
        details: { resultat: "autorise", requete: "action_serveur", rubrique: "baux", objet_id: BAIL, route: `/agence/${ORG}/baux/${BAIL}`, action_ref: "7f3a9c0d2e4b5a69" },
      });
  });

  it("un formulaire envoyé sans JavaScript (POST sans en-tête d'action) est un geste, pas une consultation", () => {
    const { action, details } = detailsTraversee({ orgId: ORG, nature: "geste", resultat: "autorise" }, contexte({ ecriture: true }));
    expect(action).toBe("traversee_action");
    expect(details.requete).toBe("formulaire");
  });

  it("un fichier lu ou un contrôle fait à l'affichage d'une page (GET) est une consultation, même demandé par la porte des gestes", () => {
    expect(detailsTraversee({ orgId: ORG, nature: "geste", resultat: "autorise" }, contexte()).action).toBe("traversee_espace");
  });

  it("un refus dit pourquoi", () => {
    expect(detailsTraversee({ orgId: ORG, nature: "espace", resultat: "refuse", motif: "organisation_introuvable" }, contexte()).details)
      .toMatchObject({ resultat: "refuse", motif: "organisation_introuvable" });
  });

  it("n'embarque jamais de paramètre d'adresse ni de texte libre", () => {
    const { details } = detailsTraversee({ orgId: ORG, nature: "espace", resultat: "autorise" }, contexte({ chemin: `/agence/${ORG}/baux/${BAIL}` }));
    expect(JSON.stringify(details)).not.toMatch(/\?|@/);
  });
});

describe("D08 — écrire la trace", () => {
  // Constaté sur un vrai serveur : Next.js masque ses en-têtes de navigation (rsc, next-router-prefetch…) à
  // `headers()` ; une page chargée à l'avance s'écrit donc comme une page ouverte (la base n'en garde qu'une
  // ligne par minute). Ce test fixe cette limite : si Next.js les exposait un jour, il faudra le décider.
  it("une page chargée à l'avance par le navigateur s'écrit comme une page ouverte (limite documentée)", async () => {
    mocks.entetes = { "x-gerimmo-chemin": `/agence/${ORG}/loyers`, "x-gerimmo-methode": "GET" };
    await tracerTraversee({ rpc: mocks.rpc }, { orgId: ORG, nature: "espace", resultat: "autorise" });
    expect(appelsTrace()).toHaveLength(1);
    expect(appelsTrace()[0][1]).toMatchObject({ sa_action: "traversee_espace", sa_details: { rubrique: "loyers", requete: "page" } });
  });

  it("une erreur d'écriture est dite au journal du serveur et rendue, sans lever", async () => {
    mocks.traceEnPanne = true;
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(tracerTraversee({ rpc: mocks.rpc }, { orgId: ORG, nature: "espace", resultat: "autorise" })).resolves.toBe(false);
    expect(erreur).toHaveBeenCalled();
    erreur.mockRestore();
  });

  it("hors requête (contexte inconnu), la trace part comme un geste : on ne prétend pas que c'était une lecture", async () => {
    mocks.horsRequete = true;
    await tracerTraversee({ rpc: mocks.rpc }, { orgId: ORG, nature: "geste", resultat: "autorise" });
    expect(appelsTrace()[0][1]).toMatchObject({ org: ORG, sa_action: "traversee_action", sa_details: { resultat: "autorise" } });
  });
});

describe("D08 — l'entrée dans un espace client par la page (verifierAccesEspace)", () => {
  it("écrit « traversee_espace » avec la page, l'objet et la décision", async () => {
    mocks.entetes = { "x-gerimmo-chemin": `/agence/${ORG}/baux/${BAIL}`, "x-gerimmo-methode": "GET" };
    const espace = await verifierAccesEspace(ORG);
    expect(espace.role).toBe("admin_agence");
    expect(appelsTrace()).toEqual([[
      "log_sa_access",
      { org: ORG, sa_action: "traversee_espace", sa_details: { resultat: "autorise", requete: "page", rubrique: "baux", objet_id: BAIL, route: `/agence/${ORG}/baux/${BAIL}` } },
    ]]);
  });

  it("une organisation inexistante laisse une ligne « refusé » puis renvoie vers les espaces", async () => {
    mocks.organisation = null;
    mocks.entetes = { "x-gerimmo-chemin": `/agence/${ORG}-inconnue/parc`, "x-gerimmo-methode": "GET" };
    await expect(verifierAccesEspace(ORG + "-inconnue")).rejects.toThrow("REDIRECT:/espaces");
    expect(appelsTrace()).toEqual([[
      "log_sa_access",
      { org: ORG + "-inconnue", sa_action: "traversee_espace", sa_details: { resultat: "refuse", requete: "page", motif: "organisation_introuvable", rubrique: "parc", route: `/agence/${ORG}-inconnue/parc` } },
    ]]);
  });

  it("un compte qui n'est pas super-administrateur n'écrit aucune ligne de traversée", async () => {
    mocks.superAdmin = false;
    await expect(verifierAccesEspace(ORG + "-simple")).rejects.toThrow("REDIRECT:/espaces");
    expect(appelsTrace()).toHaveLength(0);
  });

  it("un membre gérant de l'agence n'écrit aucune ligne de traversée", async () => {
    mocks.membre = { role: "admin_agence" };
    mocks.organisation = { id: ORG + "-membre", name: "Agence", status: "active", type: "agence" };
    // Le membre lit son adhésion et son organisation en une seule requête.
    (mocks.membre as Record<string, unknown>).organisation = mocks.organisation;
    await verifierAccesEspace(ORG + "-membre");
    expect(appelsTrace()).toHaveLength(0);
  });

  it("une trace en panne ne bloque pas la page", async () => {
    mocks.traceEnPanne = true;
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const espace = await verifierAccesEspace(ORG + "-panne");
    expect(espace.role).toBe("admin_agence");
    erreur.mockRestore();
  });
});

describe("D08 — un geste dans un espace client (verifierGerant)", () => {
  it("une action serveur écrit « traversee_action », avec son empreinte, la page et l'objet", async () => {
    mocks.entetes = { "x-gerimmo-chemin": `/agence/${ORG}/baux/${BAIL}`, "x-gerimmo-methode": "POST", "next-action": ACTION };
    const acces = await verifierGerant(ORG);
    expect(acces.user).not.toBeNull();
    expect(appelsTrace()).toEqual([[
      "log_sa_access",
      { org: ORG, sa_action: "traversee_action", sa_details: { resultat: "autorise", requete: "action_serveur", rubrique: "baux", objet_id: BAIL, route: `/agence/${ORG}/baux/${BAIL}`, action_ref: ACTION.slice(0, 16) } },
    ]]);
  });

  it("le contrôle d'un dossier au rendu de la page (GET, aucune action) n'écrit PLUS « traversee_action »", async () => {
    mocks.entetes = { "x-gerimmo-chemin": `/agence/${ORG}-lecture/baux/${BAIL}`, "x-gerimmo-methode": "GET" };
    await verifierGerant(ORG + "-lecture");
    expect(appelsTrace()).toHaveLength(1);
    expect(appelsTrace()[0][1]).toMatchObject({ sa_action: "traversee_espace", sa_details: { requete: "page", rubrique: "baux" } });
  });

  it("la lecture d'un fichier (route GET) s'écrit comme une consultation, avec l'objet", async () => {
    mocks.entetes = { "x-gerimmo-chemin": `/agence/${ORG}-fichier/documents/${BAIL}/fichier`, "x-gerimmo-methode": "GET" };
    await verifierGerant(ORG + "-fichier");
    expect(appelsTrace()[0][1]).toMatchObject({ sa_action: "traversee_espace", sa_details: { rubrique: "documents", objet_id: BAIL } });
  });

  it("un formulaire envoyé en POST sans JavaScript reste un geste", async () => {
    mocks.entetes = { "x-gerimmo-chemin": `/agence/${ORG}-formulaire/loyers`, "x-gerimmo-methode": "POST" };
    await verifierGerant(ORG + "-formulaire");
    expect(appelsTrace()[0][1]).toMatchObject({ sa_action: "traversee_action", sa_details: { requete: "formulaire", rubrique: "loyers" } });
  });

  it("une organisation inexistante : refusé, trace « refusé », aucun accès", async () => {
    mocks.organisation = null;
    mocks.entetes = { "x-gerimmo-chemin": `/agence/${ORG}-inconnue/loyers`, "x-gerimmo-methode": "POST", "next-action": ACTION };
    const acces = await verifierGerant(ORG + "-inconnue");
    expect(acces.user).toBeNull();
    expect(appelsTrace()[0][1]).toMatchObject({ sa_action: "traversee_action", sa_details: { resultat: "refuse", motif: "organisation_introuvable" } });
  });

  it("un compte qui n'est pas super-administrateur n'écrit aucune ligne et n'entre pas", async () => {
    mocks.superAdmin = false;
    const acces = await verifierGerant(ORG + "-simple");
    expect(acces.user).toBeNull();
    expect(appelsTrace()).toHaveLength(0);
  });

  it("aucun droit ne change : le rôle rendu au super-administrateur est celui d'avant", async () => {
    expect((await verifierGerant(ORG + "-role")).role).toBe("admin_agence");
    mocks.organisation = { id: ORG, type: "proprietaire_direct" };
    expect((await verifierGerant(ORG + "-role2")).role).toBe("proprietaire_direct");
  });
});
