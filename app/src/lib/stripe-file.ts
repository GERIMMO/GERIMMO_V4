import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { traiterEvenementStripe } from "./stripe-evenements";
import { ArretSupervision } from "./controle-effets";

export const TYPES_STRIPE_SUIVIS = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed", "customer.subscription.trial_will_end", "invoice.paid"] as const;
export type ReferenceStripe = { objet: string; client: string | null };
export function referenceEvenementStripe(e: Stripe.Event): ReferenceStripe {
  const objet = e.data.object as Stripe.Subscription | Stripe.Invoice;
  const client = typeof objet.customer === "string" ? objet.customer : objet.customer?.id ?? null;
  if (!objet.id || !TYPES_STRIPE_SUIVIS.includes(e.type as typeof TYPES_STRIPE_SUIVIS[number])) throw new Error("Référence Stripe invalide.");
  return { objet: objet.id, client };
}

export async function executerEvenementStripe(db: SupabaseClient, stripe: Stripe, evenement: Stripe.Event, effetsExternes = true, avantEffet?: () => Promise<void>) {
  const jeton = randomUUID();
  const prise = await db.rpc("stripe_evenement_prendre", {
    p_event_id: evenement.id, p_type: evenement.type, p_reference: referenceEvenementStripe(evenement), p_jeton: jeton,
  });
  if (prise.error) throw new Error("La réception Stripe n’a pas pu être enregistrée.");
  if (prise.data !== "pris") {
    if (!["traite", "occupe", "attendre", "examiner"].includes(prise.data)) throw new Error("État de réception inconnu.");
    return { etat: prise.data as "traite" | "occupe" | "attendre" | "examiner", ...(prise.data === "traite" ? { deja_traite: evenement.id } : {}) };
  }
  try {
    const metier = new Proxy(db, { get(cible, cle) {
      if (cle === "rpc") return (nom: string, params: Record<string, unknown>) =>
        ["abonnement_appliquer", "abonnement_details", "abonnement_facture_payee"].includes(nom)
          ? cible.rpc("stripe_evenement_appliquer", { p_event_id: evenement.id, p_jeton: jeton, p_action: nom, p_params: params })
          : cible.rpc(nom, params);
      const valeur = Reflect.get(cible, cle); return typeof valeur === "function" ? valeur.bind(cible) : valeur;
    } });
    if (!effetsExternes && evenement.type === "invoice.paid") {
      const facture = await stripe.invoices.retrieve(referenceEvenementStripe(evenement).objet);
      if (facture.status !== "paid") throw new Error("La facture n’est pas confirmée payée.");
      evenement = { ...evenement, data: { object: facture } } as Stripe.Event;
    }
    const resultat = await traiterEvenementStripe(metier, stripe, evenement, effetsExternes, avantEffet);
    const fin = await db.rpc("stripe_evenement_finir", { p_event_id: evenement.id, p_jeton: jeton, p_reussi: true, p_motif: resultat.motif ?? null });
    if (fin.error || fin.data !== true) throw new Error("La fin du traitement doit être vérifiée.");
    return { etat: "traite" as const, traite: evenement.type, ...resultat.reponse };
  } catch (e) {
    // Aucun détail fournisseur (coordonnées possibles) dans la file.
    await db.rpc("stripe_evenement_finir", { p_event_id: evenement.id, p_jeton: jeton, p_reussi: false, p_motif: "Traitement interrompu, reprise nécessaire." });
    throw e;
  }
}

export async function reprendreEvenementsStripe(db: SupabaseClient, stripe: Stripe, avant: () => Promise<void>) {
  const file = await db.from("abonnement_evenements").select("stripe_event_id,type,charge")
    .is("traite_le", null).lte("reprendre_apres", new Date().toISOString()).lt("tentatives", 20)
    .order("reprendre_apres").limit(10);
  if (file.error) throw new Error("La file Stripe est indisponible.");
  const bilan = { repris: 0, echecs: 0, attentes: 0 };
  for (const ligne of file.data ?? []) {
    await avant();
    try {
      // Les références minimales restent utilisables après l'expiration de l'API Events.
      // Pour les anciennes entrées dépourvues de référence, on tente l'événement original.
      let evenement: Stripe.Event;
      const ref = ligne.charge as ReferenceStripe | null;
      if (ref?.objet) {
        const objet = { id: ref.objet, customer: ref.client, status: ligne.type === "customer.subscription.deleted" ? "canceled" : undefined };
        evenement = { id: ligne.stripe_event_id, type: ligne.type, data: { object: objet } } as Stripe.Event;
      } else {
        evenement = await stripe.events.retrieve(ligne.stripe_event_id);
      }
      // Pas de modification de facture ni de relance d’impayé. L’avis de fin
      // d’essai conserve sa clé d’événement pour une reprise idempotente.
      const resultat = await executerEvenementStripe(db, stripe, evenement, false, avant);
      if (resultat.etat === "traite") bilan.repris++; else if (resultat.etat === "examiner") bilan.echecs++; else bilan.attentes++;
    } catch (e) {
      if (e instanceof ArretSupervision) throw e;
      if (!ligne.charge) {
        const report = await db.rpc("stripe_evenement_lecture_differee", { p_event_id: ligne.stripe_event_id, p_definitif: (e as { code?: string }).code === "resource_missing" });
        if (report.error) throw new Error("Le report de la réception Stripe n’a pas pu être enregistré.");
      }
      bilan.echecs++;
    }
  }
  return bilan;
}
