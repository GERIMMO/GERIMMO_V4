// Les trois envois que Gerimmo sait faire seul — et lesquels sont éteints.
//
// Le tableau de bord (assistant) et le parcours de démarrage posent la même
// question : « qu'est-ce que l'organisation n'a pas encore laissé partir tout
// seul ? ». Écrite deux fois, la liste divergerait au premier envoi ajouté ;
// elle vit ici, avec les libellés que les deux écrans affichent tels quels.

export type ReglagesEnvoi = {
  quittances_envoi_auto: boolean | null;
  appels_envoi_auto: boolean | null;
  relances_envoi_auto: boolean | null;
};

/** Les envois encore manuels, dans l'ordre où ils arrivent dans un mois. */
export function envoisEteints(reglages: ReglagesEnvoi | null | undefined): string[] {
  if (!reglages) return [];
  return [
    !reglages.appels_envoi_auto && "les avis d'échéance",
    !reglages.quittances_envoi_auto && "les quittances",
    !reglages.relances_envoi_auto && "les relances d'impayé",
  ].filter((x): x is string => Boolean(x));
}

/** Vrai quand aucun des trois n'est activé : l'organisation fait tout à la main. */
export function toutManuel(reglages: ReglagesEnvoi | null | undefined): boolean {
  return envoisEteints(reglages).length === 3;
}
