/**
 * Ce qui manque au profil d'un propriétaire pour qu'il puisse créer un bien (décision D29 B, fiche DES-A-11).
 *
 * L'adresse reste facultative à l'inscription (inscription courte), mais le bail, les quittances et les avis
 * d'échéance désignent le bailleur et son domicile : tant que l'adresse (rue, code postal, ville) et l'e-mail de
 * contact manquent, « Créer un lot » est remplacé par « Complétez d'abord votre profil ». « Mes lots » vide annonce
 * ce détour dans son bouton au lieu de promettre « Créer mon premier bien ». Les deux écrans partagent cette règle :
 * ils ne peuvent pas se contredire.
 */
export type ProfilBailleur = {
  address_line1?: string | null;
  postal_code?: string | null;
  city?: string | null;
  email_contact?: string | null;
} | null;

const vide = (valeur: string | null | undefined) => !valeur || valeur.trim() === "";

/** Les éléments à compléter, en mots du propriétaire (« votre adresse », « votre e-mail de contact »). */
export function elementsManquantsDuBailleur(profil: ProfilBailleur | undefined): string[] {
  return [
    vide(profil?.address_line1) || vide(profil?.postal_code) || vide(profil?.city) ? "votre adresse" : null,
    vide(profil?.email_contact) ? "votre e-mail de contact" : null,
  ].filter((m): m is string => m !== null);
}

/**
 * Faut-il lire le profil pour choisir le bouton de « Mes lots » ? Seulement pour le propriétaire direct devant un parc
 * VIDE : aucun bien visible, aucun bien retiré (sinon l'écran n'est pas l'état vide), pas de portefeuille d'agent, et un
 * parc lisible (un parc illisible ressemble à un parc vide : l'écran n'affiche alors aucun bouton de création).
 */
export function doitLireLeProfilBailleur(ecran: {
  role: string;
  erreurBiens: boolean;
  portefeuille: boolean;
  nbBiensVisibles: number;
  nbBiensRetires: number;
}): boolean {
  return ecran.role === "proprietaire_direct" && !ecran.erreurBiens && !ecran.portefeuille && ecran.nbBiensVisibles === 0 && ecran.nbBiensRetires === 0;
}

export type BoutonPremierBien = { libelle: string; href: string; detourParProfil: boolean };

/**
 * Le bouton de l'état vide de « Mes lots ». `base` est l'adresse de l'espace (« /agence/<id> », ou « /espace/<id> » une
 * fois la décision D27 en place) : les deux liens en partent, il n'y a donc qu'un endroit où la poser.
 *
 * Le détour par le profil n'est annoncé que si la lecture a réussi ET qu'il manque quelque chose. Une lecture en échec
 * ne dit rien du profil : le bouton habituel s'affiche, et la porte de « Créer un lot » décidera (elle relit le profil).
 */
export function boutonPremierBien({ base, manquants, erreurLecture }: { base: string; manquants: string[]; erreurLecture: boolean }): BoutonPremierBien {
  if (!erreurLecture && manquants.length > 0) {
    return { libelle: "Compléter mon profil pour créer un bien", href: `${base}/profil?retour=nouveau-lot`, detourParProfil: true };
  }
  return { libelle: "Créer mon premier bien", href: `${base}/parc/nouveau`, detourParProfil: false };
}
