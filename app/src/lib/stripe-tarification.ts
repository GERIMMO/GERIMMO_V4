/** Nouvelle grille isolée des contrats historiques. Aucune création de tarif ici. */
import Stripe from "stripe";
import { createHash } from "node:crypto";
import { calculerTarif, VERSION_TARIFICATION, type Periodicite, type PublicTarif } from "@/lib/tarification";

export type FiscaliteV2 = { mode: "exonere" | "taux"; mention: string; taux_id?: string };
export type ConfigurationV2 = { cle: string; reel: boolean; catalogue: Record<string, string>; fiscalite: { mode: "exonere" | "taux"; mention: string; particulier?: string; agence?: string } };
export type LigneStripeV2 = { price: string; quantity: number };
export type PropositionStripeV2 = {
  version: string; public_tarif: PublicTarif; volume_source: number; volume_cible: number;
  capacite: number; formule: string; periodicite: Periodicite; montant_centimes: number;
  total_centimes: number; taxe_centimes: number; prorata_centimes: number; premier_prelevement_centimes?: number;
  date_effet: string; type: "souscription" | "augmentation" | "baisse" | "resiliation";
  revision_abonnement: string; stripe_customer_id: string; stripe_subscription_id: string | null;
  stripe_lignes: LigneStripeV2[]; stripe_proration_date: number; fiscalite: FiscaliteV2;
  essai_fin: string | null; empreinte_stripe: string | null; acteur_id: string;
};

export function configurationStripeV2(): ConfigurationV2 {
  const cle = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!/^(sk|rk)_(test|live)_/.test(cle)) throw new Error("La connexion de paiement n’est pas encore configurée.");
  const reel = /^(sk|rk)_live_/.test(cle);
  if (reel && process.env.GERIMMO_TARIFICATION_V2_PRODUCTION !== "active") {
    throw new Error("La nouvelle tarification est en cours de vérification. Aucun abonnement réel ne peut encore être ouvert ou modifié avec cette grille.");
  }
  let catalogue: Record<string, string>;
  let fiscalite: ConfigurationV2["fiscalite"];
  try {
    catalogue = JSON.parse(process.env.STRIPE_CATALOGUE_V2_JSON ?? "{}");
    fiscalite = JSON.parse(process.env.STRIPE_FISCALITE_V2_JSON ?? "{}");
  } catch { throw new Error("Les réglages de facturation doivent être complétés par Gerimmo."); }
  if (!catalogue || typeof catalogue !== "object" || Array.isArray(catalogue)) throw new Error("Le catalogue de paiement n’est pas configuré.");
  if (!["exonere", "taux"].includes(fiscalite?.mode) || typeof fiscalite.mention !== "string" || !fiscalite.mention.trim()) {
    throw new Error("Le régime fiscal de Gerimmo doit être confirmé avant d’ouvrir les paiements. Aucun taux de taxe n’a été supposé.");
  }
  return { cle, reel, catalogue, fiscalite };
}

export function creerClientStripeV2(config: ConfigurationV2) { return new Stripe(config.cle, { maxNetworkRetries: 2 }); }
export function finEssaiV2(fin: string | null, maintenant = Date.now()): number | undefined {
  if (!fin) return undefined;
  const n = Date.parse(fin) + (fin.length === 10 ? 86_400_000 : 0);
  return Number.isFinite(n) && n > maintenant ? Math.floor(n / 1000) : undefined;
}
export function empreinteSouscription(s: Stripe.Subscription): string {
  return createHash("sha256").update(JSON.stringify({ id: s.id, status: s.status, cancel: s.cancel_at_period_end,
    schedule: typeof s.schedule === "string" ? s.schedule : s.schedule?.id, pending: s.pending_update,
    items: s.items.data.map(i => [i.id, i.price.id, i.quantity, i.current_period_start, i.current_period_end]).sort() })).digest("hex");
}

/** Relit les prix réels : une variable correcte ne garantit pas que Stripe applique le bon tarif. */
export async function lignesTarifV2(stripe: Stripe, config: ConfigurationV2, publicTarif: PublicTarif, volume: number, periodicite: Periodicite) {
  const tarif = calculerTarif(publicTarif, volume, periodicite);
  const choix = [{ cle: `${tarif.formule}_${periodicite}`, quantite: publicTarif === "agence" ? Math.max(1, volume) : 1,
    montant: tarif.baseCentimes }];
  if (publicTarif !== "agence" && tarif.biensSupplementaires > 0) choix.push({ cle: `supplement_${periodicite}`, quantite: tarif.biensSupplementaires, montant: periodicite === "annuel" ? 1000 : 100 });
  const lignes: LigneStripeV2[] = [];
  for (const choixPrix of choix) {
    const id = config.catalogue[choixPrix.cle];
    if (typeof id !== "string" || !id.startsWith("price_")) throw new Error(`Le tarif ${choixPrix.cle.replaceAll("_", " ")} doit être configuré avant la souscription.`);
    const p = await stripe.prices.retrieve(id, { expand: ["tiers"] });
    if (!p.active || p.livemode !== config.reel || p.currency !== "eur" || p.recurring?.interval !== (periodicite === "annuel" ? "year" : "month") || p.recurring.interval_count !== 1 || p.recurring.usage_type !== "licensed" || p.transform_quantity) {
      throw new Error("Le tarif du prestataire de paiement ne correspond pas à l’offre présentée. Aucun paiement n’a été ouvert.");
    }
    if (p.tax_behavior !== (publicTarif === "agence" ? "exclusive" : "inclusive")) throw new Error("Le traitement des taxes de ce tarif doit être corrigé avant le paiement.");
    if (publicTarif === "agence") {
      const attendu = [[10, 0, 3900], [50, 200, 0], [200, 150, 0], [null, 100, 0]];
      if (p.billing_scheme !== "tiered" || p.tiers_mode !== "graduated" || p.tiers?.length !== 4 || p.tiers.some((t, i) => t.up_to !== attendu[i][0] || (t.unit_amount ?? 0) !== attendu[i][1] || (t.flat_amount ?? 0) !== attendu[i][2])) {
        throw new Error("Les tranches du tarif agence ne correspondent pas à la grille présentée.");
      }
    } else if (p.billing_scheme !== "per_unit" || p.unit_amount !== choixPrix.montant) throw new Error("Le montant du tarif de paiement ne correspond pas à l’offre présentée.");
    lignes.push({ price: p.id, quantity: choixPrix.quantite });
  }
  let taux: Stripe.TaxRate | null = null;
  if (config.fiscalite.mode === "taux") {
    const id = publicTarif === "agence" ? config.fiscalite.agence : config.fiscalite.particulier;
    if (!id?.startsWith("txr_")) throw new Error("Le taux applicable à cette offre doit être configuré avant le paiement.");
    taux = await stripe.taxRates.retrieve(id);
    if (!taux.active || taux.livemode !== config.reel || taux.inclusive !== (publicTarif !== "agence")) throw new Error("Le taux de taxe configuré ne correspond pas à cette offre.");
  }
  const fiscalite: FiscaliteV2 = { mode: config.fiscalite.mode, mention: config.fiscalite.mention, ...(taux ? { taux_id: taux.id } : {}) };
  return { tarif, lignes, fiscalite };
}

export function modificationsLignes(s: Stripe.Subscription, lignes: LigneStripeV2[]): Stripe.SubscriptionUpdateParams.Item[] {
  return [...s.items.data.map(i => ({ id: i.id, deleted: true })), ...lignes];
}
function taxesFacture(f: Stripe.Invoice): number {
  return f.total_taxes?.reduce((n, t) => n + t.amount, 0) ?? 0;
}
export async function apercuTarifV2(stripe: Stripe, params: { customer: string; lignes: LigneStripeV2[]; fiscalite: FiscaliteV2; abonnement?: Stripe.Subscription | null; prorationDate?: number }) {
  const regular = await stripe.invoices.createPreview({ customer: params.customer, discounts: [],
    subscription_details: { items: params.lignes, default_tax_rates: params.fiscalite.taux_id ? [params.fiscalite.taux_id] : [] },
    automatic_tax: { enabled: false } });
  let prorata = 0;
  if (params.abonnement) {
    const preview = await stripe.invoices.createPreview({ customer: params.customer, subscription: params.abonnement.id,
      subscription_details: { items: modificationsLignes(params.abonnement, params.lignes), proration_behavior: "always_invoice", proration_date: params.prorationDate } });
    // amount_due inclut taxes et solde disponible ; c’est ce qui sera réellement demandé.
    prorata = preview.amount_due;
  }
  return { total: regular.total, taxe: taxesFacture(regular), prorata, premierPaiement: regular.amount_due };
}

export function metadataProposition(p: PropositionStripeV2, org: string, id: string): Stripe.MetadataParam {
  return { organization_id: org, tarification_version: VERSION_TARIFICATION, proposition_id: id,
    formule: p.formule, periodicite: p.periodicite, capacite: String(p.capacite), volume_facture: String(p.volume_cible) };
}

export async function ouvrirSouscriptionV2(stripe: Stripe, p: PropositionStripeV2, org: string, id: string, retour: string) {
  const essai = finEssaiV2(p.essai_fin);
  if (!essai && Date.parse(p.date_effet) > p.stripe_proration_date * 1000) throw new Error("Votre essai est terminé depuis le récapitulatif. Confirmez à nouveau la date du premier prélèvement.");
  const metadata = metadataProposition(p, org, id);
  const commun = { customer: p.stripe_customer_id, success_url: `${retour}?paiement=verification`, cancel_url: `${retour}?paiement=annule`,
    client_reference_id: org, metadata, expires_at: Math.floor(Date.now() / 1000) + 1800, billing_address_collection: "required" as const, payment_method_types: ["card"] as Stripe.Checkout.SessionCreateParams.PaymentMethodType[] };
  // Checkout impose 48h pour trial_end. Le mode setup préserve même les dernières minutes d’essai.
  const session = await stripe.checkout.sessions.create(essai ? {
    ...commun, mode: "setup", currency: "eur", setup_intent_data: { metadata },
    custom_text: { submit: { message: `Souscription confirmée : premier prélèvement à la fin de votre essai, le ${new Date(essai * 1000).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}. ${p.total_centimes / 100} EUR par ${p.periodicite === "annuel" ? "an, en une fois" : "mois"}. ${p.fiscalite.mention}` } },
  } : {
    ...commun, mode: "subscription", line_items: p.stripe_lignes,
    allow_promotion_codes: false, automatic_tax: { enabled: false },
    subscription_data: { metadata, default_tax_rates: p.fiscalite.taux_id ? [p.fiscalite.taux_id] : [] },
  }, { idempotencyKey: `abonnement-v2-checkout-${id}` });
  if (!session.url) throw new Error("La page sécurisée de paiement n’a pas pu être ouverte.");
  return session.url;
}

export async function terminerSouscriptionEssaiV2(stripe: Stripe, session: Stripe.Checkout.Session, p: PropositionStripeV2, org: string, id: string) {
  if (session.mode !== "setup" || session.status !== "complete" || session.customer !== p.stripe_customer_id || session.metadata?.proposition_id !== id) throw new Error("La confirmation du moyen de paiement ne correspond pas à la souscription.");
  const essai = finEssaiV2(p.essai_fin);
  if (!essai) throw new Error("L’essai est terminé. Une nouvelle confirmation du premier prélèvement est nécessaire.");
  const setupId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id;
  if (!setupId) throw new Error("Le moyen de paiement n’est pas confirmé.");
  const setup = await stripe.setupIntents.retrieve(setupId);
  if (setup.status !== "succeeded" || setup.customer !== p.stripe_customer_id || !setup.payment_method) throw new Error("Le moyen de paiement n’est pas confirmé.");
  return stripe.subscriptions.create({ customer: p.stripe_customer_id, default_payment_method: typeof setup.payment_method === "string" ? setup.payment_method : setup.payment_method.id,
    items: p.stripe_lignes, trial_end: essai, trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
    metadata: metadataProposition(p, org, id), default_tax_rates: p.fiscalite.taux_id ? [p.fiscalite.taux_id] : [], automatic_tax: { enabled: false },
  }, { idempotencyKey: `abonnement-v2-essai-${id}` });
}

export async function augmenterAbonnementV2(stripe: Stripe, s: Stripe.Subscription, p: PropositionStripeV2, org: string, id: string) {
  if (s.schedule || s.pending_update || s.cancel_at_period_end) throw new Error("Un changement ou une résiliation est déjà programmé. Réglez cette demande avant de modifier votre capacité.");
  if (s.items.data[0]?.price.recurring?.interval !== (p.periodicite === "annuel" ? "year" : "month")) throw new Error("Un changement de périodicité se programme à la prochaine échéance.");
  return stripe.subscriptions.update(s.id, { items: modificationsLignes(s, p.stripe_lignes), proration_behavior: "always_invoice",
    proration_date: p.stripe_proration_date, payment_behavior: "pending_if_incomplete", metadata: metadataProposition(p, org, id),
    expand: ["latest_invoice"] }, { idempotencyKey: `abonnement-v2-hausse-${id}` });
}

export async function programmerBaisseV2(stripe: Stripe, s: Stripe.Subscription, p: PropositionStripeV2, org: string, id: string) {
  if (s.schedule || s.pending_update || s.cancel_at_period_end) throw new Error("Un changement ou une résiliation est déjà programmé. Réglez cette demande avant d’en programmer une autre.");
  // Catalogue V2 uniquement : aucun calendrier historique ni avantage n’est remplacé.
  if (s.metadata.tarification_version !== VERSION_TARIFICATION || s.discounts.length || s.automatic_tax.enabled || s.items.data.some(i => i.discounts.length || (i.tax_rates?.length ?? 0))) throw new Error("Cette souscription comporte des réglages particuliers. Gerimmo doit préserver ces réglages avant de programmer le changement.");
  const schedule = await stripe.subscriptionSchedules.create({ from_subscription: s.id }, { idempotencyKey: `abonnement-v2-calendrier-${id}` });
  const phase = schedule.phases[0];
  if (!phase) throw new Error("La période payée n’a pas pu être lue.");
  return stripe.subscriptionSchedules.update(schedule.id, { end_behavior: "release", proration_behavior: "none", metadata: { proposition_id: id },
    phases: [{ start_date: phase.start_date, end_date: phase.end_date, items: s.items.data.map(i => ({ price: i.price.id, quantity: i.quantity ?? 1 })),
      metadata: s.metadata, default_tax_rates: (s.default_tax_rates ?? []).map(t => t.id), proration_behavior: "none", ...(phase.trial_end ? { trial_end: phase.trial_end } : {}) },
    { start_date: phase.end_date, duration: { interval: p.periodicite === "annuel" ? "year" : "month", interval_count: 1 }, items: p.stripe_lignes,
      metadata: metadataProposition(p, org, id), default_tax_rates: p.fiscalite.taux_id ? [p.fiscalite.taux_id] : [], proration_behavior: "none" }],
  }, { idempotencyKey: `abonnement-v2-baisse-${id}` });
}

/** Les droits découlent des lignes réellement actives, jamais d’une hausse en attente. */
export async function snapshotSouscriptionV2(stripe: Stripe, config: ConfigurationV2, s: Stripe.Subscription) {
  if (s.livemode !== config.reel || s.metadata.tarification_version !== VERSION_TARIFICATION) throw new Error("Cette souscription n’appartient pas à la nouvelle tarification.");
  const lignes = s.items.data;
  const principale = lignes.find(i => Object.entries(config.catalogue).some(([key, val]) => !key.startsWith("supplement_") && val === i.price.id));
  if (!principale) throw new Error("Le tarif de cette souscription est inconnu.");
  const cle = Object.entries(config.catalogue).find(([key, val]) => !key.startsWith("supplement_") && val === principale.price.id)![0];
  const periodicite: Periodicite = cle.endsWith("_annuel") ? "annuel" : "mensuel";
  const agence = cle.startsWith("agence_");
  const form = cle.split("_")[0];
  const baseCapacites: Record<string, number> = { solo: 1, bailleur: 3, investisseur: 10, patrimoine: 20 };
  const sup = lignes.find(i => i.price.id === config.catalogue[`supplement_${periodicite}`]);
  const capacite = agence ? Math.max(10, principale.quantity ?? 1) : (baseCapacites[form] ?? 0) + (sup?.quantity ?? 0);
  const volume = agence ? (principale.quantity ?? 1) : capacite;
  const valide = await lignesTarifV2(stripe, config, agence ? "agence" : "proprietaire_direct", volume, periodicite);
  const attendues = valide.lignes.map(l => `${l.price}:${l.quantity}`).sort();
  const recues = lignes.map(l => `${l.price.id}:${l.quantity}`).sort();
  if (JSON.stringify(attendues) !== JSON.stringify(recues)) throw new Error("Les lignes facturées ne correspondent pas à une formule Gerimmo.");
  const customer = typeof s.customer === "string" ? s.customer : s.customer.id;
  const apercu = await apercuTarifV2(stripe, { customer, lignes: valide.lignes, fiscalite: valide.fiscalite });
  return { version: VERSION_TARIFICATION, stripe_customer_id: customer, stripe_subscription_id: s.id, stripe_statut: s.status,
    formule: valide.tarif.formule, periodicite, volume_facture: agence && Number(s.metadata.volume_facture) === 0 ? 0 : volume,
    capacite, montant_centimes: valide.tarif.montantCentimes, total_centimes: apercu.total, taxe_centimes: apercu.taxe,
    periode_fin: new Date(principale.current_period_end * 1000).toISOString(), annulation_demandee: s.cancel_at_period_end,
    pending_update: Boolean(s.pending_update) };
}

/** Résiliation explicite, y compris après une baisse programmée. Aucun droit payé n’est repris. */
export async function resilierAbonnementV2(stripe: Stripe, s: Stripe.Subscription, id: string) {
  if (s.metadata.tarification_version !== VERSION_TARIFICATION) throw new Error("Ce contrat historique doit être géré depuis son espace de facturation.");
  if (s.pending_update) {
    const invoiceId = typeof s.latest_invoice === "string" ? s.latest_invoice : s.latest_invoice?.id;
    if (!invoiceId) throw new Error("La demande de changement en attente doit être vérifiée avant la résiliation.");
    const invoice = await stripe.invoices.retrieve(invoiceId);
    if (invoice.status === "open") await stripe.invoices.voidInvoice(invoiceId, {}, { idempotencyKey: `abonnement-v2-abandon-hausse-${id}` });
  }
  if (s.schedule) {
    const scheduleId = typeof s.schedule === "string" ? s.schedule : s.schedule.id;
    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
    if (!schedule.metadata?.proposition_id) throw new Error("Le calendrier de ce contrat nécessite une vérification avant sa résiliation.");
    await stripe.subscriptionSchedules.release(scheduleId, {}, { idempotencyKey: `abonnement-v2-annuler-calendrier-${id}` });
  }
  return stripe.subscriptions.update(s.id, { cancel_at_period_end: true }, { idempotencyKey: `abonnement-v2-resiliation-${id}` });
}
