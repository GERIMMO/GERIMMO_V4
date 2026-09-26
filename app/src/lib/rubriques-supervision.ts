// LE PLAN DE LA CONSOLE (26/09), dessiné par le porteur :
// « Vue d'ensemble (avec aujourd'hui) — Utilisateurs — Veille — Marketing —
// Développement — Historique et conservation — Paramètres. »
//
// Sept entrées dans la colonne, pas une de plus. Chaque rubrique regroupe ses
// pages sous des onglets en haut de l'écran : le menu dit OÙ l'on est, les
// onglets disent QUOI regarder dans la rubrique. Les adresses des pages ne
// changent pas (liens, favoris et tests restent valables) ; seul le
// rangement change. Un seul tableau, lu par la colonne ET par les onglets.

export type Onglet = { href: string; libelle: string; badge?: "artisans" | "decisions" };
export type Rubrique = {
  cle: string;
  libelle: string;
  /** L'écran ouvert par l'entrée du menu : le premier onglet. */
  href: string;
  onglets: Onglet[];
  /** Pages sans onglet qui appartiennent pourtant à la rubrique (fiches). */
  aussi?: string[];
  badge?: "artisans" | "decisions";
};

export const RUBRIQUES: Rubrique[] = [
  {
    cle: "vue",
    libelle: "Vue d’ensemble",
    href: "/admin/brief",
    badge: "decisions",
    onglets: [
      { href: "/admin/brief", libelle: "Aujourd’hui", badge: "decisions" },
      { href: "/admin", libelle: "Chiffres et clients" },
    ],
  },
  {
    cle: "utilisateurs",
    libelle: "Utilisateurs",
    href: "/admin/clients",
    badge: "artisans",
    onglets: [
      { href: "/admin/clients", libelle: "Agences, bailleurs et artisans" },
      { href: "/admin/artisans", libelle: "Artisans à valider", badge: "artisans" },
      { href: "/admin/devis", libelle: "Demandes commerciales" },
      { href: "/admin/marque-blanche", libelle: "Personnalisation des agences" },
    ],
    aussi: ["/admin/organisations", "/admin/comptes"],
  },
  {
    cle: "veille",
    libelle: "Veille",
    href: "/admin/veille",
    onglets: [
      { href: "/admin/veille", libelle: "Veille réglementaire" },
      { href: "/admin/equipes", libelle: "Travail des équipes" },
      { href: "/admin/sante", libelle: "Santé et connexions" },
      { href: "/admin/relais", libelle: "Relais en mon absence" },
    ],
  },
  {
    cle: "marketing",
    libelle: "Marketing",
    href: "/admin/marketing",
    onglets: [
      { href: "/admin/marketing", libelle: "Agent marketing" },
      { href: "/admin/publications", libelle: "Articles du site" },
    ],
  },
  {
    cle: "developpement",
    libelle: "Développement",
    href: "/admin/autonomie",
    onglets: [
      { href: "/admin/autonomie", libelle: "Développement du site" },
      { href: "/admin/retours", libelle: "Retours des utilisateurs" },
      { href: "/admin/territoire", libelle: "Développement territorial" },
    ],
  },
  {
    cle: "historique",
    libelle: "Historique et conservation",
    href: "/admin/journaux",
    onglets: [{ href: "/admin/journaux", libelle: "Historique et conservation" }],
  },
  {
    cle: "parametres",
    libelle: "Paramètres",
    href: "/admin/parametres",
    onglets: [{ href: "/admin/parametres", libelle: "Paramètres" }],
  },
];

/** `/admin` n'englobe pas ses sous-pages : c'est un onglet comme un autre. */
function couvre(href: string, chemin: string): boolean {
  if (href === "/admin") return chemin === "/admin";
  return chemin === href || chemin.startsWith(`${href}/`);
}

/** L'onglet de l'écran courant, ou `null` (fiche d'une organisation…). */
export function ongletActif(chemin: string): Onglet | null {
  for (const r of RUBRIQUES) for (const o of r.onglets) if (couvre(o.href, chemin)) return o;
  return null;
}

/** La rubrique de l'écran courant : par ses onglets, puis par ses fiches. */
export function rubriqueActive(chemin: string): Rubrique | null {
  return (
    RUBRIQUES.find((r) => r.onglets.some((o) => couvre(o.href, chemin))) ??
    RUBRIQUES.find((r) => r.aussi?.some((a) => couvre(a, chemin))) ??
    null
  );
}
