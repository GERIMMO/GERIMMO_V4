// Compatibilité avec les témoins d'inscription historiques du 15/10/2026.
// Le parcours courant crée un secret inconnu, puis demande le mot de passe après
// preuve e-mail. Il efface les anciens témoins et ne les utilise plus pour
// dispenser du choix explicite. Ces helpers restent pour les liens et tests historiques.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const COOKIE_INSCRIPTION = "gerimmo_inscription";
/** La clé de `user_metadata` qui porte l'empreinte du témoin, effacée à la confirmation. */
export const CLE_EMPREINTE_INSCRIPTION = "empreinte_inscription";
/** /mot-de-passe-oublie?raison=… : l'adresse est confirmée, mais le mot de passe n'a pas pu être choisi dans la foulée. */
export const RAISON_ADRESSE_CONFIRMEE = "adresse-confirmee";
/** /nouveau-mot-de-passe?motif=… : la confirmation d'une inscription de Gerimmo. */
export const MOTIF_INSCRIPTION = "inscription";
/** /nouveau-mot-de-passe?motif=… : tout autre lien (récupération, invitation, connexion) qui vient de confirmer l'adresse. */
export const MOTIF_CONFIRMATION = "confirmation";
/** Deux jours : plus long que la validité d'un lien de confirmation. */
export const DUREE_TEMOIN_INSCRIPTION_S = 2 * 24 * 60 * 60;

export function nouveauTemoinInscription(): string {
  return randomBytes(32).toString("base64url");
}

/** L'empreinte gardée dans le compte : le témoin lui-même ne quitte jamais le navigateur et le serveur. */
export function empreinteTemoinInscription(temoin: string): string {
  return createHash("sha256").update(temoin, "utf8").digest("hex");
}

/** Le cookie présent est-il le témoin de l'inscription en cours ? Comparaison en temps constant, faux si l'un manque. */
export function temoinInscriptionValide(temoin: string | undefined | null, empreinte: unknown): boolean {
  if (!temoin || typeof empreinte !== "string" || !/^[0-9a-f]{64}$/.test(empreinte)) return false;
  const a = Buffer.from(empreinteTemoinInscription(temoin), "hex");
  const b = Buffer.from(empreinte, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Les options du cookie : jamais lu par un script, envoyé au seul préfixe /auth (le bouton de confirmation). */
export function optionsCookieInscription(maxAge = DUREE_TEMOIN_INSCRIPTION_S) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/auth",
    maxAge,
  };
}

/** Un mot de passe que personne ne connaît : il ferme le compte jusqu'au choix de la personne qui a confirmé. */
export function motDePasseInconnu(): string {
  // Préfixe fixe : satisfait une politique qui exigerait minuscule, majuscule, chiffre et symbole.
  return `Aa1!-${randomBytes(48).toString("base64url")}`;
}
