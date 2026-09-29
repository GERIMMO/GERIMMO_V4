// Ce que Stripe nous dit du paiement — et la seule porte par laquelle il le dit.
//
// LA SIGNATURE EST LA SEULE CHOSE QUI DISTINGUE STRIPE DE N'IMPORTE QUI.
// Cette adresse est publique : elle doit l'être, Stripe l'appelle depuis ses
// serveurs sans se connecter. Sans vérification de signature, le premier venu
// y poste « abonnement actif » et s'ouvre le produit gratuitement. La
// vérification se fait sur le corps BRUT : reparser le JSON puis le
// re-sérialiser change un espace, et la signature ne correspond plus.
//
// ON ENREGISTRE AVANT DE TRAITER. Stripe réessaie pendant trois jours et peut
// livrer deux fois en même temps. L'identifiant de l'événement est une clé
// primaire : la seconde livraison se reconnaît et ne refait rien. Mais si le
// traitement ÉCHOUE, on efface la trace — sinon la relance passerait pour un
// doublon et l'événement serait perdu, compte fermé alors que le client a payé.
//
// 200 OU 500, ET LE CHOIX N'EST PAS ANODIN. 200 dit à Stripe « c'est réglé,
// n'y reviens pas ». On ne le rend que si c'est vrai. Un événement qu'on ne
// sait pas traiter est un 200 (Stripe en envoie des dizaines de types dont
// aucun ne nous concerne) ; un traitement qui échoue est un 500, pour que
// Stripe revienne.

//
// L'ÉTAT APPLIQUÉ EST CELUI DE STRIPE MAINTENANT, pas celui de l'événement
// (audit 29/09) : la souscription est relue avant d'être recopiée, et une
// souscription qui n'est pas celle que l'organisation suit n'écrase rien.

import {
  appliquerPiedDeFacture,
  clientStripe,
  configurationStripe,
  finDePeriode,
  lireErreurStripe,
  quantiteFacturee,
} from "@/lib/stripe";
import { envoyerAvisFinEssai } from "@/lib/avis-abonnement";
import { envoyerRelancesDues } from "@/lib/relances-paiement";
import { GRILLE, lireDetails } from "@/lib/stripe-offres";
import { clientDeService } from "@/lib/supabase/service";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Les seuls événements qui changent quelque chose chez nous. À abonner dans
 * le tableau de bord Stripe (point de terminaison du webhook) : les
 * événements de souscription, `customer.subscription.trial_will_end` et
 * `invoice.paid` (audit 29/09).
 */
const SUIVIS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.trial_will_end",
  "invoice.paid",
]);

/** Une souscription dans l'un de ces états ne facture plus et ne facturera plus. */
const SOUSCRIPTION_TERMINEE = new Set(["canceled", "incomplete_expired"]);

function identifiantClient(s: Stripe.Subscription): string | null {
  return typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null);
}

export async function POST(request: Request) {
  const reglages = configurationStripe();
  if (!reglages.pret) {
    // 503 et non 200 : si quelqu'un a branché le webhook sans poser les clés,
    // il doit le voir dans le tableau de bord Stripe, pas le découvrir au
    // premier client qui paie sans que son compte s'ouvre.
    return Response.json({ erreur: reglages.motif }, { status: 503 });
  }
  const supabase = clientDeService();
  if (!supabase) {
    return Response.json(
      { erreur: "SUPABASE_SERVICE_ROLE_KEY absente : le webhook ne peut rien enregistrer." },
      { status: 503 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ erreur: "Signature absente." }, { status: 400 });
  }

  const brut = await request.text();
  const stripe = clientStripe(reglages.config);
  let evenement: Stripe.Event;
  try {
    evenement = await stripe.webhooks.constructEventAsync(
      brut,
      signature,
      reglages.config.secretWebhook
    );
  } catch (e) {
    // 400 : Stripe ne réessaie pas une signature invalide, et c'est correct —
    // elle ne deviendra pas valide. Le message reste volontairement muet sur
    // ce qui cloche : celui qui teste sa signature n'a pas à être aidé. Le
    // motif va au journal serveur, plus dans un en-tête de réponse (audit
    // 25/09, S7 : l'en-tête x-motif contredisait cette ligne).
    console.error("[stripe webhook] signature refusée:", lireErreurStripe(e).slice(0, 200));
    return Response.json({ erreur: "Signature refusée." }, { status: 400 });
  }

  if (!SUIVIS.has(evenement.type)) {
    return Response.json({ ignore: evenement.type });
  }

  const { data: nouveau, error: erreurJournal } = await supabase.rpc(
    "abonnement_evenement_a_traiter",
    { p_event_id: evenement.id, p_type: evenement.type, p_charge: null }
  );
  if (erreurJournal) {
    return Response.json({ erreur: erreurJournal.message }, { status: 500 });
  }
  if (nouveau === false) {
    return Response.json({ deja_traite: evenement.id });
  }

  try {
    const resultat =
      evenement.type === "invoice.paid"
        ? await traiterFacturePayee(supabase, evenement)
        : evenement.type === "customer.subscription.trial_will_end"
          ? await traiterFinEssai(supabase, stripe, evenement)
          : await traiterSouscription(supabase, stripe, evenement);

    await supabase.rpc("abonnement_evenement_solde", {
      p_event_id: evenement.id,
      // Un client inconnu n'est pas un échec à rejouer : c'est un événement qui
      // ne nous concerne pas (un autre produit sur le même compte Stripe, ou
      // une souscription créée à la main). On le classe, avec son motif. De
      // même pour une souscription que l'on ne suit pas (doublon, ancienne).
      p_erreur: resultat.motif ?? null,
    });
    return Response.json({ traite: evenement.type, ...resultat.reponse });
  } catch (e) {
    // La trace s'efface : la relance de Stripe doit repartir d'une page
    // blanche, faute de quoi elle passerait pour un doublon.
    await supabase.rpc("abonnement_evenement_rejouable", { p_event_id: evenement.id });
    return Response.json(
      { erreur: e instanceof Error ? e.message : "Traitement impossible." },
      { status: 500 }
    );
  }
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

async function traiterSouscription(supabase: Service, stripe: Stripe, evenement: Stripe.Event): Promise<Resultat> {
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

  const { data: org, error } = await supabase.rpc("abonnement_appliquer", {
    p_customer: customer,
    p_subscription: s.id,
    p_statut: statut,
    p_quantite: quantiteFacturee(s),
    p_periode_fin: finDePeriode(s),
    p_annulation: s.cancel_at_period_end ?? false,
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

  // La mention de TVA des factures suit le régime déclaré (audit 29/09,
  // point 6) — posée à la naissance de la souscription, quel que soit le
  // chemin qui l'a créée. Un échec n'empêche pas d'ouvrir le compte : il est
  // journalisé, et la prochaine souscription ou page de paiement la reposera.
  if (org && evenement.type === "customer.subscription.created") {
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
  if (org && (statut === "past_due" || statut === "unpaid")) {
    try {
      alerte = await envoyerRelancesDues(supabase, { org: org as string });
    } catch (e) {
      alerte = { echecs: [e instanceof Error ? e.message : "envoi impossible"] };
    }
  }
  return {
    motif: org ? undefined : "Client Stripe inconnu de Gerimmo",
    reponse: { organisation: org ?? null, alerte },
  };
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
 * premier prélèvement, par courrier. L'envoi ne fait pas échouer le webhook
 * (il n'y a rien à rejouer d'un avis) ; son échec est rendu et journalisé.
 */
async function traiterFinEssai(supabase: Service, stripe: Stripe, evenement: Stripe.Event): Promise<Resultat> {
  const brute = evenement.data.object as Stripe.Subscription;
  const customer = identifiantClient(brute);
  if (!customer) throw new Error("Événement de souscription sans client.");
  const suivi = await lireSuivi(supabase, customer);
  if (!suivi) return { motif: "Client Stripe inconnu de Gerimmo", reponse: { organisation: null } };
  const s = await souscriptionFraiche(stripe, evenement, brute);
  if (suivi.stripe_subscription_id !== s.id || s.status !== "trialing" || typeof s.trial_end !== "number") {
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
    });
  } catch (e) {
    echec = e instanceof Error ? e.message : "envoi impossible";
  }
  if (echec) console.error(`[stripe webhook][fin-essai] ${suivi.organization_id} : ${echec.slice(0, 200)}`);
  return { reponse: { organisation: suivi.organization_id, avis: echec ? { echec } : "envoye" } };
}

// Stripe n'appelle qu'en POST. Une réponse claire vaut mieux qu'un 405 nu pour
// qui teste l'adresse dans son navigateur.
export function GET() {
  return Response.json(
    { message: "Adresse de réception des événements Stripe. Elle n'accepte que POST, signé." },
    { status: 405 }
  );
}
