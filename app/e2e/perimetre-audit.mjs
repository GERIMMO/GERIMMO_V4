// Périmètre des audits opérationnels du site publié (audit-production.mjs et audit-lecture-live.mjs).
//
// Ce module ne contient que de la logique pure, sans navigateur ni accès au réseau : les deux scripts le partagent, et
// tests/audit-perimetre.test.ts le vérifie. Il répond à trois questions :
//  · quelles adresses un profil a-t-il le droit de parcourir (et donc de suivre pendant l'exploration) ?
//  · quelle page de code correspond à une adresse visitée (le « patron » de l'adresse) ?
//  · l'exploration d'un profil a-t-elle réellement parcouru ses écrans, ou s'est-elle arrêtée à l'accueil sans le dire ?

import fs from "node:fs";
import path from "node:path";

/** La page « Mes espaces » et les pages communes à tous les profils connectés. */
const COMMUNES = ["/espaces", "/compte", "/assistance"];

/**
 * Les racines d'adresses que chaque profil parcourt.
 * Les écrans de gestion vivent sous `/agence/<id>` pour une agence et ses agents, sous `/espace/<id>` pour le propriétaire
 * direct (décision D27 : `/espaces` le redirige vers `/espace/<id>`, et `/agence/<id>` vers `/espace/<id>` à vie).
 */
export const RACINES = {
  agent: ["/agence/", ...COMMUNES],
  admin: ["/agence/", ...COMMUNES],
  locataire: ["/locataire/", ...COMMUNES, "/quittance/", "/attestation-loyer/"],
  proprietaire: ["/espace/", ...COMMUNES],
  artisan: ["/artisan", ...COMMUNES],
};

/** Ce que la connexion doit afficher pour être réussie : l'une des pages d'arrivée d'un profil connecté. */
export const ARRIVEE_APRES_CONNEXION = /\/(espaces?|agence|locataire|artisan)/;

/** Les adresses qui ne sont pas des écrans (API, fichiers, exports) : jamais explorées. */
export const IGNOREES = /\/(api|auth\/|comptabilite\/export|documents\/[^/]+\/fichier|bail\/fichier|attestations\/[^/]+\/fichier)(\/|$)|\/modele$/;

/** Cette adresse est-elle parcourable par ce profil ? (`persona.nom`, `persona.racines`) */
export function admissible(persona, pathname) {
  if (IGNOREES.test(pathname)) return false;
  if (persona.nom === "public") return !/^\/(admin|agence|artisan|locataire|compte|espaces?|securite)(\/|$)/.test(pathname);
  return persona.racines.some((racine) => pathname === racine || pathname.startsWith(racine));
}

/** audit-lecture-live : l'adresse est-elle sous la racine du profil, ou la page de compte ? */
export function permis(pathname, prefixe) {
  return pathname.startsWith(prefixe) || pathname === "/compte";
}

/** L'adresse appartient-elle aux écrans de gestion (`/agence/<id>…` ou `/espace/<id>…`) ? */
export function estCheminDeGestion(chemin) {
  return /^\/(agence|espace)\/[^/?#]+/.test(chemin);
}

/** Le chemin sous la racine des dossiers (la route réelle) : « /espace/<id>/x » devient « /agence/<id>/x ». */
export function versRouteAgence(chemin) {
  return chemin.replace(/^\/espace\/([^/?#]+)/, "/agence/$1");
}

/** Les routes du code : une par `page.tsx` de `src/app` (`/agence/[orgId]/parc`, `/espaces`…). Il n'existe pas de dossier `espace`. */
export function routesDuCode(racineApp) {
  const pages = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
      const complet = path.join(dir, item.name);
      return item.isDirectory() ? pages(complet) : item.name === "page.tsx" ? [complet] : [];
    });
  return pages(racineApp).map((fichier) => fichier.slice(racineApp.length).replace(/\/page\.tsx$/, "") || "/");
}

/**
 * Fabrique la recherche du « patron » d'une adresse à partir des routes du code (`/agence/[orgId]/parc`) :
 * `patron("/agence/<id>/parc")` rend `/agence/[orgId]/parc`, ou null si aucune page ne correspond.
 */
export function fabriquerPatron(routes) {
  const patrons = routes.map((route) => ({
    route,
    regex: new RegExp(`^${route.replace(/\[[^/]+\]/g, "[^/]+")}/?$`),
  }));
  return (pathname) => patrons.find((p) => p.regex.test(versRouteAgence(pathname)))?.route ?? null;
}

/**
 * Le profil a-t-il parcouru au moins un écran de sa propre racine ? Rend le message d'échec, ou null si tout va bien.
 * `chemins` : les adresses réellement visitées pendant l'exploration.
 */
export function controleCouverture(profil, chemins, racinesDuProfil) {
  const visites = chemins.filter((chemin) => racinesDuProfil.some((racine) => chemin.startsWith(racine)));
  if (visites.length > 0) return null;
  return `${profil} : aucun écran visité sous ${racinesDuProfil.join(" ou ")}`;
}

/** La racine propre à chaque profil : l'exploration doit y visiter au moins un écran. */
export const RACINE_PROPRE = {
  agent: "/agence/",
  admin: "/agence/",
  proprietaire: "/espace/",
  locataire: "/locataire/",
  artisan: "/artisan",
};

/** audit-production : les profils explorés, avec leur compte de démonstration et leurs pages de départ. */
export const PERSONAS = [
  { nom: "public", departs: ["/", "/connexion", "/inscription", "/journal", "/conditions", "/confidentialite", "/tarifs", "/outils", "/outils/calcul-irl", "/outils/quittance-de-loyer", "/outils/comparateur-gli-visale", "/outils/simulateur-lmnp", "/outils/rentabilite-locative", "/mentions-legales", "/mot-de-passe-oublie"] },
  { nom: "agent", email: "agent.alpha@gerimmo-demo.fr", departs: ["/espaces"], racines: RACINES.agent },
  { nom: "admin", email: "admin.alpha@gerimmo-demo.fr", departs: ["/espaces"], racines: RACINES.admin },
  { nom: "locataire", email: "locataire.alpha@gerimmo-demo.fr", departs: ["/espaces"], racines: RACINES.locataire },
  { nom: "proprietaire", email: "proprietaire@gerimmo-demo.fr", departs: ["/espaces"], racines: RACINES.proprietaire },
  { nom: "artisan", email: "artisan.alpha@gerimmo-demo.fr", departs: ["/espaces", "/artisan"], racines: RACINES.artisan },
];

/** audit-lecture-live : [profil, e-mail de démonstration, racine que l'exploration peut suivre]. */
export const COMPTES_LECTURE = [
  ["agent", "agent.alpha@gerimmo-demo.fr", "/agence/"],
  ["admin-agence", "admin.alpha@gerimmo-demo.fr", "/agence/"],
  ["locataire", "locataire.alpha@gerimmo-demo.fr", "/locataire/"],
  ["artisan", "artisan.alpha@gerimmo-demo.fr", "/artisan"],
  ["proprietaire", "proprietaire@gerimmo-demo.fr", "/espace/"],
];
