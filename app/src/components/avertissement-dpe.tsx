import { phrasesEcartDpe, type EcartDpe } from "@/lib/avertissement-dpe";

/**
 * Décision du 24/11/2026 (Q28) : avertissement affiché quand plusieurs diagnostics de performance énergétique existent
 * pour un logement et que la question « lequel décide ? » se pose. Il ne change aucun calcul (lib/avertissement-dpe.ts).
 * `usage` : ce à quoi la classe sert sur cet écran.
 */
export function AvertissementDpe({ ecart, usage }: { ecart: EcartDpe | null; usage: string }) {
  if (!ecart) return null;
  const phrases = phrasesEcartDpe(ecart);
  return (
    <div role="note" data-avertissement-dpe className="rounded-lg border-l-[3px] border-l-warning bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
      <p className="font-medium">Plusieurs diagnostics de performance énergétique pour ce logement</p>
      <p>{phrases.retenu} {usage}</p>
      <p>{phrases.plusRecent}</p>
      <p>{phrases.suite}</p>
    </div>
  );
}
