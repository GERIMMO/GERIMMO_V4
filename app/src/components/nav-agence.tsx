"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Navigation de l'espace agence — charte : l'or signale le liseré actif.
// Chaque module de sprint ajoute son entrée ici.
export function NavAgence({
  orgId,
  alertesOuvertes,
}: {
  orgId: string;
  alertesOuvertes: number;
}) {
  const pathname = usePathname();
  const base = `/agence/${orgId}`;
  const entrees = [
    { href: base, libelle: "Tableau de bord", exact: true },
    { href: `${base}/parc`, libelle: "Parc" },
    { href: `${base}/personnes`, libelle: "Personnes" },
    { href: `${base}/comptabilite`, libelle: "Comptabilité" },
    { href: `${base}/documents`, libelle: "Documents" },
    {
      href: `${base}/alertes`,
      libelle: "Alertes",
      badge: alertesOuvertes > 0 ? alertesOuvertes : undefined,
    },
  ];

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {entrees.map((e) => {
        const active = e.exact ? pathname === e.href : pathname.startsWith(e.href);
        return (
          <Link
            key={e.href}
            href={e.href}
            className={cn(
              // Liseré or sous l'entrée active, tracé en permanence pour que
              // la ligne de base ne saute pas d'un onglet à l'autre.
              "flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-3 text-[0.8125rem] tracking-[0.02em] transition-colors",
              active
                ? "border-[var(--or)] font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {e.libelle}
            {e.badge !== undefined && (
              <span className="flex size-[1.15rem] items-center justify-center rounded-full border border-[var(--or-filet)] text-[0.6875rem] text-[var(--or-texte)]">
                {e.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
