/** Tests de décisions des actions ; les invariants SQL sont testés séparément sur PostgreSQL. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculerTarif } from "@/lib/tarification";
const mocks = vi.hoisted(() => ({
  user: vi.fn(), rpc: vi.fn(), serviceRpc: vi.fn(), org: vi.fn(), configuration: vi.fn(), client: vi.fn(), lignes: vi.fn(), apercu: vi.fn(),
  retrieve: vi.fn(), ouvrir: vi.fn(), augmenter: vi.fn(), baisser: vi.fn(), resilier: vi.fn(), annulerChangement: vi.fn(), snapshot: vi.fn(), assurer: vi.fn(), redirect: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.user }, rpc: mocks.rpc,
  from: () => ({ select: () => ({ eq: () => ({ single: mocks.org }) }) }) }) }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ rpc: mocks.serviceRpc }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3100", "x-forwarded-proto": "http" }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/stripe", async importer => ({ ...(await importer<typeof import("@/lib/stripe")>()), assurerClientStripe: mocks.assurer }));
vi.mock("@/lib/stripe-tarification", async importer => ({ ...(await importer<typeof import("@/lib/stripe-tarification")>()),
  configurationStripeV2: mocks.configuration, creerClientStripeV2: mocks.client, lignesTarifV2: mocks.lignes, apercuTarifV2: mocks.apercu,
  ouvrirSouscriptionV2: mocks.ouvrir, augmenterAbonnementV2: mocks.augmenter, programmerBaisseV2: mocks.baisser,
  resilierAbonnementV2: mocks.resilier, annulerChangementProgrammeV2: mocks.annulerChangement, snapshotSouscriptionV2: mocks.snapshot, empreinteSouscription: () => "stable" }));
import { preparerAbonnementV2, confirmerAbonnementV2 } from "@/app/actions/abonnement-v2";
const fiscalite = { mode: "exonere", mention: "Scénario fiscal de test" };
const contexte = { version: "2026-09-v2", public_tarif: "proprietaire_direct", volume_actuel: 1, volume_reserve: 1,
  capacite: 1, formule: "solo", periodicite: "mensuel", montant_centimes: 599, total_centimes: 599, taxe_centimes: 0,
  statut: "active", essai_fin: null, periode_fin: "2026-11-01T00:00:00Z", stripe_customer_id: "cus_x", stripe_subscription_id: "sub_x",
  revision_abonnement: "revision", changement_programme: null };
const souscription = { id: "sub_x", status: "active", metadata: { tarification_version: "2026-09-v2", proposition_id: "prop_old" },
  items: { data: [{ price: { id: "price_solo", recurring: { interval: "month" } }, quantity: 1, current_period_end: Date.parse("2026-11-01T00:00:00Z") / 1000 }] } };
const proposition = { id: "prop", organization_id: "org", acteur_id: "user", etat: "preparee", consentie_le: null,
  expire_le: "2026-12-01T00:00:00Z", snapshot: { version: "2026-09-v2", public_tarif: "proprietaire_direct", volume_source: 1, volume_cible: 3,
    capacite: 3, formule: "bailleur", periodicite: "mensuel", montant_centimes: 999, total_centimes: 999, taxe_centimes: 0,
    prorata_centimes: 200, premier_prelevement_centimes: 999, date_effet: "2026-10-01T00:00:00Z", type: "augmentation", revision_abonnement: "revision",
    stripe_customer_id: "cus_x", stripe_subscription_id: "sub_x", stripe_lignes: [{ price: "price_bailleur_mensuel", quantity: 1 }], stripe_proration_date: 1000,
    fiscalite, essai_fin: null, empreinte_stripe: "stable", acteur_id: "user" } };
function form(values: Record<string, string> = {}) { const f = new FormData(); for (const [k, v] of Object.entries(values)) f.set(k, v); return f; }
const confirmation = () => form({ proposition_id: "prop", confirmation: "oui" });
function aucunPaiement() { expect(mocks.ouvrir).not.toHaveBeenCalled(); expect(mocks.augmenter).not.toHaveBeenCalled(); expect(mocks.baisser).not.toHaveBeenCalled(); expect(mocks.resilier).not.toHaveBeenCalled(); }
beforeEach(() => {
  vi.clearAllMocks(); mocks.user.mockResolvedValue({ data: { user: { id: "user", email: "fictif@example.test" } } });
  mocks.rpc.mockImplementation(async (nom: string) => ({ error: null, data: nom === "lire_abonnement_v2" ? { ...contexte } : structuredClone(proposition) }));
  mocks.serviceRpc.mockImplementation(async (nom: string) => ({ error: null, data: nom === "enregistrer_proposition_abonnement_v2" ? "prop" : true }));
  mocks.org.mockResolvedValue({ data: { name: "Espace fictif", email_contact: "fictif@example.test" } });
  mocks.configuration.mockReturnValue({ reel: false, cle: "sk_test_x" }); mocks.client.mockReturnValue({ subscriptions: { retrieve: mocks.retrieve } });
  mocks.assurer.mockResolvedValue({ ok: true, customer: "cus_x" }); mocks.retrieve.mockResolvedValue(structuredClone(souscription));
  mocks.lignes.mockImplementation(async (_s, _c, type, volume, periodicite) => { const tarif = calculerTarif(type, volume, periodicite);
    return { tarif, lignes: [{ price: `price_${tarif.formule}_${periodicite}`, quantity: 1 }], fiscalite }; });
  mocks.apercu.mockResolvedValue({ total: 999, taxe: 0, prorata: 200, premierPaiement: 999 });
  mocks.augmenter.mockResolvedValue({ ...souscription, pending_update: null }); mocks.baisser.mockResolvedValue({ id: "sched" });
  mocks.resilier.mockResolvedValue({ ...souscription, cancel_at_period_end: true }); mocks.annulerChangement.mockResolvedValue(souscription); mocks.snapshot.mockResolvedValue({ stripe_statut: "active" });
  mocks.ouvrir.mockResolvedValue("https://checkout.stripe.test/recette"); mocks.redirect.mockImplementation(() => { throw new Error("REDIRECTION_TEST"); });
});
afterEach(() => { vi.unstubAllEnvs(); });
describe("confirmations abonnement V2 côté serveur", () => {
  it("sans confirmation explicite, aucune connexion ni opération de paiement", async () => { expect((await confirmerAbonnementV2("org", {}, form({ proposition_id: "prop" }))).erreur).toContain("Confirmez"); expect(mocks.user).not.toHaveBeenCalled(); aucunPaiement(); });
  it("sans session, aucun récapitulatif ni paiement n’est préparé", async () => { mocks.user.mockResolvedValue({ data: { user: null } }); expect((await preparerAbonnementV2("org", {}, form())).erreur).toContain("Reconnectez"); expect(mocks.configuration).not.toHaveBeenCalled(); aucunPaiement(); });
  it("un utilisateur sans rôle de responsable ne peut rien préparer", async () => { mocks.rpc.mockResolvedValue({ data: null, error: { message: "Responsable requis" } }); expect((await preparerAbonnementV2("org", {}, form())).erreur).toBeTruthy(); expect(mocks.assurer).not.toHaveBeenCalled(); aucunPaiement(); });
  it("une confirmation d’une autre organisation est refusée", async () => {
    mocks.rpc.mockImplementation(async nom => ({ data: nom === "lire_abonnement_v2" ? contexte : { ...proposition, organization_id: "autre" }, error: null }));
    expect((await confirmerAbonnementV2("org", {}, confirmation())).erreur).toContain("disponible"); expect(mocks.retrieve).not.toHaveBeenCalled(); aucunPaiement();
  });
  it.each(["Ce récapitulatif a expiré", "Le portefeuille a changé", "L’abonnement a changé"])("refus atomique de consentement : %s, sans changement Stripe", async motif => {
    mocks.rpc.mockImplementation(async nom => nom === "consentir_proposition_abonnement_v2" ? { data: null, error: { message: motif } } : { data: nom === "lire_abonnement_v2" ? contexte : structuredClone(proposition), error: null });
    expect((await confirmerAbonnementV2("org", {}, confirmation())).erreur).toBe(motif); aucunPaiement();
  });
  it("ignore les montants et capacités envoyés par le navigateur", async () => {
    const f = confirmation(); f.set("montant_centimes", "1"); f.set("capacite", "9999");
    const r = await confirmerAbonnementV2("org", {}, f); expect(r.succes).toContain("confirmée");
    expect(mocks.augmenter.mock.calls[0][2]).toMatchObject({ montant_centimes: 999, capacite: 3 });
    const accordIndex = mocks.rpc.mock.invocationCallOrder[mocks.rpc.mock.calls.findIndex(([nom]) => nom === "consentir_proposition_abonnement_v2")];
    expect(accordIndex).toBeLessThan(mocks.augmenter.mock.invocationCallOrder[0]);
  });
  it("un montant Stripe modifié impose un nouveau récapitulatif avant consentement", async () => {
    mocks.apercu.mockResolvedValue({ total: 1000, taxe: 0, prorata: 200, premierPaiement: 1000 });
    expect((await confirmerAbonnementV2("org", {}, confirmation())).erreur).toContain("montant"); aucunPaiement();
    expect(mocks.rpc.mock.calls.some(([nom]) => nom === "consentir_proposition_abonnement_v2")).toBe(false);
  });
  it("une proposition exécutée ne prélève jamais une deuxième fois", async () => {
    mocks.rpc.mockImplementation(async nom => ({ data: nom === "lire_abonnement_v2" ? contexte : { ...proposition, etat: "executee", consentie_le: "date" }, error: null }));
    expect((await confirmerAbonnementV2("org", {}, confirmation())).succes).toContain("déjà"); expect(mocks.retrieve).not.toHaveBeenCalled(); aucunPaiement();
  });
  it.each(["expiree", "annulee"])("une proposition clôturée %s ne peut pas être rejouée", async etat => {
    mocks.rpc.mockImplementation(async nom => ({ data: nom === "lire_abonnement_v2" ? contexte : { ...proposition, etat }, error: null }));
    expect((await confirmerAbonnementV2("org", {}, confirmation())).erreur).toContain("clôturée"); aucunPaiement();
  });
  it("une prétendue nouvelle souscription ne crée rien si le contrat est déjà actif", async () => {
    mocks.rpc.mockImplementation(async nom => ({ data: nom === "lire_abonnement_v2" ? contexte : { ...proposition, snapshot: { ...proposition.snapshot, type: "souscription", stripe_subscription_id: null } }, error: null }));
    expect((await confirmerAbonnementV2("org", {}, confirmation())).erreur).toContain("existe déjà"); aucunPaiement();
  });
  it("annuel vers mensuel est proposé à l’échéance, sans mutation pendant la préparation", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...contexte, periodicite: "annuel", montant_centimes: 5990 }, error: null });
    mocks.retrieve.mockResolvedValue({ ...souscription, items: { data: [{ ...souscription.items.data[0], price: { recurring: { interval: "year" } } }] } });
    const r = await preparerAbonnementV2("org", {}, form({ periodicite: "mensuel", volume: "1" }));
    expect(r.proposition).toMatchObject({ type: "baisse", periodicite: "mensuel", dateEffet: "2026-11-01T00:00:00.000Z" }); aucunPaiement();
  });
  it("une baisse qui ne couvre pas les mandats déjà réservés est refusée avant Stripe", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...contexte, volume_reserve: 11, capacite: 20 }, error: null });
    expect((await preparerAbonnementV2("org", {}, form({ volume: "10" }))).erreur).toContain("couvrir"); expect(mocks.assurer).not.toHaveBeenCalled(); aucunPaiement();
  });
  it("un paiement en attente ne prétend pas avoir augmenté la capacité", async () => {
    mocks.augmenter.mockResolvedValue({ ...souscription, pending_update: { expires_at: 123 }, latest_invoice: null });
    const r = await confirmerAbonnementV2("org", {}, confirmation()); expect(r.succes).toContain("reste inchangée");
    expect(mocks.serviceRpc.mock.calls.some(([nom]) => nom === "finir_proposition_abonnement_v2")).toBe(false);
  });
  it("annuler une baisse conserve la capacité payée, sans proposer une nouvelle hausse", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...contexte, capacite: 3, volume_facture: 3, formule: "bailleur", montant_centimes: 999, total_centimes: 999, changement_programme: { capacite: 1 } }, error: null });
    mocks.retrieve.mockResolvedValue({ ...souscription, schedule: "sched" });
    const r = await preparerAbonnementV2("org", {}, form({ type: "annulation_changement", volume: "999" }));
    expect(r.proposition).toMatchObject({ type: "annulation_changement", capacite: 3, formule: "bailleur", montantCents: 999 }); aucunPaiement();
  });
  it("annuler une baisse après accord libère seulement le calendrier", async () => {
    mocks.rpc.mockImplementation(async nom => ({ data: nom === "lire_abonnement_v2" ? contexte : { ...proposition, snapshot: { ...proposition.snapshot, type: "annulation_changement", prorata_centimes: 0 } }, error: null }));
    mocks.retrieve.mockResolvedValue({ ...souscription, schedule: "sched" });
    const r = await confirmerAbonnementV2("org", {}, confirmation()); expect(r.succes).toContain("conservées");
    expect(mocks.annulerChangement).toHaveBeenCalledTimes(1); expect(mocks.resilier).not.toHaveBeenCalled(); expect(mocks.augmenter).not.toHaveBeenCalled();
    expect(mocks.serviceRpc).toHaveBeenCalledWith("appliquer_abonnement_v2", expect.objectContaining({ p_snapshot: { stripe_statut: "active", changement_programme: null, traitement_token: expect.any(String) } }));
  });

  it("le verrou commun précède la lecture Stripe et protège chaque application", async () => {
    expect((await confirmerAbonnementV2("org", {}, confirmation())).succes).toContain("confirmée");
    const debut = mocks.serviceRpc.mock.calls.findIndex(([nom]) => nom === "reserver_traitement_abonnement_v2");
    expect(mocks.serviceRpc.mock.invocationCallOrder[debut]).toBeLessThan(mocks.retrieve.mock.invocationCallOrder[0]);
    const token = mocks.serviceRpc.mock.calls[debut][1].p_token;
    expect(mocks.serviceRpc).toHaveBeenCalledWith("appliquer_abonnement_v2", expect.objectContaining({ p_snapshot: expect.objectContaining({ traitement_token: token }) }));
    expect(mocks.serviceRpc).toHaveBeenLastCalledWith("liberer_traitement_abonnement_v2", { p_org: "org", p_token: token });
  });
  it("un verrou occupé refuse l’opération avant toute lecture ou écriture Stripe", async () => {
    mocks.serviceRpc.mockResolvedValue({ data: false, error: null });
    expect((await confirmerAbonnementV2("org", {}, confirmation())).erreur).toContain("en cours");
    expect(mocks.retrieve).not.toHaveBeenCalled(); aucunPaiement();
  });
  it.each(["past_due", "unpaid"])("un impayé %s n’empêche pas de demander la résiliation", async status => {
    mocks.retrieve.mockResolvedValue({ ...souscription, status });
    expect((await preparerAbonnementV2("org", {}, form({ type: "resiliation" }))).proposition?.type).toBe("resiliation");
    aucunPaiement();
  });

});
