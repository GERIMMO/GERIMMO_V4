// LES OPTIONS DES COOKIES DE SESSION SUPABASE — les mêmes pour les trois
// clients (navigateur, serveur, proxy), audit du 30/09 (B1).
//
// @supabase/ssr pose déjà `path=/` et `SameSite=Lax`, mais pas `Secure` :
// la session pouvait partir en clair si une page http était servie. En
// production (site en https), le cookie n'est envoyé qu'en https ; sur un banc
// servi en http (CI : `NEXT_PUBLIC_SITE_URL=http://localhost:3100`, build de
// production), il doit rester lisible — d'où le protocole du site, pas
// NODE_ENV. `httpOnly` reste faux : le client navigateur lit la session.
// Les options fournies s'AJOUTENT aux défauts de la bibliothèque (path,
// maxAge) : elles ne les remplacent pas.
//
// 14/10/2026 (X03, AUD-B-03) : `Secure` ne dépend plus de la seule adresse du
// site. Si cette variable était absente ou posée en http, la session de
// production circulait en clair sans qu'aucune alerte le dise. Le drapeau se
// dérive aussi de l'environnement de production de la plateforme
// (`VERCEL_ENV === "production"`, que seule Vercel pose) : il est vrai si
// l'UNE ou l'AUTRE condition l'est, donc jamais moins strict qu'avant.
// NODE_ENV ne sert toujours pas : la CI et le banc servent une construction
// de production en http.
//
// Côté navigateur, seules les variables NEXT_PUBLIC_* sont incorporées au
// code. `next.config.ts` déclare donc `env.NEXT_PUBLIC_VERCEL_ENV`, dérivée de
// `VERCEL_ENV` (toujours présente pendant la construction sur Vercel) : le
// navigateur reçoit l'environnement de production sans aucun réglage du
// tableau de bord (relecture du 14/10/2026 ; tests/next-config-env-navigateur.test.ts).
// Le serveur et le proxy, eux, lisent `VERCEL_ENV` à l'exécution.

import type { CookieOptionsWithName } from "@supabase/ssr";

/** Vrai si le site est servi en https OU si l'environnement est la production de la plateforme. */
export function cookieSessionSecurise(env: { adresseSite?: string; environnement?: string }): boolean {
  const enHttps = (env.adresseSite ?? "").startsWith("https://");
  const enProduction = env.environnement === "production";
  return enHttps || enProduction;
}

export const COOKIES_SESSION: CookieOptionsWithName = {
  // Accès statiques à process.env : seuls ceux-là sont incorporés au code du navigateur.
  secure: cookieSessionSecurise({
    adresseSite: process.env.NEXT_PUBLIC_SITE_URL,
    environnement: process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV,
  }),
  sameSite: "lax",
};
