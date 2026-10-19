/**
 * La garde de souscription (lot B3, 19/10/2026) : deux conditions de contrat
 * vérifiées PAR LE SERVEUR avant tout appel à Stripe, sans Stripe ni base réels.
 *
 *  1. L'identité de l'éditeur, lue dans `supervision_identite` par-dessus le
 *     code (lib/editeur-serveur.ts) : tant qu'un fait requis manque — ou que la
 *     lecture échoue —, ni souscription ni hausse. Le refus est une phrase
 *     exacte, la même à l'écran et dans l'action.
 *  2. La version en vigueur des conditions générales, acceptée par LE COMPTE
 *     qui clique (`acceptations_cgu`) : exigée pour la souscription initiale
 *     seulement (arbitrage du 19/10). L'action qui l'enregistre
 *     (accepterConditionsGenerales) passe par la RPC `accepter_cgu` avec la
 *     source existante la plus proche, 'compte' : aucune migration.
 *
 * Les phrases sont écrites ici en toutes lettres, et non importées : ce test
 * fige le libellé arbitré, il ne le recopie pas depuis le code.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { offreParticulier } from "@/lib/tarifs";

const MOTIF_IDENTITE =
  "Le paiement en ligne n’est pas encore ouvert : les mentions légales de l’éditeur sont en cours de publication. Votre essai continue.";
const MOTIF_CONDITIONS = "Acceptez la version en vigueur des conditions générales avant de poursuivre.";
const VERSION_EN_VIGUEUR = "2026-09-30";

/** Un éditeur fictif complet : les huit faits requis par lib/editeur.ts (domaine example : jamais une adresse réelle). */
const EDITEUR_COMPLET: Record<string, string | null> = {
  denomination: "Éditeur de test",
  forme: "SAS",
  capital: null,
  siege: "1 rue de l'Essai, 75000 Paris",
  rcs: "RCS Paris 000 000 000",
  siret: "00000000000000",
  tvaIntracommunautaire: null,
  directeurPublication: "Personne de test",
  email: "contact@example.com",
  telephone: null,
  mediateurNom: "Médiateur de test",
  mediateurAdresse: null,
  mediateurSite: null,
};
const EDITEUR_VIDE: Record<string, string | null> = Object.fromEntries(Object.keys(EDITEUR_COMPLET).map((k) => [k, null]));

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  serviceRpc: vi.fn(),
  retrieve: vi.fn(),
  lireEditeur: vi.fn(),
  apercu: vi.fn(),
  appliquerHausse: vi.fn(),
  stripePret: true,
  /** Les versions des conditions que la base tient pour acceptées par le compte « compte-1 ». */
  versionsAcceptees: [] as string[],
  /** Les lectures d'`acceptations_cgu`, avec leurs filtres, dans l'ordre. */
  lecturesCgu: [] as [string, unknown][][],
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "www.gerimmo.test", "x-forwarded-proto": "https" }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    auth: { getUser: async () => ({ data: { user: { id: "compte-1" } }, error: null }) },
    from: (table: string) => {
      const filtres: [string, unknown][] = [];
      const q = {
        select: () => q,
        eq: (colonne: string, valeur: unknown) => {
          filtres.push([colonne, valeur]);
          return q;
        },
        order: () => q,
        limit: () => q,
        maybeSingle: async () => {
          if (table === "acceptations_cgu") {
            mocks.lecturesCgu.push(filtres);
            const version = filtres.find(([c]) => c === "version")?.[1];
            const trouvee =
              typeof version === "string" ? mocks.versionsAcceptees.includes(version) : mocks.versionsAcceptees.length > 0;
            return { data: trouvee ? { id: "acceptation-1" } : null, error: null };
          }
          return { data: { id: "org-1", name: "Org", type: "proprietaire_direct", email_contact: null }, error: null };
        },
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  clientDeService: () => ({ rpc: mocks.serviceRpc }),
}));
vi.mock("@/lib/editeur-serveur", () => ({ lireEditeur: () => mocks.lireEditeur() }));
vi.mock("@/lib/stripe", async (importer) => {
  const vrai = await importer<typeof import("@/lib/stripe")>();
  return {
    ...vrai,
    configurationStripe: () =>
      mocks.stripePret ? { pret: true, config: { cle: "sk_test_x", secretWebhook: "whsec_x", prix: {} } } : { pret: false },
    clientStripe: () => ({
      customers: { retrieve: mocks.retrieve, update: vi.fn(async () => ({})) },
      // La page de paiement n'est pas l'objet de ce test : le flux s'arrête
      // net après l'enregistrement du client.
      subscriptions: {
        list: async () => {
          throw new Error("arrêt du test");
        },
      },
    }),
  };
});
vi.mock("@/lib/stripe-offres", async (importer) => ({
  ...(await importer<typeof import("@/lib/stripe-offres")>()),
  apercuChangement: mocks.apercu,
  appliquerHausse: mocks.appliquerHausse,
}));

import { accepterConditionsGenerales, confirmerHausse, demarrerAbonnement } from "@/app/actions/abonnement";
import { GRILLE } from "@/lib/stripe-offres";

const PIED = "TVA non applicable, art. 293 B du CGI.";

function etat(grille: string, souscrit = false) {
  mocks.rpc.mockImplementation(async (nom: string) => {
    if (nom === "etat_abonnement") {
      return {
        data: [{ statut: souscrit ? "actif" : "essai", essai_fin: null, public_tarif: "proprietaire_direct", unites_facturees: 1, en_ligne_possible: true, grille, unites_a_couvrir: 1, unites_souscrites: souscrit ? 1 : null }],
        error: null,
      };
    }
    if (nom === "mon_abonnement") {
      return {
        data: [{ souscrit, periodicite: "mensuel", formule: souscrit ? "solo" : null, unites_souscrites: souscrit ? 1 : null, montant_periode_cents: souscrit ? 1 : null, stripe_statut: souscrit ? "active" : null }],
        error: null,
      };
    }
    if (nom === "mon_client_stripe") return { data: "cus_connu", error: null };
    if (nom === "ma_souscription_stripe") return { data: "sub_test", error: null };
    return { data: null, error: null };
  });
}

function souscrire(): FormData {
  const fd = new FormData();
  fd.set("confirmation", "oui");
  fd.set("periodicite", "mensuel");
  fd.set("formule", "solo");
  fd.set("montant_attendu_cents", "599");
  return fd;
}

function hausse(): FormData {
  const offre = offreParticulier(4, "mensuel");
  const fd = new FormData();
  fd.set("confirmation", "oui");
  fd.set("unites", "4");
  fd.set("formule", offre.formule.code);
  fd.set("montant_attendu_cents", String(offre.montantCents));
  fd.set("proration_date", "1792000000");
  fd.set("immediat_attendu_cents", "250");
  return fd;
}

function identite(editeur: Record<string, string | null>, indisponible = false) {
  mocks.lireEditeur.mockResolvedValue({ editeur, indisponible });
}

const appelsRpc = () => mocks.rpc.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stripePret = true;
  mocks.versionsAcceptees = [VERSION_EN_VIGUEUR];
  mocks.lecturesCgu = [];
  identite(EDITEUR_COMPLET);
  mocks.serviceRpc.mockResolvedValue({ data: true, error: null });
  mocks.retrieve.mockResolvedValue({ id: "cus_connu", metadata: { organization_id: "org-1" }, invoice_settings: { footer: PIED } });
  mocks.apercu.mockResolvedValue({ ok: false, erreur: "arrêt du test" });
  mocks.appliquerHausse.mockResolvedValue({ ok: true, echeancierLibere: false });
});

describe("souscription : l'identité de l'éditeur, lue en base par-dessus le code", () => {
  it("refuse quand un fait requis manque, avant tout appel à Stripe", async () => {
    etat(GRILLE);
    identite(EDITEUR_VIDE);
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toBe(MOTIF_IDENTITE);
    expect(appelsRpc()).not.toContain("mon_client_stripe");
    expect(appelsRpc()).not.toContain("abonnement_client_pose");
    expect(appelsRpc()).not.toContain("accepter_cgu");
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("refuse quand l'identité ne peut pas être lue : fermeture par défaut, même phrase", async () => {
    etat(GRILLE);
    identite(EDITEUR_VIDE, true);
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toBe(MOTIF_IDENTITE);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("un seul fait requis manquant suffit (le médiateur de la consommation)", async () => {
    etat(GRILLE);
    identite({ ...EDITEUR_COMPLET, mediateurNom: null });
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toBe(MOTIF_IDENTITE);
  });

  it("laisse passer une identité complète : le flux atteint l'enregistrement du client", async () => {
    etat(GRILLE);
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toBeDefined(); // la page de paiement s'arrête (voir le faux Stripe)
    expect(r.erreur).not.toBe(MOTIF_IDENTITE);
    expect(mocks.rpc).toHaveBeenCalledWith("abonnement_client_pose", { p_org: "org-1", p_customer: "cus_connu" });
  });

  it("le motif Stripe garde la priorité (banc local sans clés : e2e/abonnement.spec.ts)", async () => {
    etat(GRILLE);
    mocks.stripePret = false;
    identite(EDITEUR_VIDE);
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toMatch(/^Le paiement en ligne n'est pas encore ouvert\. Écrivez-nous/);
    expect(mocks.lireEditeur).not.toHaveBeenCalled();
  });

  it("la grille historique bascule sans lire l'identité : la garde vient après la bascule", async () => {
    etat("historique");
    await expect(demarrerAbonnement("org-1", {}, new FormData())).rejects.toMatchObject({
      url: expect.stringContaining("/abonnement?grille=actuelle"),
    });
    expect(mocks.serviceRpc).toHaveBeenCalledWith("abonnement_basculer_grille", { p_org: "org-1" });
    expect(mocks.lireEditeur).not.toHaveBeenCalled();
  });
});

describe("souscription : la version en vigueur des conditions générales, acceptée par le compte qui clique", () => {
  it("refuse un compte sans aucune acceptation, sans rien enregistrer ni appeler Stripe", async () => {
    etat(GRILLE);
    mocks.versionsAcceptees = [];
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toBe(MOTIF_CONDITIONS);
    expect(appelsRpc()).not.toContain("accepter_cgu");
    expect(appelsRpc()).not.toContain("mon_client_stripe");
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("une acceptation d'une version antérieure ne suffit pas", async () => {
    etat(GRILLE);
    mocks.versionsAcceptees = ["2026-09-24"];
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toBe(MOTIF_CONDITIONS);
  });

  it("la lecture est bornée au compte qui clique et à la version en vigueur (pas à toutes les lignes visibles)", async () => {
    etat(GRILLE);
    await demarrerAbonnement("org-1", {}, souscrire());
    expect(mocks.lecturesCgu).toHaveLength(1);
    expect(mocks.lecturesCgu[0]).toEqual(expect.arrayContaining([["account_id", "compte-1"], ["version", VERSION_EN_VIGUEUR]]));
  });

  it("l'identité passe avant les conditions", async () => {
    etat(GRILLE);
    identite(EDITEUR_VIDE);
    mocks.versionsAcceptees = [];
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toBe(MOTIF_IDENTITE);
  });
});

describe("hausse de capacité : l'identité de l'éditeur seulement", () => {
  it("refuse une hausse quand l'identité manque, avant tout calcul de prorata", async () => {
    etat(GRILLE, true);
    identite(EDITEUR_VIDE);
    const r = await confirmerHausse("org-1", {}, hausse());
    expect(r.erreur).toBe(MOTIF_IDENTITE);
    expect(appelsRpc()).not.toContain("ma_souscription_stripe");
    expect(mocks.apercu).not.toHaveBeenCalled();
    expect(mocks.appliquerHausse).not.toHaveBeenCalled();
  });

  it("laisse passer une identité complète, sans exiger l'acceptation des conditions (périmètre arbitré)", async () => {
    etat(GRILLE, true);
    mocks.versionsAcceptees = [];
    const r = await confirmerHausse("org-1", {}, hausse());
    expect(appelsRpc()).toContain("ma_souscription_stripe");
    expect(mocks.apercu).toHaveBeenCalledOnce();
    expect(r.erreur).toBe("arrêt du test");
    expect(mocks.lecturesCgu).toHaveLength(0);
  });
});

describe("accepterConditionsGenerales : la case de « Mon abonnement »", () => {
  function accepter(version = VERSION_EN_VIGUEUR, cochee = true): FormData {
    const fd = new FormData();
    fd.set("cgu_version", version);
    if (cochee) fd.set("cgu", "oui");
    return fd;
  }

  it("enregistre l'acceptation de la version en vigueur par la RPC accepter_cgu, source « compte »", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const r = await accepterConditionsGenerales({}, accepter());
    expect(r).toEqual({ succes: true });
    expect(mocks.rpc).toHaveBeenCalledWith("accepter_cgu", { p_version: VERSION_EN_VIGUEUR, p_source: "compte" });
  });

  it("refuse une case non cochée, sans rien enregistrer", async () => {
    const r = await accepterConditionsGenerales({}, accepter(VERSION_EN_VIGUEUR, false));
    expect(r.erreur).toBe(MOTIF_CONDITIONS);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuse une version qui n'est plus celle en vigueur (page restée ouverte pendant un déploiement)", async () => {
    const r = await accepterConditionsGenerales({}, accepter("2026-09-24"));
    expect(r.erreur).toMatch(/ont changé depuis l’affichage/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rend une phrase, pas une erreur d'API, quand la base refuse", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "permission denied for function accepter_cgu" } });
    const r = await accepterConditionsGenerales({}, accepter());
    expect(r.erreur).toMatch(/n’a pas pu être enregistrée/);
    expect(r.erreur).not.toMatch(/permission denied/);
    expect(r).not.toHaveProperty("succes", true);
  });
});

describe("les phrases de la garde ne ressemblent pas à une erreur d'écran", () => {
  // = e2e/recette-production/outils.ts, MESSAGES_D_ERREUR : ce que jugerEcran
  // relève comme défaut. Recopiées plutôt qu'importées (outils.ts tire
  // @playwright/test).
  const MESSAGES_D_ERREUR = [
    /Cette page n.a pas pu s.afficher/i,
    /Cette page est introuvable/i,
    /Application error/i,
    /Internal Server Error/i,
    /Impossible d.afficher/i,
    /Lecture impossible/i,
    /n.ont pas pu être lues|n.a pas pu être lue/i,
  ];
  for (const phrase of [MOTIF_IDENTITE, MOTIF_CONDITIONS]) {
    it(`« ${phrase.slice(0, 40)}… » passe la recette`, () => {
      for (const motif of MESSAGES_D_ERREUR) expect(phrase).not.toMatch(motif);
    });
  }
});
