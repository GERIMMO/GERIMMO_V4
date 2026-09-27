import type { Formule, Periodicite, PublicTarif } from "./tarification";

export type EtatAbonnementV2 = {
  version: string; public_tarif: PublicTarif; statut: string; essai_fin: string | null;
  ecriture_ouverte: boolean; volume_actuel: number; volume_facture?: number; volume_reserve?: number; capacite: number | null;
  formule: Formule | null; periodicite: Periodicite | null;
  montant_centimes: number | null; total_centimes: number | null; taxe_centimes: number | null;
  periode_fin: string | null; annulation_demandee: boolean;
  changement_programme: { formule?: Formule; periodicite?: Periodicite; volume?: number; montant_centimes?: number; date_effet?: string } | null;
  stripe_customer_id: string | null; stripe_subscription_id: string | null;
};

export function dateAbonnement(iso: string | null | undefined): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "À confirmer";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(iso));
}

export function statutAbonnementV2(etat: EtatAbonnementV2): string {
  if (!etat.ecriture_ouverte) return "Lecture seule";
  if (etat.annulation_demandee) return "Résiliation programmée";
  if (etat.statut === "past_due" || etat.statut === "unpaid") return "Paiement à régulariser";
  if (etat.essai_fin && etat.ecriture_ouverte && (!etat.stripe_subscription_id || etat.statut === "trialing")) return "Essai gratuit";
  return etat.stripe_subscription_id ? "Abonnement actif" : "À souscrire";
}
