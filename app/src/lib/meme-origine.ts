/**
 * Le POST vient-il bien de notre page ? `Sec-Fetch-Site` (tous les navigateurs
 * récents) fait foi. À défaut, l'en-tête `Origin` — sauf la valeur « null » :
 * la page /auth/confirmer est servie en `referrer: no-referrer` (le jeton est
 * dans son adresse), ce qui fait envoyer `Origin: null` au formulaire. Refuser
 * « null » bloquait tout le monde (30/09, « Requête refusée »).
 *
 * Audit du 30/09 (M1) : un `Origin: null` — ou absent — vaut aussi pour un
 * formulaire posté depuis une page « data: » ou un vieux navigateur sans
 * `Sec-Fetch-Site` : un site tiers pouvait forcer une connexion. Sans
 * `Sec-Fetch-Site`, « null » et l'absence ne passent donc plus que si le
 * double jeton (cookie posé par /auth/confirm, champ caché de la page) a été
 * vérifié par l'appelant : `nonceValide`.
 */
export function requeteMemeOrigine(request: Request, nonceValide = false): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origine = request.headers.get("origin");
  if (!origine || origine === "null") return nonceValide;
  const hote = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origine).host === hote;
  } catch {
    return false;
  }
}
