/**
 * Relecture adverse du 24/10/2026 (domaine « acceptation », défaut 3) — « Annuler la résiliation » sans accord.
 *
 * Après la date d'effet d'une version des conditions clients qui exige l'accord exprès (R19), un abonnement dont aucun
 * responsable n'a accepté cette version n'est pas reconduit : la tâche quotidienne pose `cancel_at_period_end`. Un Client
 * qui « annulait la résiliation » sans accepter voyait sa reprise défaite le lendemain, sans un mot. La reprise demande
 * désormais l'accord, dans le même geste : une case « J'ai lu et j'accepte la version du … des conditions générales »
 * apparaît sous le bouton, et l'envoi qui la porte enregistre l'accord puis reprend l'abonnement.
 *
 * Aujourd'hui (version 2026-09-30, publiée avant la règle de l'accord exprès), rien ne change : la reprise ne lit même
 * pas les acceptations. Ni Stripe ni base réels ; aucune adresse réelle.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VersionDeclaree } from "@/lib/conditions-versions";

const m = vi.hoisted(() => ({
  version: "2026-09-30",
  date: "30 septembre 2026",
  accepte: false,
  lectureEnEchec: false,
  rpc: vi.fn(),
  resilier: vi.fn(),
  verrou: vi.fn(),
  etat: {} as Record<string, unknown>,
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));
vi.mock("@/lib/editeur", async (importer) => {
  const vrai = await importer<typeof import("@/lib/editeur")>();
  return {
    ...vrai,
    get CONDITIONS_VERSION() {
      return m.version;
    },
    get CONDITIONS_DATE() {
      return m.date;
    },
  };
});
/** Une future version substantielle, déclarée avec la règle de l'accord exprès (fictive), en vigueur le 15/11/2026. */
const V1: VersionDeclaree = { date_effet: "2026-11-15", nature: "substantielle", resume_modifications: "Offre aux seuls propriétaires.", empreinte_reference: "0".repeat(64) };
vi.mock("@/lib/conditions-versions", async (importer) => {
  const vrai = await importer<typeof import("@/lib/conditions-versions")>();
  return {
    ...vrai,
    versionDeclaree: (document: string, version: string) => (document === "conditions_clients" && version === "2026-11-15" ? V1 : vrai.versionDeclaree(document as never, version)),
  };
});
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "www.gerimmo.test" }) }));
const lectures: string[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: m.rpc,
    auth: { getUser: async () => ({ data: { user: { id: "compte-1" } }, error: null }) },
    from: (table: string) => {
      lectures.push(table);
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () =>
          m.lectureEnEchec ? { data: null, error: { message: "indisponible" } } : { data: m.accepte ? { id: "acceptation-1" } : null, error: null },
      };
      return q;
    },
  }),
}));
// Intégration avec la vente (R04, I3) : l'action consigne la notification et efface la marque de l'accusé par la clé de
// service ; comme un vrai client Supabase, l'appel rend toujours { data, error }.
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ rpc: vi.fn(async () => ({ data: null, error: null })) }) }));
vi.mock("@/lib/stripe", async (importer) => ({
  ...(await importer<typeof import("@/lib/stripe")>()),
  configurationStripe: () => ({ pret: true, config: { cle: "sk_test_x", secretWebhook: "whsec_x", prix: {} } }),
  clientStripe: () => ({}),
}));
vi.mock("@/lib/verrou-facturation", () => ({ prendreVerrouFacturation: m.verrou }));
vi.mock("@/lib/stripe-offres", async (importer) => ({
  ...(await importer<typeof import("@/lib/stripe-offres")>()),
  resilierAEcheance: m.resilier,
}));
vi.mock("@/lib/racine-espace-serveur", () => ({ baseDeLOrganisation: async () => "/espace/org-1" }));
// Le rendu du bouton : l'état d'après le refus est simulé (en rendu serveur, l'état initial est toujours rendu).
vi.mock("@/lib/use-action-state-protegee", () => ({ useActionStateProtegee: () => [m.etat, () => {}, false] }));

import { resilierAbonnement } from "@/app/actions/abonnement";
import { BoutonResiliation } from "@/app/agence/[orgId]/abonnement/boutons-abonnement";
import { messageRepriseSansAccord, repriseExigeAccord } from "@/lib/nouvelle-version-conditions";
import { ERREUR_ACCEPTATION_CONDITIONS, ERREUR_CONDITIONS_PERIMEES } from "@/lib/garde-souscription";

const ORG = "org-1";
const envoi = (valeurs: Record<string, string>) => {
  const fd = new FormData();
  for (const [cle, valeur] of Object.entries(valeurs)) fd.set(cle, valeur);
  return fd;
};
const issue = async (p: Promise<unknown>) => {
  try {
    return await p;
  } catch (e) {
    return { redirection: (e as { url?: string }).url };
  }
};
const accepterCgu = () => m.rpc.mock.calls.filter(([nom]) => nom === "accepter_cgu");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T10:00:00Z"));
  m.version = "2026-09-30";
  m.date = "30 septembre 2026";
  m.accepte = false;
  m.lectureEnEchec = false;
  m.etat = {};
  lectures.length = 0;
  m.rpc.mockReset().mockImplementation(async (nom: string) => (nom === "ma_souscription_stripe" ? { data: "sub_1", error: null } : { data: null, error: null }));
  m.resilier.mockReset().mockResolvedValue({ ok: true, echeancierLibere: false });
  m.verrou.mockReset().mockResolvedValue({ ok: true, proteger: (s: unknown) => s, rendre: vi.fn() });
});
afterEach(() => vi.useRealTimers());

describe("la reprise exige-t-elle l'accord ? (règle pure)", () => {
  it("jamais pour la version en vigueur, publiée avant la règle de l'accord exprès", () => {
    expect(repriseExigeAccord({ aujourdhui: "2099-01-01" })).toBe(false);
  });

  it("une version substantielle avec accord exprès : à partir de sa date d'effet seulement", () => {
    expect(repriseExigeAccord({ version: "2026-11-15", declaree: V1, aujourdhui: "2026-11-14" })).toBe(false);
    expect(repriseExigeAccord({ version: "2026-11-15", declaree: V1, aujourdhui: "2026-11-15" })).toBe(true);
    expect(repriseExigeAccord({ version: "2026-11-15", declaree: V1, aujourdhui: "2027-01-01" })).toBe(true);
  });

  it("une version technique, ou non déclarée : jamais", () => {
    expect(repriseExigeAccord({ version: "2026-11-15", declaree: { ...V1, nature: "technique" }, aujourdhui: "2026-12-01" })).toBe(false);
    expect(repriseExigeAccord({ version: "2026-11-15", declaree: null, aujourdhui: "2026-12-01" })).toBe(false);
  });
});

describe("« Annuler la résiliation » (resilierAbonnement, resilier = non)", () => {
  it("aujourd'hui : la reprise part chez Stripe sans rien lire des acceptations", async () => {
    const r = await issue(resilierAbonnement(ORG, {}, envoi({ resilier: "non" })));
    expect(r).toEqual({ redirection: "/espace/org-1/abonnement?resiliation=annulee" });
    expect(m.resilier).toHaveBeenCalledWith(expect.anything(), { subscription: "sub_1", resilier: false, metadata: { gerimmo_non_reconduction: "" } });
    expect(lectures).not.toContain("acceptations_cgu");
    expect(accepterCgu()).toEqual([]);
  });

  it("finitions du 24/10 (I4) : une fermeture programmée du compte refuse la reprise comme la résiliation, sans geste chez Stripe", async () => {
    m.rpc.mockImplementation(async (nom: string) =>
      nom === "ma_souscription_stripe" ? { data: "sub_1", error: null }
        : nom === "fermeture_programmee_de" ? { data: [{ effacement_prevu_le: "2026-11-08", choix: "fin_periode" }], error: null }
          : { data: null, error: null });
    for (const resilier of ["non", "oui"]) {
      const r = await issue(resilierAbonnement(ORG, {}, envoi({ resilier })));
      expect(r).toEqual({ erreur: expect.stringContaining("La fermeture de votre compte est programmée") });
    }
    expect(m.resilier).not.toHaveBeenCalled();
    // Vérification impossible : rien ne part non plus.
    m.rpc.mockImplementation(async (nom: string) =>
      nom === "ma_souscription_stripe" ? { data: "sub_1", error: null }
        : nom === "fermeture_programmee_de" ? { data: null, error: { message: "panne" } }
          : { data: null, error: null });
    expect(await issue(resilierAbonnement(ORG, {}, envoi({ resilier: "non" })))).toEqual({ erreur: expect.stringContaining("n'a pas pu être vérifiée") });
    expect(m.resilier).not.toHaveBeenCalled();
  });

  it("après la date d'effet, sans accord : refus qui demande l'accord, rien chez Stripe, aucun verrou", async () => {
    m.version = "2026-11-15";
    m.date = "15 novembre 2026";
    const r = await issue(resilierAbonnement(ORG, {}, envoi({ resilier: "non" })));
    expect(r).toEqual({ erreur: messageRepriseSansAccord("15 novembre 2026"), accordConditions: { version: "2026-11-15", dateVersion: "15 novembre 2026" } });
    expect(m.resilier).not.toHaveBeenCalled();
    expect(m.verrou).not.toHaveBeenCalled();
    expect(accepterCgu()).toEqual([]);
  });

  it("après la date d'effet, case cochée sur la version affichée : l'accord est enregistré, puis la reprise part", async () => {
    m.version = "2026-11-15";
    const r = await issue(resilierAbonnement(ORG, {}, envoi({ resilier: "non", cgu: "oui", cgu_version: "2026-11-15" })));
    expect(r).toEqual({ redirection: "/espace/org-1/abonnement?resiliation=annulee" });
    expect(accepterCgu()).toEqual([["accepter_cgu", { p_version: "2026-11-15", p_source: "compte", p_document: "conditions_clients" }]]);
    const ordre = m.rpc.mock.invocationCallOrder[m.rpc.mock.calls.findIndex(([nom]) => nom === "accepter_cgu")];
    expect(ordre).toBeLessThan(m.resilier.mock.invocationCallOrder[0]);
  });

  it("case cochée sur une version qui n'est plus celle du serveur : refus, rien d'enregistré", async () => {
    m.version = "2026-11-15";
    const r = await issue(resilierAbonnement(ORG, {}, envoi({ resilier: "non", cgu: "oui", cgu_version: "2026-09-30" })));
    expect(r).toMatchObject({ erreur: ERREUR_CONDITIONS_PERIMEES, accordConditions: { version: "2026-11-15" } });
    expect(accepterCgu()).toEqual([]);
    expect(m.resilier).not.toHaveBeenCalled();
  });

  it("accord non enregistré : refus, rien chez Stripe", async () => {
    m.version = "2026-11-15";
    m.rpc.mockImplementation(async (nom: string) =>
      nom === "ma_souscription_stripe" ? { data: "sub_1", error: null } : nom === "accepter_cgu" ? { data: null, error: { message: "indisponible" } } : { data: null, error: null }
    );
    const r = await issue(resilierAbonnement(ORG, {}, envoi({ resilier: "non", cgu: "oui", cgu_version: "2026-11-15" })));
    expect(r).toMatchObject({ erreur: ERREUR_ACCEPTATION_CONDITIONS });
    expect(m.resilier).not.toHaveBeenCalled();
  });

  it("le compte a déjà accepté la version : la reprise part sans case", async () => {
    m.version = "2026-11-15";
    m.accepte = true;
    const r = await issue(resilierAbonnement(ORG, {}, envoi({ resilier: "non" })));
    expect(r).toEqual({ redirection: "/espace/org-1/abonnement?resiliation=annulee" });
    expect(accepterCgu()).toEqual([]);
  });

  it("avant la date d'effet : la reprise part sans rien demander", async () => {
    m.version = "2026-11-15";
    vi.setSystemTime(new Date("2026-11-10T10:00:00Z"));
    const r = await issue(resilierAbonnement(ORG, {}, envoi({ resilier: "non" })));
    expect(r).toEqual({ redirection: "/espace/org-1/abonnement?resiliation=annulee" });
  });

  it("résilier n'exige jamais l'accord, même après la date d'effet", async () => {
    m.version = "2026-11-15";
    const r = await issue(resilierAbonnement(ORG, {}, envoi({ resilier: "oui" })));
    // Intégration avec la vente (R04, I3) : la résiliation part ; l'écran dit aussi que l'accusé n'a pas pu partir
    // (« &accuse=echec »), le Stripe simulé ne rendant pas de fin de période.
    expect(r).toEqual({ redirection: "/espace/org-1/abonnement?resiliation=programmee&accuse=echec" });
    expect(lectures).not.toContain("acceptations_cgu");
  });
});

describe("le bouton « Annuler la résiliation » pose la case quand l'action la demande", () => {
  const rendre = (resilier: boolean) => renderToStaticMarkup(createElement(BoutonResiliation, { orgId: ORG, resilier, libelle: resilier ? "Résilier" : "Annuler la résiliation" }));

  it("sans demande d'accord : aucune case", () => {
    expect(rendre(false)).not.toContain('name="cgu"');
  });

  it("accord demandé : case requise, lien vers la version, version affichée en champ caché, et le refus", () => {
    m.etat = { erreur: messageRepriseSansAccord("15 novembre 2026"), accordConditions: { version: "2026-11-15", dateVersion: "15 novembre 2026" } };
    const html = rendre(false);
    const caseCgu = html.match(/<input type="checkbox"[^>]*>/)?.[0] ?? "";
    expect(caseCgu).toContain('name="cgu"');
    expect(caseCgu).toContain('value="oui"');
    expect(caseCgu).toContain('required=""');
    expect(html).toContain('name="cgu_version" value="2026-11-15"');
    expect(html).toContain("J’ai lu et j’accepte la ");
    expect(html).toContain('href="/conditions"');
    expect(html).toContain("version du 15 novembre 2026 des conditions générales");
    expect(html).toContain(messageRepriseSansAccord("15 novembre 2026"));
  });
});
