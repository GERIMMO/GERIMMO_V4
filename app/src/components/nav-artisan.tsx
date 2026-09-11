"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navigation du portail artisan — une barre d'onglets EN BAS de l'écran.
 *
 * Ce n'est pas une variante de la barre latérale du locataire : c'est le
 * gabarit du module 19. L'artisan travaille debout, d'une main, le téléphone
 * tenu bas ; le haut de l'écran est hors d'atteinte du pouce et se trouve
 * souvent sous le reflet du soleil. Les quatre destinations sont donc collées
 * au bord inférieur, à 64 px de haut — une cible qu'un doigt ganté atteint
 * sans viser.
 *
 * QUATRE onglets, pas huit. Les huit parcours du module 19 existent tous, mais
 * quatre d'entre eux (facture, attestations, note, visibilité) sont des
 * parcours de fin de journée, pas de chantier : ils vivent sous « Mon
 * entreprise ». Ce qui compte sur place — ce qui m'attend, où je vais, ce
 * qu'on me demande de chiffrer — tient dans les trois premiers.
 *
 * Aucun identifiant d'agence dans ces adresses : l'artisan est inter-agences
 * (RM-19.3.3), et aucune de ses RPC n'accepte d'organisation en paramètre.
 */

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
  missionsAAccepter = 0,
  devisAChiffrer = 0,
  piecesAAJour = true,
}: {
  /** Missions proposées, en attente d'acceptation ou de refus (7.4). */
  missionsAAccepter?: number;
  /** Demandes de devis encore à chiffrer (9.2). */
  devisAChiffrer?: number;
  /** Une pièce expirée ou proche de l'échéance met une pastille sur l'onglet. */
  piecesAAJour?: boolean;
}) {
  const pathname = usePathname();

  const entrees = [
    { href: "/artisan", libelle: "Aujourd'hui", icone: "jour", exact: true, badge: missionsAAccepter },
    { href: "/artisan/agenda", libelle: "Agenda", icone: "agenda", badge: 0 },
    { href: "/artisan/devis", libelle: "Devis", icone: "devis", badge: devisAChiffrer },
    {
      href: "/artisan/entreprise",
      libelle: "Mon entreprise",
      icone: "entreprise",
      // Les pages de l'entreprise sont trois adresses distinctes : l'onglet
      // désigne la SECTION, sinon il s'éteint dès qu'on entre dans « Mes
      // attestations » et le rail ne désigne plus rien.
      aussi: ["/artisan/attestations", "/artisan/facturation", "/artisan/note"],
      badge: 0,
      point: !piecesAAJour,
    },
  ];

  return (
    <nav
      aria-label="Mon espace artisan"
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-[var(--filet)] bg-[var(--ivoire)] pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex w-full max-w-[720px]">
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
                // Le badge est décoratif : sans ce nom, un lecteur d'écran
                // annonce « Devis 2 » sans dire ce que vaut le 2.
                aria-label={
                  nb > 0
                    ? `${e.libelle}, ${nb} en attente`
                    : e.point
                      ? `${e.libelle}, une attestation à renouveler`
                      : undefined
                }
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
                      aria-hidden
                      className="absolute -top-1.5 -right-2.5 min-w-5 rounded-full bg-[var(--destructive)] px-1 text-center text-[11px] leading-5 font-medium text-[var(--ivoire)]"
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
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
