/**
 * Le POST vient-il bien de notre page ? `Sec-Fetch-Site` (tous les navigateurs
 * récents) fait foi. À défaut, l'en-tête `Origin` — sauf la valeur « null » :
 * la page /auth/confirmer est servie en `referrer: no-referrer` (le jeton est
 * dans son adresse), ce qui fait envoyer `Origin: null` au formulaire. Refuser
 * « null » bloquait tout le monde (30/09, « Requête refusée »).
 */
export function requeteMemeOrigine(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origine = request.headers.get("origin");
  if (!origine || origine === "null") return true;
  const hote = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origine).host === hote;
  } catch {
    return false;
  }
}
