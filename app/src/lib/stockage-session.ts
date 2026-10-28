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

// Même prudence pour le localStorage, partagé par tous les onglets du site : un repère de confort (la synthèse d'alertes
// déjà fermée aujourd'hui), jamais un état dont dépendrait un geste.
export function lireLocal(cle: string): string | null {
  try { return localStorage.getItem(cle); } catch { return null; }
}
export function ecrireLocal(cle: string, valeur: string): void {
  try { localStorage.setItem(cle, valeur); } catch { /* stockage refusé : le repère n'est pas mémorisé */ }
}
export function oublierLocal(cle: string): void {
  try { localStorage.removeItem(cle); } catch { /* idem */ }
}
