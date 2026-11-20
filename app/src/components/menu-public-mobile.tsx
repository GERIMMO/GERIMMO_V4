"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { Menu } from "lucide-react";

/**
 * La page en cours, pour un lien de la navigation publique : « page » sur la page elle-même, « true » sur une page
 * qui en dépend (un outil sous « Outils gratuits », un article sous « Journal »). Une ancre de l'accueil n'est
 * jamais la page en cours.
 */
function pageEnCours(href: string, chemin: string | null): "page" | "true" | undefined {
  if (!chemin || href === "/" || href.includes("#")) return undefined;
  if (chemin === href) return "page";
  return chemin.startsWith(`${href}/`) ? "true" : undefined;
}

/**
 * Un lien de la navigation publique. La page en cours porte `aria-current` : la feuille de la vitrine lui donne le
 * liseré champagne des menus des espaces (Design System « Maison », 20/11/2026).
 */
export function LienNavigationPublique({ href, children }: { href: string; children: ReactNode }) {
  const chemin = usePathname();
  return <Link href={href} aria-current={pageEnCours(href, chemin)}>{children}</Link>;
}

export function MenuPublicMobile({ liens }: { liens: readonly (readonly [string, string])[] }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={menu} className="public-menu-mobile" onKeyDown={event => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    }}>
      <summary aria-label="Menu du site"><Menu size={22} aria-hidden /><span>Menu</span></summary>
      <nav aria-label="Navigation mobile" onClick={event => {
        if ((event.target as HTMLElement).closest("a") && menu.current) menu.current.open = false;
      }}>
        {liens.map(([href, titre]) => <LienNavigationPublique key={href} href={href}>{titre}</LienNavigationPublique>)}
        <Link href="/#espaces">Les espaces Gerimmo</Link>
        <Link href="/connexion">Se connecter</Link>
        <Link href="/inscription">Créer mon compte</Link>
      </nav>
    </details>
  );
}
