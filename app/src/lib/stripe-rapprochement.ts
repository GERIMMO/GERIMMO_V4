import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { finDePeriode, finProgrammee, quantiteFacturee } from "./stripe";
import { GRILLE, lireDetails } from "./stripe-offres";
import { ArretSupervision } from "./controle-effets";
export type SuiviControleStripe = {
  organization_id: string; stripe_customer_id: string; stripe_subscription_id: string | null;
  stripe_statut: string | null; quantite: number; montant_periode_cents: string | number;
  periodicite: string | null; periode_fin: string | null; annulation_demandee: boolean; premiere_facture_payee: boolean;
};
export async function comparerAbonnementStripe(stripe: Stripe, a: SuiviControleStripe): Promise<string[]> {
  const ecarts = new Set<string>();
  const liste = await stripe.subscriptions.list({ customer: a.stripe_customer_id, status: "all", limit: 100 });
  if (liste.has_more) ecarts.add("lecture_incomplete");
  const vivantes = liste.data.filter(s => !["canceled", "incomplete_expired"].includes(s.status));
  if (vivantes.length > 1) ecarts.add("plusieurs_souscriptions");
  if (vivantes.some(s => s.id !== a.stripe_subscription_id)) ecarts.add("souscription_non_suivie");
  if (!a.stripe_subscription_id) return [...ecarts];
  const s = liste.data.find(s => s.id === a.stripe_subscription_id) ?? await stripe.subscriptions.retrieve(a.stripe_subscription_id);
  if ((typeof s.customer === "string" ? s.customer : s.customer?.id) !== a.stripe_customer_id) return ["client_incoherent"];
  if (s.status !== a.stripe_statut) ecarts.add("statut");
  if (quantiteFacturee(s) !== a.quantite) ecarts.add("quantite");
  const details = lireDetails(s);
  if (details.grille === GRILLE) {
    if (String(details.montantPeriodeCents) !== String(a.montant_periode_cents)) ecarts.add("montant");
    if (details.periodicite !== a.periodicite) ecarts.add("periodicite");
  }
  if ((finDePeriode(s) ? Date.parse(finDePeriode(s)!) : null) !== (a.periode_fin ? Date.parse(a.periode_fin) : null)) ecarts.add("periode");
  // Finitions du 24/10 (I1) : même lecture que le webhook — une date d'arrêt est une fin programmée.
  if (finProgrammee(s) !== a.annulation_demandee) ecarts.add("annulation");
  const factures = await stripe.invoices.list({ customer: a.stripe_customer_id, subscription: a.stripe_subscription_id, status: "paid", limit: 100 });
  if (factures.has_more) ecarts.add("lecture_incomplete");
  if (factures.data.some(f => f.amount_paid > 0) && !a.premiere_facture_payee) ecarts.add("facture_non_reportee");
  return [...ecarts];
}

/** Lecture Stripe uniquement. Les différences sont signalées, jamais facturées ou remboursées automatiquement. */
export async function rapprocherAbonnementsStripe(db: SupabaseClient, stripe: Stripe, avant: () => Promise<void>) {
  // 21 permet de signaler explicitement le reliquat au-delà des 20 dossiers du passage.
  const selection = await db.rpc("stripe_controles_a_faire", { p_limite: 21 });
  if (selection.error) throw new Error("La sélection des contrôles Stripe est indisponible.");
  const lignes = (selection.data ?? []) as SuiviControleStripe[];
  const bilan = { controles: 0, ecarts: 0, echecs: 0, incomplet: lignes.length > 20 };
  for (const a of lignes.slice(0, 20)) {
    await avant();
    let ecarts: string[];
    try { ecarts = await comparerAbonnementStripe(stripe, a); }
    catch (e) {
      if (e instanceof ArretSupervision) throw e;
      ecarts = [(e as { code?: string }).code === "resource_missing" ? "souscription_absente" : "prestataire_indisponible"];
      bilan.echecs++;
    }
    const r = await db.rpc("stripe_controle_enregistrer", { p_org: a.organization_id, p_ecarts: ecarts });
    if (r.error) throw new Error("Le contrôle Stripe n’a pas pu être enregistré.");
    bilan.controles++; if (ecarts.length) bilan.ecarts++;
  }
  return bilan;
}
