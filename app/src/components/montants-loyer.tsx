import { eur } from "@/lib/ged";
import type { MontantsLoyer } from "@/lib/loyers-parc-mois";

export function MontantsDuLoyer({ montants, enDecompte = false, compact = false }: {
  montants: MontantsLoyer;
  enDecompte?: boolean;
  compact?: boolean;
}) {
  return <dl aria-label="Montants des échéances" className={`grid w-full min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-sm ${compact ? "" : montants.compense !== 0 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
    <div><dt className="text-xs text-muted-foreground">Attendu</dt><dd className="montant font-semibold">{eur(montants.attendu)}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Reçu</dt><dd className="montant font-semibold">{eur(montants.recu)}</dd></div>
    {montants.compense !== 0 && <div><dt className="text-xs text-muted-foreground">Compensé</dt><dd className="montant font-semibold">{eur(montants.compense)}</dd></div>}
    <div><dt className="text-xs text-muted-foreground">{enDecompte ? "Écart avant décompte" : "Reste dû"}</dt><dd className="montant font-semibold">{eur(montants.resteDu)}</dd></div>
  </dl>;
}
