import type { AvertissementLoyer } from "@/lib/coherence-loyer";

export function AvertissementsLoyer({ avertissements, enregistre = false }: { avertissements: AvertissementLoyer[]; enregistre?: boolean }) {
  if (!avertissements.length) return null;
  return <div role="status" aria-live="polite" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
    <p className="font-medium">{enregistre ? "Enregistré · loyer à vérifier" : "Loyer à vérifier"}</p>
    <ul className="mt-1 list-disc space-y-1 pl-5">{avertissements.map(a => <li key={a.code}>{a.message}</li>)}</ul>
    <p className="mt-2 text-xs">Cet avertissement ne bloque pas l’enregistrement et ne modifie aucun montant.</p>
  </div>;
}
