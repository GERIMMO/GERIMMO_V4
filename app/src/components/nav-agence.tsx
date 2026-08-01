"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Navigation latérale de l'espace agence (layout définitif S2).
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
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:gap-0.5">
      {entrees.map((e) => {
        const active = e.exact ? pathname === e.href : pathname.startsWith(e.href);
        return (
          <Link
            key={e.href}
            href={e.href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
            )}
          >
            {e.libelle}
            {e.badge !== undefined && (
              <span className="rounded-full bg-warning-soft px-1.5 text-xs text-warning-soft-foreground">
                {e.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
