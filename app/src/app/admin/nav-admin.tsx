"use client";

import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { RUBRIQUES, ongletActif, rubriqueActive } from "@/lib/rubriques-supervision";

// Le plan de la console vit dans lib/rubriques-supervision.ts (26/09).

// 25/09 (audit C26) : au téléphone, trois barres se superposaient avant le
// contenu (logo, « Menu supervision », recherche/alertes). Le bouton du menu
// vit désormais DANS la barre haute ; le panneau s'ouvre dessous. L'état est
// partagé par ce contexte entre le bouton (bandeau) et le panneau.
const MenuSupervision = createContext<{ ouvert: boolean; basculer: () => void; fermer: () => void }>({ ouvert: false, basculer: () => {}, fermer: () => {} });

export function MenuSupervisionProvider({ children }: { children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  return <MenuSupervision.Provider value={{ ouvert, basculer: () => setOuvert((o) => !o), fermer: () => setOuvert(false) }}>{children}</MenuSupervision.Provider>;
}

/** Le bouton du menu, posé dans la barre haute ; visible sous 900 px seulement (classe commune). */
export function BoutonMenuSupervision() {
  const { ouvert, basculer } = useContext(MenuSupervision);
  return <button type="button" className="admin-menu-mobile w-auto! shrink-0" aria-label={ouvert ? "Fermer le menu" : "Menu supervision"} aria-expanded={ouvert} aria-controls="menu-supervision" onClick={basculer}>{ouvert ? "Fermer" : "Menu"}</button>;
}

/** La colonne latérale : toujours là sur ordinateur ; au téléphone, seulement quand le menu est ouvert (un seul menu dans la page). */
export function ColonneSupervision({ children }: { children: ReactNode }) {
  const { ouvert } = useContext(MenuSupervision);
  return <aside id="menu-supervision" className={`admin-late min-[901px]:col-start-1 min-[901px]:row-start-1 min-[901px]:row-span-2 max-[900px]:row-start-2${ouvert ? "" : " max-[900px]:hidden!"}`}>{children}</aside>;
}

function Groupes({ artisansEnAttente, decisions, auClic }: { artisansEnAttente: number; decisions: number; auClic?: () => void }) {
  const chemin = usePathname();
  const active = rubriqueActive(chemin);
  const compte = { artisans: artisansEnAttente, decisions };
  // Sept entrées, dessinées par le porteur le 26/09 : le menu dit OÙ l'on est,
  // les onglets en haut de l'écran disent QUOI regarder dans la rubrique.
  return <div className="admin-menu-groupes" key={chemin} onClick={(e) => { if ((e.target as HTMLElement).closest("a")) auClic?.(); }}>
    {RUBRIQUES.map((r, i) => {
      const n = r.badge ? compte[r.badge] : 0;
      return <Link key={r.cle} href={r.href} className={`admin-nav-lien${i === RUBRIQUES.length - 2 ? " admin-nav-lien-bas" : ""}`} aria-current={active?.cle === r.cle ? "page" : undefined}>
        {r.libelle}
        {n > 0 && <span className="coquille-badge ml-auto" aria-label={r.badge === "artisans" ? `${n} artisan${n > 1 ? "s" : ""} à valider` : `${n} décision${n > 1 ? "s" : ""} attendue${n > 1 ? "s" : ""}`}>{n}</span>}
      </Link>;
    })}
  </div>;
}

/** La navigation de la colonne latérale (ordinateur). */
export function NavAdmin({ artisansEnAttente = 0, decisions = 0 }: { artisansEnAttente?: number; decisions?: number }) {
  const { fermer } = useContext(MenuSupervision);
  return <div className="admin-menu-conteneur">
    {/* Au téléphone, la recherche vit dans le menu (audit C26) ; la fenêtre est celle de la barre haute. */}
    <button type="button" className="admin-nav-lien min-[901px]:hidden" onClick={() => { fermer(); window.dispatchEvent(new Event("gerimmo:ouvrir-recherche")); }}>Rechercher un client…</button>
    <Groupes artisansEnAttente={artisansEnAttente} decisions={decisions} auClic={fermer} />
  </div>;
}

/**
 * LES ONGLETS DE LA RUBRIQUE (26/09). Une barre sous le bandeau, qui liste
 * les pages de la rubrique courante ; rien pour une rubrique d'une seule page.
 * Sur une fiche (organisation, compte), la rubrique reste lisible sans
 * qu'aucun onglet ne soit allumé : on sait où l'on est, et comment remonter.
 */
export function OngletsSupervision({ artisansEnAttente = 0, decisions = 0 }: { artisansEnAttente?: number; decisions?: number }) {
  const chemin = usePathname();
  const rubrique = rubriqueActive(chemin);
  if (!rubrique || rubrique.onglets.length < 2) return null;
  const actif = ongletActif(chemin);
  const compte = { artisans: artisansEnAttente, decisions };
  return <nav className="admin-onglets" aria-label={`Pages de la rubrique ${rubrique.libelle}`}>
    <div className="admin-onglets-interieur">
      {rubrique.onglets.map((o) => {
        const n = o.badge ? compte[o.badge] : 0;
        return <Link key={o.href} href={o.href} className="admin-onglet" aria-current={actif?.href === o.href ? "page" : undefined}>
          {o.libelle}
          {n > 0 && <span className="coquille-badge ml-2" aria-hidden>{n}</span>}
        </Link>;
      })}
    </div>
  </nav>;
}
