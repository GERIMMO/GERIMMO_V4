// sessionStorage « au mieux » : une commodité, jamais une condition.
//
// Audit du 13/10/2026 (VER-PR178-07) : quand le navigateur refuse l'accès (SecurityError levée par la PROPRIÉTÉ
// `sessionStorage`, données de site bloquées), la synthèse d'alertes et la page de connexion y lisaient et y écrivaient
// sans protection, dans un effet : toute l'application affichait « Cette page n'a pas pu s'afficher », connexion comprise.
// Un drapeau qu'on ne peut pas mémoriser reste simplement non mémorisé.

export function lireSession(cle: string): string | null {
  try { return sessionStorage.getItem(cle); } catch { return null; }
}
export function ecrireSession(cle: string, valeur: string): void {
  try { sessionStorage.setItem(cle, valeur); } catch { /* stockage refusé : le drapeau n'est pas mémorisé */ }
}
export function oublierSession(cle: string): void {
  try { sessionStorage.removeItem(cle); } catch { /* idem */ }
}
