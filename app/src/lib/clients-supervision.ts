// LES CLIENTS, VUS DE LA SUPERVISION — le classement, sans écran ni réseau.
//
// POURQUOI (demande du porteur du projet, 19/09). La console n'avait pas de
// vue « clients » : les agences et les propriétaires vivaient en bas de la page
// de supervision, les artisans dans un écran de file d'attente nommé
// « Inscriptions artisan », et rien ne réunissait les trois. On ne pouvait pas
// répondre à « qui sont nos clients, et où en est chacun ? » sans ouvrir trois
// écrans.
//
// Trois familles, trois natures de relation :
//  · agence — cliente payante, ouverte après contrat par la supervision ;
//  · propriétaire bailleur — client direct, qui ouvre son espace lui-même ;
//  · artisan — inscrit libre, dont l'inscription se VALIDE (SIRET, assurances).
// Seuls les artisans ont une file d'attente : c'est elle qu'on met en évidence.

export type FamilleClient = "agence" | "proprietaire" | "artisan";

export const LIBELLES_FAMILLE: Record<FamilleClient, string> = {
  agence: "Agences",
  proprietaire: "Propriétaires bailleurs",
  artisan: "Artisans",
};

/** Une organisation est soit une agence, soit un propriétaire en direct. */
export function familleOrganisation(
  type: string | null | undefined
): "agence" | "proprietaire" {
  return type === "proprietaire_direct" ? "proprietaire" : "agence";
}

export const LIBELLES_STATUT_ARTISAN: Record<string, string> = {
  en_attente: "En attente de validation",
  valide: "Validé",
  refuse: "Refusé",
};

export const LIBELLES_SIRET: Record<string, string> = {
  verifie: "SIRET vérifié",
  non_verifie: "SIRET non vérifié",
  invalide: "SIRET invalide",
};

export const LIBELLES_VISIBILITE: Record<string, string> = {
  privee: "Visible des seules agences qui l'ont sollicité",
  publique: "Visible de toutes les agences",
};

/**
 * L'ordre de lecture de la liste des artisans : ce qui attend une décision
 * passe devant. Un refus se réexamine, donc il reste au-dessus des validés.
 */
export function rangArtisan(statut: string | null | undefined): number {
  if (statut === "en_attente") return 0;
  if (statut === "refuse") return 1;
  return 2;
}

export function trierArtisans<T extends { statut_plateforme?: string | null; raison_sociale?: string | null }>(
  artisans: T[]
): T[] {
  return [...artisans].sort(
    (a, b) =>
      rangArtisan(a.statut_plateforme) - rangArtisan(b.statut_plateforme) ||
      (a.raison_sociale ?? "").localeCompare(b.raison_sociale ?? "", "fr")
  );
}

/**
 * ENTRER DANS L'ESPACE D'UN CLIENT — ce que la plateforme sait faire, et ce
 * qu'elle ne sait PAS faire.
 *
 * Une organisation (agence, propriétaire) s'ouvre : la supervision traverse
 * ses écrans, et la traversée est journalisée (RM-A1.11, `log_sa_access`).
 *
 * Un artisan, NON — et ce n'est pas un oubli d'écran : son portail se lit
 * depuis `mon_artisan_id()`, déduite de `auth.uid()`, sans paramètre forgeable
 * (module 8). Il n'existe aucun mécanisme d'usurpation dans le produit, et on
 * n'en invente pas un pour une commodité de navigation. Sa fiche donne donc
 * tout ce que la supervision peut lire, décisions comprises, et le dit.
 */
export function cheminEspaceClient(client: {
  famille: FamilleClient;
  id: string;
}): string | null {
  return client.famille === "artisan" ? null : `/agence/${client.id}`;
}

/** Les initiales d'une pastille, à partir d'un nom d'entreprise ou de personne. */
export function initiales(nom: string | null | undefined): string {
  const mots = (nom ?? "").trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "◇";
  return mots
    .slice(0, 2)
    .map((m) => m[0])
    .join("")
    .toUpperCase();
}
