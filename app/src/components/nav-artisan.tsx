"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, BookOpen, Building2, CalendarDays, FileCheck2, FileText, LayoutDashboard, Star, Users, type LucideIcon } from "lucide-react";
import styles from "@/app/artisan/portail-artisan.module.css";

/** Sur bureau, toutes les rubriques sont visibles ; sur téléphone, quatre
 * accès restent à portée du pouce et les autres vivent dans Mon entreprise. */

const IC: Record<string, string> = {
  jour: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  agenda:
    '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  devis: '<path d="M6.5 3h7l4.5 4.5V21h-11.5z"/><path d="M13.5 3v5h4.5M9 13h6M9 17h4"/>',
  entreprise:
    '<path d="M4 20V9.5L12 4l8 5.5V20"/><path d="M9.5 20v-6h5v6"/>',
};

function Icone({ nom }: { nom: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-6 shrink-0 fill-none stroke-current stroke-[1.6] [stroke-linecap:round] [stroke-linejoin:round]"
      dangerouslySetInnerHTML={{ __html: IC[nom] ?? "" }}
    />
  );
}

export function NavArtisan({
  aFaireMaintenant = 0,
  devisAChiffrer = 0,
  piecesAAJour = true,
  presentation = "mobile",
  clientsExternes = false,
}: {
  /**
   * Ce qui attend un geste de sa part sur l'écran d'arrivée : missions à
   * accepter (7.4) ET comptes rendus à déposer (7.5). Les deux comptent
   * ensemble parce que le badge répond à une seule question — « est-ce que
   * quelque chose m'attend ? » ; en séparer un dirait à l'artisan qu'il n'a
   * rien à faire alors qu'une facture attend son compte rendu.
   */
  presentation?: "mobile" | "bureau";
  clientsExternes?: boolean;
  aFaireMaintenant?: number;
  /** Demandes de devis encore à chiffrer (9.2). */
  devisAChiffrer?: number;
  /** Une pièce expirée ou proche de l'échéance met une pastille sur l'onglet. */
  piecesAAJour?: boolean;
}) {
  const pathname = usePathname();

  const entrees = [
    { href: "/artisan", libelle: "Aujourd'hui", icone: "jour", exact: true, badge: aFaireMaintenant },
    {
      href: "/artisan/agenda",
      libelle: "Agenda",
      icone: "agenda",
      // 24/09 : la fiche d'une mission (et ses créneaux, son compte rendu) vit
      // sous /artisan/missions ; sans ce rattachement, aucun onglet n'y était
      // allumé et l'artisan venu de son agenda perdait son repère.
      aussi: ["/artisan/missions"],
      badge: 0,
    },
    { href: "/artisan/devis", libelle: "Devis", icone: "devis", badge: devisAChiffrer },
    {
      href: "/artisan/entreprise",
      libelle: "Mon entreprise",
      icone: "entreprise",
      // Les pages de l'entreprise sont trois adresses distinctes : l'onglet
      // désigne la SECTION, sinon il s'éteint dès qu'on entre dans « Mes
      // attestations » et le rail ne désigne plus rien.
      // Audit 27/09 : « Les règles » et la page de panne (toutes deux sous
      // « Mon entreprise ») n'allumaient aucun onglet.
      aussi: [
        "/artisan/attestations",
        "/artisan/facturation",
        "/artisan/note",
        "/artisan/regles",
        "/artisan/panne",
      ],
      badge: 0,
      point: !piecesAAJour,
    },
  ];

  if (presentation === "bureau") {
    const groupes: { titre: string; liens: { href: string; libelle: string; icone: LucideIcon; exact?: boolean; badge?: number; aussi?: string[]; point?: boolean }[] }[] = [
      { titre: "Mon activité", liens: [
        { href: "/artisan", libelle: "Aujourd’hui", icone: LayoutDashboard, exact: true, badge: aFaireMaintenant },
        { href: "/artisan/agenda", libelle: "Mon agenda", icone: CalendarDays, aussi: ["/artisan/missions"] },
        { href: "/artisan/devis", libelle: "Demandes de devis", icone: FileText, badge: devisAChiffrer },
        { href: "/artisan/facturation", libelle: "Ma facturation", icone: Banknote },
        ...(clientsExternes ? [{ href: "/artisan/clients", libelle: "Clients externes", icone: Users, aussi: ["/artisan/chantiers"] }] : []),
      ] },
      { titre: "Mon entreprise", liens: [
        { href: "/artisan/entreprise", libelle: "Ma fiche entreprise", icone: Building2 },
        { href: "/artisan/attestations", libelle: "Mes attestations", icone: FileCheck2, point: !piecesAAJour },
        { href: "/artisan/note", libelle: "Mes évaluations", icone: Star },
        { href: "/artisan/regles", libelle: "Les règles à connaître", icone: BookOpen },
      ] },
    ];
    return (
      <nav aria-label="Mon espace artisan" className={styles.desktopNav}>
        {groupes.map((groupe) => (
          <div key={groupe.titre}>
            <p>{groupe.titre}</p>
            <ul>
              {groupe.liens.map((lien) => {
                const actif = lien.exact ? pathname === lien.href : pathname.startsWith(lien.href) || (lien.aussi ?? []).some((p) => pathname.startsWith(p));
                const IconeMenu = lien.icone;
                return (
                  <li key={lien.href}>
                    <Link href={lien.href} aria-current={actif ? "page" : undefined}>
                      <IconeMenu size={19} aria-hidden /><span>{lien.libelle}</span>
                      {Boolean(lien.badge) && <span className={styles.navBadge}>{lien.badge}<span className="sr-only"> en attente</span></span>}
                      {lien.point && <span className={styles.navPoint}><span className="sr-only">Attestations à déposer ou à renouveler</span></span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Mon espace artisan"
      className={`artisan-navigation ${styles.mobileNav} fixed inset-x-0 bottom-0 z-30 border-t border-[var(--filet)] bg-[var(--ivoire)] pb-[env(safe-area-inset-bottom)]`}
    >
      <ul className="mx-auto flex w-full max-w-[960px]">
        {entrees.map((e) => {
          const actif = e.exact
            ? pathname === e.href
            : pathname.startsWith(e.href) ||
              (e.aussi ?? []).some((a) => pathname.startsWith(a));
          const nb = e.badge ?? 0;
          return (
            <li key={e.href} className="min-w-0 flex-1">
              <Link
                href={e.href}
                aria-current={actif ? "page" : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-center transition-colors ${
                  actif
                    ? "text-[var(--encre)]"
                    : "text-[var(--texte-secondaire)] hover:text-[var(--encre)]"
                }`}
              >
                {actif && (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 top-0 h-[3px] rounded-b bg-[var(--or)]"
                  />
                )}
                <span className="relative">
                  <Icone nom={e.icone} />
                  {nb > 0 && (
                    <span
                      className="absolute -top-1.5 -right-2.5 min-w-5 rounded-full bg-[var(--marque)] px-1 text-center text-[11px] leading-5 font-medium text-[var(--sur-marque)]"
                    >
                      {nb > 9 ? "9+" : nb}
                    </span>
                  )}
                  {nb === 0 && e.point && (
                    <span
                      aria-hidden
                      className="absolute -top-0.5 -right-1.5 size-2.5 rounded-full bg-[var(--warning)]"
                    />
                  )}
                </span>
                <span className="w-full truncate text-[0.6875rem] leading-tight font-medium">
                  {e.libelle}
                </span>
                {nb > 0 ? <span className="sr-only"> — {nb} en attente</span> : e.point ? <span className="sr-only"> — attestations à déposer ou à renouveler</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
