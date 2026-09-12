"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Barre latérale de l'espace agence (maquette v6 du 08/09) : même langage
// premium que les espaces locataire et propriétaire — menu vertical encre,
// entrée active laiton, badges. Deux menus : l'agent voit SON portefeuille
// (RM-18.1.3) ; l'admin voit tout, plus les mandats, l'administration.
// Pas de cloche (décision 30/08 — l'onglet Alertes prime), pas de ⌘K ni de
// bot (chantiers dédiés).

const IC: Record<string, string> = {
  maison: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9v11h13V9"/>',
  parc: '<path d="M3 21V9l6-4 6 4v12"/><path d="M15 21V11l6-3v13M7 13h2M7 17h2"/>',
  outil: '<path d="M14.5 6.5a4 4 0 0 0-5.6 4.9L4 16.3V20h3.7l4.9-4.9a4 4 0 0 0 4.9-5.6L15 12l-3-3z"/>',
  gens: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 5a3.5 3.5 0 0 1 0 7M15.5 13.5A6 6 0 0 1 21 20"/>',
  euro: '<path d="M17 5.5A7 7 0 0 0 6.5 12 7 7 0 0 0 17 18.5M4 10h9M4 14h9"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',
  bulle: '<path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/>',
  cloche: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
  mallette: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a3 3 0 0 1 6 0v2M3 13h18"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/>',
  roue: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  // Même carte bancaire que dans les barres locataire et propriétaire : le
  // même geste doit porter le même signe d'un espace à l'autre.
  carte: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>',
};

function Icone({ nom }: { nom: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden dangerouslySetInnerHTML={{ __html: IC[nom] ?? "" }} />
  );
}

export function SidebarAgence({
  orgId,
  admin = false,
  badgeIncidents = 0,
  badgeAlertes = 0,
  badgeMessages = 0,
}: {
  orgId: string;
  // admin_agence : parc entier, mandats & rapports, administration
  admin?: boolean;
  badgeIncidents?: number;
  badgeAlertes?: number;
  badgeMessages?: number;
}) {
  const pathname = usePathname();
  const base = `/agence/${orgId}`;
  const entrees = [
    { href: base, libelle: "Tableau de bord", icone: "maison", exact: true },
    {
      href: `${base}/parc`,
      libelle: admin ? "Parc de l'agence" : "Mon portefeuille",
      icone: "parc",
    },
    { href: `${base}/incidents`, libelle: "Incidents", icone: "outil", badge: badgeIncidents },
    { href: `${base}/personnes`, libelle: "Personnes", icone: "gens" },
    // Le libellé colle au titre de la page (audit 09/09) : l'admin ouvre la
    // comptabilité complète, l'agent ses loyers & charges
    { href: `${base}/comptabilite`, libelle: admin ? "Comptabilité" : "Loyers & charges", icone: "euro" },
    ...(admin
      ? [{ href: `${base}/mandats`, libelle: "Mandats & rapports", icone: "mallette" }]
      : []),
    { href: `${base}/documents`, libelle: "Documents", icone: "doc" },
    { href: `${base}/messages`, libelle: "Messages", icone: "bulle", badge: badgeMessages },
    { href: `${base}/alertes`, libelle: "Alertes", icone: "cloche", badge: badgeAlertes },
    { href: `${base}/statistiques`, libelle: "Statistiques", icone: "stats" },
    // « Mon abonnement » n'apparaît qu'au responsable, comme chez le
    // propriétaire direct : un agent n'a pas à connaître la facture de son
    // agence, et la base refuse déjà de la lui rendre (`mon_abonnement`).
    // Avant la grille du 12/09, l'écran n'existait pas pour les agences —
    // elles n'avaient aucun moyen de savoir ce qu'elles payaient, ni de payer.
    ...(admin
      ? [
          { href: `${base}/abonnement`, libelle: "Mon abonnement", icone: "carte" },
          { href: `${base}/administration`, libelle: "Administration", icone: "roue" },
        ]
      : []),
  ];

  return (
    <nav className="loc-menu" aria-label="Espace agence">
      {entrees.map((e) => {
        const active = e.exact ? pathname === e.href : pathname.startsWith(e.href);
        const nb = e.badge ?? 0;
        return (
          <Link
            key={e.href}
            href={e.href}
            className={cn(active && "actif")}
            title={e.libelle}
            // L'entrée courante s'annonce comme telle : le liseré laiton ne se
            // lit pas au lecteur d'écran (relevé 11/09)
            aria-current={active ? "page" : undefined}
            // Accessibilité (audit 09/09) : le lien s'annonce en entier, le
            // badge est décoratif — sinon les lecteurs d'écran ne lisent
            // que le nombre
            aria-label={nb > 0 ? `${e.libelle}, ${nb} élément${nb > 1 ? "s" : ""} à traiter` : undefined}
          >
            <Icone nom={e.icone} />
            <span className="lib">{e.libelle}</span>
            {nb > 0 && (
              // Au-delà de 99, la pastille déborderait : elle le dit (« 99+ »)
              // et le compte exact reste dans l'aria-label du lien.
              <span className="loc-badge" aria-hidden="true">
                {nb > 99 ? "99+" : nb}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
