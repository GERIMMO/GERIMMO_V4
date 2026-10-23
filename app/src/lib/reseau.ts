/**
 * Décision du dirigeant du 23/10/2026 (migration 20261023180000) : le réseau d'artisans suit la zone (codes postaux ou
 * départements) et les métiers que chaque artisan choisit lui-même. Plus d'ouverture commune × métier par la supervision,
 * donc plus d'état « fermée » : sans artisan proposé pour ce bien, ce métier et ces travaux, l'état est « sans_artisan ».
 */
export const RESEAU_SANS_ARTISAN = "Aucun artisan du réseau n’est actuellement disponible pour ce métier et ces travaux dans cette zone. Vous ne pouvez pas envoyer de nouvelle demande au réseau pour le moment.";

export type DisponibiliteReseau = {
  metier: string;
  nature: string;
  etat: "adresse_incomplete" | "sans_artisan" | "ouverte";
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

/**
 * Audit du 13/10, PRO2-01, décision D17 (option A) : un propriétaire sans artisan du réseau pour ce bien et ces
 * travaux, et qui n'a aucun artisan dans son carnet, ne peut rien solliciter. L'écran lui montre alors la voie de
 * sortie (clôturer, inviter ou appeler lui-même un artisan, signaler son intérêt) au lieu d'un bouton grisé seul.
 * Un agent d'agence garde son carnet et la possibilité d'y ajouter un artisan : il n'est pas dans une impasse.
 */
export function voieDeSortieAffichee(d: DisponibiliteReseau, estProprietaire: boolean): boolean {
  return estProprietaire && d.etat === "sans_artisan" && d.nb_contacts === 0;
}

export function messageDisponibilite(d: DisponibiliteReseau): string {
  if (d.etat === "adresse_incomplete") return "Complétez l’adresse du bien et confirmez sa commune pour vérifier la disponibilité du réseau.";
  if (d.etat === "sans_artisan") return RESEAU_SANS_ARTISAN;
  return `${d.nb_artisans} artisan${d.nb_artisans > 1 ? "s" : ""} du réseau disponible${d.nb_artisans > 1 ? "s" : ""} pour ce métier et ces travaux à ${d.commune_nom}.`;
}

export type CandidatReseau = { id: string; raison_sociale: string; statut_plateforme: string; siret_etat: string; visibilite: string; account_id: string | null; blacklist_globale_le: string | null };
export function statutCandidat(a: CandidatReseau) {
  if (a.blacklist_globale_le) return "Exclu du réseau";
  if (a.statut_plateforme !== "valide") return a.statut_plateforme === "refuse" ? "Validation refusée" : "Validation à examiner";
  if (a.siret_etat !== "verifie") return "SIRET à vérifier";
  if (a.visibilite !== "publique") return "Profil privé";
  if (!a.account_id) return "Compte artisan à activer";
  return "Proposé dans sa zone";
}

/** Ce que l'artisan voit dans « Mon entreprise » : ce qui lui manque pour être proposé par le réseau Gerimmo. */
export type FichePresenceReseau = {
  statut_plateforme: string;
  siret_etat: string;
  visibilite: string;
  metiers: string[] | null;
  codes_postaux: string[] | null;
};
export type ConditionPresence = {
  cle: "validation" | "siret" | "public" | "metier" | "zone" | "exclusion";
  libelle: string;
  remplie: boolean;
  aide: string;
  /** Ce qui manque, à lire dans « Il vous manque : … » (relecture produit du 23/10, M-1). */
  manque: string;
};

/**
 * Les conditions qui dépendent de l'artisan ou de Gerimmo, dans l'ordre où il les remplit. Mêmes règles que la base
 * (`reseau_artisan_eligible`) : inscription validée, SIRET vérifié, profil public, au moins un métier, une zone, et pas
 * d'exclusion du réseau par Gerimmo (liste noire globale, lue par `artisan_exclusion_plateforme` : `exclu`). La
 * condition d'exclusion ne s'affiche que si elle manque. Le compte est acquis (l'artisan est connecté) ; la décennale
 * dépend des travaux, et la liste noire d'un client ne regarde que ce client : l'écran les mentionne à part.
 */
export function presenceReseau(fiche: FichePresenceReseau, exclu = false): { propose: boolean; conditions: ConditionPresence[] } {
  const conditions: ConditionPresence[] = [
    {
      cle: "validation", libelle: "Inscription validée par Gerimmo", remplie: fiche.statut_plateforme === "valide",
      aide: fiche.statut_plateforme === "refuse" ? "Votre inscription a été refusée : le motif figure sur cette page." : "Gerimmo relit votre inscription et vos attestations.",
      manque: "la validation de votre inscription par Gerimmo",
    },
    { cle: "siret", libelle: "SIRET vérifié", remplie: fiche.siret_etat === "verifie", aide: "La vérification est faite par Gerimmo.", manque: "la vérification de votre SIRET par Gerimmo" },
    {
      cle: "public", libelle: "Profil public", remplie: fiche.visibilite === "publique",
      aide: "La validation ne rend pas votre profil public : vous seul le décidez, dans « Qui peut me solliciter ».",
      manque: "un profil public",
    },
    { cle: "metier", libelle: "Au moins un métier", remplie: (fiche.metiers ?? []).length > 0, aide: "Dans « Mes métiers et ma zone ».", manque: "au moins un métier" },
    {
      cle: "zone", libelle: "Une zone d’intervention", remplie: (fiche.codes_postaux ?? []).length > 0,
      aide: "Des codes postaux ou des départements entiers, dans « Mes métiers et ma zone ».",
      manque: "une zone d’intervention",
    },
  ];
  if (exclu) {
    conditions.push({
      cle: "exclusion", libelle: "Pas d’exclusion du réseau par Gerimmo", remplie: false,
      aide: "Gerimmo vous a exclu du réseau : vous n’êtes plus proposé. Pour en parler, écrivez-nous depuis la page Assistance.",
      manque: "la levée de votre exclusion du réseau par Gerimmo",
    });
  }
  return { propose: conditions.every((c) => c.remplie), conditions };
}

/**
 * Le rappel de « Aujourd'hui » : rien quand l'artisan est proposé ; un ton informatif quand seule la visibilité manque
 * (rester privé est un choix, par exemple pour un artisan invité par un propriétaire) ; un avertissement sinon.
 */
export function rappelPresenceReseau(p: { propose: boolean; conditions: ConditionPresence[] }): { ton: "information" | "avertissement"; texte: string } | null {
  if (p.propose) return null;
  const manquantes = p.conditions.filter((c) => !c.remplie);
  if (manquantes.length === 1 && manquantes[0].cle === "public") {
    return { ton: "information", texte: "Votre profil est privé : seuls les clients qui vous ont ajouté à leur carnet peuvent vous solliciter. Pour être proposé aux propriétaires de votre zone, rendez-le public." };
  }
  return { ton: "avertissement", texte: `Vous n’êtes pas encore proposé dans le réseau Gerimmo. Il vous manque : ${manquantes.map((c) => c.manque).join(" ; ")}.` };
}
