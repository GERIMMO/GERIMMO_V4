/**
 * DÉCISION DU DIRIGEANT DU 24/11/2026, LOT D4 — Q15 : « nouvelle version des conditions, accord exprès du client ».
 *
 * Avant le lot, la version du 24/11/2026 était déclarée « nouvelles souscriptions uniquement » : un Client déjà abonné
 * n'était ni informé ni invité à accepter. Depuis le lot :
 *  1. il voit l'écran « Nos conditions générales évoluent » (rappel à chaque connexion), qui dit que rien ne change
 *     tant qu'il n'a pas répondu ;
 *  2. son accord se donne par une case NON cochée par défaut, à côté du lien vers le texte ; la base garde la date, la
 *     version et l'empreinte du texte archivé (tests/acceptation-conditions-base.test.ts tient l'empreinte) ;
 *  3. l'accord n'est demandé que pour une version ARCHIVÉE (sinon il n'y aurait pas d'empreinte à garder) ;
 *  4. RIEN n'est coupé : jamais de non-reconduction pour cette version, aucun accès fermé ;
 *  5. l'accord est redemandé au prochain acte contractuel : hausse (tests/garde-souscription.test.ts), changement de
 *     périodicité et reprise après une résiliation (ici).
 *
 * Sans base, sans Stripe : tout est simulé. La version en vigueur et sa déclaration sont les VRAIES (lib/editeur.ts,
 * conditions-versions.json) : c'est la déclaration elle-même que ces tests tiennent.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const m = vi.hoisted(() => ({
  /** Les versions des conditions clients que le compte a acceptées (la dernière en premier). */
  acceptees: [] as string[],
  archivee: true,
  archiveIllisible: false,
  lectures: [] as string[],
  rpc: vi.fn(),
  resilier: vi.fn(),
  liberer: vi.fn(),
  verrou: vi.fn(),
  details: {} as Record<string, unknown>,
  etat: {} as Record<string, unknown>,
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));
/** Le client de la session : acceptations du compte, archive des versions, fonctions de la base. */
const client = () => ({
  rpc: m.rpc,
  auth: { getUser: async () => ({ data: { user: { id: "compte-1" } }, error: null }) },
  from: (table: string) => {
    m.lectures.push(table);
    const filtres: Record<string, unknown> = {};
    const q = {
      select: () => q,
      eq: (colonne: string, valeur: unknown) => { filtres[colonne] = valeur; return q; },
      order: () => q,
      limit: () => q,
      maybeSingle: async () => {
        if (table === "versions_conditions") {
          if (m.archiveIllisible) return { data: null, error: { message: "indisponible" } };
          return { data: m.archivee ? { version: filtres.version } : null, error: null };
        }
        if (table === "acceptations_cgu") {
          // Avec un filtre de version : « a-t-il accepté celle-ci ? » ; sans : sa dernière acceptation.
          if (typeof filtres.version === "string") return { data: m.acceptees.includes(filtres.version) ? { id: "acceptation-1" } : null, error: null };
          return { data: m.acceptees.length ? { version: m.acceptees[0] } : null, error: null };
        }
        return { data: null, error: null };
      },
    };
    return q;
  },
});
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "www.gerimmo.test" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ rpc: vi.fn(async () => ({ data: null, error: null })) }) }));
vi.mock("@/lib/stripe", async (importer) => ({
  ...(await importer<typeof import("@/lib/stripe")>()),
  configurationStripe: () => ({ pret: true, config: { cle: "sk_test_x", secretWebhook: "whsec_x", prix: {} } }),
  clientStripe: () => ({ subscriptions: { retrieve: async () => ({}) } }),
}));
vi.mock("@/lib/verrou-facturation", () => ({ prendreVerrouFacturation: m.verrou }));
vi.mock("@/lib/stripe-offres", async (importer) => ({
  ...(await importer<typeof import("@/lib/stripe-offres")>()),
  resilierAEcheance: m.resilier,
  libererEcheancierDe: m.liberer,
  lireDetails: () => m.details,
}));
vi.mock("@/lib/racine-espace-serveur", () => ({ baseDeLOrganisation: async () => "/espace/org-1" }));
vi.mock("@/lib/use-action-state-protegee", () => ({ useActionStateProtegee: () => [m.etat, () => {}, false] }));

import { demanderPeriodicite, resilierAbonnement } from "@/app/actions/abonnement";
import { FormulaireHausse, FormulairePeriodicite } from "@/app/agence/[orgId]/abonnement/boutons-abonnement";
import { EcranNouvelleVersionConditions } from "@/components/ecran-nouvelle-version-conditions";
import { NouvelleVersionConditions } from "@/components/nouvelle-version-conditions";
import { versionDeclaree, versionsDeclarees } from "@/lib/conditions-versions";
import { CONDITIONS_DATE, CONDITIONS_VERSION } from "@/lib/editeur";
import { ERREUR_CONDITIONS_PERIMEES } from "@/lib/garde-souscription";
import { motifSansObjet, poserNonReconductionsConditions } from "@/lib/non-reconduction-conditions";
import {
  accordAuProchainActe, accordExpresRequis, messageActeSansAccord, nouvelleVersionAAccepter, repriseExigeAccord,
} from "@/lib/nouvelle-version-conditions";
import { offrePour } from "@/lib/stripe-offres";

const ORG = "org-1";
const DECLAREE = versionDeclaree("conditions_clients", CONDITIONS_VERSION)!;
const ABONNE = { souscrit: true, periode_fin: "2027-03-01T10:00:00Z", annulation_demandee: false };
const envoi = (valeurs: Record<string, string>) => {
  const fd = new FormData();
  for (const [cle, valeur] of Object.entries(valeurs)) fd.set(cle, valeur);
  return fd;
};
const issue = async (p: Promise<unknown>) => {
  try {
    return (await p) as { erreur?: string; accordConditions?: unknown; redirection?: string };
  } catch (e) {
    return { redirection: (e as { url?: string }).url } as { erreur?: string; accordConditions?: unknown; redirection?: string };
  }
};
const appels = () => m.rpc.mock.calls.map((c) => c[0] as string);
const ACCORD = { p_version: CONDITIONS_VERSION, p_source: "compte", p_document: "conditions_clients" };

beforeEach(() => {
  m.acceptees = ["2026-11-15"];
  m.archivee = true;
  m.archiveIllisible = false;
  m.lectures.length = 0;
  m.etat = {};
  // Un abonnement mensuel au tarif de la grille : demander « annuel » est un vrai changement de périodicité.
  const reference = offrePour("proprietaire_direct", 1, "mensuel", "gerimmo")!;
  m.details = { periodicite: "mensuel", unites: 1, formule: "gerimmo", montantPeriodeCents: reference.montantCents };
  m.rpc.mockReset().mockImplementation(async (nom: string) =>
    nom === "ma_souscription_stripe" ? { data: "sub_1", error: null }
    : nom === "mon_abonnement" ? { data: [ABONNE], error: null }
    : { data: null, error: null });
  m.resilier.mockReset().mockResolvedValue({ ok: true, echeancierLibere: false });
  m.liberer.mockReset().mockResolvedValue({ ok: true, echeancierLibere: false });
  m.verrou.mockReset().mockResolvedValue({ ok: true, proteger: (s: unknown) => s, rendre: vi.fn() });
});

describe("Q15 — la version en vigueur s'adresse aussi au Client déjà abonné, sans jamais couper son abonnement", () => {
  it("elle est déclarée substantielle, « accord au prochain acte », et n'est plus « nouvelles souscriptions uniquement »", () => {
    expect(CONDITIONS_VERSION).toBe("2026-11-24");
    expect(DECLAREE.nature).toBe("substantielle");
    expect(DECLAREE.accord_au_prochain_acte).toBe(true);
    expect(DECLAREE.nouvelles_souscriptions_uniquement).toBeUndefined();
    expect(accordAuProchainActe(DECLAREE)).toBe(true);
    // Les versions précédentes gardent leur déclaration : seule la dernière demande l'accord aux abonnés.
    const autres = versionsDeclarees().filter(([document, version]) => document === "conditions_clients" && version !== CONDITIONS_VERSION);
    expect(autres.length).toBeGreaterThan(0);
    for (const [, version, v] of autres) expect(accordAuProchainActe(v), version).toBe(false);
  });

  it("jamais de non-reconduction pour elle : ni aujourd'hui, ni dans un an, ni après un mois d'archivage", async () => {
    expect(accordExpresRequis(CONDITIONS_VERSION, DECLAREE)).toBe(false);
    for (const jour of ["2026-11-24", "2026-12-31", "2027-11-24", "2099-01-01"]) expect(motifSansObjet(CONDITIONS_VERSION, DECLAREE, jour), jour).toBe("sans_accord_expres");
    // La tâche quotidienne s'arrête avant toute lecture : ni archive, ni abonnements, ni Stripe.
    const base = { from: vi.fn(), rpc: vi.fn() };
    const stripe = new Proxy({}, { get: () => { throw new Error("Stripe ne doit pas être appelé"); } });
    const bilan = await poserNonReconductionsConditions(base as unknown as SupabaseClient, stripe as never, { aujourdhui: "2027-06-01" });
    expect(bilan).toEqual({ motif: "sans_accord_expres", examinees: 0, posees: 0, echecs: [] });
    expect(base.from).not.toHaveBeenCalled();
    expect(base.rpc).not.toHaveBeenCalled();
  });

  it("la règle ne se confond pas avec la non-reconduction, et le drapeau « nouvelles souscriptions uniquement » l'emporte", () => {
    expect(accordAuProchainActe({ ...DECLAREE, nouvelles_souscriptions_uniquement: true })).toBe(false);
    expect(accordAuProchainActe({ ...DECLAREE, nature: "technique" })).toBe(false);
    expect(accordAuProchainActe({ ...DECLAREE, accord_au_prochain_acte: undefined })).toBe(false);
    expect(accordAuProchainActe(null)).toBe(false);
    // Une version substantielle sans le drapeau garde la règle d'avant (non-reconduction faute d'accord).
    expect(accordExpresRequis("2027-01-01", { ...DECLAREE, accord_au_prochain_acte: undefined })).toBe(true);
  });

  it("un acte contractuel exige l'accord à partir de la date d'effet ; jamais pour une version réservée aux nouvelles souscriptions", () => {
    expect(repriseExigeAccord({ aujourdhui: "2026-11-23" })).toBe(false);
    expect(repriseExigeAccord({ aujourdhui: DECLAREE.date_effet })).toBe(true);
    expect(repriseExigeAccord({ aujourdhui: "2027-05-01" })).toBe(true);
    expect(repriseExigeAccord({ version: "2026-11-15", aujourdhui: "2027-05-01" })).toBe(false);
  });
});

describe("Q15 — l'écran « Nos conditions générales évoluent » pour un Client abonné", () => {
  it("il s'affiche, dit ce qui change et que rien n'est coupé sans réponse — sans menace de non-reconduction", () => {
    const ecran = nouvelleVersionAAccepter({ derniereVersionAcceptee: "2026-11-15", abonnement: ABONNE })!;
    expect(ecran).not.toBeNull();
    expect(ecran.version).toBe(CONDITIONS_VERSION);
    expect(ecran.accordExpres).toBe(false);
    expect(ecran.paragraphes).toHaveLength(2);
    expect(ecran.paragraphes[0]).toContain("datée du 24 novembre 2026, est en ligne");
    expect(ecran.paragraphes[0]).toContain("Résumé des changements : Médiation de la consommation (article 17)");
    expect(ecran.paragraphes[1]).toBe(
      "Votre accord est demandé pour cette nouvelle version. Tant que vous ne l’avez pas donné, rien ne change : votre abonnement continue et vos données restent accessibles. " +
      "Il vous sera redemandé à votre prochaine démarche sur votre abonnement (changement de formule, de capacité ou de périodicité, reprise après une résiliation).");
    expect(ecran.paragraphes.join(" ")).not.toMatch(/reconduit|s’applique à compter/);
  });

  it("il ne s'affiche ni pour qui a déjà accepté cette version, ni pour qui n'a jamais rien accepté ; hors abonnement, le texte d'avant", () => {
    expect(nouvelleVersionAAccepter({ derniereVersionAcceptee: CONDITIONS_VERSION, abonnement: ABONNE })).toBeNull();
    expect(nouvelleVersionAAccepter({ derniereVersionAcceptee: null, abonnement: ABONNE })).toBeNull();
    const essai = nouvelleVersionAAccepter({ derniereVersionAcceptee: "2026-11-15", abonnement: { ...ABONNE, souscrit: false } })!;
    expect(essai.paragraphes).toHaveLength(1);
    expect(essai.paragraphes[0]).toContain("s’applique à compter du 24 novembre 2026");
  });

  it("l'accord se donne par une case NON cochée par défaut, obligatoire, dont le libellé porte le lien vers le texte", () => {
    const html = renderToStaticMarkup(createElement(EcranNouvelleVersionConditions, {
      orgId: ORG, version: CONDITIONS_VERSION, dateVersion: CONDITIONS_DATE, paragraphes: ["Premier.", "Second."], report: "x",
    }));
    const cases = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
    expect(cases).toHaveLength(1);
    expect(cases[0]).toContain('name="cgu"');
    expect(cases[0]).toContain('value="oui"');
    expect(cases[0]).toMatch(/\srequired/);
    expect(cases[0]).not.toMatch(/checked/);
    const libelle = /<label[^>]*>[\s\S]*?<\/label>/.exec(html)?.[0] ?? "";
    expect(libelle).toContain("J’ai lu et j’accepte la");
    expect(libelle).toMatch(/<a[^>]*href="\/conditions"[^>]*>version du 24 novembre 2026 des conditions générales d’utilisation et de vente<\/a>/);
    expect(html).toContain(`<input type="hidden" name="cgu_version" value="${CONDITIONS_VERSION}"/>`);
    expect(html).toContain('href="/conditions/versions"');
    // Toujours un encart qui ne bloque rien : « Plus tard » reste proposé.
    expect(html).toContain("Plus tard");
    expect(html).toContain("J’accepte la nouvelle version");
  });

  const rendre = async () => {
    const element = await NouvelleVersionConditions({ supabase: client() as unknown as SupabaseClient, orgId: ORG, compteId: "compte-1", derniereConnexion: null });
    return element === null ? null : (element.props as { version: string; paragraphes: string[] });
  };

  it("posé par la coquille de l'espace pour un abonné qui n'a pas accepté, quand la version est archivée", async () => {
    const props = await rendre();
    expect(props?.version).toBe(CONDITIONS_VERSION);
    expect(props?.paragraphes).toHaveLength(2);
    expect(m.lectures).toContain("versions_conditions");
  });

  it.each([
    ["la version n'est pas encore archivée", () => { m.archivee = false; }],
    ["l'archive ne peut pas être lue", () => { m.archiveIllisible = true; }],
    ["le compte a déjà accepté cette version", () => { m.acceptees = [CONDITIONS_VERSION]; }],
    ["le compte n'a jamais rien accepté", () => { m.acceptees = []; }],
  ])("jamais posé quand %s", async (_libelle, preparer) => {
    preparer();
    expect(await rendre()).toBeNull();
  });
});

describe("Q15 — l'accord est redemandé au changement de périodicité", () => {
  it("nouvelle version archivée, pas encore acceptée : refus qui demande l'accord, rien n'est enregistré ni programmé", async () => {
    const r = await issue(demanderPeriodicite(ORG, {}, envoi({ periodicite: "annuel" })));
    expect(r.erreur).toBe(messageActeSansAccord(CONDITIONS_DATE));
    expect(r.erreur).not.toMatch(/reconduit/);
    expect(r.accordConditions).toEqual({ version: CONDITIONS_VERSION, dateVersion: CONDITIONS_DATE });
    expect(appels()).not.toContain("demander_periodicite_suivante");
    expect(appels()).not.toContain("accepter_cgu");
    expect(m.liberer).not.toHaveBeenCalled();
  });

  it("case cochée sur la version affichée : l'accord est enregistré, puis la demande part", async () => {
    const r = await issue(demanderPeriodicite(ORG, {}, envoi({ periodicite: "annuel", cgu: "oui", cgu_version: CONDITIONS_VERSION })));
    expect(m.rpc).toHaveBeenCalledWith("accepter_cgu", ACCORD);
    expect(appels().indexOf("accepter_cgu")).toBeLessThan(appels().indexOf("demander_periodicite_suivante"));
    expect(r.redirection).toBe("/espace/org-1/abonnement?periodicite=programmee");
  });

  it("case cochée sur une version qui n'est plus celle du serveur : refus, rien d'enregistré", async () => {
    const r = await issue(demanderPeriodicite(ORG, {}, envoi({ periodicite: "annuel", cgu: "oui", cgu_version: "2026-11-15" })));
    expect(r.erreur).toBe(ERREUR_CONDITIONS_PERIMEES);
    expect(appels()).not.toContain("accepter_cgu");
    expect(appels()).not.toContain("demander_periodicite_suivante");
  });

  it.each([
    ["le compte a déjà accepté la version", () => { m.acceptees = [CONDITIONS_VERSION]; }],
    ["la version n'est pas encore archivée (aucune preuve possible)", () => { m.archivee = false; }],
    ["l'archive ne peut pas être lue", () => { m.archiveIllisible = true; }],
  ])("la demande part sans rien demander quand %s", async (_libelle, preparer) => {
    preparer();
    const r = await issue(demanderPeriodicite(ORG, {}, envoi({ periodicite: "annuel" })));
    expect(r.redirection).toBe("/espace/org-1/abonnement?periodicite=programmee");
    expect(appels()).not.toContain("accepter_cgu");
  });

  it("revenir à sa périodicité actuelle (annuler une demande) ne demande jamais l'accord", async () => {
    const r = await issue(demanderPeriodicite(ORG, {}, envoi({ periodicite: "mensuel" })));
    expect(r.redirection).toBe("/espace/org-1/abonnement?periodicite=programmee");
    expect(m.lectures).not.toContain("acceptations_cgu");
  });
});

describe("Q15 — l'accord est redemandé à la reprise après une résiliation ; résilier ne le demande jamais", () => {
  it("nouvelle version archivée, pas encore acceptée : « Annuler la résiliation » demande l'accord, rien ne part chez Stripe", async () => {
    const r = await issue(resilierAbonnement(ORG, {}, envoi({ resilier: "non" })));
    expect(r.erreur).toBe(messageActeSansAccord(CONDITIONS_DATE));
    expect(r.accordConditions).toEqual({ version: CONDITIONS_VERSION, dateVersion: CONDITIONS_DATE });
    expect(m.resilier).not.toHaveBeenCalled();
    expect(m.verrou).not.toHaveBeenCalled();
  });

  it("case cochée : l'accord est enregistré, puis la reprise part", async () => {
    const r = await issue(resilierAbonnement(ORG, {}, envoi({ resilier: "non", cgu: "oui", cgu_version: CONDITIONS_VERSION })));
    expect(m.rpc).toHaveBeenCalledWith("accepter_cgu", ACCORD);
    expect(m.resilier).toHaveBeenCalledOnce();
    expect(r.redirection).toBe("/espace/org-1/abonnement?resiliation=annulee");
  });

  it("version non archivée : la reprise part comme avant, sans rien demander", async () => {
    m.archivee = false;
    const r = await issue(resilierAbonnement(ORG, {}, envoi({ resilier: "non" })));
    expect(r.redirection).toBe("/espace/org-1/abonnement?resiliation=annulee");
    expect(appels()).not.toContain("accepter_cgu");
  });

  it("résilier ne lit rien des acceptations : on ne retient pas un Client qui veut partir", async () => {
    m.acceptees = [];
    await issue(resilierAbonnement(ORG, {}, envoi({ resilier: "oui" })));
    expect(m.lectures).not.toContain("acceptations_cgu");
    expect(m.lectures).not.toContain("versions_conditions");
    expect(appels()).not.toContain("accepter_cgu");
  });
});

describe("Q15 — les formulaires posent la case quand l'action la demande, jamais cochée d'avance", () => {
  const hausse = () => renderToStaticMarkup(createElement(FormulaireHausse, { orgId: ORG, unites: 4, formule: "gerimmo", montantCents: 999, immediatCents: 250, prorationDate: 1792000000, libelleConfirmation: "Je confirme le nouveau montant." }));
  const periodicite = () => renderToStaticMarkup(createElement(FormulairePeriodicite, { orgId: ORG, vers: "annuel", libelle: "Passer à l’annuel" }));
  const caseAccord = (html: string) => /<input[^>]*name="cgu"[^>]*>/.exec(html)?.[0] ?? "";

  it("sans demande de l'action : aucune case des conditions", () => {
    for (const html of [hausse(), periodicite()]) {
      expect(caseAccord(html)).toBe("");
      expect(html).not.toContain("cgu_version");
    }
  });

  it("accord demandé : case requise et non cochée, lien vers le texte, version affichée en champ caché, et le refus", () => {
    m.etat = { erreur: messageActeSansAccord(CONDITIONS_DATE), accordConditions: { version: CONDITIONS_VERSION, dateVersion: CONDITIONS_DATE } };
    for (const html of [hausse(), periodicite()]) {
      expect(caseAccord(html)).toContain('type="checkbox"');
      expect(caseAccord(html)).toContain('value="oui"');
      expect(caseAccord(html)).toMatch(/\srequired/);
      expect(caseAccord(html)).not.toMatch(/checked/);
      expect(html).toContain(`<input type="hidden" name="cgu_version" value="${CONDITIONS_VERSION}"/>`);
      expect(html).toMatch(/<a[^>]*href="\/conditions"[^>]*>version du 24 novembre 2026 des conditions générales<\/a>/);
      expect(html).toContain("Cette démarche modifie votre contrat : acceptez d’abord la version du 24 novembre 2026 des conditions générales.");
    }
  });
});
