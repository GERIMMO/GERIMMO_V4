import { createClient } from "@/lib/supabase/server";
import { aujourdhuiParis } from "@/lib/ged";
import { PlanApurementFormulaires, type PlanApurementLu } from "./plan-apurement-formulaires";

// Plan d'apurement du bail (02/11/2026) : lecture serveur, gestes dans le composant client.
export async function PlanApurementBail({ orgId, bailId, base }: { orgId: string; bailId: string; base: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("plan_apurement_bail", { p_org: orgId, p_bail: bailId });
  if (error) return <p role="status" className="text-sm text-muted-foreground">Le plan d’apurement n’a pas pu être chargé.</p>;
  const plan = ((data ?? []) as PlanApurementLu[])[0] ?? null;
  // Sans plan vivant, la dette échue se lit sur les termes : c'est elle que la proposition va geler.
  let detteEchue = plan?.dette_restante != null ? Number(plan.dette_restante) : 0;
  if (plan?.dette_restante == null) {
    const { data: termes } = await supabase.rpc("etat_loyers_bail", { p_bail: bailId });
    const aujourdhui = aujourdhuiParis();
    for (const t of (termes ?? []) as { date_echeance: string; montant_du: number | string; montant_couvert: number | string }[]) {
      if (String(t.date_echeance).slice(0, 10) < aujourdhui) detteEchue += Math.max(0, Number(t.montant_du) - Number(t.montant_couvert));
    }
    detteEchue = Math.round(detteEchue * 100) / 100;
  }
  return <PlanApurementFormulaires orgId={orgId} bailId={bailId} base={base} plan={plan} detteEchue={detteEchue} aujourdhui={aujourdhuiParis()} />;
}
