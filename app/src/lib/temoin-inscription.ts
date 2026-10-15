// LE TÉMOIN D'INSCRIPTION (troisième relecture du 15/10/2026, constat « compte pré-inscrit »).
//
// Le mot de passe d'une inscription est choisi AVANT que l'adresse soit prouvée. Pour une adresse inscrite mais jamais
// confirmée, quiconque la connaît (un invitant, par exemple) peut réinscrire l'adresse avec SON mot de passe : le seul
// lien valide part alors dans la boîte du titulaire, qui le clique et ouvre un compte dont un tiers connaît le mot de
// passe. Le dernier inscrit gagnait, quel qu'il soit.
//
// Le remède lie la confirmation au navigateur de l'inscription. L'inscription pose un témoin aléatoire en cookie
// (httpOnly, limité au préfixe /auth) et garde son EMPREINTE dans le compte. Au clic sur le bouton de confirmation, le
// cookie présent doit correspondre à l'empreinte : la personne qui confirme est celle qui a choisi le mot de passe,
// dans ce navigateur. Sinon, le mot de passe choisi avant la confirmation est remplacé par un mot de passe aléatoire,
// que personne ne connaît, posé par la session que le bouton vient d'ouvrir, et la personne qui vient de prouver la
// possession de la boîte choisit le sien (lib/lien-mot-de-passe.ts, route /auth/confirm).
//
// OÙ VIT L'EMPREINTE (contre-relecture finale du 15/10/2026). Dans `user_metadata`, écrite avec le mot de passe dans
// la MÊME opération d'Auth : la création du compte par `generateLink` (qui ne sait écrire que `user_metadata`), ou
// `updateUserById` pour une adresse pré-inscrite. Poser l'empreinte à part (dans `app_metadata`, par un second appel)
// séparait le couple et obligeait à un appel d'administration sur chaque inscription neuve. La sûreté ne repose pas
// sur le secret de l'empreinte (un condensé) ni sur qui peut l'écrire : sans le témoin, que seul le navigateur de
// l'inscription détient (cookie httpOnly), aucune empreinte ne donne « même navigateur » — une empreinte posée par un
// autre ne mène qu'au choix du mot de passe.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const COOKIE_INSCRIPTION = "gerimmo_inscription";
/** La clé de `user_metadata` qui porte l'empreinte du témoin, effacée à la confirmation. */
export const CLE_EMPREINTE_INSCRIPTION = "empreinte_inscription";
/** /mot-de-passe-oublie?raison=… : l'adresse est confirmée, mais le mot de passe n'a pas pu être choisi dans la foulée. */
export const RAISON_ADRESSE_CONFIRMEE = "adresse-confirmee";
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
