"use client";
import { retirerEvaluationContestee } from "@/app/actions/retours";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { useActionRetour } from "@/lib/use-action-retour";

const champ = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

/**
 * Audit palier 1 (P1-07) : le retrait motivé d'une évaluation, dans le cadre d'une contestation (RM-11.4.4).
 * Le geste est définitif : la base ne sait pas remettre une évaluation retirée. D'où la case à cocher.
 */
export function RetraitEvaluation({ retourId, evaluationId }: { retourId: string; evaluationId: string }) {
  const { etat, soumettre, enCours } = useActionRetour(retirerEvaluationContestee.bind(null, retourId, evaluationId));
  return <form data-saisie-confirmee onSubmit={soumettre} className="space-y-3">
    <label className="block space-y-1 text-sm">
      <span>Motif du retrait</span>
      <textarea name="motif" className={champ} rows={3} required minLength={10} maxLength={1000} />
    </label>
    <p className="text-xs text-muted-foreground">
      {/* Décision du 24/11/2026 (Q20, reprise M5) : seul l'auteur de la note lit ce motif ; l'artisan ne le lit pas. */}
      Le motif est conservé avec l’évaluation. L’auteur de la note retirée le lit : l’organisation pour sa propre note,
      le locataire pour la sienne. L’artisan ne le voit pas. N’y reprenez pas ce qu’il vous a confié en privé.
    </p>
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="confirmation" required className="mt-1" />
      <span>Je retire cette évaluation. C’est définitif : elle ne comptera plus dans la moyenne de l’artisan.</span>
    </label>
    {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
    {etat.succes && <p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
    <BoutonEnvoi size="sm" variant="destructive" enCours={enCours} enCoursTexte="Retrait en cours…">Retirer l’évaluation</BoutonEnvoi>
  </form>;
}
