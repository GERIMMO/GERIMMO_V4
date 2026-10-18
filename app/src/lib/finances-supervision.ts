import { dateParis, formuleParCode } from "@/lib/tarifs";

export type FinancialAccount = {
  id: string; name: string; type: string; status: string; essai_fin: string | null;
  created_at: string; grille_tarifaire: string; stripe_statut: string | null;
  periodicite: string | null; formule: string | null; montant_periode_cents: number | null;
  periode_fin: string | null; periodicite_suivante: string | null;
  unites_a_couvrir: number; unites_souscrites: number | null;
  annulation_demandee: boolean; paiement_en_defaut_depuis: string | null;
  derniere_synchro: string | null; a_resynchroniser: boolean; synchro_en_erreur: boolean;
  premiere_facture_payee: boolean; avantages_en_attente: number;
};
export type FinancialSnapshot = { total: number; organisations: FinancialAccount[] };
export type FinanceFilter = "tous" | "actifs" | "essais" | "essais_expires" | "essais_proches" | "defaut" | "resiliations" | "sans" | "synchro";
export const FINANCE_FILTERS: { value: FinanceFilter; label: string }[] = [
  { value: "tous", label: "Tous les clients" }, { value: "actifs", label: "Abonnements actifs" },
  { value: "essais", label: "En essai" }, { value: "essais_expires", label: "Essais terminés" }, { value: "essais_proches", label: "Fins d’essai sous 7 j" }, { value: "defaut", label: "Paiements à suivre" },
  { value: "resiliations", label: "Résiliations prévues" }, { value: "sans", label: "Sans souscription en cours" },
  { value: "synchro", label: "Synchronisation à vérifier" },
];
const RUNNING = ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"];
export const inTrial = (a: FinancialAccount) => a.stripe_statut === "trialing" || (!RUNNING.includes(a.stripe_statut ?? "") && a.status === "essai");
export const paymentIssue = (a: FinancialAccount) => ["past_due", "unpaid", "incomplete"].includes(a.stripe_statut ?? "") || Boolean(a.paiement_en_defaut_depuis);
export const scheduledCancellation = (a: FinancialAccount) => a.annulation_demandee && RUNNING.includes(a.stripe_statut ?? "");
export const syncIssue = (a: FinancialAccount) => a.synchro_en_erreur || a.a_resynchroniser;
export const isOwner = (a: FinancialAccount) => a.type === "proprietaire_direct";
export const offerName = (a: FinancialAccount) => a.grille_tarifaire === "historique" ? "Grille historique" : a.formule ? (formuleParCode(a.formule)?.nom ?? a.formule) : isOwner(a) ? "Sans formule" : "Offre agence";
export function subscriptionLabel(a: FinancialAccount): string {
  const states: Record<string, string> = { active: "Abonnement actif", trialing: "Essai avec souscription", past_due: "Paiement en retard", unpaid: "Paiement impayé", incomplete: "Paiement à finaliser", incomplete_expired: "Souscription expirée", canceled: "Abonnement résilié", paused: "Abonnement en pause" };
  return a.stripe_statut ? states[a.stripe_statut] ?? "État à vérifier" : inTrial(a) ? "Essai sans carte" : "Aucune souscription";
}
export function matchesFinanceFilter(a: FinancialAccount, filter: FinanceFilter, today?: string) {
  switch (filter) {
    case "actifs": return a.stripe_statut === "active";
    case "essais": return inTrial(a);
    case "essais_expires": return inTrial(a) && !!today && (daysUntil(a.essai_fin ?? a.periode_fin, today) ?? 1) < 0;
    case "essais_proches": {
      const days = today ? daysUntil(a.essai_fin ?? a.periode_fin, today) : null;
      return inTrial(a) && days !== null && days >= 0 && days <= 7;
    }
    case "defaut": return paymentIssue(a);
    case "resiliations": return scheduledCancellation(a);
    case "sans": return !RUNNING.includes(a.stripe_statut ?? "");
    case "synchro": return syncIssue(a);
    default: return true;
  }
}
/** Date calendaire de Paris : les changements d'heure ne valent pas un jour. */
export function daysUntil(value: string | null, today: string): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.round((Date.parse(`${dateParis(date)}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}
export function monthlyCents(a: FinancialAccount): number | null {
  // Un espace actif ne prouve pas une souscription. Un montant non reçu n'est
  // jamais remplacé par le prix catalogue ; aucun annuel n'est multiplié par 12.
  if (a.montant_periode_cents === null || !Number.isSafeInteger(a.montant_periode_cents) || a.montant_periode_cents < 0) return null;
  if (a.periodicite !== "annuel" && a.periodicite !== "mensuel") return null;
  return a.montant_periode_cents / (a.periodicite === "annuel" ? 12 : 1);
}
export function revenueSummary(accounts: FinancialAccount[]) {
  const active = accounts.filter(a => a.stripe_statut === "active");
  const group = (owner: boolean) => {
    const rows = active.filter(a => isOwner(a) === owner);
    const known = rows.filter(a => monthlyCents(a) !== null && !paymentIssue(a));
    const sum = known.reduce((total, a) => total + monthlyCents(a)!, 0);
    return { monthly: Math.round(sum), annual: Math.round(sum * 12), count: rows.length,
      unknown: rows.length - known.length, cancelling: Math.round(known.filter(scheduledCancellation).reduce((total, a) => total + monthlyCents(a)!, 0)) };
  };
  return { owner: group(true), agency: group(false), active: active.length,
    monthly: active.filter(a => a.periodicite === "mensuel").length,
    annual: active.filter(a => a.periodicite === "annuel").length };
}
export function upcomingEvents(accounts: FinancialAccount[], today: string) {
  return accounts.flatMap(a => {
    const trial = inTrial(a);
    const end = trial ? a.essai_fin ?? a.periode_fin : a.periode_fin;
    if (!trial && !RUNNING.includes(a.stripe_statut ?? "")) return [];
    const days = daysUntil(end, today);
    if (days === null || days < 0 || days > 30) return [];
    return [{ account: a, date: end!, days, label: scheduledCancellation(a) ? "Fin d’abonnement" : trial ? "Fin d’essai" : "Renouvellement" }];
  }).sort((a, b) => a.days - b.days || a.account.name.localeCompare(b.account.name, "fr"));
}
