import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/** Un éditeur fictif complet (les huit faits requis par lib/editeur.ts ; domaine example : jamais une adresse réelle). */
const EDITEUR_COMPLET: Record<string, string | null> = {
  denomination: "Éditeur de test", forme: "SAS", capital: null, siege: "1 rue de l'Essai, 75000 Paris",
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
}));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspace: async () => ({
    supabase: {
      rpc: mocks.rpc,
      from: (table: string) => {
        const q = {
          select: () => q,
          eq: () => q,
          order: () => q,
          limit: () => q,
          maybeSingle: async () => ({
            data: table === "acceptations_cgu" && mocks.conditionsAcceptees ? { id: "acceptation-1" } : null,
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
vi.mock("@/lib/reglage-souscription-serveur", () => ({ lireReglageSouscription: async () => ({ blocageIdentiteActif: mocks.blocageIdentiteActif, revision: 1, indisponible: false }) }));
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
    expect(html).toContain("25 octobre 2099");
    expect(html).toContain("Zoho Sign");
    expect(html).not.toContain("signature électronique n’est pas encore proposée");
    expect(html).toContain("Choisir ma formule");
    expect(html).toContain("Sans souscription, aucun prélèvement");
    expect(html).not.toContain("Abonnement actif");
  });
  it("conserve le montant réellement facturé même si un avantage le réduit", async () => {
    abonner({ montant_periode_cents: 749 });
    const html = await rendre();
    expect(html).toContain("7,49");
    expect(html).toContain("votre avantage ou ancienne condition est conservé");
    expect(html).toContain("Abonnement actif");
    expect(html).not.toContain("Choisir ma formule");
  });
  it("distingue le prélèvement annuel des mensualités", async () => {
    abonner({ periodicite: "annuel", montant_periode_cents: 9990 });
    const html = await rendre();
    expect(html).toContain("99,90");
    expect(html).toContain("Facturation annuelle");
    expect(html).toContain("TTC / an");
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
  it("annonce une erreur de lecture sans proposer une nouvelle souscription", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "indisponible" } });
    const html = await rendre();
    expect(html).toContain("Lecture impossible");
    expect(html).not.toContain("Choisir ma formule");
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
    // Le récapitulatif reste : le client lit le montant, même sans bouton.
    expect(html).toContain("Récapitulatif avant paiement");
    expect(html).toContain("Total à payer TTC");
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
    expect(html).toContain("Reprendre avec un abonnement");
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
    expect(html).toContain("version du 30 septembre 2026 des conditions générales");
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
  it("sans clés Stripe, le motif Stripe passe avant celui de l’identité (banc local)", async () => {
    mocks.editeur = { editeur: EDITEUR_VIDE, indisponible: false };
    const html = await rendre();
    // React écrit l'apostrophe droite « &#x27; » dans le HTML statique.
    expect(html).toContain("Le paiement en ligne n&#x27;est pas encore ouvert. Écrivez-nous");
    expect(html).not.toContain(MOTIF_IDENTITE_HORS_ESSAI_HTML);
    expect(html).not.toContain("Continuer vers le paiement sécurisé");
  });
  it("blocage levé : l’identité incomplète permet le paiement mais les conditions restent requises", async () => {
    mocks.stripePret = true;
    mocks.editeur = { editeur: EDITEUR_VIDE, indisponible: false };
    mocks.blocageIdentiteActif = false;
    mocks.conditionsAcceptees = false;
    const html = await rendre();
    expect(html).not.toContain(MOTIF_IDENTITE_HORS_ESSAI_HTML);
    expect(html).toContain("Continuer vers le paiement sécurisé");
    expect(html).toContain(INFOBULLE_CONDITIONS);
  });
  it("blocage levé : une configuration Stripe absente ferme toujours le paiement", async () => {
    mocks.blocageIdentiteActif = false;
    const html = await rendre();
    expect(html).not.toContain("Continuer vers le paiement sécurisé");
    expect(html).toContain("Le paiement en ligne n&#x27;est pas encore ouvert. Écrivez-nous");
  });
});
