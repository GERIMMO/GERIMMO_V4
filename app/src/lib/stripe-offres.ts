// Stripe pour la grille du 28/09/2026 — l'adaptateur des OFFRES.
//
// LE PRIX NE VIT PLUS CHEZ STRIPE. La grille historique confiait le prix
// unitaire à un tarif créé à la main dans Stripe (STRIPE_PRIX_BIEN) ; la
// nouvelle a quatre formules, deux périodicités, des suppléments et des
// tranches — autant de tarifs à créer, à garder alignés, et à ne jamais
// oublier de changer ensemble. Ici, chaque ligne part avec son montant
// (`price_data`), calculé par src/lib/tarifs.ts : le site, l'écran et la
// facture lisent le même nombre. Stripe ne garde que les PRODUITS (un par
// formule, un pour le supplément, un par tranche agence), créés à la volée
// avec un identifiant stable — aucune variable à poser.
//
// LA TVA suit le régime déclaré de l'éditeur (REGIME_TVA, lib/editeur.ts) :
// franchise → aucun taux, mention 293 B sur les factures ; assujetti → un
// taux Stripe (TTC inclus pour les particuliers, HT + TVA pour les agences),
// retrouvé ou créé une fois, reconnu par sa métadonnée. Régime inconnu : on
// ne souscrit pas — un montant de taxe ne s'invente pas.

import type Stripe from "stripe";
import {
  appliquerPiedDeFacture,
  lireErreurStripe,
  piedDeFacturePour,
  verifierAucuneSouscriptionVivante,
  type Echec,
  type Reussite,
} from "@/lib/stripe";
import {
  formuleParCode,
  offreAgence,
  offreFormule,
  type LigneTarif,
  type Offre,
  type Periodicite,
  type RegimeTva,
} from "@/lib/tarifs";

export const GRILLE = "2026-09-28";

const NOMS_PRODUITS: Record<string, string> = {
  gerimmo_formule_solo: "Gerimmo — formule Solo",
  gerimmo_formule_bailleur: "Gerimmo — formule Bailleur",
  gerimmo_formule_investisseur: "Gerimmo — formule Investisseur",
  gerimmo_formule_patrimoine: "Gerimmo — formule Patrimoine",
  gerimmo_bien_supplementaire: "Gerimmo — bien supplémentaire (au-delà de 20)",
  gerimmo_agence_tranche_1: "Gerimmo agence — socle (jusqu'à 10 lots)",
  gerimmo_agence_tranche_2: "Gerimmo agence — lots du 11ᵉ au 50ᵉ",
  gerimmo_agence_tranche_3: "Gerimmo agence — lots du 51ᵉ au 200ᵉ",
  gerimmo_agence_tranche_4: "Gerimmo agence — lots à partir du 201ᵉ",
};

/** Le produit Stripe de cette ligne, créé s'il n'existe pas encore. */
export async function assurerProduit(stripe: Stripe, id: string): Promise<string> {
  try {
    const p = await stripe.products.retrieve(id);
    if (!p.active) await stripe.products.update(id, { active: true });
    return p.id;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code !== "resource_missing") throw e;
    const cree = await stripe.products.create(
      { id, name: NOMS_PRODUITS[id] ?? id, metadata: { gerimmo_grille: GRILLE } },
      { idempotencyKey: `produit:${id}` }
    );
    return cree.id;
  }
}

/** Le taux de TVA Stripe du régime déclaré, retrouvé par sa métadonnée ou créé. */
export async function assurerTauxTva(
  stripe: Stripe,
  taux: number,
  inclusive: boolean
): Promise<string> {
  const marque = `tva-${taux}-${inclusive ? "incluse" : "en-sus"}`;
  for await (const t of stripe.taxRates.list({ active: true, limit: 100 })) {
    if (t.metadata?.gerimmo === marque && t.percentage === taux && t.inclusive === inclusive) return t.id;
  }
  const cree = await stripe.taxRates.create({
    display_name: "TVA",
    percentage: taux,
    inclusive,
    country: "FR",
    jurisdiction: "FR",
    description: `TVA ${taux} % ${inclusive ? "incluse" : "en sus"} (Gerimmo)`,
    metadata: { gerimmo: marque },
  });
  return cree.id;
}

/** La mention de facture exigée par le régime (franchise en base). */
export function piedDeFacture(regime: RegimeTva): string | undefined {
  return piedDeFacturePour(regime);
}

/**
 * « explicite » : le client a choisi une offre plus chère que celle qui couvre
 * son portefeuille (formule supérieure, lots en réserve). La tâche de nuit ne
 * la rabaisse alors pas d'elle-même à l'échéance (audit 29/09, point 11).
 */
export type ChoixOffre = "explicite" | "auto";

export type LigneStripe = {
  produit: string;
  quantite: number;
  prix: {
    currency: "eur";
    product: string;
    unit_amount: number;
    recurring: { interval: "month" | "year" };
    tax_behavior: "inclusive" | "exclusive";
  };
  tax_rates?: string[];
};

/** Les lignes Stripe d'une offre : produits assurés, montants de la grille, taux. */
export async function lignesStripe(
  stripe: Stripe,
  offre: Offre,
  regime: RegimeTva
): Promise<LigneStripe[]> {
  const inclusive = offre.public === "particulier";
  const taux =
    regime.nature === "assujetti" ? [await assurerTauxTva(stripe, regime.tauxPourcent, inclusive)] : undefined;
  const lignes: LigneStripe[] = [];
  for (const l of offre.lignes) {
    const product = await assurerProduit(stripe, l.produit);
    lignes.push({
      produit: l.produit,
      quantite: l.quantite,
      prix: {
        currency: "eur",
        product,
        unit_amount: l.prixUnitaireCents,
        recurring: { interval: offre.periodicite === "annuel" ? "year" : "month" },
        tax_behavior: inclusive ? "inclusive" : "exclusive",
      },
      ...(taux ? { tax_rates: taux } : {}),
    });
  }
  return lignes;
}

/** Ce que la souscription porte en métadonnées : ce que le webhook recopie. */
export function metadonneesOffre(orgId: string, offre: Offre, choix: ChoixOffre = "auto"): Record<string, string> {
  return {
    gerimmo_choix: choix,
    organization_id: orgId,
    gerimmo_grille: GRILLE,
    gerimmo_public: offre.public,
    gerimmo_periodicite: offre.periodicite,
    gerimmo_formule: offre.public === "particulier" ? offre.formule.code : "",
    gerimmo_unites: String(offre.capacite),
    gerimmo_montant_cents: String(offre.montantCents),
  };
}

/** Stripe Checkout refuse un `trial_end` à moins de 48 h : on garde une marge. */
const MARGE_ESSAI_S = 48 * 3600 + 600;

/**
 * La fin d'essai à transmettre : les jours restants sont PRÉSERVÉS. `essai_fin`
 * est une date incluse (fin = minuit UTC du lendemain). Si l'essai finit dans
 * moins de 48 h, Stripe refuse la date : on la reporte au plus proche
 * possible — quelques heures offertes plutôt qu'un débit immédiat.
 */
export function finEssaiPreservee(essaiFin: string | null | undefined, maintenantMs = Date.now()): number | undefined {
  if (!essaiFin) return undefined;
  const debutMs = new Date(essaiFin).getTime();
  if (Number.isNaN(debutMs)) return undefined;
  const fin = Math.floor(debutMs / 1000) + (essaiFin.length === 10 ? 86_400 : 0);
  const maintenant = Math.floor(maintenantMs / 1000);
  if (fin <= maintenant) return undefined; // essai terminé : rien à préserver
  return Math.max(fin, maintenant + MARGE_ESSAI_S);
}

/** La page de paiement hébergée par Stripe, pour une offre de la nouvelle grille. */
export async function creerSessionOffre(
  stripe: Stripe,
  params: {
    offre: Offre;
    regime: RegimeTva;
    customer: string;
    orgId: string;
    retourOk: string;
    retourAnnule: string;
    essaiFin?: string | null;
    /** « explicite » si le client a choisi plus que ce qui couvre son portefeuille. */
    choix?: ChoixOffre;
  }
): Promise<Reussite<{ url: string; premierPrelevement: number | null }> | Echec> {
  // Jamais une seconde souscription à côté d'une vivante (audit 29/09, point 1).
  const libre = await verifierAucuneSouscriptionVivante(stripe, params.customer);
  if (!libre.ok) return libre;
  try {
    const lignes = await lignesStripe(stripe, params.offre, params.regime);
    // Posée en franchise, RETIRÉE sinon (audit 29/09, point 6).
    await appliquerPiedDeFacture(stripe, params.customer, params.regime);
    const trialEnd = finEssaiPreservee(params.essaiFin);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: params.customer,
      line_items: lignes.map((l) => ({
        price_data: {
          currency: l.prix.currency,
          product: l.prix.product,
          unit_amount: l.prix.unit_amount,
          recurring: l.prix.recurring,
          tax_behavior: l.prix.tax_behavior,
        },
        quantity: l.quantite,
        ...(l.tax_rates ? { tax_rates: l.tax_rates } : {}),
      })),
      success_url: params.retourOk,
      cancel_url: params.retourAnnule,
      billing_address_collection: "required",
      // Le formulaire fait lire au client le montant exact avant validation ;
      // Stripe l'affiche encore, TTC, taxes détaillées, avant la carte.
      subscription_data: {
        metadata: metadonneesOffre(params.orgId, params.offre, params.choix),
        ...(trialEnd ? { trial_end: trialEnd } : {}),
      },
      metadata: { organization_id: params.orgId, gerimmo_grille: GRILLE },
      client_reference_id: params.orgId,
    });
    if (!session.url) return { ok: false, erreur: "Stripe n'a pas rendu d'adresse de paiement." };
    return { ok: true, url: session.url, premierPrelevement: trialEnd ?? null };
  } catch (e) {
    return { ok: false, erreur: lireErreurStripe(e) };
  }
}

type ElementMaj = {
  id?: string;
  deleted?: boolean;
  quantity?: number;
  price_data?: {
    currency: string;
    product: string;
    unit_amount: number;
    recurring: { interval: "month" | "year" };
    tax_behavior: "inclusive" | "exclusive";
  };
  tax_rates?: string[];
};

function produitDe(item: Stripe.SubscriptionItem): string {
  const p = item.price.product;
  return typeof p === "string" ? p : p.id;
}

/**
 * Les éléments de mise à jour : une ligne gardée garde son identifiant (Stripe
 * calcule alors le prorata sur elle), une ligne nouvelle s'ajoute, une ligne
 * qui n'a plus lieu d'être est supprimée.
 */
export function elementsDeMiseAJour(
  existants: Stripe.SubscriptionItem[],
  lignes: LigneStripe[]
): ElementMaj[] {
  const restants = new Map(existants.map((i) => [produitDe(i), i]));
  const elements: ElementMaj[] = lignes.map((l) => {
    const existant = restants.get(l.prix.product);
    restants.delete(l.prix.product);
    return {
      ...(existant ? { id: existant.id } : {}),
      quantity: l.quantite,
      price_data: {
        currency: l.prix.currency,
        product: l.prix.product,
        unit_amount: l.prix.unit_amount,
        recurring: l.prix.recurring,
        tax_behavior: l.prix.tax_behavior,
      },
      ...(l.tax_rates ? { tax_rates: l.tax_rates } : {}),
    };
  });
  for (const i of restants.values()) elements.push({ id: i.id, deleted: true });
  return elements;
}

/**
 * L'APERÇU d'un changement, calculé par Stripe : ce qui serait prélevé
 * aujourd'hui (prorata) si le client confirme maintenant. `prorationDate` est
 * rendue pour être reprise telle quelle à la confirmation : le montant
 * confirmé est alors exactement celui qui a été montré.
 */
export async function apercuChangement(
  stripe: Stripe,
  params: { subscription: string; offre: Offre; regime: RegimeTva; maintenant?: number }
): Promise<Reussite<{ immediatCents: number; prorationDate: number; enEssai: boolean }> | Echec> {
  try {
    const s = await stripe.subscriptions.retrieve(params.subscription);
    const lignes = await lignesStripe(stripe, params.offre, params.regime);
    const enEssai = s.status === "trialing";
    const prorationDate = params.maintenant ?? Math.floor(Date.now() / 1000);
    if (enEssai) return { ok: true, immediatCents: 0, prorationDate, enEssai };
    const apercu = await stripe.invoices.createPreview({
      customer: typeof s.customer === "string" ? s.customer : s.customer.id,
      subscription: s.id,
      subscription_details: {
        items: elementsDeMiseAJour(s.items.data, lignes),
        proration_behavior: "always_invoice",
        proration_date: prorationDate,
      },
    });
    return { ok: true, immediatCents: apercu.amount_due, prorationDate, enEssai };
  } catch (e) {
    return { ok: false, erreur: lireErreurStripe(e) };
  }
}

/**
 * Libérer l'échéancier Stripe attaché à la souscription, s'il y en a un.
 *
 * Audit 29/09, point 5. Un échéancier (baisse ou périodicité programmée pour
 * l'échéance) REPREND la main à sa phase suivante : une résiliation, une
 * hausse ou une nouvelle demande de périodicité posée à côté serait écrasée
 * par la phase programmée. On le libère d'abord — la souscription garde son
 * état présent — et la tâche de nuit reprogrammera ce qui doit l'être.
 * Rend vrai si un échéancier a été libéré.
 */
export async function libererEcheancier(stripe: Stripe, s: Stripe.Subscription): Promise<boolean> {
  const id = typeof s.schedule === "string" ? s.schedule : (s.schedule?.id ?? null);
  if (!id) return false;
  const echeancier = await stripe.subscriptionSchedules.retrieve(id);
  if (echeancier.status !== "active" && echeancier.status !== "not_started") return false;
  await stripe.subscriptionSchedules.release(id);
  return true;
}

/**
 * Appliquer une HAUSSE confirmée : prorata facturé et prélevé aussitôt
 * (`always_invoice`), et refus net si la carte échoue (`error_if_incomplete`)
 * — la capacité n'est alors pas relevée. Pendant l'essai Stripe, aucun
 * prorata : le premier prélèvement portera la nouvelle formule. Un échéancier
 * en place est libéré avant (sa phase suivante écraserait la hausse).
 */
export async function appliquerHausse(
  stripe: Stripe,
  params: {
    subscription: string;
    offre: Offre;
    regime: RegimeTva;
    orgId: string;
    prorationDate: number;
    choix?: ChoixOffre;
  }
): Promise<Reussite<{ souscription: Stripe.Subscription; echeancierLibere: boolean }> | Echec> {
  try {
    const s = await stripe.subscriptions.retrieve(params.subscription);
    const echeancierLibere = await libererEcheancier(stripe, s);
    const lignes = await lignesStripe(stripe, params.offre, params.regime);
    const enEssai = s.status === "trialing";
    const maj = await stripe.subscriptions.update(params.subscription, {
      items: elementsDeMiseAJour(s.items.data, lignes),
      proration_behavior: enEssai ? "none" : "always_invoice",
      ...(enEssai ? {} : { proration_date: params.prorationDate, payment_behavior: "error_if_incomplete" as const }),
      metadata: metadonneesOffre(params.orgId, params.offre, params.choix),
    });
    return { ok: true, souscription: maj, echeancierLibere };
  } catch (e) {
    return { ok: false, erreur: lireErreurStripe(e) };
  }
}

/** Le choix du client a-t-il été explicite (formule plus chère que nécessaire) ? */
export function choixExplicite(s: Pick<Stripe.Subscription, "metadata">): boolean {
  return s.metadata?.gerimmo_choix === "explicite";
}

/** La phase EN COURS d'un échéancier : celle qui contient maintenant. */
function phaseEnCours(
  echeancier: Stripe.SubscriptionSchedule,
  maintenant: number
): Stripe.SubscriptionSchedule.Phase {
  const courante = echeancier.current_phase;
  const parCourante = courante
    ? echeancier.phases.find((p) => p.start_date === courante.start_date && p.end_date === courante.end_date)
    : undefined;
  return (
    parCourante ??
    echeancier.phases.find((p) => p.start_date <= maintenant && maintenant < p.end_date) ??
    echeancier.phases[0]
  );
}

/**
 * Programmer une offre pour la PROCHAINE période, sans rien changer à la
 * période en cours : un échéancier Stripe garde la phase actuelle telle
 * quelle (prix, quantités, métadonnées, fin d'essai), puis ouvre la suivante
 * avec l'offre donnée, et se retire. La capacité enregistrée chez nous ne
 * bouge qu'à l'ouverture de la nouvelle période, quand Stripe recopie les
 * métadonnées de la phase sur la souscription (webhook).
 *
 * Audit 29/09, point 5 : la première phase est celle qui CONTIENT maintenant
 * (`current_phase`), pas la dernière de l'échéancier — un échéancier déjà
 * programmé aurait sinon « prolongé » sa phase future à la place de la
 * présente. Une souscription en essai garde sa fin d'essai.
 */
export async function programmerEcheance(
  stripe: Stripe,
  params: { subscription: string; offre: Offre; regime: RegimeTva; orgId: string; choix?: ChoixOffre; maintenant?: number }
): Promise<Reussite<{ echeancier: string }> | Echec> {
  try {
    const s = await stripe.subscriptions.retrieve(params.subscription);
    const lignes = await lignesStripe(stripe, params.offre, params.regime);
    const existant = typeof s.schedule === "string" ? s.schedule : (s.schedule?.id ?? null);
    const echeancier = existant
      ? await stripe.subscriptionSchedules.retrieve(existant)
      : await stripe.subscriptionSchedules.create({ from_subscription: s.id });
    const maintenant = params.maintenant ?? Math.floor(Date.now() / 1000);
    const phase = phaseEnCours(echeancier, maintenant);
    const finEssai = s.status === "trialing" && typeof s.trial_end === "number" ? s.trial_end : null;
    const maj = await stripe.subscriptionSchedules.update(echeancier.id, {
      end_behavior: "release",
      proration_behavior: "none",
      phases: [
        {
          start_date: phase.start_date,
          end_date: phase.end_date,
          items: phase.items.map((i) => ({
            price: typeof i.price === "string" ? i.price : i.price.id,
            quantity: i.quantity ?? 1,
            ...(i.tax_rates?.length ? { tax_rates: i.tax_rates.map((t) => (typeof t === "string" ? t : t.id)) } : {}),
          })),
          metadata: s.metadata,
          ...(finEssai ? { trial_end: finEssai } : {}),
        },
        {
          items: lignes.map((l) => ({
            price_data: {
              currency: l.prix.currency,
              product: l.prix.product,
              unit_amount: l.prix.unit_amount,
              recurring: l.prix.recurring,
              tax_behavior: l.prix.tax_behavior,
            },
            quantity: l.quantite,
            ...(l.tax_rates ? { tax_rates: l.tax_rates } : {}),
          })),
          duration: { interval: params.offre.periodicite === "annuel" ? "year" : "month", interval_count: 1 },
          metadata: metadonneesOffre(params.orgId, params.offre, params.choix ?? (choixExplicite(s) ? "explicite" : "auto")),
        },
      ],
    });
    return { ok: true, echeancier: maj.id };
  } catch (e) {
    return { ok: false, erreur: lireErreurStripe(e) };
  }
}

/**
 * Appliquer une BAISSE à l'échéance : sans prorata (la période payée n'est
 * pas remboursée ni refacturée). Audit 29/09, point 11 : par un échéancier —
 * la mise à jour directe changeait le prix ET la capacité sur-le-champ, au
 * milieu d'une période déjà payée. La nouvelle offre commence à la prochaine
 * période ; d'ici là, la capacité payée reste entière.
 * Appelée par la tâche de nuit dans les jours qui précèdent l'échéance.
 */
export async function appliquerBaisseAEcheance(
  stripe: Stripe,
  params: { subscription: string; offre: Offre; regime: RegimeTva; orgId: string }
): Promise<Reussite<{ echeancier: string }> | Echec> {
  return programmerEcheance(stripe, params);
}

/**
 * Changer de périodicité À L'ÉCHÉANCE, jamais en cours de période (même
 * mécanique que la baisse : un échéancier qui ouvre la période suivante).
 */
export async function programmerPeriodicite(
  stripe: Stripe,
  params: { subscription: string; offre: Offre; regime: RegimeTva; orgId: string }
): Promise<Reussite<{ echeancier: string }> | Echec> {
  return programmerEcheance(stripe, params);
}

/**
 * Résilier pour la prochaine échéance (ou revenir sur cette demande). Un
 * échéancier en place est libéré d'abord : sa phase suivante rouvrirait une
 * période que le client vient de refuser.
 */
export async function resilierAEcheance(
  stripe: Stripe,
  params: { subscription: string; resilier: boolean }
): Promise<Reussite<{ souscription: Stripe.Subscription; echeancierLibere: boolean }> | Echec> {
  try {
    const s = await stripe.subscriptions.retrieve(params.subscription);
    const echeancierLibere = await libererEcheancier(stripe, s);
    const maj = await stripe.subscriptions.update(params.subscription, {
      cancel_at_period_end: params.resilier,
    });
    return { ok: true, souscription: maj, echeancierLibere };
  } catch (e) {
    return { ok: false, erreur: lireErreurStripe(e) };
  }
}

/** Libérer l'échéancier d'une souscription donnée par son identifiant. */
export async function libererEcheancierDe(
  stripe: Stripe,
  subscription: string
): Promise<Reussite<{ echeancierLibere: boolean }> | Echec> {
  try {
    const s = await stripe.subscriptions.retrieve(subscription);
    return { ok: true, echeancierLibere: await libererEcheancier(stripe, s) };
  } catch (e) {
    return { ok: false, erreur: lireErreurStripe(e) };
  }
}

export type DetailsSouscription = {
  grille: string | null;
  periodicite: Periodicite;
  formule: string | null;
  unites: number | null;
  montantPeriodeCents: number;
  periodeDebut: string | null;
};

/**
 * Ce que la souscription facture RÉELLEMENT, lu chez Stripe : périodicité et
 * montant d'une période depuis ses lignes, formule et capacité depuis ses
 * métadonnées. C'est ce que le miroir enregistre et ce que l'écran affiche
 * comme « montant facturé ».
 */
export function lireDetails(s: Stripe.Subscription): DetailsSouscription {
  const items = s.items?.data ?? [];
  const interval = items[0]?.price?.recurring?.interval;
  const montant = items.reduce((t, i) => t + (i.price?.unit_amount ?? 0) * (i.quantity ?? 1), 0);
  const debut = items[0]?.current_period_start ?? (s as unknown as { current_period_start?: number }).current_period_start;
  const unites = Number.parseInt(s.metadata?.gerimmo_unites ?? "", 10);
  return {
    grille: s.metadata?.gerimmo_grille ?? null,
    periodicite: interval === "year" ? "annuel" : "mensuel",
    formule: s.metadata?.gerimmo_formule || null,
    unites: Number.isFinite(unites) ? unites : null,
    montantPeriodeCents: montant,
    periodeDebut: typeof debut === "number" ? new Date(debut * 1000).toISOString() : null,
  };
}

/** L'offre à facturer pour un portefeuille donné et une formule choisie. */
export function offrePour(
  publicTarif: "agence" | "proprietaire_direct",
  unites: number,
  periodicite: Periodicite,
  codeFormule?: string | null
): Offre | null {
  if (publicTarif === "agence") return offreAgence(unites);
  const f = formuleParCode(codeFormule);
  if (!f) return null;
  return offreFormule(f, unites, periodicite);
}

/** Montant affiché d'une ligne, utile pour comparer ce qui est facturé à la grille. */
export function totalLignes(lignes: LigneTarif[]): number {
  return lignes.reduce((t, l) => t + l.totalCents, 0);
}
