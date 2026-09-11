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

import {
  clientStripe,
  configurationStripe,
  finDePeriode,
  lireErreurStripe,
  quantiteFacturee,
} from "@/lib/stripe";
import { clientDeService } from "@/lib/supabase/service";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Les seuls événements qui changent quelque chose chez nous. */
const SUIVIS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

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
    // ce qui cloche : celui qui teste sa signature n'a pas à être aidé.
    return Response.json({ erreur: "Signature refusée." }, { status: 400, headers: { "x-motif": lireErreurStripe(e).slice(0, 120) } });
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
    const s = evenement.data.object as Stripe.Subscription;
    const customer = identifiantClient(s);
    if (!customer) throw new Error("Événement de souscription sans client.");

    // `deleted` arrive avec le statut que la souscription avait avant : on
    // impose `canceled`, sinon un compte résilié resterait ouvert.
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

    await supabase.rpc("abonnement_evenement_solde", {
      p_event_id: evenement.id,
      // Un client inconnu n'est pas un échec à rejouer : c'est un événement qui
      // ne nous concerne pas (un autre produit sur le même compte Stripe, ou
      // une souscription créée à la main). On le classe, avec son motif.
      p_erreur: org ? null : "Client Stripe inconnu de Gerimmo",
    });
    return Response.json({ traite: evenement.type, organisation: org ?? null });
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

// Stripe n'appelle qu'en POST. Une réponse claire vaut mieux qu'un 405 nu pour
// qui teste l'adresse dans son navigateur.
export function GET() {
  return Response.json(
    { message: "Adresse de réception des événements Stripe. Elle n'accepte que POST, signé." },
    { status: 405 }
  );
}
