import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CONDITIONS_DATE } from "@/lib/editeur";

/** Un éditeur fictif complet (les huit faits requis par lib/editeur.ts ; domaine example : jamais une adresse réelle). */
const EDITEUR_COMPLET: Record<string, string | null> = {
  denomination: "Éditeur de test", forme: "SAS", typeVendeur: "personne_morale", capital: null, siege: "1 rue de l'Essai, 75000 Paris",
  rcs: "RCS Paris 000 000 000", siret: "00000000000000", tvaIntracommunautaire: null,
  directeurPublication: "Personne de test", email: "contact@example.com", telephone: "01 00 00 00 00",
  mediateurNom: "Médiateur de test", mediateurAdresse: "1 rue Exemple, Paris", mediateurSite: "https://example.test/mediateur",
};
const EDITEUR_VIDE: Record<string, string | null> = Object.fromEntries(Object.keys(EDITEUR_COMPLET).map((k) => [k, null]));
/**
 * Lot B3 (19/10) : la phrase arbitrée, en toutes lettres (le test fige le
 * libellé, il ne le recopie pas depuis le code). Complète pendant l'essai ;
 * sans « Votre essai continue. » pour un compte gelé ou abonné (correction du
 * 19/10). React écrit l'apostrophe droite « &#x27; » dans le HTML statique :
 * les comparaisons se font sur la forme écrite.
 */
const MOTIF_IDENTITE =
  "Le paiement en ligne n'est pas encore ouvert : les mentions légales de l'éditeur sont en cours de publication. Votre essai continue.";
const MOTIF_IDENTITE_HORS_ESSAI =
  "Le paiement en ligne n'est pas encore ouvert : les mentions légales de l'éditeur sont en cours de publication.";
const enHtml = (texte: string) => texte.replace(/'/g, "&#x27;");
const MOTIF_IDENTITE_HTML = enHtml(MOTIF_IDENTITE);
const MOTIF_IDENTITE_HORS_ESSAI_HTML = enHtml(MOTIF_IDENTITE_HORS_ESSAI);
const CASE_CONDITIONS = "J’ai lu et j’accepte la";
const INFOBULLE_CONDITIONS = 'title="Acceptez d’abord la version en vigueur des conditions générales."';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  stripePret: false,
  editeur: { editeur: {} as Record<string, string | null>, indisponible: false },
  /** Vrai si le compte a une acceptation enregistrée pour la version en vigueur des conditions. */
  conditionsAcceptees: true,
  blocageIdentiteActif: true,
  venteSansMediateurLe: null as string | null,
  /** L'identité rangée avec la version archivée des conditions ; `null` : celle de l'éditeur complet. */
  archive: null as Record<string, string | null> | null,
}));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspace: async () => ({
    supabase: {
      rpc: mocks.rpc,
      from: (table: string) => {
        const q = {
          select: () => q,
          eq: () => q,
          // Reprise D4 (D4R-01) : la preuve d'accord filtre les lignes à empreinte ; ce faux client les tient pour telles.
          not: () => q,
          order: () => q,
          limit: () => q,
          maybeSingle: async () => ({
            data: table === "versions_conditions" ? { identite_editeur: mocks.archive ?? EDITEUR_COMPLET } : table === "acceptations_cgu" && mocks.conditionsAcceptees ? { id: "acceptation-1" } : null,
            error: null,
          }),
        };
        return q;
      },
    },
    user: { id: "compte-test" },
    organisation: { type: "proprietaire_direct", name: "Parc de test" },
    role: "proprietaire_direct",
  }),
}));
vi.mock("@/lib/stripe", () => ({
  configurationStripe: () =>
    mocks.stripePret ? { pret: true, config: { cle: "sk_test_x", secretWebhook: "whsec_x", prix: {} } } : { pret: false },
  clientStripe: vi.fn(),
}));
vi.mock("@/lib/editeur-serveur", () => ({ lireEditeur: async () => mocks.editeur }));
vi.mock("@/lib/reglage-souscription-serveur", () => ({ lireReglageSouscription: async () => ({ blocageIdentiteActif: mocks.blocageIdentiteActif, venteSansMediateurLe: mocks.venteSansMediateurLe, revision: 1, indisponible: false }) }));
vi.mock("@/app/actions/abonnement", () => ({ accepterConditionsGenerales: vi.fn(), demarrerAbonnement: vi.fn(), confirmerHausse: vi.fn(), demanderPeriodicite: vi.fn(), ouvrirPortailAbonnement: vi.fn(), resilierAbonnement: vi.fn() }));
import { PageAbonnement2026 } from "@/app/agence/[orgId]/abonnement/abonnement-2026";

const etatInitial = { statut: "essai", ecriture_ouverte: true, essai_fin: "2099-10-24", jours_essai_restants: 13, public_tarif: "proprietaire_direct", unites_a_couvrir: 3, unites_souscrites: null };
const paiementInitial = { souscrit: false, paye: false, paiement_en_retard: false, annulation_demandee: false, formule: null, periodicite: "mensuel", unites_souscrites: null, montant_periode_cents: null, periode_fin: null, periodicite_suivante: null };
let etat: Record<string, unknown>;
let paiement: Record<string, unknown>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-10-10T23:30:00Z")); // Le 11 à Paris : 13 jours avant le 24.
  etat = { ...etatInitial };
  paiement = { ...paiementInitial };
  mocks.rpc.mockImplementation(async (nom: string) => ({ data: [nom === "etat_abonnement" ? etat : paiement], error: null }));
  mocks.stripePret = false;
  mocks.editeur = { editeur: EDITEUR_COMPLET, indisponible: false };
  mocks.conditionsAcceptees = true;
  mocks.blocageIdentiteActif = true;
  mocks.venteSansMediateurLe = null;
});
afterEach(() => vi.useRealTimers());
async function rendre(recherche: Record<string, string> = {}) {
  return renderToStaticMarkup(await PageAbonnement2026({ params: Promise.resolve({ orgId: "org-test" }), searchParams: Promise.resolve(recherche) }));
}
function abonner(changements = {}) {
  etat = { ...etat, statut: "active" };
  paiement = { ...paiement, souscrit: true, paye: true, formule: "bailleur", unites_souscrites: 3, montant_periode_cents: 999, periode_fin: "2099-11-24", ...changements };
}

describe("présentation de l’abonnement propriétaire", () => {
  it("présente l’essai et le tarif proposé sans annoncer un abonnement payé", async () => {
    const html = await rendre();
    expect(html).toContain("Votre essai Gerimmo");
    expect(html).toContain("13 jours restants");
    expect(html).toContain("24/10/2099");
    expect(html).not.toContain("Premier prélèvement");
    expect(html).toContain("Zoho Sign");
    expect(html).not.toContain("signature électronique n’est pas encore proposée");
    expect(html).toContain("Votre offre Gerimmo");
    expect(html).toContain("Sans souscription, aucun prélèvement");
    expect(html).not.toContain("Abonnement actif");
  });
  it("conserve le montant réellement facturé même si un avantage le réduit", async () => {
    abonner({ montant_periode_cents: 749 });
    const html = await rendre();
    expect(html).toContain("7,49");
    expect(html).toContain("votre avantage ou ancienne condition est conservé");
    expect(html).toContain("Abonnement actif");
    expect(html).not.toContain("Souscrire à Gerimmo");
  });
  it("distingue le prélèvement annuel des mensualités", async () => {
    abonner({ periodicite: "annuel", montant_periode_cents: 9990 });
    const html = await rendre();
    expect(html).toContain("99,90");
    expect(html).toContain("Facturation annuelle");
    // Plan du 23/10 (R55) : éditeur en franchise de TVA, ni « TTC » ni « HT » à côté du montant.
    expect(html).toContain("<small>/ an</small>");
    expect(html).not.toContain("TTC / an");
  });
  it("ne remplace pas un montant indisponible par zéro", async () => {
    abonner({ montant_periode_cents: null });
    const html = await rendre();
    expect(html).toContain("À confirmer");
    expect(html).not.toContain("Sans souscription, aucun prélèvement");
  });
  it("garde visibles la fin de l’abonnement et la résiliation programmée", async () => {
    abonner({ annulation_demandee: true });
    const html = await rendre();
    expect(html).toContain("Fin de l’abonnement");
    expect(html).toContain("Résiliation au");
    expect(html).toContain("Annuler la résiliation");
  });
  it("finitions du 24/10 (I1, I4) : une fermeture programmée remplace « Résilier » et « Annuler la résiliation » et dit la nuit d'effacement", async () => {
    abonner({ annulation_demandee: true });
    mocks.rpc.mockImplementation(async (nom: string) => ({
      data: nom === "fermeture_programmee_de" ? [{ effacement_prevu_le: "2099-11-08", choix: "j14_prorata" }] : [nom === "etat_abonnement" ? etat : paiement],
      error: null,
    }));
    const html = await rendre();
    expect(html).toContain("Fermeture de votre compte programmée");
    expect(html).toContain("nuit du 7 au 8 novembre 2099");
    expect(html).toContain("La fermeture de votre compte est programmée");
    expect(html).not.toContain("Annuler la résiliation");
    expect(html).not.toContain("Résilier votre contrat");
    expect(html).not.toContain("données conservées");
  });
  it("annonce une erreur de lecture sans proposer une nouvelle souscription", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "indisponible" } });
    const html = await rendre();
    expect(html).toContain("Lecture impossible");
    expect(html).not.toContain("Souscrire à Gerimmo");
    expect(html).not.toContain("Aucun prélèvement");
  });
});

// Lot B3 (19/10/2026) : la garde de souscription à l'écran. Le paiement est
// ouvert (clés Stripe, régime de TVA), et l'écran dit ce qui manque encore.
describe("garde de souscription à l’écran « Mon abonnement »", () => {
  it("identité de l’éditeur incomplète, essai en cours : le motif complet remplace le bouton, sans case à cocher", async () => {
    mocks.stripePret = true;
    mocks.editeur = { editeur: EDITEUR_VIDE, indisponible: false };
    const html = await rendre();
    expect(html).toContain(MOTIF_IDENTITE_HTML);
    expect(html).not.toContain("Continuer vers le paiement sécurisé");
    expect(html).not.toContain(CASE_CONDITIONS);
    // Le prix reste visible, sans présenter une commande impossible.
    expect(html).toContain("Tarifs à titre d’information");
    expect(html).toContain("9,97");
    expect(html).not.toContain("Récapitulatif avant paiement");
    expect(html).not.toContain("Total à payer");
    expect(html).not.toContain("Total à payer TTC");
    expect(html).toContain("TVA non applicable, article 293 B du CGI.");
  });
  it("identité illisible : même motif (fermeture par défaut)", async () => {
    mocks.stripePret = true;
    mocks.editeur = { editeur: EDITEUR_VIDE, indisponible: true };
    const html = await rendre();
    expect(html).toContain(MOTIF_IDENTITE_HTML);
    expect(html).not.toContain("Continuer vers le paiement sécurisé");
  });
  it("essai arrivé à son terme (lecture seule, statut encore « essai ») : le motif sans « Votre essai continue »", async () => {
    mocks.stripePret = true;
    mocks.editeur = { editeur: EDITEUR_VIDE, indisponible: false };
    etat = { ...etat, ecriture_ouverte: false, essai_fin: "2099-10-01", jours_essai_restants: 0 };
    const html = await rendre();
    expect(html).toContain("Votre offre Gerimmo");
    expect(html).toContain("Votre essai gratuit est arrivé à son terme.");
    expect(html).toContain(MOTIF_IDENTITE_HORS_ESSAI_HTML);
    expect(html).not.toContain("Votre essai continue");
    expect(html).not.toContain("Continuer vers le paiement sécurisé");
  });
  it("client abonné qui demande une hausse : le motif sans « Votre essai continue », à la place de la promesse de prorata", async () => {
    mocks.stripePret = true;
    mocks.editeur = { editeur: EDITEUR_VIDE, indisponible: false };
    abonner();
    const html = await rendre({ formule: "investisseur" });
    expect(html).toContain("Changer de formule");
    expect(html).toContain("Formule Investisseur");
    expect(html).toContain(MOTIF_IDENTITE_HORS_ESSAI_HTML);
    expect(html).not.toContain("Votre essai continue");
    expect(html).not.toContain("Le prorata sera calculé par notre prestataire de paiement avant confirmation.");
    expect(html).not.toContain("J&#x27;accepte le nouveau montant");
  });
  it("identité complète, version en vigueur non acceptée : la case, le lien vers les conditions, le bouton présent mais retenu", async () => {
    mocks.stripePret = true;
    mocks.conditionsAcceptees = false;
    const html = await rendre();
    expect(html).not.toContain(MOTIF_IDENTITE_HORS_ESSAI_HTML);
    expect(html).toContain(CASE_CONDITIONS);
    expect(html).toContain("Médiateur de test");
    expect(html).toContain("https://example.test/mediateur");
    expect(html).toContain(`version du ${CONDITIONS_DATE} des conditions générales`);
    expect(html).toContain('href="/conditions"');
    expect(html).toContain("Continuer vers le paiement sécurisé");
    // Le blocage est prouvé par son infobulle : la prop arrive bien au bouton.
    expect(html).toContain(INFOBULLE_CONDITIONS);
  });
  it("identité complète et version acceptée : ni motif ni case, le bouton", async () => {
    mocks.stripePret = true;
    const html = await rendre();
    expect(html).not.toContain(MOTIF_IDENTITE_HORS_ESSAI_HTML);
    expect(html).not.toContain(CASE_CONDITIONS);
    expect(html).toContain("Continuer vers le paiement sécurisé");
    expect(html).not.toContain("Acceptez d’abord");
  });
  it("relecture adverse du 24/10 (M3, M9) : le récapitulatif renvoie au formulaire de l'article 8.10 ; les nouveaux onglets sont annoncés", async () => {
    mocks.stripePret = true;
    const html = await rendre();
    expect(html).toContain("ou avec le formulaire de l&#x27;article 8.10 des <a");
    expect(html).toMatch(/article 8\.10 des <a [^>]*href="\/conditions"[^>]*>conditions générales/);
    const liensNouvelOnglet = html.match(/<a [^>]*target="_blank"[^>]*>[\s\S]*?<\/a>/g) ?? [];
    expect(liensNouvelOnglet.length).toBeGreaterThan(0);
    for (const lien of liensNouvelOnglet) expect(lien).toContain("(nouvel onglet)");
  });
  it("sans clés Stripe, le motif Stripe passe avant celui de l’identité (banc local)", async () => {
    mocks.editeur = { editeur: EDITEUR_VIDE, indisponible: false };
    const html = await rendre();
    // React écrit l'apostrophe droite « &#x27; » dans le HTML statique.
    expect(html).toContain("Le paiement en ligne n&#x27;est pas encore ouvert. Écrivez-nous");
    expect(html).not.toContain(MOTIF_IDENTITE_HORS_ESSAI_HTML);
    expect(html).not.toContain("Continuer vers le paiement sécurisé");
  });
  // Lot D7 (décision du dirigeant du 24/11/2026, Q7 : les ventes s'ouvrent sans médiateur, pas sans vendeur). Ce test
  // affirmait que, règle levée, le MÉDIATEUR manquant fermait le paiement. C'est désormais l'identité du VENDEUR qui
  // ferme la première souscription d'un particulier, règle levée ou non ; le médiateur ne ferme plus rien.
  it("simulation : même si le réglage général est levé, sans vendeur le paiement reste fermé", async () => {
    mocks.stripePret = true;
    mocks.editeur = { editeur: EDITEUR_VIDE, indisponible: false };
    mocks.blocageIdentiteActif = false;
    mocks.conditionsAcceptees = false;
    const html = await rendre();
    expect(html).toContain(MOTIF_IDENTITE_HORS_ESSAI_HTML);
    expect(html).not.toContain("Un médiateur de la consommation doit d"); // phrase du médiateur (T4R-08)
    expect(html).not.toContain("Continuer vers le paiement sécurisé");
  });
  // REPRISE DU LOT D7 (24/11/2026, décision de pilotage). Le test du premier commit D7 disait : « vendeur complet,
  // médiateur non saisi — le paiement s'ouvre ». Le recueil du dirigeant contient L. 612-1 et L. 616-1 du code de la
  // consommation : PAR DÉFAUT le paiement d'un particulier reste fermé sans médiateur ; il ne s'ouvre que si le super
  // admin a levé le blocage, et l'écran dit alors qu'aucun médiateur n'est désigné.
  const SANS_MEDIATEUR = { ...EDITEUR_COMPLET, mediateurNom: null, mediateurAdresse: null, mediateurSite: null };
  it("reprise D7 : vendeur complet, médiateur non saisi, règle active (par défaut) — le paiement reste fermé au particulier", async () => {
    mocks.stripePret = true;
    mocks.editeur = { editeur: SANS_MEDIATEUR, indisponible: false };
    const html = (await rendre()).replace(/&#x27;/g, "'");
    // Seconde reprise (T4R-08) : la phrase ne présuppose plus qu'un médiateur existe.
    expect(html).toContain("Le paiement en ligne n'est pas encore ouvert aux particuliers. Un médiateur de la consommation doit d'abord être désigné, et ses coordonnées publiées, avant la première souscription. Votre essai continue.");
    expect(html).not.toContain("médiateur de la consommation de Gerimmo");
    expect(html).not.toContain(MOTIF_IDENTITE_HORS_ESSAI);
    expect(html).not.toContain("Continuer vers le paiement sécurisé");
  });
  // Seconde reprise du 24/11/2026 (relecture T4R-02) : ce test ouvrait le paiement sur la seule levée du blocage. Une
  // levée enregistrée avant le lot ne doit rien ouvrir aux particuliers : l'écran reste fermé ; il s'ouvre avec la
  // décision à part, datée.
  it("T4R-02 : vendeur complet, médiateur non saisi, blocage levé SEUL — le paiement reste fermé au particulier", async () => {
    mocks.stripePret = true;
    mocks.blocageIdentiteActif = false;
    mocks.editeur = { editeur: SANS_MEDIATEUR, indisponible: false };
    const html = (await rendre()).replace(/&#x27;/g, "'");
    expect(html).toContain("Un médiateur de la consommation doit d'abord être désigné, et ses coordonnées publiées, avant la première souscription.");
    expect(html).not.toContain("Continuer vers le paiement sécurisé");
  });
  it("reprise D7 : vendeur complet, médiateur non saisi, décision datée de vendre sans médiateur — le paiement s'ouvre et l'écran dit qu'aucun médiateur n'est désigné", async () => {
    mocks.stripePret = true;
    mocks.venteSansMediateurLe = "2026-11-25T09:00:00+00:00";
    mocks.editeur = { editeur: SANS_MEDIATEUR, indisponible: false };
    // D7R-02 : la version archivée des conditions porte ici un médiateur (identité par défaut de l'archive du test)
    // que l'identité affichée n'a pas. Le contrat ne dépend plus du médiateur : la commande n'attend rien.
    const html = await rendre();
    expect(html).not.toContain(MOTIF_IDENTITE_HORS_ESSAI_HTML);
    expect(html).not.toContain("Un médiateur de la consommation doit d");
    expect(html).not.toContain("version archivée des conditions");
    expect(html.replace(/&#x27;/g, "'")).toContain("Médiateur de la consommation : aucun n'est désigné à ce jour ; ses coordonnées figureront dans les mentions légales dès sa désignation.");
    expect(html).toContain("Continuer vers le paiement sécurisé");
  });
  it("reprise D7 (D7R-02) : l'adresse du vendeur a changé depuis l'archivage des conditions — la commande attend, et l'écran le dit", async () => {
    mocks.stripePret = true;
    mocks.archive = { ...EDITEUR_COMPLET, siege: "9 rue d'Avant, 75000 Paris" };
    let html: string;
    try { html = await rendre(); } finally { mocks.archive = null; }
    expect(html).toContain("Les souscriptions sont en attente de la vérification de la version archivée des conditions générales.");
    expect(html).not.toContain("Continuer vers le paiement sécurisé");
  });
  // Relecture de la fusion du 25/11/2026 (E-01) : l'écran d'une AGENCE ne comparait pas l'identité archivée (seul le
  // particulier le faisait) ; le bouton de paiement s'affichait alors que le serveur doit refuser.
  it("E-01 : agence, première souscription, adresse changée depuis l'archivage — la commande attend, et l'écran le dit", async () => {
    mocks.stripePret = true;
    etat = { ...etat, public_tarif: "agence" };
    mocks.archive = { ...EDITEUR_COMPLET, siege: "9 rue d'Avant, 75000 Paris" };
    let html: string;
    try { html = await rendre(); } finally { mocks.archive = null; }
    expect(html).toContain("Les souscriptions sont en attente de la vérification de la version archivée des conditions générales.");
    expect(html).not.toContain("Continuer vers le paiement sécurisé");
  });
  it("pilote gratuit : même avec Stripe prêt, médiateur et conditions acceptées, aucune commande", async () => {
    vi.stubEnv("GERIMMO_MODE", "commercial");
    try {
      mocks.stripePret = true;
      const html = await rendre();
      expect(html).toContain("Les nouvelles souscriptions payantes sont fermées pendant le pilote gratuit.");
      expect(html).not.toContain("Continuer vers le paiement sécurisé");
    } finally { vi.unstubAllEnvs(); }
  });
  it("blocage levé : une configuration Stripe absente ferme toujours le paiement", async () => {
    mocks.blocageIdentiteActif = false;
    const html = await rendre();
    expect(html).not.toContain("Continuer vers le paiement sécurisé");
    expect(html).toContain("Le paiement en ligne n&#x27;est pas encore ouvert. Écrivez-nous");
  });
});

describe("plan du 23/10 (R01, R37) : le droit de rétractation sur « Mon abonnement »", () => {
  const ligne = {
    souscrit_le: "2099-10-05T08:00:00Z", abonnement_suivi: true, stripe_statut: "past_due", essai_fin: null, periodicite: "mensuel",
    periodicite_suivante: null, passage_annuel_demande_le: null, formule: "bailleur", organisation: "Parc de test",
    destinataire: "titulaire@example.com", retractation_abonnement_le: null as string | null, retractation_passage_le: null,
  };
  function avecLigne(l: Record<string, unknown>) {
    mocks.rpc.mockImplementation(async (nom: string) =>
      nom === "ma_souscription_stripe"
        ? { data: "sub_test", error: null }
        : { data: [nom === "etat_abonnement" ? etat : nom === "ma_retractation" ? l : paiement], error: null }
    );
  }
  it("visible en lecture seule, avec sa date limite (jour de souscription exclu) et « Renoncer au contrat ici »", async () => {
    abonner({ paye: false, paiement_en_retard: true });
    etat = { ...etat, ecriture_ouverte: false };
    avecLigne(ligne);
    const html = await rendre();
    expect(html).toContain("Votre compte est en lecture seule");
    expect(html).toContain("Droit de rétractation — jusqu&#x27;au 19 octobre 2099 inclus");
    expect(html).toContain("Renoncer au contrat ici");
    expect(html).toContain("/abonnement/retractation");
  });
  it("une déclaration déjà enregistrée, ou un délai échu, retire le bouton", async () => {
    abonner();
    avecLigne({ ...ligne, retractation_abonnement_le: "2099-10-06T08:00:00Z" });
    expect(await rendre()).not.toContain("Renoncer au contrat ici");
    avecLigne({ ...ligne, souscrit_le: "2099-09-01T08:00:00Z" });
    expect(await rendre()).not.toContain("Renoncer au contrat ici");
  });
  it("relecture adverse du 24/10 (M4) : une souscription que la base n'a pas encore datée prend la date relue chez Stripe", async () => {
    abonner();
    mocks.stripePret = true;
    const retrieve = vi.fn(async () => ({ id: "sub_test", start_date: Date.parse("2099-08-01T08:00:00Z") / 1000 }));
    const { clientStripe } = await import("@/lib/stripe");
    vi.mocked(clientStripe).mockReturnValue({ subscriptions: { retrieve } } as never);
    avecLigne({ ...ligne, souscrit_le: null });
    expect(await rendre()).not.toContain("Renoncer au contrat ici"); // souscrite le 1er août : délai échu
    retrieve.mockResolvedValueOnce({ id: "sub_test", start_date: Date.parse("2099-10-05T08:00:00Z") / 1000 });
    expect(await rendre()).toContain("Droit de rétractation — jusqu&#x27;au 19 octobre 2099 inclus");
    // Stripe illisible : le bouton reste (la page de déclaration redira si le délai court).
    retrieve.mockRejectedValueOnce(new Error("indisponible"));
    expect(await rendre()).toContain("Renoncer au contrat ici");
  });
});

describe("relecture adverse du 24/10 (I2) : après une résiliation pour impayé", () => {
  it("l'écran ne promet plus que « tout rouvre » au paiement : il dit la résiliation et conserve les données sans inviter à une vente indisponible", async () => {
    etat = { ...etat, statut: "suspendue", ecriture_ouverte: false };
    paiement = { ...paiement, souscrit: false, paiement_en_retard: true, stripe_statut: "canceled" };
    const html = await rendre();
    expect(html).not.toContain("Dès que le paiement aboutit, tout rouvre");
    expect(html).toContain("Votre abonnement a été résilié faute de règlement");
    expect(html).toContain("Consultez votre dernière facture");
    expect(html).not.toContain("La facture restée impayée est annulée");
    expect(html).not.toContain("Souscrivez de nouveau ci-dessous");
    expect(html).not.toContain("prolongation de votre essai");
    expect(html).toContain("Contactez Gerimmo");
  });
  it("propose la reprise au client résilié uniquement si le formulaire de commande est disponible", async () => {
    etat = { ...etat, statut: "suspendue", ecriture_ouverte: false, unites_a_couvrir: 1 };
    paiement = { ...paiement, souscrit: false, paiement_en_retard: true, stripe_statut: "canceled" };
    mocks.stripePret = true;
    const html = await rendre();
    expect(html).toContain("Continuer vers le paiement sécurisé");
    expect(html).toContain("Souscrivez de nouveau ci-dessous pour reprendre la saisie");
    etat.unites_a_couvrir = 0;
    const sansBien = await rendre();
    expect(sansBien).toContain("Aucun bien actif à facturer");
    expect(sansBien).not.toContain("Souscrivez de nouveau ci-dessous");
    // Écriture fermée : l'ajout d'un bien serait refusé, aucun bouton ne le propose.
    expect(sansBien).not.toContain("Ajouter mon premier bien");
  });
  it("ouverture de la vente du 27/11 : un espace en essai sans bien propose d'ajouter le premier bien", async () => {
    mocks.stripePret = true;
    mocks.venteSansMediateurLe = "2099-10-01T07:32:22Z";
    etat.unites_a_couvrir = 0;
    const html = await rendre();
    expect(html).toContain("Aucun bien actif à facturer");
    expect(html).toContain("Ajouter mon premier bien");
    expect(html).toContain("/agence/org-test/parc/nouveau");
    expect(html).not.toContain("Continuer vers le paiement sécurisé");
  });
  it("ouverture de la vente du 27/11 : la vente fermée, un espace en essai sans bien propose aussi d'ajouter le premier bien", async () => {
    etat.unites_a_couvrir = 0;
    const html = await rendre();
    expect(html).toContain("Aucun bien actif à facturer");
    expect(html).toContain("Ajouter mon premier bien");
  });
  it("un abonnement encore en cours garde le texte de l'impayé (tout rouvre au paiement)", async () => {
    abonner({ paiement_en_retard: true, paye: false });
    etat = { ...etat, ecriture_ouverte: false };
    expect(await rendre()).toContain("Dès que le paiement aboutit, tout rouvre");
  });
});

describe("UX 11B — situation réelle et souscription fermée", () => {
  it.each([true, false])("essai ouvert = %s : tarif informatif, sans commande ni prolongation inventée", async (ouvert) => {
    etat.ecriture_ouverte = ouvert;
    etat.essai_fin = ouvert ? "2099-10-24" : "2099-10-01";
    const html = await rendre();
    expect(html).toContain("Votre offre Gerimmo");
    expect(html).toContain("Tarifs à titre d’information");
    expect(html).not.toContain("Récapitulatif avant paiement");
    expect(html).not.toContain('name="periodicite"');
    expect(html).not.toContain('name="montant_attendu_cents"');
    expect(html).not.toContain("Votre essai est prolongé");
    expect(html).not.toContain("Votre abonnement est offert");
    expect(html).toContain("9,97");
    expect(html).toContain("99,70");
    expect(html.indexOf('id="services-inclus"')).toBeLessThan(html.indexOf("Tarifs à titre d’information"));
    if (!ouvert) expect(html).toContain("Votre essai gratuit est arrivé à son terme");
  });
  it("une prolongation offerte n'est affichée que sur la preuve retournée par la base", async () => {
    mocks.rpc.mockImplementation(async (nom: string) => ({ data: nom === "lire_mois_offerts" ? [{ id: "cadeau", nature: "acces", fin: etat.essai_fin }] : [nom === "etat_abonnement" ? etat : paiement], error: null }));
    expect(await rendre()).toContain("Votre abonnement est offert");
    etat.ecriture_ouverte = false;
    expect(await rendre()).not.toContain("Votre abonnement est offert");
  });
  it("ventes autorisées sur le banc : le véritable formulaire et ses consentements restent présents", async () => {
    mocks.stripePret = true;
    const html = await rendre();
    expect(html).toContain("Récapitulatif avant paiement");
    expect(html).toContain('name="montant_attendu_cents"');
    expect(html).toContain("Continuer vers le paiement sécurisé");
    expect(html).toContain("J&#x27;ai vérifié le montant");
  });
});


it("ne présente pas comme essai un abonnement dont la formule est absente", async () => {
  abonner({ formule: null, montant_periode_cents: null });
  const html = await rendre();
  expect(html).toContain("Votre abonnement Gerimmo");
  expect(html).toContain("Abonnement actif");
  expect(html).not.toContain("Votre essai Gerimmo");
  expect(html).toContain("À confirmer");
});


it("fermeture commerciale : aucun faux paiement même avec Stripe disponible", async () => {
  mocks.stripePret = true;
  vi.stubEnv("GERIMMO_MODE", "commercial");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app");
  try {
    const html = await rendre();
    expect(html).toContain("Les nouvelles souscriptions payantes sont fermées pendant le pilote gratuit.");
    expect(html).toContain("Tarifs à titre d’information");
    expect(html).not.toContain("Récapitulatif avant paiement");
    expect(html).not.toContain("Continuer vers le paiement sécurisé");
    expect(html).not.toContain("Souscrire maintenant");
    expect(html).not.toContain("Votre essai est prolongé");
    expect(html).toContain("24/10/2099");
  } finally {
    vi.unstubAllEnvs();
  }
});
