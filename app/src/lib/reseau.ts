export const RESEAU_FERME = "Le réseau d’artisans Gerimmo n’est pas encore disponible pour ce métier dans cette zone.";

export type DisponibiliteReseau = {
  metier: string;
  nature: string;
  etat: "adresse_incomplete" | "fermee" | "sans_artisan" | "ouverte";
  commune_code: string | null;
  commune_nom: string | null;
  nb_artisans: number;
  nb_contacts: number;
  interet_enregistre: boolean;
};
export type CommuneReseau = { code: string; nom: string; codes_postaux: string[]; departement: string };

/**
 * Même normalisation que `reseau_nom_commune` en base (audit gestion du
 * 29/09) : casse, accents, ligatures, tirets et apostrophes ignorés ;
 * « St »/« Ste » valent « Saint »/« Sainte » ; « Cedex » et l'arrondissement
 * (« Paris 12e ») sont retirés.
 */
export function nomCommuneNormalise(nom: string | null | undefined): string {
  return (nom ?? "")
    .replace(/œ/g, "oe").replace(/Œ/g, "oe").replace(/æ/g, "ae").replace(/Æ/g, "ae")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+cedex(\s*\d+)?\s*$/, "")
    .replace(/\s*\d+\s*(er|e|eme)?(\s*arrondissement)?\s*$/, "")
    .replace(/(^|[^a-z0-9])ste(?=[^a-z0-9]|$)/g, "$1sainte")
    .replace(/(^|[^a-z0-9])st(?=[^a-z0-9]|$)/g, "$1saint")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * La commune qui s'impose pour un code postal et une ville : la seule
 * desservie par ce code postal, ou la seule qui porte le nom saisi. Sinon
 * (plusieurs candidates, aucune au bon nom), rien — l'utilisateur choisit.
 */
export function communeEvidente(communes: CommuneReseau[], ville: string | null | undefined): CommuneReseau | null {
  if (communes.length === 1) return communes[0];
  const cible = nomCommuneNormalise(ville);
  if (!cible) return null;
  const memeNom = communes.filter((c) => nomCommuneNormalise(c.nom) === cible);
  return memeNom.length === 1 ? memeNom[0] : null;
}
export type LignePilotageReseau = {
  commune_code: string; nom: string; ouverte: boolean; preparee: boolean;
  artisans: number; eligibles: number; interets: number; biens_interesses: number; demandes: number;
};

export function messageDisponibilite(d: DisponibiliteReseau): string {
  if (d.etat === "adresse_incomplete") return "Complétez l’adresse du bien et confirmez sa commune pour vérifier la disponibilité du réseau.";
  if (d.etat === "sans_artisan") return "Aucun artisan du réseau n’est actuellement disponible pour ce métier et ces travaux dans cette zone. Vous ne pouvez pas envoyer de nouvelle demande au réseau pour le moment.";
  if (d.etat === "fermee") return RESEAU_FERME;
  return `${d.nb_artisans} artisan${d.nb_artisans > 1 ? "s" : ""} du réseau disponible${d.nb_artisans > 1 ? "s" : ""} pour ce métier et ces travaux à ${d.commune_nom}.`;
}

export type CandidatReseau = { id: string; raison_sociale: string; statut_plateforme: string; siret_etat: string; visibilite: string; account_id: string | null; blacklist_globale_le: string | null };
export function statutCandidat(a: CandidatReseau) {
  if (a.blacklist_globale_le) return "Exclu du réseau";
  if (a.statut_plateforme !== "valide") return a.statut_plateforme === "refuse" ? "Validation refusée" : "Validation à examiner";
  if (a.siret_etat !== "verifie") return "SIRET à vérifier";
  if (a.visibilite !== "publique") return "Profil privé";
  if (!a.account_id) return "Compte artisan à activer";
  return "Éligible au réseau";
}
