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

import type { CookieOptionsWithName } from "@supabase/ssr";

export const COOKIES_SESSION: CookieOptionsWithName = {
  secure: (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://"),
  sameSite: "lax",
};
