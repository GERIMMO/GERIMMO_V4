/**
 * Garde des adresses de la supervision (audit du 13/10, PRF-04, décision D44).
 *
 * Jusqu'ici, la porte de `/admin/*` vivait dans le seul layout (`admin/layout.tsx`). Or un layout ne
 * contrôle pas le rendu du reste de la route : la page peut s'exécuter en même temps que lui, et sa
 * charge utile partir avant la redirection (documentation de Next.js, guide « Authentication »,
 * section « Layouts and auth checks »). Aucune fuite n'a été constatée — chaque page lit avec la
 * session de l'utilisateur, donc sous la RLS — mais une page qui lirait un jour sans elle enverrait
 * ses données à n'importe quel compte connecté.
 *
 * Le proxy tranche donc avant tout rendu. Cette fonction ne dit que « est-ce une adresse de la
 * supervision ? » ; la décision (rôle + second facteur) est `estSuperviseurActif` (lib/mfa.ts),
 * le miroir exact de `public.is_super_admin()`.
 */

/**
 * Le premier segment de l'adresse, décodé et en minuscules. « /%61dmin/brief » et « //Admin/brief »
 * désignent la même page pour un lecteur humain : la garde les reconnaît donc aussi, quitte à
 * refuser une adresse que Next.js aurait de toute façon rendue introuvable (plus strict, jamais plus
 * souple).
 */
export function premierSegment(pathname: string): string {
  let chemin = pathname;
  try {
    chemin = decodeURIComponent(pathname);
  } catch {
    // Pourcentage mal formé : Next.js répond 400 de son côté. On garde le texte brut, ce qui ne peut
    // que rendre la garde plus stricte.
  }
  return (chemin.split("/").find((segment) => segment !== "") ?? "").toLowerCase();
}

/** Vrai pour « /admin » et tout ce qui est dessous. « /administration » n'en fait pas partie. */
export function estAdresseSupervision(pathname: string): boolean {
  return premierSegment(pathname) === "admin";
}
