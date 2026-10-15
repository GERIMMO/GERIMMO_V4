// LE TÉMOIN D'INSCRIPTION (troisième relecture du 15/10/2026, constat « compte pré-inscrit »).
//
// Le mot de passe d'une inscription est choisi AVANT que l'adresse soit prouvée. Pour une adresse inscrite mais jamais
// confirmée, quiconque la connaît (un invitant, par exemple) peut réinscrire l'adresse avec SON mot de passe : le seul
// lien valide part alors dans la boîte du titulaire, qui le clique et ouvre un compte dont un tiers connaît le mot de
// passe. Le dernier inscrit gagnait, quel qu'il soit.
//
// Le remède lie la confirmation au navigateur de l'inscription. L'inscription pose un témoin aléatoire en cookie
// (httpOnly, limité au préfixe /auth) et garde son EMPREINTE dans le compte (`app_metadata`, que seul le serveur
// écrit). Au clic sur le bouton de confirmation, le cookie présent doit correspondre à l'empreinte : la personne qui
// confirme est celle qui a choisi le mot de passe, dans ce navigateur. Sinon, le mot de passe choisi avant la
// confirmation est remplacé par un mot de passe aléatoire, que personne ne connaît, et la personne qui vient de prouver
// la possession de la boîte choisit le sien (lib/lien-mot-de-passe.ts, route /auth/confirm).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const COOKIE_INSCRIPTION = "gerimmo_inscription";
/** La clé de `app_metadata` qui porte l'empreinte du témoin, effacée à la confirmation. */
export const CLE_EMPREINTE_INSCRIPTION = "empreinte_inscription";
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
