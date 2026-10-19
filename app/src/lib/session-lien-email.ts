/**
 * D'où vient la session ? La revendication `amr` du jeton (« authentication methods references », RFC 8176) le dit :
 * Supabase Auth y écrit la liste des méthodes qui ont ouvert la session, sous la forme `[{ method, timestamp }]`
 * (format détaillé) ou `["password"]` (format RFC).
 *
 * POURQUOI ÇA COMPTE. /nouveau-mot-de-passe pose le mot de passe SANS demander l'ancien. Ce geste n'a de sens que
 * pour une session née d'un lien reçu par e-mail : la preuve, c'est l'accès à la boîte. Une session ouverte par mot
 * de passe doit passer par « Mon compte », qui exige le mot de passe actuel (audit du 19/10, lot mineurs, g).
 *
 * Les valeurs sont celles que GoTrue écrit (models.AuthenticationMethod). Côté « lien ou code reçu par e-mail » :
 * `recovery` (mot de passe oublié, invitations envoyées comme liens de récupération), `invite`, `magiclink`,
 * `email/signup` (confirmation d'inscription), `email_change`, `otp` (code à usage unique, ou lien vérifié par le
 * type « email »). Côté « non » : `password`, `oauth`, `sso/saml`, `totp` et les autres seconds facteurs,
 * `anonymous`, `token_refresh`, `web3`. Aucune session issue d'un lien n'était en vie en production au moment du relevé
 * (`auth.mfa_amr_claims` : uniquement `password`) : la liste suit la source de GoTrue, et le parcours de recette
 * « inscription puis récupération » reste la garde contre une chaîne qui différerait.
 */
export const METHODES_LIEN_EMAIL: ReadonlySet<string> = new Set([
  "recovery",
  "invite",
  "magiclink",
  "email/signup",
  "email_change",
  "otp",
]);

/** Les méthodes nommées par `amr`, dans l'un ou l'autre format ; rien pour une valeur absente ou mal formée. */
export function methodesDeLaSession(amr: unknown): string[] {
  if (!Array.isArray(amr)) return [];
  const methodes: string[] = [];
  for (const entree of amr) {
    if (typeof entree === "string") methodes.push(entree);
    else if (entree && typeof entree === "object" && typeof (entree as { method?: unknown }).method === "string") {
      methodes.push((entree as { method: string }).method);
    }
  }
  return methodes;
}

/** Vrai si la session a été ouverte par un lien (ou un code) reçu par e-mail. */
export function sessionIssueDUnLien(amr: unknown): boolean {
  return methodesDeLaSession(amr).some((methode) => METHODES_LIEN_EMAIL.has(methode));
}
