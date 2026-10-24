import {
  appliquerPiedDeFacture,
  finDePeriode,
  finProgrammee,
  lireErreurStripe,
  MARQUE_NON_RECONDUCTION_STRIPE,
  quantiteFacturee,
} from "@/lib/stripe";
import { MARQUE_FERMETURE_STRIPE } from "@/lib/comptes-fermeture";
import { envoyerAvisFinEssai } from "@/lib/avis-abonnement";
import {
  envoyerAccuseResiliation,
  envoyerConfirmationSouscription,
  notifierResiliationImpaye,
  premierPrelevement,
} from "@/lib/courriers-contrat-envoi";
import { COMMENTAIRE_RETRACTATION } from "@/lib/retractation-stripe";
import { envoyerRelancesDues } from "@/lib/relances-paiement";
import { GRILLE, lireDetails } from "@/lib/stripe-offres";
import { clientDeService } from "@/lib/supabase/service";
import type Stripe from "stripe";
import { baseDeLOrganisation } from "@/lib/racine-espace-serveur";
import { ArretSupervision } from "@/lib/controle-effets";


/** Une souscription dans l'un de ces états ne facture plus et ne facturera plus. */
const SOUSCRIPTION_TERMINEE = new Set(["canceled", "incomplete_expired"]);

function identifiantClient(s: Stripe.Subscription): string | null {
  return typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null);
}

export async function traiterEvenementStripe(supabase: Service, stripe: Stripe, evenement: Stripe.Event, effetsExternes = true, avantEffet?: () => Promise<void>): Promise<Resultat> {
  if (evenement.type === "invoice.paid") return traiterFacturePayee(supabase, evenement);
  if (evenement.type === "customer.subscription.trial_will_end") {
    return traiterFinEssai(supabase, stripe, evenement, avantEffet);
  }
  return traiterSouscription(supabase, stripe, evenement, effetsExternes);
}

type Service = NonNullable<ReturnType<typeof clientDeService>>;
type Resultat = { motif?: string; reponse: Record<string, unknown> };
type Suivi = {
  organization_id: string;
  organisation: string;
  public_tarif: "agence" | "proprietaire_direct";
  grille: string;
  stripe_subscription_id: string | null;
  stripe_statut: string | null;
  destinataire: string | null;
};

/** Ce que la base sait de ce client Stripe (organisation, souscription suivie). */
async function lireSuivi(supabase: Service, customer: string): Promise<Suivi | null> {
  const { data, error } = await supabase.rpc("abonnement_par_client", { p_customer: customer });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Suivi[])[0] ?? null;
}

function introuvable(e: unknown): boolean {
  return (e as { code?: string }).code === "resource_missing";
}

/**
 * L'état FRAIS de la souscription, relu chez Stripe (audit 29/09, point 2).
 *
 * Stripe ne garantit pas l'ordre des événements, et en rejoue : appliquer la
 * charge de l'événement, c'est pouvoir remettre « active » par-dessus
 * « canceled » parce que le premier est arrivé après le second. L'état relu
 * est le seul qui soit vrai maintenant ; tous les événements d'une même
 * souscription y convergent. Une souscription introuvable (purgée) ne
 * tombe sur la charge que pour un `deleted`, qui est de toute façon terminal.
 */
async function souscriptionFraiche(
  stripe: Stripe,
  evenement: Stripe.Event,
  brute: Stripe.Subscription
): Promise<Stripe.Subscription> {
  try {
    return await stripe.subscriptions.retrieve(brute.id);
  } catch (e) {
    if (evenement.type === "customer.subscription.deleted" && introuvable(e)) return brute;
    throw e;
  }
}

/**
 * Une autre souscription est-elle déjà suivie, et encore vivante chez Stripe ?
 * (audit 29/09, points 1 et 2). La base enregistrée n'est pas crue sur
 * parole : son statut peut être en retard ; on le relit.
 */
async function autreSouscriptionVivante(stripe: Stripe, suivi: Suivi, s: Stripe.Subscription): Promise<string | null> {
  const enregistree = suivi.stripe_subscription_id;
  if (!enregistree || enregistree === s.id) return null;
  try {
    const actuelle = await stripe.subscriptions.retrieve(enregistree);
    return SOUSCRIPTION_TERMINEE.has(actuelle.status) ? null : enregistree;
  } catch (e) {
    if (introuvable(e)) return null;
    throw e;
  }
}

async function traiterSouscription(supabase: Service, stripe: Stripe, evenement: Stripe.Event, effetsExternes: boolean): Promise<Resultat> {
  const brute = evenement.data.object as Stripe.Subscription;
  const customer = identifiantClient(brute);
  if (!customer) throw new Error("Événement de souscription sans client.");
  const s = await souscriptionFraiche(stripe, evenement, brute);

  const suivi = await lireSuivi(supabase, customer);
  if (!suivi) return { motif: "Client Stripe inconnu de Gerimmo", reponse: { organisation: null } };

  // UNE SEULE SOUSCRIPTION SUIVIE PAR ORGANISATION. Une seconde souscription
  // vivante à côté de celle qu'on suit n'écrase rien : c'est un double
  // prélèvement à rembourser, pas un état à recopier. On le crie au journal,
  // on garde l'enregistrée. Une souscription enregistrée TERMINÉE cède la
  // place à la nouvelle (réabonnement après résiliation).
  const vivante = await autreSouscriptionVivante(stripe, suivi, s);
  if (vivante) {
    if (!SOUSCRIPTION_TERMINEE.has(s.status)) {
      console.error(
        `[stripe webhook][double-souscription] organisation ${suivi.organization_id} : la souscription ${s.id} (${s.status}) coexiste avec ${vivante}, suivie et vivante. Rien n'est écrasé ; ${s.id} est à annuler et rembourser à la main.`
      );
    }
    return {
      motif: `Souscription non suivie (${s.id}) : ${vivante} reste celle de l'organisation`,
      reponse: { organisation: suivi.organization_id, ignore: "souscription_non_suivie" },
    };
  }

  // `deleted` : l'état relu dit déjà `canceled` ; on l'impose quand même,
  // sinon un compte résilié resterait ouvert si Stripe tardait.
  const statut = evenement.type === "customer.subscription.deleted" ? "canceled" : s.status;

  // Plan du 23/10 (R04, R07) : ce que la base savait AVANT cet événement — résiliation déjà demandée, défaut de
  // paiement en cours, courriers déjà partis. Les bascules (résiliation notifiée hors de la page, résiliation pour
  // impayé) se lisent par différence avec l'état relu chez Stripe.
  const avant = await lireContexteEvenement(supabase, customer);

  const { data: org, error } = await supabase.rpc("abonnement_appliquer", {
    p_customer: customer,
    p_subscription: s.id,
    p_statut: statut,
    p_quantite: quantiteFacturee(s),
    p_periode_fin: finDePeriode(s),
    // Finitions du 24/10 (I1) : une date d'arrêt (`cancel_at`) est une fin programmée, comme une résiliation à l'échéance.
    p_annulation: finProgrammee(s),
  });
  if (error) throw new Error(error.message);

  // GRILLE DU 28/09/2026 : le détail de l'offre souscrite, tel que Stripe
  // le facture (formule, périodicité, capacité, montant d'une période). Un
  // échec ici rend 500 et Stripe rejoue : `abonnement_appliquer` est
  // idempotente, rien ne se double. Une capacité inférieure au portefeuille
  // est tracée par la base (`abonnement_capacite_insuffisante`) et présentée
  // comme une hausse à confirmer sur « Mon abonnement » — jamais facturée
  // d'office.
  const details = lireDetails(s);
  if (org && details.grille === GRILLE) {
    const { error: erreurDetails } = await supabase.rpc("abonnement_details", {
      p_customer: customer,
      p_periodicite: details.periodicite,
      p_formule: details.formule,
      p_unites: details.unites,
      p_montant_periode_cents: details.montantPeriodeCents,
      p_periode_debut: details.periodeDebut,
    });
    if (erreurDetails) throw new Error(erreurDetails.message);
  }

  // Plan du 23/10 (R01, R03) : la conclusion du contrat (`start_date`), départ du délai de rétractation. Seule la
  // souscription suivie est datée ; une autre conclusion remet à zéro les marques des courriers (base).
  if (org && typeof s.start_date === "number" && !SOUSCRIPTION_TERMINEE.has(s.status)) {
    const { error: erreurDate } = await supabase.rpc("abonnement_souscription_datee", {
      p_customer: customer,
      p_subscription: s.id,
      p_souscrit_le: new Date(s.start_date * 1000).toISOString(),
    });
    if (erreurDate) throw new Error(erreurDate.message);
  }

  // Relecture adverse du 24/10 (I3) : une résiliation levée (page, tableau de bord) efface la marque de son accusé ;
  // la notification suivante de la même échéance sera accusée de nouveau. Une marque en base, pas un effet externe :
  // posée même quand la réception est rejouée sans effets. L'état est celui relu chez Stripe, jamais celui de la charge.
  if (
    org &&
    evenement.type === "customer.subscription.updated" &&
    avant?.stripe_subscription_id === s.id &&
    avant.resiliation_accusee_pour &&
    !finProgrammee(s) &&
    !SOUSCRIPTION_TERMINEE.has(s.status)
  ) {
    const { error: erreurLevee } = await supabase.rpc("abonnement_resiliation_levee", { p_org: org, p_subscription: s.id });
    if (erreurLevee) console.error("[stripe webhook][résiliation levée] marque non effacée :", erreurLevee.message.slice(0, 200));
  }

  // La mention de TVA des factures suit le régime déclaré (audit 29/09,
  // point 6) — posée à la naissance de la souscription, quel que soit le
  // chemin qui l'a créée. Un échec n'empêche pas d'ouvrir le compte : il est
  // journalisé, et la prochaine souscription ou page de paiement la reposera.
  if (effetsExternes && org && evenement.type === "customer.subscription.created") {
    try {
      await appliquerPiedDeFacture(stripe, customer);
    } catch (e) {
      console.error("[stripe webhook][pied-de-facture]", lireErreurStripe(e).slice(0, 200));
    }
  }

  // L'ALERTE PART LE JOUR MÊME. Le client a quinze jours pour régulariser :
  // en perdre un à attendre la tâche de nuit, c'est lui en retirer un.
  //
  // Le courrier ne peut PAS faire échouer le webhook. Un envoi raté rendrait
  // 500, Stripe rejouerait l'événement, et `abonnement_appliquer` serait
  // rejouée pour un défaut déjà posé — sans rien changer, mais en masquant le
  // vrai incident. La tâche de nuit rattrape l'alerte non partie : la base
  // sait encore qu'aucune relance n'est sortie.
  let alerte: unknown = null;
  if (effetsExternes && org && (statut === "past_due" || statut === "unpaid")) {
    try {
      alerte = await envoyerRelancesDues(supabase, { org: org as string });
    } catch (e) {
      alerte = { echecs: [e instanceof Error ? e.message : "envoi impossible"] };
    }
  }

  // Plan du 23/10 : les courriers du contrat (confirmation, accusé de résiliation, résiliation pour impayé). Comme
  // l'alerte, aucun ne peut faire échouer le webhook : la confirmation est rattrapée par la tâche de nuit, l'accusé de
  // résiliation est aussi envoyé par la page, l'échec du courrier d'impayé reste au journal (relance à la main).
  let courriers: Record<string, unknown> = {};
  if (effetsExternes && org) {
    courriers = await courriersDuContrat(supabase, stripe, { evenement, s, suivi, avant, org: org as string });
  }
  return {
    motif: org ? undefined : "Client Stripe inconnu de Gerimmo",
    reponse: { organisation: org ?? null, alerte, ...(Object.keys(courriers).length ? { courriers } : {}) },
  };
}

/** Ce que `abonnement_contexte_evenement` rend : l'état d'avant l'événement. */
type ContexteEvenement = {
  organization_id: string;
  stripe_subscription_id: string | null;
  stripe_statut: string | null;
  annulation_demandee: boolean;
  paiement_en_defaut_depuis: string | null;
  periode_fin: string | null;
  souscrit_le: string | null;
  confirmation_envoyee_le: string | null;
  resiliation_accusee_pour: string | null;
  resiliation_impaye_notifiee_le: string | null;
  /** La page « Résilier votre contrat » vient de notifier cette résiliation : c'est elle qui envoie l'accusé. */
  resiliation_par_la_page?: boolean;
};

async function lireContexteEvenement(supabase: Service, customer: string): Promise<ContexteEvenement | null> {
  // Sans contexte, aucun courrier de bascule ne part (on ne devine pas l'état d'avant) ; l'état, lui, s'applique.
  try {
    const { data, error } = await supabase.rpc("abonnement_contexte_evenement", { p_customer: customer });
    if (error) {
      console.error("[stripe webhook][contexte] lecture impossible :", error.message.slice(0, 200));
      return null;
    }
    return ((data ?? []) as ContexteEvenement[])[0] ?? null;
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    console.error("[stripe webhook][contexte] lecture impossible :", e instanceof Error ? e.message.slice(0, 200) : "erreur");
    return null;
  }
}

async function courriersDuContrat(
  supabase: Service,
  stripe: Stripe,
  c: { evenement: Stripe.Event; s: Stripe.Subscription; suivi: Suivi; avant: ContexteEvenement | null; org: string }
): Promise<Record<string, unknown>> {
  const { evenement, s, suivi, avant, org } = c;
  const resultat: Record<string, unknown> = {};
  const essayer = async (nom: string, geste: () => Promise<{ envoye: boolean; motif?: string }>) => {
    try {
      const r = await geste();
      resultat[nom] = r.envoye ? "envoye" : { motif: r.motif };
    } catch (e) {
      if (e instanceof ArretSupervision) throw e;
      resultat[nom] = { echec: e instanceof Error ? e.message.slice(0, 200) : "envoi impossible" };
    }
  };

  // R03 : la confirmation, à la naissance de la souscription (rattrapée la nuit si elle échoue). Relecture adverse du
  // 24/10 (I5) : une souscription née « incomplete » (authentification forte de la carte) devient active par une MISE
  // À JOUR ; la confirmation part alors à cette bascule, avant le début de l'exécution — pour une souscription du
  // dernier mois jamais confirmée (comme le rattrapage de nuit), jamais pour une ancienne.
  const naissance = evenement.type === "customer.subscription.created";
  const devenueActive =
    evenement.type === "customer.subscription.updated" &&
    !avant?.confirmation_envoyee_le &&
    typeof s.start_date === "number" &&
    s.start_date * 1000 >= Date.now() - 30 * 86_400_000;
  if ((naissance || devenueActive) && ["active", "trialing", "past_due"].includes(s.status)) {
    await essayer("confirmation", () =>
      envoyerConfirmationSouscription(supabase, { orgId: org, subscription: s.id, premierPrelevementLe: premierPrelevement(s) })
    );
  }

  if (!avant || avant.stripe_subscription_id !== s.id) return resultat;

  // R04 : une résiliation notifiée hors de la page (tableau de bord Stripe, ancien portail encore ouvert) reçoit le
  // même accusé, une fois. Relecture adverse du 24/10 (point 10) : rien ne distingue ici une résiliation « à la fin de
  // la période » posée par l'équipe pour impayé d'une résiliation demandée par le client (par courriel, saisie au
  // tableau de bord) ; la procédure de l'impayé est donc l'annulation IMMÉDIATE (affichée dans Finances, à côté du lien
  // vers Stripe), qui passe par la branche R07 ci-dessous. Seulement pour la grille du 28/09 : la grille historique pose d'elle-même une résiliation
  // quand le parc tombe à zéro bien (synchroniserQuantite), ce n'est pas une notification du client. Une résiliation
  // que la page vient de notifier est accusée par la page elle-même, à l'adresse que le client y a choisie.
  const fin = finDePeriode(s);
  // Finitions du 24/10 (relectures transverses I1, I4, M1) : une fin posée par la fermeture d'un compte (marque
  // MARQUE_FERMETURE_STRIPE) n'est ni une résiliation notifiée par le client (pas d'accusé : le compte sera effacé, rien
  // n'est « annulable » depuis l'écran), ni une résiliation pour impayé (pas de courrier, facture laissée telle quelle).
  const fermeture = Boolean(s.metadata?.[MARQUE_FERMETURE_STRIPE]);
  // De même, la non-reconduction faute d'accord (R19) : le client n'a rien notifié (relecture transverse 3, M1).
  const nonReconduction = Boolean(s.metadata?.[MARQUE_NON_RECONDUCTION_STRIPE]);
  if (
    evenement.type === "customer.subscription.updated" &&
    s.cancel_at_period_end &&
    !fermeture &&
    !nonReconduction &&
    !avant.annulation_demandee &&
    !avant.resiliation_par_la_page &&
    !SOUSCRIPTION_TERMINEE.has(s.status) &&
    suivi.grille === GRILLE &&
    fin
  ) {
    await essayer("accuse_resiliation", () =>
      envoyerAccuseResiliation(supabase, {
        orgId: org,
        subscription: s.id,
        periodeFin: new Date(fin),
        notifieeLe: new Date(evenement.created * 1000),
        chemin: "webhook",
      })
    );
  }

  // R07 : la résiliation pour impayé — défaut en cours, aucune résiliation demandée par le client, pas une
  // rétractation. La facture restée ouverte est annulée, puis le courrier part.
  if (
    evenement.type === "customer.subscription.deleted" &&
    avant.paiement_en_defaut_depuis &&
    !fermeture &&
    !avant.annulation_demandee &&
    !avant.resiliation_impaye_notifiee_le &&
    !(s.cancellation_details?.comment ?? "").startsWith(COMMENTAIRE_RETRACTATION)
  ) {
    await essayer("resiliation_impaye", () =>
      notifierResiliationImpaye(supabase, stripe, {
        orgId: org,
        subscription: s.id,
        resilieLe: typeof s.ended_at === "number" ? new Date(s.ended_at * 1000) : new Date(evenement.created * 1000),
        destinataire: suivi.destinataire,
        organisation: suivi.organisation,
        enDefautDepuis: avant.paiement_en_defaut_depuis,
      })
    );
  }
  return resultat;
}

/**
 * Une facture payée (audit 29/09, point 7). Seul un montant NON NUL compte :
 * la facture à 0 € qui ouvre un essai Stripe n'est pas un paiement. Tant
 * qu'aucune ne l'est, un prélèvement refusé gèle le compte sans délai.
 */
async function traiterFacturePayee(supabase: Service, evenement: Stripe.Event): Promise<Resultat> {
  const f = evenement.data.object as Stripe.Invoice;
  const customer = typeof f.customer === "string" ? f.customer : (f.customer?.id ?? null);
  if (!customer) return { motif: "Facture sans client", reponse: { organisation: null } };
  if (!(f.amount_paid > 0)) return { reponse: { ignore: "facture_nulle" } };
  const sub = f.parent?.subscription_details?.subscription ?? null;
  const { data: org, error } = await supabase.rpc("abonnement_facture_payee", {
    p_customer: customer,
    p_subscription: typeof sub === "string" ? sub : (sub?.id ?? null),
  });
  if (error) throw new Error(error.message);
  return {
    motif: org ? undefined : "Client Stripe inconnu de Gerimmo",
    reponse: { organisation: org ?? null },
  };
}

/**
 * Trois jours avant la fin d'un essai Stripe : la date et le montant du
 * premier prélèvement, par courrier. Un échec conserve la réception pour reprise
 * dans la fenêtre d'idempotence, puis examen humain au-delà de cette fenêtre.
 */
async function traiterFinEssai(supabase: Service, stripe: Stripe, evenement: Stripe.Event, avantEffet?: () => Promise<void>): Promise<Resultat> {
  const brute = evenement.data.object as Stripe.Subscription;
  const customer = identifiantClient(brute);
  if (!customer) throw new Error("Événement de souscription sans client.");
  const suivi = await lireSuivi(supabase, customer);
  if (!suivi) return { motif: "Client Stripe inconnu de Gerimmo", reponse: { organisation: null } };
  const s = await souscriptionFraiche(stripe, evenement, brute);
  if (suivi.stripe_subscription_id !== s.id || s.status !== "trialing" || typeof s.trial_end !== "number" || s.trial_end * 1000 <= Date.now()) {
    return { reponse: { organisation: suivi.organization_id, ignore: "essai_non_suivi" } };
  }
  const details = lireDetails(s);
  let echec: string | null;
  try {
    echec = await envoyerAvisFinEssai({
      orgId: suivi.organization_id,
      organisation: suivi.organisation,
      destinataire: suivi.destinataire,
      premierPrelevementLe: new Date(s.trial_end * 1000).toISOString(),
      montantCents: details.montantPeriodeCents || null,
      cle: `fin-essai-${evenement.id}`,
      // Décision D27 : le lien du courrier mène à /espace/<id> chez un propriétaire direct.
      base: await baseDeLOrganisation(supabase, suivi.organization_id),
    }, avantEffet);
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    echec = e instanceof Error ? e.message : "envoi impossible";
  }
  if (echec) throw new Error("L’avis de fin d’essai reste à envoyer.");
  return { reponse: { organisation: suivi.organization_id, avis: echec ? { echec } : "envoye" } };
}
