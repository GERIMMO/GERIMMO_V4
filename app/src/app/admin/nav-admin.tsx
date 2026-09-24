"use client";

import Link from "next/link";
import {useState} from "react";
import { usePathname } from "next/navigation";

const GROUPES = [
  { titre: "Dossiers et décisions", entrees: [["/admin/autonomie", "Dossiers et évolutions"], ["/admin/artisans", "Artisans à valider"], ["/admin/veille", "Veille réglementaire"], ["/admin/retours", "Retours des utilisateurs"]] },
  { titre: "Mes équipes", entrees: [["/admin/equipes", "Travail et commandes"], ["/admin", "Vue d’ensemble"]] },
  { titre: "Clients et partenaires", entrees: [["/admin/clients", "Agences, bailleurs et artisans"], ["/admin/marque-blanche", "Personnalisation des agences"]] },
  { titre: "Développement commercial", entrees: [["/admin/devis", "Demandes commerciales"], ["/admin/marketing", "Agent marketing"], ["/admin/publications", "Articles du journal"], ["/admin/territoire", "Développement territorial"]] },
  { titre: "Réglages et sécurité", entrees: [["/admin/sante", "Santé et connexions"], ["/admin/journaux", "Historique et conservation"], ["/admin/autonomie#continuite", "Relais en mon absence"]] },
];

export function NavAdmin({ artisansEnAttente = 0 }: { artisansEnAttente?: number }) {
  const chemin = usePathname();
  const [ouvert, setOuvert] = useState(false);
  const actif = (href: string) => !href.includes("#") && (href === "/admin" ? chemin === href : chemin === href || chemin.startsWith(`${href}/`) || href === "/admin/clients" && chemin.startsWith("/admin/organisations/"));
  return <div className="admin-menu-conteneur">
    <button type="button" className="admin-menu-mobile" aria-expanded={ouvert} aria-controls="menu-supervision" onClick={() => setOuvert(!ouvert)}>{ouvert ? "Fermer le menu" : "Menu supervision"}</button>
    <div id="menu-supervision" className={`admin-menu-groupes ${ouvert ? "ouvert" : "ferme"}`} key={chemin} onClick={e => {if ((e.target as HTMLElement).closest("a")) setOuvert(false);}}>
    <Link href="/admin/brief" className="admin-nav-lien" aria-current={actif("/admin/brief") ? "page" : undefined}>Aujourd’hui</Link>
    {GROUPES.map(g => <details key={g.titre} open={g.entrees.some(([href]) => actif(href))} className="admin-menu-groupe">
      <summary>{g.titre}{g.titre === "Dossiers et décisions" && artisansEnAttente > 0 && <span className="coquille-badge ml-2" aria-label={`${artisansEnAttente} artisans à valider`}>{artisansEnAttente}</span>}</summary>
      <div>{g.entrees.map(([href, libelle]) => <Link key={href} href={href} className="admin-nav-lien" aria-current={actif(href) ? "page" : undefined}>{libelle}</Link>)}</div>
    </details>)}
  </div></div>;
}
