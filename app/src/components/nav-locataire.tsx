"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Barre latérale de l'espace locataire (maquette v10 du 05/09) : le locataire
// est chez lui — menu vertical encre, entrée active en laiton, badges sur ce
// qui l'attend. En mobile, la barre devient un rail d'icônes.

const IC: Record<string, string> = {
  maison: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9v11h13V9"/>',
  cle: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M17 12v3M20.5 12v2"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',
  carte: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>',
  outil: '<path d="M14.5 6.5a4 4 0 0 0-5.6 4.9L4 16.3V20h3.7l4.9-4.9a4 4 0 0 0 4.9-5.6L15 12l-3-3z"/>',
  bulle: '<path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/>',
  quest: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.8.3-.9 1-.9 1.7M12 17h.01"/>',
};

function Icone({ nom }: { nom: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: IC[nom] ?? "" }}
    />
  );
}

export function SidebarLocataire({
  orgId,
  badgeDocuments = 0,
  badgeDemandes = 0,
}: {
  orgId: string;
  // Une pièce à déposer ou à renouveler (assurance…) attend dans Documents
  badgeDocuments?: number;
  // Signalements en cours
  badgeDemandes?: number;
}) {
  const pathname = usePathname();
  const base = `/locataire/${orgId}`;
  const entrees = [
    { href: base, libelle: "Accueil", icone: "maison", exact: true },
    { href: `${base}/logement`, libelle: "Mon logement", icone: "cle" },
    { href: `${base}/documents`, libelle: "Mes documents", icone: "doc", badge: badgeDocuments },
    { href: `${base}/loyers`, libelle: "Mes paiements", icone: "carte" },
    {
      href: `${base}/demandes`,
      libelle: "Signaler un problème",
      icone: "outil",
      aussi: `${base}/incident`,
      badge: badgeDemandes,
    },
    { href: `${base}/contact`, libelle: "Mon gestionnaire", icone: "bulle" },
    { href: `${base}/faq`, libelle: "Questions fréquentes", icone: "quest" },
  ];

  return (
    <nav className="loc-menu" aria-label="Mon espace">
      {entrees.map((e) => {
        const active = e.exact
          ? pathname === e.href
          : pathname.startsWith(e.href) || (e.aussi ? pathname.startsWith(e.aussi) : false);
        return (
          <Link key={e.href} href={e.href} className={cn(active && "actif")} title={e.libelle}>
            <Icone nom={e.icone} />
            <span className="lib">{e.libelle}</span>
            {(e.badge ?? 0) > 0 && <span className="loc-badge">{e.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
