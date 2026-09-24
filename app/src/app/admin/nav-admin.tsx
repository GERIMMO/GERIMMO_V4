"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// La barre de la console ne disait jamais où l'on se trouve (constat de l'état
// des lieux du 11/09) : quatre liens identiques, aucun état actif. Le liseré
// bleu sous l'entrée courante est le même signal que dans les espaces agence
// et locataire — on ne réinvente pas un motif par espace.
// « Clients » remplace « Inscriptions artisan » (demande du 19/09) : l'entrée
// portait le nom d'une FILE D'ATTENTE, pas d'une population. Les agences et les
// propriétaires bailleurs n'avaient, eux, aucune entrée du tout — ils vivaient
// en bas de la page de supervision. Les trois familles sont désormais réunies
// sous un seul nom, et `/admin/artisans` reste l'écran de décision derrière.
const ENTREES: [string, string][] = [
  ["/admin", "Supervision"],
  ["/admin/brief", "Brief"],
  ["/admin/autonomie", "Pilotage autonome"],
  ["/admin/clients", "Clients"],
  ["/admin/territoire", "Territoire"],
  // « Journal » seul se confondait avec « Journaux et conservation ».
  ["/admin/publications", "Articles du journal"],
  ["/admin/marketing", "Agent marketing"],
  ["/admin/retours", "Retours et idées"],
  ["/admin/devis", "Demandes de devis"],
  ["/admin/journaux", "Journaux et conservation"],
  ["/admin/sante", "Santé du service"],
];

// Les écrans qui appartiennent à une entrée sans vivre sous son chemin : la
// file d'attente des artisans et les fiches d'organisation sont des écrans
// « Clients », et la barre doit le dire.
const RATTACHEMENTS: Record<string, string[]> = {
  "/admin/clients": ["/admin/artisans", "/admin/organisations"],
};

// Les inscriptions artisan en attente vivent derrière « Clients » : la pastille
// dit qu'une décision attend, sans qu'il faille ouvrir la supervision.
export function NavAdmin({ artisansEnAttente = 0 }: { artisansEnAttente?: number }) {
  const chemin = usePathname();
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".admin-nav");
    const actif = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !actif) return;
    const navRect = nav.getBoundingClientRect();
    const actifRect = actif.getBoundingClientRect();
    if (actifRect.left < navRect.left || actifRect.right > navRect.right) {
      nav.scrollLeft += actifRect.left - navRect.left - 12;
    }
  }, [chemin]);
  return (
    <>
      {ENTREES.map(([href, libelle]) => {
        // « Supervision » ne s'allume que sur la racine exacte, sinon elle
        // resterait active sur toutes les sous-pages.
        const actif =
          href === "/admin"
            ? chemin === "/admin"
            : chemin.startsWith(href) ||
              (RATTACHEMENTS[href] ?? []).some((p) => chemin.startsWith(p));
        return (
          <Link
            key={href}
            href={href}
            aria-current={actif ? "page" : undefined}
            className="admin-nav-lien"
          >
            {libelle}
            {href === "/admin/clients" && artisansEnAttente > 0 && (
              <>
                <span className="coquille-badge ml-2" aria-hidden="true">
                  {artisansEnAttente > 99 ? "99+" : artisansEnAttente}
                </span>
                <span className="sr-only">
                  , {artisansEnAttente} inscription{artisansEnAttente > 1 ? "s" : ""} artisan en attente
                </span>
              </>
            )}
          </Link>
        );
      })}
    </>
  );
}
