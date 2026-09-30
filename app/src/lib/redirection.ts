/**
 * Le statut d'une redirection vers /connexion (audit du 30/09, M6).
 *
 * Un 307 REJOUE la méthode et le corps : un POST (action serveur, formulaire)
 * dont la session vient d'expirer serait reposté sur /connexion. Avec 303, le
 * navigateur suit en GET, ce qu'une page de connexion attend.
 */
export function statutRedirection(methode: string): 303 | 307 {
  return methode === "GET" || methode === "HEAD" ? 307 : 303;
}
