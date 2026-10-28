import type { AvertissementLoyer } from "@/lib/coherence-loyer";

export function AvertissementsLoyer({ avertissements, enregistre = false, objet = "loyer" }: { avertissements: AvertissementLoyer[]; enregistre?: boolean; objet?: "loyer" | "dates" }) {
  if (!avertissements.length) return null;
  const titre = objet === "dates" ? "dates à vérifier" : "loyer à vérifier";
  return <div role="status" aria-live="polite" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
    <p className="font-medium">{enregistre ? `Enregistré · ${titre}` : titre.charAt(0).toUpperCase() + titre.slice(1)}</p>
    <ul className="mt-1 list-disc space-y-1 pl-5">{avertissements.map(a => <li key={a.code}>{a.message}</li>)}</ul>
    <p className="mt-2 text-xs">{objet === "dates" ? "Cet avertissement ne bloque pas l’enregistrement et ne modifie aucune date." : "Cet avertissement ne bloque pas l’enregistrement et ne modifie aucun montant."}</p>
  </div>;
}
