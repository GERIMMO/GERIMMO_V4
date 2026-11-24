/**
 * La garde de souscription (lot B3, 19/10/2026) : deux conditions de contrat
 * vérifiées PAR LE SERVEUR avant tout appel à Stripe, sans Stripe ni base réels.
 *
 *  1. L'identité de l'éditeur, lue dans `supervision_identite` par-dessus le
 *     code (lib/editeur-serveur.ts) : tant qu'un fait requis manque — ou que la
 *     lecture échoue —, ni souscription ni hausse. Le refus est une phrase
 *     exacte, la même à l'écran et dans l'action ; elle se termine par « Votre
 *     essai continue. » seulement si l'essai court encore (correction du
 *     19/10) : un essai gelé en lecture seule ou un client abonné lisent la
 *     phrase sans cette fin.
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
import { CONDITIONS_DATE, CONDITIONS_VERSION } from "@/lib/editeur";

/** Pendant l'essai : la phrase complète (celle que la recette de production lit, compte en essai). */
const MOTIF_IDENTITE =
  "Le paiement en ligne n'est pas encore ouvert : les mentions légales de l'éditeur sont en cours de publication. Votre essai continue.";
/** Compte gelé en lecture seule ou déjà abonné : la même phrase, sans « Votre essai continue. ». */
const MOTIF_IDENTITE_HORS_ESSAI =
  "Le paiement en ligne n'est pas encore ouvert : les mentions légales de l'éditeur sont en cours de publication.";
const MOTIF_CONDITIONS = "Acceptez la version en vigueur des conditions générales avant de poursuivre.";
const ERREUR_CONDITIONS_PERIMEES =
  "Les conditions ont changé depuis l’affichage : rechargez la page, puis acceptez la version en vigueur.";
const ERREUR_ACCEPTATION_CONDITIONS =
  "L’acceptation des conditions n’a pas pu être enregistrée. Réessayez dans un instant.";
// La version en vigueur lue dans le code : la V1 (date provisoire, lib/editeur.ts) en change la valeur, pas la règle.
const VERSION_EN_VIGUEUR = CONDITIONS_VERSION;

/** Un éditeur fictif complet : les huit faits requis par lib/editeur.ts (domaine example : jamais une adresse réelle). */
const EDITEUR_COMPLET: Record<string, string | null> = {
  denomination: "Éditeur de test",
  forme: "SAS",
  // Seconde reprise du 24/11/2026 (T4R-03) : le type de vendeur est un choix explicite ; sans lui, le vendeur est incomplet.
  typeVendeur: "personne_morale",
  capital: null,
  siege: "1 rue de l'Essai, 75000 Paris",
  rcs: "RCS Paris 000 000 000",
  siret: "00000000000000",
  tvaIntracommunautaire: null,
  directeurPublication: "Personne de test",
  email: "contact@example.com",
  telephone: "01 00 00 00 00",
  mediateurNom: "Médiateur de test",
  mediateurAdresse: "1 rue Exemple, Paris",
  mediateurSite: "https://example.test/mediateur",
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
  archive: null as { identite_editeur: Record<string, string | null> } | null,
  reglage: { data: { blocage_souscription_identite: true, revision: 0 }, error: null } as { data: unknown; error: unknown },
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
        // Reprise D4 (D4R-01) : la preuve d'accord ne lit que les lignes à empreinte (`versionsAcceptees` en porte une).
        not: (colonne: string, operateur: string, valeur: unknown) => {
          filtres.push([`${colonne} non ${operateur}`, valeur]);
          return q;
        },
        order: () => q,
        limit: () => q,
        maybeSingle: async () => {
          if (table === "supervision_identite") return mocks.reglage;
          if (table === "versions_conditions") {
            expect(filtres).toEqual([["document", "conditions_clients"], ["version", VERSION_EN_VIGUEUR]]);
            return { data: mocks.archive, error: null };
          }
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
import { messageActeSansAccord } from "@/lib/nouvelle-version-conditions";

const PIED = "TVA non applicable, article 293 B du CGI.";

/**
 * L'état lu par l'action. `ecritureOuverte` faux = compte gelé en lecture
 * seule ; un essai arrivé à son terme garde le statut « essai »
 * (public.org_ecriture_ouverte ferme à la date, sans changement de statut).
 */
function etat(grille: string, souscrit = false, ecritureOuverte = true, publicTarif: "proprietaire_direct" | "agence" = "proprietaire_direct") {
  mocks.rpc.mockImplementation(async (nom: string) => {
    if (nom === "etat_abonnement") {
      return {
        data: [{ statut: souscrit ? "active" : "essai", ecriture_ouverte: ecritureOuverte, essai_fin: null, public_tarif: publicTarif, unites_facturees: 1, en_ligne_possible: true, grille, unites_a_couvrir: 1, unites_souscrites: souscrit ? 1 : null }],
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
  fd.set("formule", "gerimmo");
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
  mocks.archive = { identite_editeur: EDITEUR_COMPLET };
  mocks.reglage = { data: { blocage_souscription_identite: true, revision: 0 }, error: null };
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

  it("un seul fait requis manquant suffit (le téléphone de contact)", async () => {
    etat(GRILLE);
    identite({ ...EDITEUR_COMPLET, telephone: null });
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toBe(MOTIF_IDENTITE);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("en commercial, même un dossier complet ne peut ouvrir un nouvel abonnement pendant le pilote", async () => {
    etat(GRILLE);
    vi.stubEnv("GERIMMO_MODE","commercial");
    try {
      const r = await demarrerAbonnement("org-1", {}, souscrire());
      expect(r.erreur).toContain("pilote gratuit");
      expect(mocks.retrieve).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });

  it("en production commerciale, relit le choix du dirigeant à chaque tentative", async () => {
    etat(GRILLE);
    vi.stubEnv("GERIMMO_MODE", "commercial");
    vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app");
    try {
      mocks.reglage = { data: { souscriptions_payantes_ouvertes: true, blocage_souscription_identite: true, revision: 1 }, error: null };
      mocks.versionsAcceptees = [];
      expect((await demarrerAbonnement("org-1", {}, souscrire())).erreur).toBe(MOTIF_CONDITIONS);
      mocks.reglage = { data: { souscriptions_payantes_ouvertes: false, blocage_souscription_identite: true, revision: 2 }, error: null };
      expect((await demarrerAbonnement("org-1", {}, souscrire())).erreur).toContain("pilote gratuit");
      expect(mocks.retrieve).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });

  // REPRISE DU LOT D7 (24/11/2026, décision de pilotage). Le commit D7 avait retiré toute fermeture par le médiateur ;
  // ses tests disaient « sans médiateur, le parcours Stripe s'ouvre ». Le recueil fourni par le dirigeant contient les
  // articles L. 612-1 et L. 616-1 du code de la consommation : PAR DÉFAUT, la première souscription d'un particulier
  // reste donc fermée sans médiateur ; lever le blocage l'ouvre, en connaissance de cause ; un professionnel n'est pas
  // concerné ; et sans vendeur, rien ne s'ouvre, blocage levé ou non, agence comprise. Les tests ci-dessous disent
  // cette règle ; celui qui affirmait « le médiateur ne ferme plus rien » est réécrit pour dire l'inverse.
  const SANS_MEDIATEUR = { ...EDITEUR_COMPLET, mediateurNom: null, mediateurAdresse: null, mediateurSite: null };
  // Seconde reprise du 24/11/2026 (relecture T4R-08) : l'ancienne phrase (« les coordonnées du médiateur de la
  // consommation de Gerimmo doivent être publiées ») laissait entendre qu'un médiateur existait déjà. Phrase corrigée.
  const MOTIF_MEDIATEUR_ESSAI =
    "Le paiement en ligne n'est pas encore ouvert aux particuliers. Un médiateur de la consommation doit d'abord être désigné, et ses coordonnées publiées, avant la première souscription. Votre essai continue.";

  it("particulier, sans médiateur, vendeur complet, règle active (par défaut) : le parcours Stripe reste fermé, avec sa phrase", async () => {
    etat(GRILLE);
    identite(SANS_MEDIATEUR);
    mocks.archive = { identite_editeur: SANS_MEDIATEUR };
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toBe(MOTIF_MEDIATEUR_ESSAI);
    expect(mocks.lecturesCgu).toEqual([]);
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });

  it.each(["mediateurNom", "mediateurAdresse", "mediateurSite"])(
    "particulier, règle active, seul %s manque : fermé (un médiateur sans coordonnées complètes n'est pas désigné)",
    async (cle) => {
      etat(GRILLE);
      identite({ ...EDITEUR_COMPLET, [cle]: null });
      const r = await demarrerAbonnement("org-1", {}, souscrire());
      expect(r.erreur).toBe(MOTIF_MEDIATEUR_ESSAI);
      expect(mocks.retrieve).not.toHaveBeenCalled();
    },
  );

  it("professionnel (agence), sans médiateur, vendeur complet, règle active : ni le médiateur ni le vendeur ne ferment", async () => {
    etat(GRILLE, false, true, "agence");
    identite(SANS_MEDIATEUR);
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    // Le flux a dépassé la garde du vendeur et du médiateur : il a lu l'acceptation des conditions, contrôle qui la
    // suit dans l'action (la suite du parcours d'une agence n'est pas l'objet de ce test).
    expect(r.erreur ?? "").not.toContain("médiateur");
    expect(r.erreur).not.toBe(MOTIF_IDENTITE);
    expect(mocks.lecturesCgu.length).toBeGreaterThan(0);
  });

  // Relecture D7R-04 : la première souscription d'une agence restait ouverte sans vendeur quand la règle était levée.
  it.each([true, false])("professionnel (agence), sans vendeur, règle active = %s : la première souscription reste fermée", async (actif) => {
    etat(GRILLE, false, true, "agence");
    identite({ ...EDITEUR_VIDE });
    mocks.reglage = { data: { blocage_souscription_identite: actif, revision: 1 }, error: null };
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toBe(MOTIF_IDENTITE);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  // Relecture D7R-05 : une identité enregistrée avant le contrôle de saisie (« NOM Prénom » sans « EI ») ne vend pas.
  it.each([true, false])("entrepreneur individuel dont le nom ne porte pas « EI », règle active = %s : fermé comme un vendeur incomplet", async (actif) => {
    etat(GRILLE);
    // Seconde reprise (T4R-03) : c'est le type de vendeur CHOISI qui fait exiger « EI », plus le texte de la forme.
    identite({ ...EDITEUR_COMPLET, typeVendeur: "entrepreneur_individuel", forme: "Entrepreneur individuel", denomination: "DUPONT Jeanne" });
    mocks.reglage = { data: { blocage_souscription_identite: actif, revision: 1 }, error: null };
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toBe(MOTIF_IDENTITE);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it.each(["denomination", "forme", "siege", "rcs", "siret", "directeurPublication", "email", "telephone"])(
    "sans vendeur (%s manquant), médiateur saisi : le parcours Stripe reste fermé",
    async (cle) => {
      etat(GRILLE);
      identite({ ...EDITEUR_COMPLET, [cle]: null });
      const r = await demarrerAbonnement("org-1", {}, souscrire());
      expect(r.erreur).toBe(MOTIF_IDENTITE);
      expect(mocks.retrieve).not.toHaveBeenCalled();
    },
  );

  it("refuse la première souscription d'un particulier même si le verrou facultatif est levé, sans vendeur", async () => {
    etat(GRILLE);
    identite({ ...EDITEUR_VIDE });
    mocks.archive = { identite_editeur: { ...EDITEUR_VIDE } };
    mocks.reglage = {data:{blocage_souscription_identite:false,revision:1},error:null};
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toBe(MOTIF_IDENTITE);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  // Seconde reprise du 24/11/2026 (relecture T4R-02). Ce test affirmait « verrou levé : le parcours Stripe s'ouvre au
  // particulier sans médiateur ». Une levée enregistrée AVANT le lot (elle ne visait alors que les hausses) aurait donc
  // ouvert d'office la vente sans médiateur au déploiement. La levée seule ne l'ouvre plus : il faut la décision à
  // part, datée (`vente_particuliers_sans_mediateur_le`).
  it("T4R-02 : verrou levé par le super admin (levée d'avant le lot), vendeur complet, sans médiateur — le particulier reste FERMÉ", async () => {
    etat(GRILLE);
    const sansMediateur = { ...EDITEUR_COMPLET, mediateurNom: null, mediateurAdresse: null, mediateurSite: null };
    identite(sansMediateur);
    mocks.archive = { identite_editeur: sansMediateur };
    for (const data of [
      { blocage_souscription_identite: false, revision: 1 },
      { blocage_souscription_identite: false, revision: 1, vente_particuliers_sans_mediateur_le: null },
      // Une valeur qui n'est pas une date (colonne mal lue) ne vaut pas décision.
      { blocage_souscription_identite: false, revision: 1, vente_particuliers_sans_mediateur_le: true },
      { blocage_souscription_identite: false, revision: 1, vente_particuliers_sans_mediateur_le: "oui" },
    ]) {
      mocks.reglage = { data, error: null };
      const r = await demarrerAbonnement("org-1", {}, souscrire());
      expect(r.erreur).toBe(MOTIF_MEDIATEUR_ESSAI);
    }
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });

  it.each([true, false])("T4R-02 : décision datée « vendre aux particuliers sans médiateur », blocage actif = %s — le parcours Stripe s'ouvre au particulier", async (actif) => {
    etat(GRILLE);
    const sansMediateur = { ...EDITEUR_COMPLET, mediateurNom: null, mediateurAdresse: null, mediateurSite: null };
    identite(sansMediateur);
    mocks.archive = { identite_editeur: sansMediateur };
    mocks.reglage = { data: { blocage_souscription_identite: actif, revision: 1, vente_particuliers_sans_mediateur_le: "2026-11-25T09:00:00+00:00" }, error: null };
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).not.toBe(MOTIF_IDENTITE);
    expect(r.erreur).not.toBe(MOTIF_MEDIATEUR_ESSAI);
    expect(mocks.serviceRpc).toHaveBeenCalledWith("abonnement_client_pose", { p_org: "org-1", p_customer: "cus_connu" });
  });

  it("T4R-02 : la décision datée n'ouvre rien si le vendeur est incomplet", async () => {
    etat(GRILLE);
    identite({ ...EDITEUR_VIDE });
    mocks.reglage = { data: { blocage_souscription_identite: false, revision: 1, vente_particuliers_sans_mediateur_le: "2026-11-25T09:00:00+00:00" }, error: null };
    expect((await demarrerAbonnement("org-1", {}, souscrire())).erreur).toBe(MOTIF_IDENTITE);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("essai arrivé à son terme (gelé en lecture seule, statut encore « essai ») : la phrase sans « Votre essai continue »", async () => {
    etat(GRILLE, false, false);
    identite(EDITEUR_VIDE);
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toBe(MOTIF_IDENTITE_HORS_ESSAI);
    expect(r.erreur).not.toContain("Votre essai continue");
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("laisse passer une identité complète : le flux atteint l'enregistrement du client", async () => {
    etat(GRILLE);
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toBeDefined(); // la page de paiement s'arrête (voir le faux Stripe)
    expect(r.erreur).not.toBe(MOTIF_IDENTITE);
    expect(mocks.serviceRpc).toHaveBeenCalledWith("abonnement_client_pose", { p_org: "org-1", p_customer: "cus_connu" });
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

// LOT D7 (décision du dirigeant du 24/11/2026, Q7) : la levée du blocage n'ouvre plus la PREMIÈRE souscription d'un
// particulier quand le vendeur n'est pas identifié. Le test « autorise le parcours de souscription malgré l'identité
// incomplète » est donc RÉÉCRIT (il attend désormais le refus) ; les tests voisins, qui se servaient de l'identité vide
// pour vérifier les AUTRES contrôles d'une souscription (conditions, confirmation, montant, Stripe), lèvent le blocage
// avec un vendeur complet et sans médiateur (`leverAvecVendeur`) : ils vérifient toujours le même contrôle.
describe("levée du blocage par le superadmin", () => {
  function leverAvecVendeur() {
    const sansMediateur = { ...EDITEUR_COMPLET, mediateurNom: null, mediateurAdresse: null, mediateurSite: null };
    mocks.archive = { identite_editeur: sansMediateur };
    identite(sansMediateur);
    // Seconde reprise (T4R-02) : sans médiateur, la levée du blocage ne suffit plus ; ces tests, qui vérifient les
    // AUTRES contrôles d'une souscription, portent aussi la décision datée de vendre sans médiateur.
    mocks.reglage = { data: { blocage_souscription_identite: false, revision: 1, vente_particuliers_sans_mediateur_le: "2026-11-25T09:00:00+00:00" }, error: null };
  }
  function lever() {
    mocks.archive = { identite_editeur: { ...EDITEUR_VIDE, mediateurNom: EDITEUR_COMPLET.mediateurNom, mediateurAdresse: EDITEUR_COMPLET.mediateurAdresse, mediateurSite: EDITEUR_COMPLET.mediateurSite } };
    identite({ ...EDITEUR_VIDE, mediateurNom: EDITEUR_COMPLET.mediateurNom, mediateurAdresse: EDITEUR_COMPLET.mediateurAdresse, mediateurSite: EDITEUR_COMPLET.mediateurSite });
    mocks.reglage = { data: { blocage_souscription_identite: false, revision: 1 }, error: null };
  }

  it("n'autorise plus la première souscription d'un particulier quand l'identité du vendeur est incomplète", async () => {
    etat(GRILLE);
    lever();
    expect((await demarrerAbonnement("org-1", {}, souscrire())).erreur).toBe(MOTIF_IDENTITE);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("vendeur complet, sans médiateur : la souscription atteint Stripe", async () => {
    etat(GRILLE);
    leverAvecVendeur();
    await demarrerAbonnement("org-1", {}, souscrire());
    expect(mocks.retrieve).toHaveBeenCalled();
  });

  it("autorise l'aperçu du prorata d'une hausse confirmée", async () => {
    etat(GRILLE, true);
    lever();
    const r = await confirmerHausse("org-1", {}, hausse());
    expect(mocks.apercu).toHaveBeenCalledOnce();
    expect(r.erreur).toBe("arrêt du test");
  });

  it("exige toujours les conditions générales", async () => {
    etat(GRILLE);
    leverAvecVendeur();
    mocks.versionsAcceptees = [];
    expect((await demarrerAbonnement("org-1", {}, souscrire())).erreur).toBe(MOTIF_CONDITIONS);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("ne permet ni une souscription sans confirmation ni un montant différent", async () => {
    etat(GRILLE);
    leverAvecVendeur();
    const sansConfirmation = souscrire(); sansConfirmation.delete("confirmation");
    expect((await demarrerAbonnement("org-1", {}, sansConfirmation)).erreur).toBeTruthy();
    const montantModifie = souscrire(); montantModifie.set("montant_attendu_cents", "1");
    expect((await demarrerAbonnement("org-1", {}, montantModifie)).erreur).toBeTruthy();
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("conserve le refus lorsque Stripe n'est pas configuré", async () => {
    etat(GRILLE);
    leverAvecVendeur();
    mocks.stripePret = false;
    expect((await demarrerAbonnement("org-1", {}, souscrire())).erreur).toBeTruthy();
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("un champ forgé dans le formulaire ne lève pas la règle", async () => {
    etat(GRILLE);
    identite(EDITEUR_VIDE);
    const form = souscrire(); form.set("blocage_souscription_identite", "false");
    expect((await demarrerAbonnement("org-1", {}, form)).erreur).toBe(MOTIF_IDENTITE);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: null },
    { data: { blocage_souscription_identite: false, revision: 1 }, error: { message: "lecture impossible" } },
    { data: { blocage_souscription_identite: "false", revision: 1 }, error: null },
    { data: { blocage_souscription_identite: false }, error: null },
  ])("conserve la règle si le réglage est absent, invalide ou indisponible : %j", async (reglage) => {
    etat(GRILLE);
    identite(EDITEUR_VIDE);
    mocks.reglage = reglage;
    expect((await demarrerAbonnement("org-1", {}, souscrire())).erreur).toBe(MOTIF_IDENTITE);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("relit le réglage après sa réactivation, même pour un écran déjà ouvert", async () => {
    etat(GRILLE);
    lever();
    const { lireGardeSouscription } = await import("@/lib/garde-souscription-serveur");
    const { createClient } = await import("@/lib/supabase/server");
    const garde = await lireGardeSouscription(await createClient(), "compte-1");
    const { motifIdentiteEditeur } = await import("@/lib/garde-souscription");
    expect(motifIdentiteEditeur(garde.editeur, { enEssai: true, blocageIdentiteActif: garde.blocageIdentiteActif })).toBeNull();
    mocks.reglage = { data: { blocage_souscription_identite: true, revision: 2 }, error: null };
    expect((await demarrerAbonnement("org-1", {}, souscrire())).erreur).toBe(MOTIF_IDENTITE);
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

  // Reprise du lot D7 (relecture D7R-02). Ce test refusait aussi la commande quand le MÉDIATEUR archivé différait :
  // saisir le médiateur après l'ouverture refermait les ventes sans un mot. La comparaison ne porte plus que sur ce
  // que le texte des conditions imprime (nom, adresse, e-mail de contact, encadré « en cours de finalisation »).
  it.each([
    ["l'archive manque", null],
    ["le nom archivé est différent", { identite_editeur: { ...EDITEUR_COMPLET, denomination: "Autre vendeur EI" } }],
    ["l'adresse archivée est différente", { identite_editeur: { ...EDITEUR_COMPLET, siege: "9 rue d'Avant, 75000 Paris" } }],
    ["l'e-mail de contact archivé est différent", { identite_editeur: { ...EDITEUR_COMPLET, email: "avant@example.com" } }],
    ["l'archive a été faite avec un vendeur incomplet (encadré « en cours de finalisation »)", { identite_editeur: { ...EDITEUR_COMPLET, rcs: null } }],
  ])("refuse la commande si %s", async (_cas, archive) => {
    etat(GRILLE);
    mocks.archive = archive;
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toBe("Les souscriptions sont en attente de la vérification de la version archivée des conditions générales.");
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it.each([
    ["le médiateur a été saisi après l'archivage", { ...EDITEUR_COMPLET, mediateurNom: null, mediateurAdresse: null, mediateurSite: null }],
    ["le médiateur a changé depuis l'archivage", { ...EDITEUR_COMPLET, mediateurNom: "Ancien médiateur", mediateurSite: "https://ancien.example" }],
    ["le téléphone a été retouché", { ...EDITEUR_COMPLET, telephone: "01 99 99 99 99" }],
    ["les coordonnées d'un prestataire ont été saisies", { ...EDITEUR_COMPLET, coordonneesVercel: "Vercel Inc., adresse fictive" }],
    ["le SIRET, l'immatriculation ou le directeur de la publication ont été retouchés", { ...EDITEUR_COMPLET, siret: "11111111111111", rcs: "RNE autre", directeurPublication: "Autre personne" }],
  ])("ne referme pas la commande quand %s : le texte des conditions n'en dépend pas", async (_cas, archivee) => {
    etat(GRILLE);
    mocks.archive = { identite_editeur: archivee };
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur ?? "").not.toContain("version archivée des conditions");
    expect(mocks.serviceRpc).toHaveBeenCalledWith("abonnement_client_pose", { p_org: "org-1", p_customer: "cus_connu" });
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
    expect(mocks.lecturesCgu[0]).toEqual(
      expect.arrayContaining([["account_id", "compte-1"], ["document", "conditions_clients"], ["version", VERSION_EN_VIGUEUR]])
    );
    // Reprise D4 (D4R-01) : et seulement aux lignes qui portent l'empreinte du texte archivé.
    expect(mocks.lecturesCgu[0]).toContainEqual(["empreinte_sha256 non is", null]);
  });

  it("l'identité passe avant les conditions", async () => {
    etat(GRILLE);
    identite(EDITEUR_VIDE);
    mocks.versionsAcceptees = [];
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toBe(MOTIF_IDENTITE);
  });
});

describe("hausse de capacité : l'identité de l'éditeur, puis l'accord à une nouvelle version des conditions (Q15)", () => {
  it("refuse une hausse quand l'identité manque, avant tout calcul de prorata — sans « Votre essai continue » : le client est abonné", async () => {
    etat(GRILLE, true);
    identite(EDITEUR_VIDE);
    const r = await confirmerHausse("org-1", {}, hausse());
    expect(r.erreur).toBe(MOTIF_IDENTITE_HORS_ESSAI);
    expect(r.erreur).not.toContain("Votre essai continue");
    expect(appelsRpc()).not.toContain("ma_souscription_stripe");
    expect(mocks.apercu).not.toHaveBeenCalled();
    expect(mocks.appliquerHausse).not.toHaveBeenCalled();
  });

  // Décision du dirigeant du 24/11/2026 (Q15, « nouvelle version des conditions, accord exprès du client »). Ce test
  // affirmait qu'une hausse n'exige JAMAIS l'acceptation des conditions (arbitrage du 19/10 : le contrat est déjà
  // formé). C'est toujours vrai des conditions déjà acceptées. Ce ne l'est plus quand une NOUVELLE version, archivée,
  // attend l'accord du Client : la hausse est un acte contractuel, et l'accord est demandé à ce moment-là. Les cinq
  // tests qui suivent tiennent les deux moitiés de la règle.
  it("le compte a accepté la version en vigueur : la hausse passe sans redemander les conditions (arbitrage du 19/10, inchangé)", async () => {
    etat(GRILLE, true);
    const r = await confirmerHausse("org-1", {}, hausse());
    expect(appelsRpc()).toContain("ma_souscription_stripe");
    expect(mocks.apercu).toHaveBeenCalledOnce();
    expect(r.erreur).toBe("arrêt du test");
    expect(r.accordConditions).toBeUndefined();
    expect(appelsRpc()).not.toContain("accepter_cgu");
  });

  it("Q15 — nouvelle version archivée, pas encore acceptée : la hausse demande l'accord exprès, rien ne part chez Stripe", async () => {
    etat(GRILLE, true);
    mocks.versionsAcceptees = ["2026-11-15"];
    const r = await confirmerHausse("org-1", {}, hausse());
    expect(r.erreur).toBe(messageActeSansAccord(CONDITIONS_DATE));
    // Aucune menace de non-reconduction : cette version n'en prévoit pas.
    expect(r.erreur).not.toMatch(/reconduit/);
    expect(r.accordConditions).toEqual({ version: VERSION_EN_VIGUEUR, dateVersion: CONDITIONS_DATE });
    expect(appelsRpc()).not.toContain("ma_souscription_stripe");
    expect(appelsRpc()).not.toContain("accepter_cgu");
    expect(mocks.apercu).not.toHaveBeenCalled();
    expect(mocks.appliquerHausse).not.toHaveBeenCalled();
    // La lecture est bornée au compte qui clique, au document et à la version en vigueur.
    expect(mocks.lecturesCgu.at(-1)).toEqual(expect.arrayContaining([["account_id", "compte-1"], ["document", "conditions_clients"], ["version", VERSION_EN_VIGUEUR]]));
  });

  it("Q15 — case cochée sur la version affichée : l'accord est enregistré (compte, document, version), puis la hausse se poursuit", async () => {
    etat(GRILLE, true);
    mocks.versionsAcceptees = ["2026-11-15"];
    const fd = hausse();
    fd.set("cgu", "oui");
    fd.set("cgu_version", VERSION_EN_VIGUEUR);
    const r = await confirmerHausse("org-1", {}, fd);
    expect(mocks.rpc).toHaveBeenCalledWith("accepter_cgu", { p_version: VERSION_EN_VIGUEUR, p_source: "compte", p_document: "conditions_clients" });
    expect(appelsRpc().indexOf("accepter_cgu")).toBeLessThan(appelsRpc().indexOf("ma_souscription_stripe"));
    expect(mocks.apercu).toHaveBeenCalledOnce();
    expect(r.erreur).toBe("arrêt du test");
  });

  it("Q15 — case cochée sur une version qui n'est plus celle du serveur, ou valeur autre que « oui » : refus, rien d'enregistré", async () => {
    etat(GRILLE, true);
    mocks.versionsAcceptees = [];
    const perimee = hausse();
    perimee.set("cgu", "oui");
    perimee.set("cgu_version", "2026-11-15");
    expect((await confirmerHausse("org-1", {}, perimee)).erreur).toBe(ERREUR_CONDITIONS_PERIMEES);
    const autre = hausse();
    autre.set("cgu", "on");
    autre.set("cgu_version", VERSION_EN_VIGUEUR);
    expect((await confirmerHausse("org-1", {}, autre)).erreur).toBe(messageActeSansAccord(CONDITIONS_DATE));
    expect(appelsRpc()).not.toContain("accepter_cgu");
    expect(appelsRpc()).not.toContain("ma_souscription_stripe");
  });

  it("Q15 — version pas encore archivée : aucune preuve possible, la hausse passe comme avant, sans rien demander", async () => {
    etat(GRILLE, true);
    mocks.versionsAcceptees = [];
    mocks.archive = null;
    // Sans archive, la garde de l'identité lit l'identité en vigueur (complète ici) : seule la question de l'accord change.
    const r = await confirmerHausse("org-1", {}, hausse());
    expect(r.accordConditions).toBeUndefined();
    expect(appelsRpc()).toContain("ma_souscription_stripe");
    expect(appelsRpc()).not.toContain("accepter_cgu");
    expect(r.erreur).toBe("arrêt du test");
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
  // Les cinq phrases visibles du lot (plan, étape 6, point 4) : les deux
  // motifs, leur variante hors essai, et les deux erreurs en role=alert.
  for (const phrase of [
    MOTIF_IDENTITE,
    MOTIF_IDENTITE_HORS_ESSAI,
    MOTIF_CONDITIONS,
    ERREUR_CONDITIONS_PERIMEES,
    ERREUR_ACCEPTATION_CONDITIONS,
  ]) {
    it(`« ${phrase.slice(0, 40)}… » passe la recette`, () => {
      for (const motif of MESSAGES_D_ERREUR) expect(phrase).not.toMatch(motif);
    });
  }

  it("le motif identité commence comme les motifs Stripe et TVA : le parcours local e2e/abonnement.spec.ts s'y accroche", () => {
    // Plan, étapes 1 et 6 : « n'est pas encore ouvert » (apostrophe droite,
    // comme ses voisins ; le parcours tolère les deux).
    expect(MOTIF_IDENTITE).toMatch(/n[’']est pas encore ouvert/);
    expect(MOTIF_IDENTITE_HORS_ESSAI).toMatch(/n[’']est pas encore ouvert/);
    expect(MOTIF_IDENTITE).toContain("n'est pas encore ouvert");
    expect(MOTIF_IDENTITE.startsWith(MOTIF_IDENTITE_HORS_ESSAI)).toBe(true);
  });
});
