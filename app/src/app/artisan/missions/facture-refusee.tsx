import { formaterDate } from "@/lib/ged";
import type { FactureRefusee } from "../acces";
import { euros } from "../libelles";

/**
 * Audit palier 1 (P1-03). Le client a refusé la facture : l'artisan lit ce qui a été refusé, quand, et ce qu'il doit
 * corriger, puis en dépose une autre (référentiel, module 9, variante V5). La facture refusée n'est ni effacée ni
 * modifiée ; un numéro réservé par une facture établie depuis Gerimmo le reste (reserver_numero_facture_artisan).
 */
export function AvisFactureRefusee({ facture }: { facture: FactureRefusee }) {
  return (
    <div role="note" data-facture-refusee className="rounded-lg border-l-4 border-[var(--warning)] bg-[var(--warning-soft)] px-3.5 py-3 text-sm text-[var(--warning-soft-foreground)]">
      <p>
        <b className="font-semibold">Votre facture n° {facture.numero} ({euros(facture.montant_ttc_cents)} TTC) a été refusée</b> par
        votre client le {formaterDate(facture.refusee_le)}.
      </p>
      <p className="mt-1">Ce qu’il vous demande de corriger : « {facture.refus_motif} »</p>
      <p className="mt-1">
        Déposez une facture corrigée. La facture refusée reste au dossier avec son numéro : si vous établissez la nouvelle
        depuis Gerimmo, donnez-lui un autre numéro.
      </p>
    </div>
  );
}
