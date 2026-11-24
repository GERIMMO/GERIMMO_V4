import Link from "next/link";
import { ArrowRight, BookOpen, ChartColumn } from "lucide-react";

/**
 * Décision du dirigeant du 24/11/2026 (Q18) : le menu reste court ; les écrans Statistiques et Journal, qui n'avaient
 * pas de lien chez le propriétaire, s'ouvrent depuis le tableau de bord.
 *
 * Aucun droit n'est ouvert : les deux pages gardent leur contrôle (`verifierAccesEspace`), le même que celui du tableau
 * de bord. Toute personne qui voit ces liens pouvait donc déjà ouvrir ces deux pages par leur adresse.
 */
export function LiensTableauDeBord({ base }: { base: string }) {
  const lien = "flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm hover:underline hover:underline-offset-4";
  return (
    <nav aria-label="Statistiques et journal" data-liens-tableau-de-bord className="grid gap-3 sm:grid-cols-2">
      <Link href={`${base}/statistiques`} className={lien}>
        <ChartColumn size={20} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 flex-1"><b className="block font-semibold">Statistiques</b><small className="text-muted-foreground">Incidents, délais et coûts des interventions</small></span>
        <ArrowRight size={16} aria-hidden="true" className="shrink-0" />
      </Link>
      <Link href={`${base}/journal`} className={lien}>
        <BookOpen size={20} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 flex-1"><b className="block font-semibold">Journal</b><small className="text-muted-foreground">Actualités et conseils pour votre location</small></span>
        <ArrowRight size={16} aria-hidden="true" className="shrink-0" />
      </Link>
    </nav>
  );
}
