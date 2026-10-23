import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { ArretSupervision } from "./controle-effets";

export type BilanInventaireStripe = { controles: number; ecarts: number; echecs: number; incomplet: boolean };
/** Inventaire du compte Stripe, y compris les clients absents de Gerimmo.
 * Cinq pages au plus par passage ; le curseur durable reprend la suite au prochain passage.
 * Les lectures Stripe n'ont aucun effet financier. Seules des références minimales sont conservées.
 */
export async function inventorierSouscriptionsStripe(db: SupabaseClient, stripe: Stripe, avant: () => Promise<void>): Promise<BilanInventaireStripe> {
  const bilan: BilanInventaireStripe = { controles: 0, ecarts: 0, echecs: 0, incomplet: true };
  await avant();
  const jeton = randomUUID();
  const prise = await db.rpc("stripe_inventaire_prendre", { p_jeton: jeton });
  if (prise.error) throw new Error("L’inventaire Stripe n’a pas pu démarrer.");
  if (!prise.data) return bilan; // Un autre passage possède le verrou ; ce contrôle n'est pas terminé.
  const etat = prise.data as { curseur: string | null; avant_epoch: number };
  let curseur = etat.curseur;
  let echec: unknown;
  try {
    for (let page = 0; page < 5; page++) {
      await avant();
      const liste = await stripe.subscriptions.list({ status: "all", limit: 100,
        created: { lte: etat.avant_epoch }, ...(curseur ? { starting_after: curseur } : {}),
      }, { timeout: 10_000, maxNetworkRetries: 0 });
      if (!liste.data.length && liste.has_more) throw new Error("Page Stripe incomplète.");
      const lignes = liste.data.map(s => ({ souscription: s.id,
        client: typeof s.customer === "string" ? s.customer : s.customer.id, statut: s.status }));
      await avant();
      const confirmation = await db.rpc("stripe_inventaire_page", {
        p_jeton: jeton, p_curseur: curseur, p_lignes: lignes, p_suite: liste.has_more,
      });
      if (confirmation.error || !confirmation.data) throw new Error("L’inventaire Stripe doit être repris.");
      bilan.controles += lignes.length;
      bilan.ecarts = confirmation.data.ecarts;
      bilan.incomplet = liste.has_more;
      if (!liste.has_more) break;
      const suivant = lignes.at(-1)!.souscription;
      if (suivant === curseur) throw new Error("Curseur Stripe sans progression.");
      curseur = suivant;
    }
  } catch (erreur) {
    bilan.echecs++;
    bilan.incomplet = true;
    echec = erreur;
  } finally {
    try {
      const liberation = await db.rpc("stripe_inventaire_liberer", { p_jeton: jeton, p_erreur: Boolean(echec) });
      if (liberation.error || liberation.data !== true) throw new Error("Réservation non libérée.");
    } catch {
      // Une panne de base pendant la libération ne doit pas masquer un arrêt de supervision.
      // Le bail expire seul ; la page suivante reprendra au dernier curseur confirmé.
      bilan.echecs++;
      bilan.incomplet = true;
    }
  }
  if (echec instanceof ArretSupervision) throw echec;
  return bilan;
}
