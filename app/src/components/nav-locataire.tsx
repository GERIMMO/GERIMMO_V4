"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Navigation de l'espace locataire — maquette chromeLoc : onglets posés sur le
// bandeau encre assombri, liseré laiton sous l'onglet actif.
export function NavLocataire({ orgId }: { orgId: string }) {
  const pathname = usePathname();
  const base = `/locataire/${orgId}`;
  const entrees = [
    { href: base, libelle: "Mon logement", exact: true },
    { href: `${base}/demandes`, libelle: "Mes demandes" },
    { href: `${base}/loyers`, libelle: "Mes loyers" },
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
          </Link>
        );
      })}
    </nav>
  );
}
