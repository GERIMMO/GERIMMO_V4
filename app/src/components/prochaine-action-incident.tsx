import { formaterDateHeure } from "@/lib/ged";
import type { prochaineActionIncident } from "@/lib/prochaine-action-incident";

export function BandeauProchaineAction({ action }: { action: ReturnType<typeof prochaineActionIncident> }) {
  return <p className="rounded-lg border border-[var(--filet)] bg-[var(--ivoire)] px-3 py-2 text-sm">
    <strong>Prochaine action :</strong> {action.titre}
    {action.responsable && <> — <strong>à faire par :</strong> {action.responsable}</>}
    {action.date && <> (<time dateTime={action.date}>{formaterDateHeure(action.date)}</time>)</>}
  </p>;
}
