import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { finDePeriode, finProgrammee, quantiteFacturee } from "./stripe";
import { GRILLE, lireDetails } from "./stripe-offres";
import { aucuneAutreFactureEnSouffrance } from "./impaye-preuve-stripe";
import { ArretSupervision } from "./controle-effets";
export type SuiviControleStripe = {
  organization_id: string; stripe_customer_id: string; stripe_subscription_id: string | null;
  stripe_statut: string | null; quantite: number; montant_periode_cents: string | number;
  periodicite: string | null; periode_fin: string | null; annulation_demandee: boolean; premiere_facture_payee: boolean;
  paiement_en_defaut_depuis?: string | null;
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

/** Un webhook absent ne peut figurer dans la file de reprise. Seul un impayé identifié
 * peut être régularisé à partir des lectures authentifiées du contrat et de sa facture. */
export async function rapprocherFactureImpayee(
  db: SupabaseClient, stripe: Stripe, dossier: Pick<SuiviControleStripe,"organization_id"|"stripe_customer_id"|"stripe_subscription_id">,
  avant: () => Promise<void>,
): Promise<boolean> {
  const sub=dossier.stripe_subscription_id;
  if (!sub) return false;
  const param={p_org:dossier.organization_id,p_customer:dossier.stripe_customer_id,p_subscription:sub};
  await avant();
  const lecture=await db.rpc("stripe_rapprocher_facture_payee",{...param,p_facture:null,p_version:null,p_montant:null});
  if (lecture.error) throw new Error("L’état de l’impayé est indisponible.");
  if (!lecture.data) return false;
  const contrat=await stripe.subscriptions.retrieve(sub,{expand:["latest_invoice"]});
  const facture=contrat.latest_invoice;
  const id=(v:string|{id:string}|null|undefined)=>typeof v==="string"?v:v?.id;
  if (contrat.id!==sub || id(contrat.customer)!==dossier.stripe_customer_id || contrat.status!=="active"
      || contrat.pause_collection || !facture || typeof facture==="string" || facture.status!=="paid"
      || facture.amount_paid<=0 || facture.amount_remaining!==0 || facture.currency!=="eur"
      || id(facture.customer)!==dossier.stripe_customer_id || id(facture.parent?.subscription_details?.subscription)!==sub) return false;
  // Une échéance plus ancienne encore ouverte ou passée en perte exige une décision humaine.
  if (!await aucuneAutreFactureEnSouffrance(stripe,dossier.stripe_customer_id,sub,avant)) return false;
  await avant();
  const r=await db.rpc("stripe_rapprocher_facture_payee",{...param,p_version:lecture.data,p_facture:facture.id,p_montant:facture.amount_paid});
  if (r.error) throw new Error("Le dossier a changé pendant le rapprochement de la facture.");
  return r.data===dossier.organization_id;
}

/** Lecture Stripe uniquement. Une régularisation certaine est appliquée localement. Les autres écarts restent supervisés. */
export async function rapprocherAbonnementsStripe(db: SupabaseClient, stripe: Stripe, avant: () => Promise<void>) {
  // 21 permet de signaler explicitement le reliquat au-delà des 20 dossiers du passage.
  const selection = await db.rpc("stripe_controles_a_faire", { p_limite: 21 });
  if (selection.error) throw new Error("La sélection des contrôles Stripe est indisponible.");
  const lignes = (selection.data ?? []) as SuiviControleStripe[];
  const bilan = { controles: 0, ecarts: 0, echecs: 0, incomplet: lignes.length > 20 };
  for (const a of lignes.slice(0, 20)) {
    await avant();
    let ecarts: string[];
    try {
      ecarts = await comparerAbonnementStripe(stripe, a);
      if (a.paiement_en_defaut_depuis && ["past_due","unpaid"].includes(a.stripe_statut ?? "") &&
        ecarts.includes("statut") && ecarts.every(e=>e==="statut"||e==="periode") &&
        await rapprocherFactureImpayee(db,stripe,a,avant)) ecarts=ecarts.filter(e=>e!=="statut");
    }
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
