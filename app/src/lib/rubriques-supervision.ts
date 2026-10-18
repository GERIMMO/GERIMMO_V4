// Menu du dirigeant : 17 destinations visibles, sans groupes ni accordéons.
export type Onglet = { href: string; libelle: string; badge?: "artisans" | "decisions"; exact?: boolean };
export type Rubrique = { cle: string; libelle: string; href: string; onglets: Onglet[]; aussi?: string[]; badge?: "artisans" | "decisions" };

export const RUBRIQUES: Rubrique[] = [
  { cle: "bureau", libelle: "Bureau de direction", href: "/admin/brief", onglets: [{ href: "/admin/brief", libelle: "Bureau de direction", exact: true }] },
  { cle: "decisions", libelle: "Décisions à prendre", href: "/admin/brief?vue=decisions", badge: "decisions", onglets: [{ href: "/admin/brief?vue=decisions", libelle: "Décisions à prendre", badge: "decisions" }] },
  { cle: "comptes-rendus", libelle: "Équipes et comptes rendus", href: "/admin/brief?vue=equipes", onglets: [{ href: "/admin/brief?vue=equipes", libelle: "Comptes rendus" }], aussi: ["/admin/brief"] },
  { cle: "utilisateurs", libelle: "Utilisateurs", href: "/admin/clients", onglets: [{ href: "/admin/clients", libelle: "Utilisateurs" }, { href: "/admin/marque-blanche", libelle: "Personnalisation des agences" }], aussi: ["/admin/organisations", "/admin/comptes"] },
  { cle: "dossiers", libelle: "Activité et dossiers", href: "/admin/autonomie?vue=dossiers", onglets: [{ href: "/admin/autonomie?vue=dossiers", libelle: "Activité et dossiers" }], aussi: ["/admin/autonomie"] },
  { cle: "artisans", libelle: "Réseau d’artisans", href: "/admin/artisans", badge: "artisans", onglets: [{ href: "/admin/artisans", libelle: "Inscriptions et validations", badge: "artisans" }, { href: "/admin/couverture", libelle: "Couverture du réseau" }], aussi: ["/admin/clients/artisans"] },
  { cle: "assistance", libelle: "Assistance clients", href: "/admin/retours", onglets: [{ href: "/admin/retours", libelle: "Demandes et suivi" }] },
  { cle: "finances", libelle: "Abonnements et finances", href: "/admin", onglets: [{ href: "/admin", libelle: "Abonnements et finances" }] },
  { cle: "marketing", libelle: "Marketing et contenus", href: "/admin/marketing", onglets: [{ href: "/admin/marketing", libelle: "Communication et résultats" }, { href: "/admin/publications", libelle: "Articles du site" }] },
  { cle: "commercial", libelle: "Développement commercial", href: "/admin/territoire", onglets: [{ href: "/admin/territoire", libelle: "Développement territorial" }, { href: "/admin/devis", libelle: "Demandes de contact" }] },
  { cle: "automatismes", libelle: "Automatismes et consignes", href: "/admin/equipes", onglets: [{ href: "/admin/equipes", libelle: "Tâches automatiques" }, { href: "/admin/consignes", libelle: "Consignes du dirigeant" }] },
  { cle: "relais", libelle: "Vacances et relais", href: "/admin/relais", onglets: [{ href: "/admin/relais", libelle: "Vacances et relais" }] },
  { cle: "produit", libelle: "Améliorations du produit", href: "/admin/autonomie?vue=ameliorations", onglets: [{ href: "/admin/autonomie?vue=ameliorations", libelle: "Améliorations du produit" }] },
  { cle: "sante", libelle: "Santé et connexions", href: "/admin/sante", onglets: [{ href: "/admin/sante", libelle: "Santé et connexions" }] },
  { cle: "securite", libelle: "Sécurité et conformité", href: "/admin/securite", onglets: [{ href: "/admin/securite", libelle: "Accès et données" }, { href: "/admin/veille", libelle: "Veille réglementaire" }] },
  { cle: "historique", libelle: "Historique et sauvegardes", href: "/admin/journaux", onglets: [{ href: "/admin/journaux", libelle: "Historique et sauvegardes" }] },
  { cle: "parametres", libelle: "Paramètres généraux", href: "/admin/parametres", onglets: [{ href: "/admin/parametres", libelle: "Paramètres généraux" }] },
];

// Les vues ont priorité sur la page générique ; les filtres ne changent pas
// de rubrique. Le préfixe le plus précis gagne pour les fiches imbriquées.
function pertinence(onglet: Onglet, chemin: string, recherche: string): number {
  const cible = new URL(onglet.href, "https://gerimmo.invalid");
  if (!(chemin === cible.pathname || (!onglet.exact && cible.pathname !== "/admin" && chemin.startsWith(`${cible.pathname}/`)))) return -1;
  const courante = new URLSearchParams(recherche);
  for (const [cle, valeur] of cible.searchParams) if (courante.get(cle) !== valeur) return -1;
  return cible.pathname.length + cible.searchParams.size * 1000;
}
export function rubriqueActive(chemin: string, recherche = ""): Rubrique | null {
  let active: Rubrique | null = null;
  let meilleur = -1;
  for (const r of RUBRIQUES) for (const o of [...r.onglets, ...(r.aussi ?? []).map(href => ({ href, libelle: r.libelle }))]) {
    const score = pertinence(o, chemin, recherche);
    if (score > meilleur) { meilleur = score; active = r; }
  }
  return active;
}
export function ongletActif(chemin: string, recherche = ""): Onglet | null {
  return rubriqueActive(chemin, recherche)?.onglets.filter(o => pertinence(o, chemin, recherche) >= 0).sort((a, b) => pertinence(b, chemin, recherche) - pertinence(a, chemin, recherche))[0] ?? null;
}
