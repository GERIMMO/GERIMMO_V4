"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { RUBRIQUES, ongletActif, rubriqueActive } from "@/lib/rubriques-supervision";
import { LayoutDashboard, Users, ShieldCheck, Megaphone, PanelsTopLeft, History, Settings2, Menu, X, Search, ClipboardCheck, Files, Wrench, MessagesSquare, Wallet, TrendingUp, Workflow, CalendarClock, Activity, BookOpen } from "lucide-react";

const ICONES = { bureau: LayoutDashboard, decisions: ClipboardCheck, "comptes-rendus": BookOpen, utilisateurs: Users, dossiers: Files, artisans: Wrench, assistance: MessagesSquare, finances: Wallet, marketing: Megaphone, commercial: TrendingUp, automatismes: Workflow, relais: CalendarClock, produit: PanelsTopLeft, sante: Activity, securite: ShieldCheck, historique: History, parametres: Settings2 };

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
  return <button type="button" className="admin-menu-mobile w-auto! shrink-0" aria-label={ouvert ? "Fermer le menu" : "Menu supervision"} aria-expanded={ouvert} aria-controls="menu-supervision" onClick={basculer}>{ouvert ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}<span className="max-[360px]:sr-only">{ouvert ? "Fermer" : "Menu"}</span></button>;
}

/** La colonne latérale : toujours là sur ordinateur ; au téléphone, seulement quand le menu est ouvert (un seul menu dans la page). */
export function ColonneSupervision({ children }: { children: ReactNode }) {
  const { ouvert } = useContext(MenuSupervision);
  return <aside id="menu-supervision" aria-label="Menu de la supervision" className={`admin-late min-[901px]:col-start-1 min-[901px]:row-start-1 min-[901px]:row-span-2 max-[900px]:row-start-2${ouvert ? "" : " max-[900px]:hidden!"}`}>{children}</aside>;
}

function Groupes({ artisansEnAttente, decisions, auClic }: { artisansEnAttente: number | null; decisions: number | null; auClic?: () => void }) {
  const chemin = usePathname();
  const recherche = useSearchParams().toString();
  const active = rubriqueActive(chemin, recherche);
  const liste = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const navigation = liste.current?.closest<HTMLElement>(".admin-nav");
    const lien = liste.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!navigation || !lien || getComputedStyle(navigation).overflowY !== "auto") return;
    const cadre = navigation.getBoundingClientRect();
    const position = lien.getBoundingClientRect();
    if (position.top < cadre.top || position.bottom > cadre.bottom) navigation.scrollTop += position.top - cadre.top - 8;
  }, [active?.cle]);
  const compte = { artisans: artisansEnAttente, decisions };
  // Toutes les destinations sont affichées sans groupes ni accordéons.
  return <div ref={liste} className="admin-menu-groupes" key={`${chemin}?${recherche}`} onClick={(e) => { if ((e.target as HTMLElement).closest("a")) auClic?.(); }}>
    {RUBRIQUES.map((r) => {
      const n = r.badge ? compte[r.badge] : 0;
      const Icone = ICONES[r.cle as keyof typeof ICONES] ?? LayoutDashboard;
      return <Link key={r.cle} href={r.href} prefetch={false} className="admin-nav-lien" aria-current={active?.cle === r.cle ? "page" : undefined}>
        <Icone size={18} strokeWidth={1.7} aria-hidden="true" /><span>{r.libelle}</span>
        {n === null && <span className="coquille-badge ml-auto">À vérifier</span>}
        {n !== null && n > 0 && <span className="coquille-badge ml-auto" aria-label={r.badge === "artisans" ? `${n} artisan${n > 1 ? "s" : ""} à valider` : `${n} sujet${n > 1 ? "s" : ""} à traiter`}>{n}</span>}
      </Link>;
    })}
  </div>;
}

/** La navigation de la colonne latérale (ordinateur). */
export function NavAdmin({ artisansEnAttente = 0, decisions = 0 }: { artisansEnAttente?: number | null; decisions?: number | null }) {
  const { fermer } = useContext(MenuSupervision);
  return <div className="admin-menu-conteneur">
    {/* Au téléphone, la recherche vit dans le menu (audit C26) ; la fenêtre est celle de la barre haute. Le menu se
        replie : le focus passe d'abord au bouton du menu, où la recherche le rendra en se fermant (audit #264, TRV-02). */}
    <button type="button" className="admin-nav-lien min-[901px]:hidden" onClick={() => { document.querySelector<HTMLElement>('[aria-controls="menu-supervision"]')?.focus(); fermer(); window.dispatchEvent(new Event("gerimmo:ouvrir-recherche")); }}><Search size={18} aria-hidden="true" /><span>Rechercher un client ou un dossier…</span></button>
    <Groupes artisansEnAttente={artisansEnAttente} decisions={decisions} auClic={fermer} />
  </div>;
}

/**
 * LES ONGLETS DE LA RUBRIQUE (26/09). Une barre sous le bandeau, qui liste
 * les pages de la rubrique courante ; rien pour une rubrique d'une seule page.
 * Sur une fiche (organisation, compte), la rubrique reste lisible sans
 * qu'aucun onglet ne soit allumé : on sait où l'on est, et comment remonter.
 */
export function OngletsSupervision({ artisansEnAttente = 0, decisions = 0 }: { artisansEnAttente?: number | null; decisions?: number | null }) {
  const chemin = usePathname();
  const recherche = useSearchParams().toString();
  const rangee = useRef<HTMLDivElement>(null);
  // Au téléphone, la rangée d'onglets défile : l'onglet actif est ramené dans
  // la vue à chaque changement de page (audit console 27/09) — « Relais en mon
  // absence » ou « Développement territorial » restaient hors écran.
  useEffect(() => {
    const courant = rangee.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!courant || !rangee.current || rangee.current.scrollWidth <= rangee.current.clientWidth) return;
    // scrollLeft plutôt que scrollIntoView : la page ne saute pas verticalement.
    const r = rangee.current;
    const gauche = courant.getBoundingClientRect().left - r.getBoundingClientRect().left + r.scrollLeft;
    r.scrollLeft = gauche - (r.clientWidth - courant.offsetWidth) / 2;
  }, [chemin, recherche]);
  const rubrique = rubriqueActive(chemin, recherche);
  if (!rubrique || rubrique.onglets.length < 2) return null;
  const actif = ongletActif(chemin, recherche);
  const compte = { artisans: artisansEnAttente, decisions };
  return <nav className="admin-onglets" aria-label={`Pages de la rubrique ${rubrique.libelle}`}>
    <div ref={rangee} className="admin-onglets-interieur">
      {rubrique.onglets.map((o) => {
        const n = o.badge ? compte[o.badge] : 0;
        return <Link key={o.href} href={o.href} className="admin-onglet" aria-current={actif?.href === o.href ? "page" : undefined}>
          {o.libelle}
          {n === null && <span className="coquille-badge ml-2">À vérifier</span>}
          {n !== null && n > 0 && <span className="coquille-badge ml-2" aria-hidden>{n}</span>}
        </Link>;
      })}
    </div>
  </nav>;
}
