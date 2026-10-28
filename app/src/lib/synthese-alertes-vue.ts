/**
 * La synthèse d'alertes de connexion a-t-elle déjà été fermée ? Deux repères, posés à la fermeture et effacés par la page
 * de connexion (audit final du 27/10, LOY-21 et sa relecture) :
 *  - l'onglet (sessionStorage) : « <compte> » ;
 *  - la journée de Paris (localStorage, commun aux onglets) : « <compte>:<jour> ».
 * Les deux portent le compte : un autre compte ouvert dans le même navigateur sans passer par la connexion (lien
 * d'invitation, de récupération) voit sa propre synthèse.
 *
 * CROCHET DE RECETTE : le drapeau d'onglet « 1 » neutralise la fenêtre pour les specs e2e et la recette de production
 * (e2e/aides.ts, e2e/a11y.spec.ts, e2e/recette-production/outils.ts), qui ne connaissent pas l'identifiant du compte.
 * L'application ne l'écrit jamais. Seul effet hors recette, transitoire : un onglet resté ouvert depuis la version qui
 * écrivait « 1 » garde la fenêtre fermée jusqu'à sa fermeture ou à la prochaine page de connexion.
 */
export function valeurOngletSynthese(compteId: string | undefined): string {
  return compteId ?? "1";
}
export function valeurJourSynthese(compteId: string | undefined, jour: string): string {
  return `${compteId ?? ""}:${jour}`;
}
export function syntheseDejaVue({ onglet, journee, compteId, jour }: {
  onglet: string | null; journee: string | null; compteId: string | undefined; jour: string;
}): boolean {
  return onglet === "1" || (onglet !== null && onglet === valeurOngletSynthese(compteId))
    || journee === valeurJourSynthese(compteId, jour);
}
