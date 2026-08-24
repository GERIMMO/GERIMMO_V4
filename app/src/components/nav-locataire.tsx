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
    // La page de déclaration (/incident) vit sous « Mes demandes »
    { href: `${base}/demandes`, libelle: "Mes demandes", aussi: `${base}/incident` },
    { href: `${base}/loyers`, libelle: "Mes loyers" },
  ];

  return (
    <div className="flex items-center justify-between gap-4">
      <nav className="flex gap-6 overflow-x-auto [scrollbar-width:none]">
        {entrees.map((e) => {
          const active = e.exact
            ? pathname === e.href
            : pathname.startsWith(e.href) || (e.aussi ? pathname.startsWith(e.aussi) : false);
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
      {/* CTA permanent de la maquette chromeLoc (conformité 24/08) */}
      <Link
        href={`${base}/incident`}
        className="btn-or my-1.5 shrink-0 !py-1.5 text-[13px]"
      >
        Signaler un problème
      </Link>
    </div>
  );
}
