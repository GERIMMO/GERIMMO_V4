"use client";

import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const GROUPES = [
  { titre: "Dossiers et décisions", entrees: [["/admin/autonomie", "Dossiers et évolutions"], ["/admin/artisans", "Artisans à valider"], ["/admin/veille", "Veille réglementaire"], ["/admin/retours", "Retours des utilisateurs"]] },
  { titre: "Mes équipes", entrees: [["/admin/equipes", "Travail et commandes"], ["/admin", "Vue d’ensemble"]] },
  { titre: "Clients et partenaires", entrees: [["/admin/clients", "Agences, bailleurs et artisans"], ["/admin/marque-blanche", "Personnalisation des agences"]] },
  { titre: "Développement commercial", entrees: [["/admin/devis", "Demandes commerciales"], ["/admin/marketing", "Agent marketing"], ["/admin/publications", "Articles du journal"], ["/admin/territoire", "Développement territorial"]] },
  { titre: "Réglages et sécurité", entrees: [["/admin/sante", "Santé et connexions"], ["/admin/journaux", "Historique et conservation"], ["/admin/autonomie#continuite", "Relais en mon absence"]] },
];

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
  const actif = (href: string) => !href.includes("#") && (href === "/admin" ? chemin === href : chemin === href || chemin.startsWith(`${href}/`) || href === "/admin/clients" && chemin.startsWith("/admin/organisations/"));
  return <div className="admin-menu-groupes" key={chemin} onClick={(e) => { if ((e.target as HTMLElement).closest("a")) auClic?.(); }}>
    {/* Le même chiffre que la barre haute et l'accueil (lib/decisions-attendues.ts). */}
    <Link href="/admin/brief" className="admin-nav-lien" aria-current={actif("/admin/brief") ? "page" : undefined}>Aujourd’hui{decisions > 0 && <span className="coquille-badge ml-2" aria-hidden title={`${decisions} décision${decisions > 1 ? "s" : ""} attendue${decisions > 1 ? "s" : ""}`}>{decisions}</span>}</Link>
    {/* Le porteur (25/09 au soir) : « je veux le menu fixe ». Plus de groupes
        repliables : chaque rubrique est un titre, ses entrées toujours visibles. */}
    {GROUPES.map((g) => <section key={g.titre} className="admin-menu-groupe" aria-labelledby={`menu-${g.titre.replace(/\W+/g, "-")}`}>
      <h3 id={`menu-${g.titre.replace(/\W+/g, "-")}`} className="admin-menu-titre">{g.titre}{g.titre === "Dossiers et décisions" && artisansEnAttente > 0 && <span className="coquille-badge ml-2" aria-label={`${artisansEnAttente} artisans à valider`}>{artisansEnAttente}</span>}</h3>
      <div>{g.entrees.map(([href, libelle]) => <Link key={href} href={href} className="admin-nav-lien" aria-current={actif(href) ? "page" : undefined}>{libelle}</Link>)}</div>
    </section>)}
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
