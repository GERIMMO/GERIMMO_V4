// Réception signée, conservation durable des références et verrou de traitement.
// Un traitement interrompu reste rejouable ; une livraison concurrente n'est
// jamais déclarée terminée tant que la première n'a pas abouti.
import { corpsAnnonceTropGrand, LIMITE_CORPS_WEBHOOK, lireCorpsBorne } from "@/lib/corps-borne";
import { clientStripe, configurationStripe, lireErreurStripe } from "@/lib/stripe";
import { clientDeService } from "@/lib/supabase/service";
import { executerEvenementStripe } from "@/lib/stripe-file";
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

  // Audit final du 27/10 (COD-14) : le corps est lu en mémoire avant la vérification de signature, donc par n'importe qui.
  // Même borne que la réception Zoho (un mégaoctet) ; Stripe n'envoie que des événements de quelques kilooctets, et il ne
  // rejoue pas un 413 utilement : une livraison plus grosse que la borne n'est pas la sienne.
  if (corpsAnnonceTropGrand(request, LIMITE_CORPS_WEBHOOK)) {
    return Response.json({ erreur: "Corps trop volumineux." }, { status: 413 });
  }
  let brut: string;
  try {
    brut = (await lireCorpsBorne(request.body, LIMITE_CORPS_WEBHOOK)).toString("utf8");
  } catch (e) {
    if ((e as Error).message === "corps_trop_grand") return Response.json({ erreur: "Corps trop volumineux." }, { status: 413 });
    // Corps absent, ou flux coupé en cours de lecture : l'expéditeur réessaie (tout code autre que 2xx).
    return Response.json({ erreur: "Corps absent ou illisible." }, { status: 400 });
  }
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

  try {
    const resultat = await executerEvenementStripe(supabase, stripe, evenement);
    if (resultat.etat === "occupe" || resultat.etat === "attendre") {
      return Response.json({ en_attente: true }, { status: 503 });
    }
    return Response.json(resultat, { status: resultat.etat === "examiner" ? 202 : 200 });
  } catch {
    return Response.json({ erreur: "Le traitement est conservé pour reprise." }, { status: 500 });
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
