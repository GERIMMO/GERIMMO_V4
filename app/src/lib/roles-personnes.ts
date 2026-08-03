// Une fiche personne n'a pas de rôle en propre (module 0b) : le rôle se déduit
// de ce que la personne EST dans les données — elle détient un lot, elle occupe
// un logement, elle se porte garante. La liste des personnes doit le dire,
// sinon treize noms par ordre alphabétique n'apprennent rien, et cent noms
// deviennent inutilisables.

export type LiensPersonnes = {
  /** person_id avec une détention en cours */
  proprietaires: ReadonlySet<string>;
  /** person_id mandant d'un mandat actif */
  mandants: ReadonlySet<string>;
  /** person_id locataire (principal ou colocataire) d'un bail vivant */
  locataires: ReadonlySet<string>;
  /** person_id garant sur un bail vivant */
  garants: ReadonlySet<string>;
};

export type RolePersonne = {
  libelle: string;
  /** Classe de texte, charte §04 : texte coloré, jamais de pastille. */
  classe: string;
};

// L'ordre est celui de la lecture : d'abord ce que la personne possède, puis
// ce qu'elle occupe, puis ce qu'elle garantit.
export function rolesDePersonne(personId: string, liens: LiensPersonnes): RolePersonne[] {
  const roles: RolePersonne[] = [];
  if (liens.proprietaires.has(personId) || liens.mandants.has(personId)) {
    roles.push({
      // Le mandat est l'information qui compte pour l'agence : un propriétaire
      // sous mandat est un client, un propriétaire sans mandat est un prospect.
      libelle: liens.mandants.has(personId) ? "Propriétaire · mandat" : "Propriétaire",
      classe: "text-foreground",
    });
  }
  if (liens.locataires.has(personId)) {
    roles.push({ libelle: "Locataire", classe: "text-success-soft-foreground" });
  }
  if (liens.garants.has(personId)) {
    roles.push({ libelle: "Garant", classe: "text-muted-foreground" });
  }
  return roles;
}

// Recherche insensible aux accents et à la casse : « helene » trouve
// « Hélène », « dasilva » trouve « DASILVA ».
export function normaliser(texte: string): string {
  return texte
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function correspond(recherche: string, ...champs: (string | null | undefined)[]): boolean {
  const aiguille = normaliser(recherche.trim());
  if (!aiguille) return true;
  const botte = normaliser(champs.filter(Boolean).join(" "));
  // Chaque mot de la recherche doit se retrouver quelque part : « leroy sab »
  // trouve « LEROY Sabine », dans n'importe quel ordre.
  return aiguille.split(/\s+/).every((mot) => botte.includes(mot));
}
