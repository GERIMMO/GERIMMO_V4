"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// Barre latérale de l'espace propriétaire (maquette PC v1 du 05/09) : même
// langage premium que l'espace locataire — menu vertical encre, entrée active
// laiton, badges — plus le sélecteur d'organisation (nom propre / SCI) quand
// le propriétaire en a plusieurs : tout suit, lots, livre, fiscalité.

const IC: Record<string, string> = {
  maison: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9v11h13V9"/>',
  cle: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M17 12v3M20.5 12v2"/>',
  gens: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 5a3.5 3.5 0 0 1 0 7M15.5 13.5A6 6 0 0 1 21 20"/>',
  outil: '<path d="M14.5 6.5a4 4 0 0 0-5.6 4.9L4 16.3V20h3.7l4.9-4.9a4 4 0 0 0 4.9-5.6L15 12l-3-3z"/>',
  livre: '<path d="M4 4h9a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z"/><path d="M17 8h3v12h-9"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',
  cloche: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
  carte: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>',
  quest: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.8.3-.9 1-.9 1.7M12 17h.01"/>',
};

function Icone({ nom }: { nom: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden dangerouslySetInnerHTML={{ __html: IC[nom] ?? "" }} />
  );
}

export type OrganisationProprietaire = { id: string; nom: string };

export function SidebarProprietaire({
  orgId,
  badgeIncidents = 0,
  badgeAlertes = 0,
  organisations = [],
}: {
  orgId: string;
  badgeIncidents?: number;
  badgeAlertes?: number;
  // Ses autres organisations (SCI, nom propre…) — le sélecteur n'apparaît
  // qu'à partir de deux
  organisations?: OrganisationProprietaire[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/agence/${orgId}`;
  const entrees = [
    { href: base, libelle: "Accueil", icone: "maison", exact: true },
    { href: `${base}/parc`, libelle: "Mes lots", icone: "cle" },
    { href: `${base}/personnes`, libelle: "Locataires & garants", icone: "gens" },
    { href: `${base}/incidents`, libelle: "Incidents", icone: "outil", badge: badgeIncidents },
    { href: `${base}/comptabilite`, libelle: "Livre & fiscalité", icone: "livre" },
    { href: `${base}/documents`, libelle: "Documents", icone: "doc" },
    { href: `${base}/alertes`, libelle: "Alertes", icone: "cloche", badge: badgeAlertes },
    { href: `${base}/abonnement`, libelle: "Mon abonnement", icone: "carte" },
    { href: `${base}/faq`, libelle: "FAQ", icone: "quest" },
  ];

  return (
    <>
      {organisations.length > 1 && (
        <div className="px-4 pt-3.5">
          <label
            htmlFor="selecteur-organisation"
            className="eyebrow block text-[var(--sur-encre)]/50"
          >
            Organisation
          </label>
          <select
            id="selecteur-organisation"
            value={orgId}
            onChange={(e) => router.push(`/agence/${e.target.value}`)}
            className="mt-1.5 w-full rounded-lg border border-[var(--sur-encre)]/20 bg-[var(--sur-encre)]/5 px-2 py-1.5 text-[12.5px] text-[var(--sur-encre)]"
          >
            {organisations.map((o) => (
              <option key={o.id} value={o.id} className="text-[var(--encre)]">
                {o.nom}
              </option>
            ))}
          </select>
        </div>
      )}
      <nav className="loc-menu" aria-label="Mon espace">
        {entrees.map((e) => {
          const active = e.exact ? pathname === e.href : pathname.startsWith(e.href);
          return (
            <Link key={e.href} href={e.href} className={cn(active && "actif")} title={e.libelle}>
              <Icone nom={e.icone} />
              <span className="lib">{e.libelle}</span>
              {(e.badge ?? 0) > 0 && <span className="loc-badge">{e.badge}</span>}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
