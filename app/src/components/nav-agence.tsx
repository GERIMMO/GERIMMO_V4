"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Navigation de l'espace agence — maquette : onglets posés sur le bandeau
// encre, liseré laiton sous l'onglet actif, badge rouge sur Alertes.
// Chaque module de sprint ajoute son entrée ici.
export function NavAgence({
  orgId,
  alertesOuvertes,
  incidentsOuverts,
}: {
  orgId: string;
  alertesOuvertes: number;
  incidentsOuverts: number;
}) {
  const pathname = usePathname();
  const base = `/agence/${orgId}`;
  const entrees = [
    { href: base, libelle: "Tableau de bord", exact: true },
    { href: `${base}/parc`, libelle: "Parc" },
    {
      href: `${base}/incidents`,
      libelle: "Incidents",
      badge: incidentsOuverts > 0 ? incidentsOuverts : undefined,
    },
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
    <nav className="flex gap-6 overflow-x-auto [scrollbar-width:none]">
      {entrees.map((e) => {
        const active = e.exact ? pathname === e.href : pathname.startsWith(e.href);
        return (
          <Link
            key={e.href}
            href={e.href}
            className={cn(
              "flex shrink-0 items-center border-b-2 py-3 text-[13px] whitespace-nowrap transition-colors",
              active
                ? "border-[var(--or)] text-[var(--sur-encre)]"
                : "border-transparent text-[var(--sur-encre)]/60 hover:text-[var(--sur-encre)]"
            )}
          >
            {e.libelle}
            {e.badge !== undefined && (
              <span className="ml-1.5 rounded-full bg-[var(--destructive)] px-[7px] py-px font-[family-name:var(--font-libelles)] text-[10px] text-white">
                {e.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
