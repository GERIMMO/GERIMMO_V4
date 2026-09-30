// LES OPTIONS DES COOKIES DE SESSION SUPABASE — les mêmes pour les trois
// clients (navigateur, serveur, proxy), audit du 30/09 (B1).
//
// @supabase/ssr pose déjà `path=/` et `SameSite=Lax`, mais pas `Secure` :
// la session pouvait partir en clair si une page http était servie. En
// production, le cookie n'est envoyé qu'en https ; en local (http), il doit
// rester lisible. `httpOnly` reste faux : le client navigateur lit la session.
// Les options fournies s'AJOUTENT aux défauts de la bibliothèque (path,
// maxAge) : elles ne les remplacent pas.

import type { CookieOptionsWithName } from "@supabase/ssr";

export const COOKIES_SESSION: CookieOptionsWithName = {
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
};
