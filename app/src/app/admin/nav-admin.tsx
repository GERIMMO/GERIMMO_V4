"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// La barre de la console ne disait jamais où l'on se trouve (constat de l'état
// des lieux du 11/09) : quatre liens identiques, aucun état actif. Le liseré
// laiton sous l'entrée courante est le même signal que dans les espaces
// agence et locataire — on ne réinvente pas un motif par espace.
const ENTREES: [string, string][] = [
  ["/admin", "Supervision"],
  ["/admin/publications", "Journal"],
  ["/admin/devis", "Demandes de devis"],
  ["/admin/journaux", "Journaux et conservation"],
];

export function NavAdmin() {
  const chemin = usePathname();
  return (
    <>
      {ENTREES.map(([href, libelle]) => {
        // « Supervision » ne s'allume que sur la racine exacte, sinon elle
        // resterait active sur toutes les sous-pages.
        const actif = href === "/admin" ? chemin === "/admin" : chemin.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={actif ? "page" : undefined}
            className={`border-b-2 py-1 text-[0.8125rem] transition-colors ${
              actif
                ? "border-[var(--or)] text-[var(--sur-encre)]"
                : "border-transparent text-[var(--sur-encre)]/75 hover:text-[var(--sur-encre)]"
            }`}
          >
            {libelle}
          </Link>
        );
      })}
    </>
  );
}
