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
  ["/admin/equipes", "Mes équipes"],
  ["/admin/marque-blanche", "Marque blanche"],
  ["/admin/veille", "Veille réglementaire"],
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
  // Sous 900 px, la barre devient une bande qui défile à l'horizontale. Rien
  // ne disait qu'il existait d'autres entrées hors champ (24/09) : un fondu
  // s'applique désormais au bord qui cache quelque chose, et l'entrée active
  // est CENTRÉE, pour qu'une voisine reste visible de chaque côté.
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".admin-nav");
    if (!nav) return;
    const fondu = () => {
      const debordement = nav.scrollWidth - nav.clientWidth;
      if (debordement <= 1) {
        nav.style.removeProperty("mask-image");
        nav.style.removeProperty("-webkit-mask-image");
        return;
      }
      const debut = nav.scrollLeft > 1 ? "transparent, #000 40px" : "#000";
      const fin = nav.scrollLeft < debordement - 1 ? "#000 calc(100% - 40px), transparent" : "#000";
      const masque = `linear-gradient(to right, ${debut}, ${fin})`;
      nav.style.setProperty("mask-image", masque);
      nav.style.setProperty("-webkit-mask-image", masque);
    };
    fondu();
    nav.addEventListener("scroll", fondu, { passive: true });
    window.addEventListener("resize", fondu);
    return () => {
      nav.removeEventListener("scroll", fondu);
      window.removeEventListener("resize", fondu);
    };
  }, []);
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".admin-nav");
    const actif = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !actif || nav.scrollWidth <= nav.clientWidth) return;
    const navRect = nav.getBoundingClientRect();
    const actifRect = actif.getBoundingClientRect();
    nav.scrollLeft += actifRect.left + actifRect.width / 2 - (navRect.left + navRect.width / 2);
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
