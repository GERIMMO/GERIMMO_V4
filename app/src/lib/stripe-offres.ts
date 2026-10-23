import { ArretSupervision } from "./controle-effets";
import { borneJourParis } from "./heure-paris";
import { dateParis } from "./heure-paris-calcul";
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
  EcritureStripeHorsDelai,
  lireErreurStripe,
  messageStripePourClient,
  piedDeFacturePour,
  verifierAucuneSouscriptionVivante,
  type Echec,
  type Reussite,
} from "@/lib/stripe";
import { jourEnLettres } from "@/lib/delai-retractation";
import {
  euros,
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
    if (e instanceof ArretSupervision) throw e;
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
 * est une date incluse (fin = minuit de Paris du lendemain). Si l'essai finit dans
 * moins de 48 h, Stripe refuse la date : on la reporte au plus proche
 * possible — quelques heures offertes plutôt qu'un débit immédiat.
 */
export function finEssaiPreservee(essaiFin: string | null | undefined, maintenantMs = Date.now()): number | undefined {
  if (!essaiFin) return undefined;
  const borne = essaiFin.length === 10 ? borneJourParis(essaiFin, true) : essaiFin;
  if (!borne) return undefined;
  const finMs = new Date(borne).getTime() + (essaiFin.length === 10 ? 1 : 0);
  if (!Number.isFinite(finMs) || !Number.isFinite(maintenantMs)) return undefined;
  const fin = Math.floor(finMs / 1000);
  const maintenant = Math.floor(maintenantMs / 1000);
  if (fin <= maintenant) return undefined; // essai terminé : rien à préserver
  return Math.max(fin, maintenant + MARGE_ESSAI_S);
}

/** Date annoncée au client, dans le même fuseau que la fin d'essai Stripe. */
export function datePremierPrelevement(essaiFin: string | null | undefined, maintenantMs = Date.now()): string | null {
  const fin = finEssaiPreservee(essaiFin, maintenantMs);
  return fin === undefined ? null : dateParis(new Date(fin * 1000));
}

/**
 * L'intention de souscription réservée en base pour cette demande (défaut A01,
 * audit du 23/10/2026 ; table `intentions_souscription`). Elle fixe tout ce
 * qui dépendait de l'instant de la demande : deux onglets qui la partagent
 * envoient à Stripe EXACTEMENT la même requête, sous la même clé
 * d'idempotence, et reçoivent la même page.
 */
export type IntentionSouscription = {
  id: string;
  /** Instant de la réservation (ms) : il remplace « maintenant » dans le calcul de la fin d'essai. */
  creeLeMs: number;
  /** Fin de la réservation (s) : l'expiration de la page Stripe, au même instant. */
  expireLeS: number;
};

/** La clé d'idempotence Stripe de la page de paiement d'une intention. */
export function cleIdempotenceSouscription(intention: string): string {
  return `souscription:${intention}`;
}

/**
 * Plan du 23/10 (R21) : le texte sous le dernier bouton de la page de paiement — « En cliquant, vous commandez
 * l'abonnement Gerimmo {formule} avec obligation de paiement : {montant} {par mois / par an}{, premier prélèvement le
 * {date}}. » La date est celle de la fin d'essai transmise à Stripe (jour de Paris).
 */
export function messageBoutonPaiement(offre: Offre, finEssaiSecondes: number | null): string {
  const formule = offre.public === "particulier" ? offre.formule.nom : "agence";
  const periode = offre.periodicite === "annuel" ? "par an" : "par mois";
  const premier = finEssaiSecondes ? `, premier prélèvement le ${jourEnLettres(dateParis(new Date(finEssaiSecondes * 1000)))}` : "";
  return `En cliquant, vous commandez l'abonnement Gerimmo ${formule} avec obligation de paiement : ${euros(offre.montantCents)} ${periode}${premier}.`;
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
    /** Obligatoire : aucune page ne s'ouvre hors d'une intention réservée (lib/souscription-unique.ts). */
    intention: IntentionSouscription;
  }
): Promise<Reussite<{ url: string; session: string; premierPrelevement: number | null }> | (Echec & { vivante?: true })> {
  // Jamais une seconde souscription à côté d'une vivante (audit 29/09, point 1).
  // La page de CETTE intention, si un autre onglet l'a déjà ouverte, est gardée.
  const libre = await verifierAucuneSouscriptionVivante(stripe, params.customer, params.intention.id);
  if (!libre.ok) return libre;
  try {
    const lignes = await lignesStripe(stripe, params.offre, params.regime);
    // Posée en franchise, RETIRÉE sinon (audit 29/09, point 6).
    await appliquerPiedDeFacture(stripe, params.customer, params.regime);
    // Calculée à l'instant de la RÉSERVATION, pas de l'appel : la même pour
    // les deux onglets (sinon Stripe refuserait la clé d'idempotence).
    const trialEnd = finEssaiPreservee(params.essaiFin, params.intention.creeLeMs);
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
      // Plan du 23/10 (R21) : la commande se conclut sur la page de Stripe ; son dernier bouton dit « Payer » (et non
      // « S'abonner »), la page est en français, et le texte sous le bouton dit l'obligation de paiement, le montant
      // et, avec un essai, la date du premier prélèvement. À vérifier en clés de test, avec et sans essai (recette du
      // chantier Stripe) ; si le bouton n'affichait pas « Payer », passer la page en mode « setup » (voir le plan).
      submit_type: "pay",
      locale: "fr",
      custom_text: { submit: { message: messageBoutonPaiement(params.offre, trialEnd ?? null) } },
      // Le formulaire fait lire au client le montant exact avant validation ;
      // Stripe l'affiche encore, TTC, taxes détaillées, avant la carte.
      subscription_data: {
        metadata: metadonneesOffre(params.orgId, params.offre, params.choix),
        ...(trialEnd ? { trial_end: trialEnd } : {}),
      },
      // La page meurt avec la réservation (Stripe : 30 min à 24 h ; 24 h par
      // défaut, ce que le code laissait jusqu'ici).
      expires_at: params.intention.expireLeS,
      metadata: { organization_id: params.orgId, gerimmo_grille: GRILLE, gerimmo_intention: params.intention.id },
      client_reference_id: params.orgId,
    }, { idempotencyKey: cleIdempotenceSouscription(params.intention.id) });
    if (!session.url) return { ok: false, erreur: "Stripe n'a pas rendu d'adresse de paiement." };
    return { ok: true, url: session.url, session: session.id, premierPrelevement: trialEnd ?? null };
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    return { ok: false, erreur: messageStripePourClient(e) };
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
    if (e instanceof ArretSupervision) throw e;
    return { ok: false, erreur: messageStripePourClient(e) };
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

/** Les étapes externes d'une hausse, chacune tracée avec son résultat (défaut A02, audit du 23/10/2026). */
export type EtapeHausse = {
  etape:
    | "lecture_souscription"
    | "preparation_lignes"
    | "lecture_echeancier"
    | "liberation_echeancier"
    | "mise_a_jour"
    | "relecture_souscription"
    | "recreation_echeancier"
    | "reprogrammation_echeancier";
  ok: boolean;
  /** L'objet Stripe concerné (souscription, échéancier) : jamais une donnée de carte. */
  objet?: string;
  erreur?: string;
};

/**
 * Ce qu'une hausse refusée laisse à l'échéancier programmé :
 * - `intouche` : aucun échéancier, ou celui en place n'a pas été retiré ;
 * - `restaure` : NOTRE libération l'avait retiré, il est recréé à l'identique ;
 * - `a_reprogrammer` : il n'est plus attaché à la souscription (libéré par nous et non recréable, ou retiré
 *   ailleurs) — l'échéance doit être recalculée par la tâche de nuit, sur l'état réel.
 */
export type SortEcheancier = "intouche" | "restaure" | "a_reprogrammer";

/** Le refus d'une hausse, avec ce qui est SÛR : la hausse, l'échéancier, les étapes. */
export type EchecHausse = Echec & {
  /** `incertaine` : Stripe n'a pas répondu à la mise à jour et la relecture ne permet pas de dire qu'elle n'a pas eu lieu. */
  hausse: "non_appliquee" | "incertaine";
  echeancier: SortEcheancier;
  etapes: EtapeHausse[];
  /**
   * Stripe a refusé NET de libérer l'échéancier (déjà libéré ailleurs, par exemple) : nous n'avons rien retiré, rien
   * tenté, rien reposé. `erreur` est alors un motif pour le client, en français.
   */
  liberationRefusee?: true;
};

/**
 * Les erreurs de Stripe qui disent NET que la requête n'a rien fait (refus de carte, requête refusée, clé ou droits
 * refusés). Toutes les autres laissent un doute : coupure, erreur 500, erreur inconnue — et aussi le débit limité ou la
 * clé d'idempotence « encore en cours », qui peuvent répondre à une NOUVELLE tentative du SDK alors que la première a
 * été appliquée sans que sa réponse arrive. Une écriture refusée par le délai du verrou de facturation
 * (`EcritureStripeHorsDelai`, seconde relecture du 23/10) n'est jamais partie : refus net aussi.
 */
const REFUS_NETS = new Set(["StripeCardError", "StripeInvalidRequestError", "StripeAuthenticationError", "StripePermissionError"]);
const refusNet = (e: unknown): boolean =>
  e instanceof EcritureStripeHorsDelai || REFUS_NETS.has(String((e as { type?: unknown } | null)?.type ?? ""));

const idDe = (o: string | { id: string } | null | undefined): string | null =>
  typeof o === "string" ? o : (o?.id ?? null);

/** La souscription facture-t-elle encore exactement ce qu'elle facturait (lignes, quantités, métadonnées) ? */
function memeFacturation(a: Stripe.Subscription, b: Stripe.Subscription): boolean {
  const lignes = (s: Stripe.Subscription) =>
    JSON.stringify(
      (s.items?.data ?? [])
        .map((i) => [i.id, idDe(i.price), i.quantity ?? 1])
        .sort((x, y) => String(x[0]).localeCompare(String(y[0])))
    );
  const meta = (s: Stripe.Subscription) => JSON.stringify(Object.entries(s.metadata ?? {}).sort(([x], [y]) => x.localeCompare(y)));
  return lignes(a) === lignes(b) && meta(a) === meta(b);
}

const nonVide = <T extends object>(o: T | null | undefined): o is T => Boolean(o) && Object.keys(o as object).length > 0;

/**
 * Les phases à reposer pour recréer un échéancier À L'IDENTIQUE : la phase en
 * cours et les suivantes, telles qu'elles ont été lues avant la libération
 * (prix, quantités, taux, métadonnées, bornes, fin d'essai à venir). Rend
 * `null` si une phase porte un réglage que cette recopie ne sait pas reposer
 * à l'identique (remise, facture additionnelle, moyen de paiement propre…) :
 * mieux vaut alors le dire et laisser la tâche de nuit reprogrammer que
 * reposer un échéancier différent de celui que le client avait.
 */
export function phasesARestaurer(
  ancien: Stripe.SubscriptionSchedule,
  maintenant: number
): Stripe.SubscriptionScheduleUpdateParams.Phase[] | null {
  const restantes = (ancien.phases ?? []).filter((p) => p.end_date > maintenant);
  if (restantes.length === 0) return null;
  const nonReproductible = (p: Stripe.SubscriptionSchedule.Phase) =>
    (p.add_invoice_items?.length ?? 0) > 0 ||
    (p.discounts?.length ?? 0) > 0 ||
    p.application_fee_percent != null ||
    p.billing_thresholds != null ||
    p.default_payment_method != null ||
    p.description != null ||
    p.invoice_settings != null ||
    p.on_behalf_of != null ||
    p.transfer_data != null ||
    p.automatic_tax?.enabled === true ||
    p.items.some((i) => (i.discounts?.length ?? 0) > 0 || i.billing_thresholds != null || !idDe(i.price));
  if (restantes.some(nonReproductible)) return null;
  return restantes.map((p) => ({
    end_date: p.end_date,
    items: p.items.map((i) => ({
      price: idDe(i.price)!,
      ...(i.quantity !== undefined ? { quantity: i.quantity } : {}),
      ...(i.tax_rates?.length ? { tax_rates: i.tax_rates.map((t) => idDe(t)!) } : {}),
      ...(nonVide(i.metadata) ? { metadata: i.metadata } : {}),
    })),
    ...(nonVide(p.metadata) ? { metadata: p.metadata } : {}),
    ...(typeof p.trial_end === "number" && p.trial_end > maintenant ? { trial_end: p.trial_end } : {}),
    ...(p.trial === true ? { trial: true } : {}),
    ...(p.default_tax_rates?.length ? { default_tax_rates: p.default_tax_rates.map((t) => idDe(t)!) } : {}),
    ...(p.collection_method ? { collection_method: p.collection_method } : {}),
    ...(p.billing_cycle_anchor ? { billing_cycle_anchor: p.billing_cycle_anchor } : {}),
    ...(p.proration_behavior ? { proration_behavior: p.proration_behavior } : {}),
  }));
}

/**
 * Appliquer une HAUSSE confirmée : prorata facturé et prélevé aussitôt
 * (`always_invoice`), et refus net si la carte échoue (`error_if_incomplete`)
 * — la capacité n'est alors pas relevée. Pendant l'essai Stripe, aucun
 * prorata : le premier prélèvement portera la nouvelle formule. Un échéancier
 * en place est libéré avant (sa phase suivante écraserait la hausse).
 *
 * DÉFAUT A02 (audit du 23/10/2026, P1). L'échéancier était libéré AVANT la
 * tentative ; une carte refusée le laissait retiré, et l'écran disait « rien
 * n'a été modifié ». Désormais :
 * - tout ce qui peut échouer sans rien toucher (lecture, lignes, lecture de
 *   l'échéancier) passe AVANT la libération ;
 * - l'échéancier est lu EN ENTIER avant d'être libéré ;
 * - si la hausse échoue, la souscription est relue : inchangée et sans
 *   échéancier, l'échéancier est recréé à l'identique (`from_subscription`,
 *   puis les phases lues) ; impossible à recréer, ou hausse incertaine,
 *   l'échec le dit (`a_reprogrammer`) et l'appelant fait recalculer
 *   l'échéance par la tâche de nuit ;
 * - chaque appel externe est tracé (`etapes`, et une ligne de journal serveur
 *   par étape, au moment où elle a lieu).
 *
 * RELECTURE ADVERSE DU 23/10. Deux onglets confirmaient la même hausse : le
 * second voyait sa libération refusée (échéancier déjà libéré par le premier),
 * puis « restaurait » l'ancien échéancier par-dessus la hausse payée par le
 * premier — et la défaisait. Désormais l'échéancier n'est recréé que si NOTRE
 * libération l'a retiré :
 * - libération refusée net par Stripe : rien n'a été retiré par nous, rien
 *   n'est tenté ni reposé ; plus attaché, l'échéance est `a_reprogrammer` ;
 * - libération sans réponse (elle a peut-être eu lieu) : pas de hausse ; on ne
 *   recrée que si la souscription facture EXACTEMENT ce qu'elle facturait ;
 * - même garde après une mise à jour refusée : une facturation qui a changé
 *   n'est jamais recouverte par l'ancien échéancier ;
 * - sans échéancier, une mise à jour restée sans réponse est vérifiée par une
 *   relecture : `incertaine` si la facturation a changé ou si la relecture
 *   échoue, jamais « non appliquée » sans preuve.
 * Les gestes d'une même organisation qui touchent l'échéancier passent en
 * outre l'un après l'autre (lib/verrou-facturation.ts, côté actions).
 * L'erreur rendue est TOUJOURS une phrase pour le client, en français ; le
 * motif d'origine de Stripe reste dans les étapes et au journal.
 * `maintenant` n'existe que pour les tests.
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
    maintenant?: number;
  }
): Promise<Reussite<{ souscription: Stripe.Subscription; echeancierLibere: boolean; etapes: EtapeHausse[] }> | EchecHausse> {
  const etapes: EtapeHausse[] = [];
  /** Trace l'étape (motif d'origine, pour le journal) et rend la phrase du client. */
  const noter = (etape: EtapeHausse["etape"], ok: boolean, objet?: string | null, e?: unknown): string | undefined => {
    const journal = e === undefined ? undefined : lireErreurStripe(e);
    const ligne: EtapeHausse = { etape, ok, ...(objet ? { objet } : {}), ...(journal ? { erreur: journal.slice(0, 200) } : {}) };
    etapes.push(ligne);
    (ok ? console.info : console.error)("[stripe hausse]", JSON.stringify({ organisation: params.orgId, ...ligne }));
    return e === undefined ? undefined : messageStripePourClient(e);
  };
  const echec = (
    erreur: string,
    hausse: EchecHausse["hausse"],
    echeancier: SortEcheancier,
    liberationRefusee = false
  ): EchecHausse => ({ ok: false, erreur, hausse, echeancier, etapes, ...(liberationRefusee ? { liberationRefusee: true as const } : {}) });
  const relire = async (): Promise<Stripe.Subscription | null> => {
    try {
      const relue = await stripe.subscriptions.retrieve(params.subscription);
      noter("relecture_souscription", true, relue.id);
      return relue;
    } catch (e) {
      if (e instanceof ArretSupervision) throw e;
      noter("relecture_souscription", false, params.subscription, e);
      return null;
    }
  };

  // 1. Ce qui peut échouer sans rien toucher, avant toute libération.
  let s: Stripe.Subscription;
  try {
    s = await stripe.subscriptions.retrieve(params.subscription);
    noter("lecture_souscription", true, s.id);
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    return echec(noter("lecture_souscription", false, params.subscription, e)!, "non_appliquee", "intouche");
  }
  let lignes: LigneStripe[];
  try {
    lignes = await lignesStripe(stripe, params.offre, params.regime);
    noter("preparation_lignes", true);
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    return echec(noter("preparation_lignes", false, null, e)!, "non_appliquee", "intouche");
  }
  // 2. L'échéancier en place, lu en entier avant d'être libéré.
  let ancien: Stripe.SubscriptionSchedule | null = null;
  const idEcheancier = idDe(s.schedule);
  if (idEcheancier) {
    try {
      const lu = await stripe.subscriptionSchedules.retrieve(idEcheancier);
      noter("lecture_echeancier", true, lu.id);
      if (lu.status === "active" || lu.status === "not_started") ancien = lu;
    } catch (e) {
      if (e instanceof ArretSupervision) throw e;
      return echec(noter("lecture_echeancier", false, idEcheancier, e)!, "non_appliquee", "intouche");
    }
  }

  /**
   * 5. Échec avec un échéancier libéré, ou peut-être libéré, par NOUS : relire avant de reposer quoi que ce soit.
   * `siDoute` : ce qu'on peut dire de la hausse quand la relecture ne prouve pas une facturation inchangée.
   */
  const revenirSur = async (
    a: Stripe.SubscriptionSchedule,
    erreur: string,
    siDoute: EchecHausse["hausse"]
  ): Promise<EchecHausse> => {
    const relue = await relire();
    if (!relue) return echec(erreur, siDoute, "a_reprogrammer");
    // La souscription ne facture plus la même chose : la hausse a peut-être eu lieu malgré l'erreur, ou un autre
    // geste est passé. L'ancien échéancier (calculé sur l'ancienne facturation) n'est pas reposé : la tâche de nuit
    // recalculera sur l'état réel.
    if (!memeFacturation(s, relue)) return echec(erreur, siDoute, "a_reprogrammer");
    const attache = idDe(relue.schedule);
    if (attache === a.id) return echec(erreur, "non_appliquee", "intouche"); // libération sans effet
    if (attache) return echec(erreur, "non_appliquee", "a_reprogrammer"); // un autre échéancier a pris la place
    const maintenant = params.maintenant ?? Math.floor(Date.now() / 1000);
    const phases = phasesARestaurer(a, maintenant);
    if (!phases) {
      noter("recreation_echeancier", false, a.id, new Error("Échéancier non reproductible à l'identique."));
      return echec(erreur, "non_appliquee", "a_reprogrammer");
    }
    let neuf: Stripe.SubscriptionSchedule;
    try {
      neuf = await stripe.subscriptionSchedules.create({ from_subscription: params.subscription });
      noter("recreation_echeancier", true, neuf.id);
    } catch (e) {
      if (e instanceof ArretSupervision) throw e;
      noter("recreation_echeancier", false, a.id, e);
      return echec(erreur, "non_appliquee", "a_reprogrammer");
    }
    // Stripe exige que la première phase commence à la phase en cours du nouvel échéancier.
    const debut = neuf.current_phase?.start_date ?? neuf.phases?.[0]?.start_date;
    if (typeof debut !== "number") {
      noter("reprogrammation_echeancier", false, neuf.id, new Error("Phase en cours introuvable sur l'échéancier recréé."));
      return echec(erreur, "non_appliquee", "a_reprogrammer");
    }
    try {
      await stripe.subscriptionSchedules.update(neuf.id, {
        end_behavior: a.end_behavior,
        proration_behavior: "none",
        ...(nonVide(a.metadata) ? { metadata: a.metadata } : {}),
        phases: phases.map((p, i) => (i === 0 ? { start_date: debut, ...p } : p)),
      });
      noter("reprogrammation_echeancier", true, neuf.id);
    } catch (e) {
      if (e instanceof ArretSupervision) throw e;
      noter("reprogrammation_echeancier", false, neuf.id, e);
      return echec(erreur, "non_appliquee", "a_reprogrammer");
    }
    return echec(erreur, "non_appliquee", "restaure");
  };

  // 3. La libération. Seule NOTRE libération autorise, plus loin, à recréer l'échéancier.
  let libere = false;
  if (ancien) {
    try {
      await stripe.subscriptionSchedules.release(ancien.id);
      libere = true;
      noter("liberation_echeancier", true, ancien.id);
    } catch (e) {
      if (e instanceof ArretSupervision) throw e;
      const erreur = noter("liberation_echeancier", false, ancien.id, e)!;
      if (refusNet(e)) {
        // Stripe a refusé : nous n'avons rien retiré, rien n'est tenté ni reposé. Plus attaché (libéré dans un autre
        // onglet, au tableau de bord, ou arrivé à son terme) : ce n'était pas à nous de le reposer ; la tâche de nuit
        // recalcule l'échéance sur l'état réel. Relecture impossible : rien n'a été modifié par nous, et c'est ce qui
        // est dit.
        const relue = await relire();
        const plusAttache = relue !== null && idDe(relue.schedule) !== ancien.id;
        return echec(erreur, "non_appliquee", plusAttache ? "a_reprogrammer" : "intouche", true);
      }
      // Réponse perdue : la libération a peut-être eu lieu. Aucune hausse n'est tentée.
      return revenirSur(ancien, erreur, "non_appliquee");
    }
  }

  // 4. La hausse.
  try {
    const enEssai = s.status === "trialing";
    const maj = await stripe.subscriptions.update(params.subscription, {
      items: elementsDeMiseAJour(s.items.data, lignes),
      proration_behavior: enEssai ? "none" : "always_invoice",
      ...(enEssai ? {} : { proration_date: params.prorationDate, payment_behavior: "error_if_incomplete" as const }),
      metadata: metadonneesOffre(params.orgId, params.offre, params.choix),
    });
    noter("mise_a_jour", true, maj.id);
    return { ok: true, souscription: maj, echeancierLibere: libere, etapes };
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    const erreur = noter("mise_a_jour", false, params.subscription, e)!;
    // Un refus net (carte refusée…) dit que la hausse n'a pas eu lieu ; une réponse perdue laisse un doute.
    const siDoute: EchecHausse["hausse"] = refusNet(e) ? "non_appliquee" : "incertaine";
    if (ancien) return revenirSur(ancien, erreur, siDoute);
    if (siDoute === "non_appliquee") return echec(erreur, "non_appliquee", "intouche");
    // Sans échéancier, rien à reposer ; mais « non appliquée » se vérifie (relecture adverse du 23/10).
    const relue = await relire();
    return echec(erreur, relue && memeFacturation(s, relue) ? "non_appliquee" : "incertaine", "intouche");
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
    if (e instanceof ArretSupervision) throw e;
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
): Promise<Reussite<{ souscription: Stripe.Subscription; echeancierLibere: boolean }> | (Echec & { echeancierLibere: boolean })> {
  let echeancierLibere = false;
  try {
    const s = await stripe.subscriptions.retrieve(params.subscription);
    echeancierLibere = await libererEcheancier(stripe, s);
    const maj = await stripe.subscriptions.update(params.subscription, {
      cancel_at_period_end: params.resilier,
    });
    return { ok: true, souscription: maj, echeancierLibere };
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    // Seconde relecture du 23/10 : un échéancier libéré avant un échec de la mise à jour reste retiré ; l'appelant
    // doit le savoir pour faire reprogrammer l'échéance (il ne le savait que sur le chemin de réussite).
    return { ok: false, erreur: messageStripePourClient(e), echeancierLibere };
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
    if (e instanceof ArretSupervision) throw e;
    return { ok: false, erreur: messageStripePourClient(e) };
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
