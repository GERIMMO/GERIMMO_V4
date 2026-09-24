// L'adaptateur Stripe — et rien d'autre que l'adaptateur.
//
// CE QUE CE FICHIER NE DÉCIDE PAS. Ni la quantité à facturer (elle vient de
// `abonnement_quantite_cible`, dans la base qui tient le parc), ni ce qu'un
// statut de paiement fait au compte (c'est `abonnement_appliquer`, écrit en
// clair dans la migration). Ce fichier PARLE à Stripe : il traduit nos gestes
// en appels, et les refus de Stripe en phrases qu'un gérant peut lire.
//
// TOUT EST FACULTATIF, ET RIEN NE MARCHE À MOITIÉ. Tant que les trois
// variables ne sont pas posées, `configurationStripe()` rend le motif exact et
// AUCUN appel n'est tenté. C'est délibéré : un encaissement qui « fonctionne
// presque » facture mal, et facturer mal coûte plus cher que ne pas facturer.
// Le jour où les clés arrivent, rien d'autre n'est à écrire.
//
// LE PRIX VIT CHEZ STRIPE, LE NOMBRE VIT CHEZ NOUS. `STRIPE_PRIX_BIEN` désigne
// un tarif récurrent mensuel « par unité » (5,99 €, décision humain du 05/09) ;
// on ne lui envoie qu'une quantité. Écrire 5,99 des deux côtés, c'est se
// garantir qu'un jour l'un des deux changera seul.

import Stripe from "stripe";

export type Echec = { ok: false; erreur: string };
export type Reussite<T> = { ok: true } & T;

/** Les deux publics du produit, et leur barème. */
export type PublicTarif = "agence" | "proprietaire_direct";

export type ConfigStripe = {
  cle: string;
  secretWebhook: string;
  /** Un tarif par public : ils n'ont ni la même unité ni le même barème. */
  prix: Partial<Record<PublicTarif, string>>;
};

export type Manque = { pret: false; motif: string };
export type Prete = { pret: true; config: ConfigStripe };

/** La variable d'environnement qui porte le tarif de ce public. */
export function variablePrix(pour: PublicTarif): string {
  return pour === "agence" ? "STRIPE_PRIX_LOT_AGENCE" : "STRIPE_PRIX_BIEN";
}

/**
 * Les réglages, ou la raison précise de leur absence.
 *
 * Le motif est écrit pour être AFFICHÉ (au super admin) et JOURNALISÉ : « la
 * facturation n'est pas configurée » n'aide personne à la configurer.
 *
 * LES TARIFS NE SONT PAS EXIGÉS ICI, et c'est délibéré. La clé et la signature
 * commandent TOUT — sans elles rien ne fonctionne, pour personne. Les tarifs,
 * eux, sont propres à un public : celui du propriétaire direct peut exister
 * quand celui de l'agence n'a pas encore été créé chez Stripe. Refuser
 * l'ensemble ferait attendre un public à cause de l'autre. Le tarif manquant se
 * signale au moment où quelqu'un veut souscrire, en nommant SA variable.
 */
export function configurationStripe(): Prete | Manque {
  const cle = process.env.STRIPE_SECRET_KEY?.trim();
  const secretWebhook = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const manquantes = [
    !cle && "STRIPE_SECRET_KEY",
    !secretWebhook && "STRIPE_WEBHOOK_SECRET",
  ].filter(Boolean) as string[];
  if (manquantes.length > 0) {
    return {
      pret: false,
      motif: `Paiement en ligne non configuré : ${manquantes.join(", ")} ${
        manquantes.length > 1 ? "sont absentes" : "est absente"
      } de l'environnement.`,
    };
  }
  return {
    pret: true,
    config: {
      cle: cle!,
      secretWebhook: secretWebhook!,
      prix: {
        proprietaire_direct: process.env.STRIPE_PRIX_BIEN?.trim() || undefined,
        agence: process.env.STRIPE_PRIX_LOT_AGENCE?.trim() || undefined,
      },
    },
  };
}

/** Le tarif de ce public, ou la variable qu'il faut poser. */
export function prixPour(
  config: ConfigStripe,
  pour: PublicTarif
): { ok: true; prix: string } | Echec {
  const prix = config.prix[pour];
  if (prix) return { ok: true, prix };
  return {
    ok: false,
    erreur: `Le tarif ${
      pour === "agence" ? "agence" : "propriétaire"
    } n'est pas encore configuré (${variablePrix(pour)}). Écrivez-nous : nous l'ouvrons et prolongeons votre accès en attendant.`,
  };
}

let cache: { cle: string; client: Stripe } | null = null;

export function clientStripe(config: ConfigStripe): Stripe {
  // Un client par clé, gardé entre les requêtes : la construction ouvre un
  // agent HTTP, et en refaire un à chaque appel gaspille une poignée de main
  // TLS par paiement.
  if (cache?.cle === config.cle) return cache.client;
  const client = new Stripe(config.cle, { maxNetworkRetries: 2 });
  cache = { cle: config.cle, client };
  return client;
}

/**
 * Traduire un refus de Stripe.
 *
 * Le message brut est en anglais, technique, et parle de ressources (« No such
 * price »). Celui qui le lit est un gérant qui vient de cliquer « S'abonner ».
 * Les cas non reconnus gardent le message d'origine : inventer une phrase
 * rassurante sur une erreur qu'on ne comprend pas, c'est empêcher de la
 * comprendre.
 */
export function lireErreurStripe(e: unknown): string {
  if (!(e instanceof Error)) return "Le service de paiement n'a pas répondu.";
  const brut = e.message;
  const type = (e as Stripe.errors.StripeError).type;
  if (type === "StripeConnectionError" || type === "StripeAPIError") {
    return "Le service de paiement est momentanément injoignable. Rien n'a été prélevé — réessayez dans un instant.";
  }
  if (type === "StripeAuthenticationError") {
    return "La clé Stripe est refusée. Vérifiez STRIPE_SECRET_KEY (une clé de test ne fonctionne pas en production, et inversement).";
  }
  if (type === "StripeRateLimitError") {
    return "Trop de demandes au service de paiement en même temps. Réessayez dans un instant.";
  }
  if (/no such price/i.test(brut)) {
    return "Le tarif configuré n'existe pas chez Stripe. Vérifiez STRIPE_PRIX_BIEN ou STRIPE_PRIX_LOT_AGENCE — un tarif de test n'existe pas dans le mode réel.";
  }
  if (/no such customer/i.test(brut)) {
    return "Le client Stripe enregistré pour cette organisation n'existe plus chez Stripe. Contactez Gerimmo : la souscription doit être recréée.";
  }
  if (/similar object exists in (test|live) mode/i.test(brut)) {
    return "Les clés Stripe et les données ne sont pas dans le même mode (test / réel). Vérifiez que les trois variables viennent du même environnement Stripe.";
  }
  return brut;
}

/** La fin de la période en cours, où qu'elle se trouve selon la version d'API. */
export function finDePeriode(s: Stripe.Subscription): string | null {
  const surLigne = s.items?.data?.[0]?.current_period_end;
  const surAbonnement = (s as unknown as { current_period_end?: number }).current_period_end;
  const secondes = surLigne ?? surAbonnement;
  return typeof secondes === "number" ? new Date(secondes * 1000).toISOString() : null;
}

/** La quantité réellement facturée chez Stripe pour cette souscription. */
export function quantiteFacturee(s: Stripe.Subscription): number {
  return s.items?.data?.[0]?.quantity ?? 0;
}

/**
 * Retrouver ou créer le client Stripe d'une organisation.
 *
 * `idempotencyKey` sur l'organisation : deux clics sur « S'abonner » ne créent
 * pas deux clients. Sans elle, le second clic fabrique un doublon qui portera
 * sa propre facture et son propre moyen de paiement.
 */
export async function assurerClientStripe(
  stripe: Stripe,
  params: { orgId: string; nom: string; email: string | null; existant: string | null }
): Promise<Reussite<{ customer: string }> | Echec> {
  try {
    if (params.existant) {
      const trouve = await stripe.customers.retrieve(params.existant);
      if (!trouve.deleted) return { ok: true, customer: trouve.id };
      // Client supprimé chez Stripe : on en refait un plutôt que d'échouer.
      // Le cas est rare et vient toujours d'un geste manuel côté Stripe.
    }
    const cree = await stripe.customers.create(
      {
        name: params.nom,
        email: params.email ?? undefined,
        metadata: { organization_id: params.orgId },
      },
      { idempotencyKey: `client:${params.orgId}` }
    );
    return { ok: true, customer: cree.id };
  } catch (e) {
    return { ok: false, erreur: lireErreurStripe(e) };
  }
}

/** Stripe Checkout refuse un `trial_end` à moins de 48 h de la demande. */
export const DELAI_MINIMAL_ESSAI_STRIPE_S = 48 * 3600;

/**
 * La fin d'essai à passer à Stripe — ou rien.
 *
 * SOUSCRIRE PENDANT L'ESSAI NE FAIT PAS PAYER PLUS TÔT (décision du 24/09). La
 * page de paiement enregistre la carte, et le premier prélèvement part à la
 * fin de l'essai que la base connaît, pas avant. C'est une promesse que
 * l'écran fait ; elle se calcule donc ICI, une fois, et l'écran appelle la
 * même fonction pour savoir s'il a le droit de la faire.
 *
 * Deux règles, lisibles dans le résultat :
 * - `essai_fin` est une DATE (« AAAA-MM-JJ », colonne `date`) : l'essai court
 *   jusqu'à ce jour INCLUS — c'est ainsi que la base compte les jours
 *   restants. La fin envoyée est donc minuit (UTC) du lendemain ; débiter au
 *   matin du dernier jour, ce serait raccourcir l'essai d'un jour. Un instant
 *   complet, avec heure, est pris tel quel.
 * - Stripe Checkout refuse un `trial_end` à moins de 48 h. En deçà — ou
 *   l'essai passé — on ne pose rien : la carte est débitée à la validation,
 *   et l'écran le dit tel quel. Mieux vaut un prélèvement immédiat annoncé
 *   qu'une page de paiement qui ne s'ouvre pas.
 *
 * En secondes Unix, l'unité de Stripe. `maintenantMs` n'existe que pour les
 * tests : une règle qui dépend de l'heure se vérifie à heure fixe.
 */
export function finEssaiPourStripe(
  essaiFin: string | null | undefined,
  maintenantMs: number = Date.now()
): number | undefined {
  if (!essaiFin) return undefined;
  const debutMs = new Date(essaiFin).getTime();
  if (Number.isNaN(debutMs)) return undefined;
  const fin = Math.floor(debutMs / 1000) + (essaiFin.length === 10 ? 86_400 : 0);
  const plancher = Math.floor(maintenantMs / 1000) + DELAI_MINIMAL_ESSAI_STRIPE_S;
  return fin > plancher ? fin : undefined;
}

/**
 * La page de paiement hébergée par Stripe.
 *
 * Hébergée, et c'est un choix : le formulaire de carte ne touche jamais nos
 * serveurs. Rien à stocker, rien à sécuriser, rien à mettre en conformité.
 *
 * `essaiFin` (24/09) : la fin d'essai de l'organisation, quand elle est encore
 * en essai. Passée à Stripe en `trial_end`, elle fait naître la souscription
 * en `trialing` — que la base tient déjà pour payée (migrations
 * 20260911300000 et 20260912090000) — et retient le premier prélèvement
 * jusqu'à cette date.
 */
export async function creerSessionPaiement(
  stripe: Stripe,
  params: {
    prix: string;
    customer: string;
    quantite: number;
    orgId: string;
    retourOk: string;
    retourAnnule: string;
    /** Fin de l'essai en cours (« AAAA-MM-JJ » ou instant complet), sinon rien. */
    essaiFin?: string | null;
  }
): Promise<Reussite<{ url: string }> | Echec> {
  if (params.quantite < 1) {
    return {
      ok: false,
      erreur: "Il n'y a rien à payer pour l'instant.",
    };
  }
  // Posée seulement quand Stripe l'acceptera (voir `finEssaiPourStripe`) ;
  // sinon la clé n'apparaît pas du tout dans ce qu'on envoie.
  const trialEnd = finEssaiPourStripe(params.essaiFin);
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: params.customer,
      line_items: [{ price: params.prix, quantity: params.quantite }],
      success_url: params.retourOk,
      cancel_url: params.retourAnnule,
      // Sans cela, une agence ne peut pas récupérer sa TVA ni justifier la
      // dépense : l'adresse de facturation est obligatoire sur une facture.
      billing_address_collection: "required",
      subscription_data: {
        metadata: { organization_id: params.orgId },
        ...(trialEnd ? { trial_end: trialEnd } : {}),
      },
      client_reference_id: params.orgId,
    });
    if (!session.url) {
      return { ok: false, erreur: "Stripe n'a pas rendu d'adresse de paiement." };
    }
    return { ok: true, url: session.url };
  } catch (e) {
    return { ok: false, erreur: lireErreurStripe(e) };
  }
}

/**
 * L'espace de facturation hébergé par Stripe.
 *
 * Il porte la carte, les factures, le changement d'adresse et la résiliation.
 * Les réécrire ici prendrait des semaines pour un résultat moins fiable — et
 * une résiliation qu'on code soi-même est une résiliation qu'on peut rater.
 */
export async function ouvrirPortailFacturation(
  stripe: Stripe,
  params: { customer: string; retour: string }
): Promise<Reussite<{ url: string }> | Echec> {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: params.customer,
      return_url: params.retour,
    });
    return { ok: true, url: session.url };
  } catch (e) {
    const erreur = lireErreurStripe(e);
    if (/no configuration provided|default configuration has not been created/i.test(erreur)) {
      return {
        ok: false,
        erreur:
          "L'espace de facturation Stripe n'est pas encore activé. À faire une fois, dans Stripe : Paramètres → Portail client → Activer.",
      };
    }
    return { ok: false, erreur };
  }
}

/**
 * Aligner la quantité facturée sur le parc réel.
 *
 * `proration_behavior: 'create_prorations'` : un bien ajouté le 12 est facturé
 * au prorata des jours restants, pas un mois plein. C'est ce que le client
 * attend, et c'est ce que dit la page — « un bien retiré n'est plus compté le
 * mois suivant ».
 *
 * QUANTITÉ NULLE = RÉSILIATION EN FIN DE PÉRIODE, pas une ligne à zéro. Une
 * agence retombée à un seul bien ne doit plus rien : on ne lui laisse pas une
 * souscription active à 0 € qui réapparaîtra sur son relevé bancaire. Le mois
 * déjà payé court jusqu'à son terme.
 */
export async function synchroniserQuantite(
  stripe: Stripe,
  params: { subscription: string; quantite: number }
): Promise<Reussite<{ quantite: number; resiliee: boolean }> | Echec> {
  try {
    const s = await stripe.subscriptions.retrieve(params.subscription);
    const ligne = s.items.data[0];
    if (!ligne) return { ok: false, erreur: "Souscription Stripe sans ligne de facturation." };

    if (params.quantite < 1) {
      if (s.cancel_at_period_end) return { ok: true, quantite: 0, resiliee: true };
      await stripe.subscriptions.update(params.subscription, { cancel_at_period_end: true });
      return { ok: true, quantite: 0, resiliee: true };
    }

    // Le parc est remonté après une résiliation programmée : on la lève, plutôt
    // que de laisser mourir une souscription que le client vient de rejustifier.
    if (s.cancel_at_period_end) {
      await stripe.subscriptions.update(params.subscription, { cancel_at_period_end: false });
    }
    if (ligne.quantity === params.quantite) {
      return { ok: true, quantite: params.quantite, resiliee: false };
    }
    await stripe.subscriptions.update(params.subscription, {
      items: [{ id: ligne.id, quantity: params.quantite }],
      proration_behavior: "create_prorations",
    });
    return { ok: true, quantite: params.quantite, resiliee: false };
  } catch (e) {
    return { ok: false, erreur: lireErreurStripe(e) };
  }
}

/**
 * Porter un avoir au solde du client — l'avantage du parrainage, côté argent.
 *
 * `createBalanceTransaction` avec un montant NÉGATIF crédite le client :
 * Stripe déduit ce solde des prochaines factures, tout seul, sans toucher à la
 * souscription ni à sa quantité. C'est exactement ce qu'on veut d'« un mois
 * offert » — pas une remise permanente, pas une ligne à zéro, une fois.
 *
 * L'IDEMPOTENCE N'EST PAS DÉCORATIVE ICI. La tâche planifiée peut expirer
 * APRÈS que Stripe a enregistré l'avoir mais AVANT que la base le sache : la
 * ligne resterait « à appliquer » et repasserait le lendemain. Avec la clé
 * d'idempotence — l'identifiant de l'avantage, qui ne bouge pas — Stripe rend
 * la même transaction au lieu d'en créer une seconde. Sans elle, on offrirait
 * deux mois pour un seul filleul, silencieusement.
 */
export async function crediterClientStripe(
  stripe: Stripe,
  params: { customer: string; montantCents: number; avantageId: string; libelle: string }
): Promise<Reussite<{ reference: string }> | Echec> {
  if (!params.customer) return { ok: false, erreur: "Client Stripe inconnu pour cette organisation." };
  if (!Number.isSafeInteger(params.montantCents) || params.montantCents <= 0) {
    return { ok: false, erreur: "Montant d'avoir invalide." };
  }
  try {
    const transaction = await stripe.customers.createBalanceTransaction(
      params.customer,
      {
        amount: -params.montantCents,
        currency: "eur",
        description: params.libelle.slice(0, 350),
      },
      { idempotencyKey: `avantage-parrainage-${params.avantageId}` }
    );
    return { ok: true, reference: transaction.id };
  } catch (e) {
    return { ok: false, erreur: lireErreurStripe(e) };
  }
}
