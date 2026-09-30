// LE DOUBLE JETON DU BOUTON /auth/confirmer (audit du 30/09, M1).
//
// Le bouton qui consomme un lien reçu par e-mail est un POST vers
// /auth/confirm. Sa garde d'origine (lib/meme-origine.ts) devait accepter
// `Origin: null` — la page est servie en `no-referrer` — et un vieux
// navigateur sans `Sec-Fetch-Site` ne permettait alors plus de distinguer
// notre page d'un formulaire posté depuis un site tiers (connexion forcée sur
// un compte qui n'est pas celui du visiteur).
//
// Le remède est un jeton aléatoire posé en cookie par /auth/confirm (GET) au
// moment de mener à la page du bouton, et recopié par la page dans un champ
// caché. Un site tiers ne lit pas nos cookies : il ne peut pas remplir le
// champ. Le POST exige l'égalité des deux, en temps constant.

import { randomBytes, timingSafeEqual } from "node:crypto";

export const COOKIE_CONFIRMATION = "gerimmo_confirmation";
/** Quinze minutes : le temps de lire la page et de cliquer, pas plus. */
export const DUREE_JETON_CONFIRMATION_S = 15 * 60;

export function nouveauJetonConfirmation(): string {
  return randomBytes(24).toString("base64url");
}

/** Les options du cookie : jamais lu par un script, limité au préfixe /auth, sûr en production. */
export function optionsCookieConfirmation(maxAge = DUREE_JETON_CONFIRMATION_S) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/auth",
    maxAge,
  };
}

/** Le champ caché vaut-il le cookie ? Comparaison en temps constant, faux si l'un manque. */
export function jetonConfirmationValide(cookie: string | undefined | null, champ: string | undefined | null): boolean {
  if (!cookie || !champ) return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(champ);
  return a.length === b.length && timingSafeEqual(a, b);
}
