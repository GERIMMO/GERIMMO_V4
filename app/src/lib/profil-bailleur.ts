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
