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

/** Seules les quittances disposent d’un envoi automatique autorisé. */
export function envoisEteints(reglages: ReglagesEnvoi | null | undefined): string[] {
  return reglages?.quittances_envoi_auto === false ? ["les quittances"] : [];
}

export function toutManuel(reglages: ReglagesEnvoi | null | undefined): boolean {
  return envoisEteints(reglages).length > 0;
}
