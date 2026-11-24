// Délais du congé délivré par le bailleur (articles 15 et 25-8 de la loi n° 89-462 du 6 juillet 1989). Module sans
// dépendance : le modèle de la lettre (documents/modeles/conge-bailleur.ts) et l'écran du bail lisent la même règle,
// miroir de la base (`enregistrer_conge`, `date_limite_conge_bailleur`).

// Même arithmétique que la base (`date + interval 'n months'`) : le jour est
// ramené au dernier jour du mois quand il n'existe pas.
export function ajouterMois(iso: string, mois: number): string {
  const [a, m, j] = iso.slice(0, 10).split("-").map(Number);
  const cible = new Date(Date.UTC(a, m - 1 + mois, 1));
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  cible.setUTCDate(Math.min(j, dernier));
  return cible.toISOString().slice(0, 10);
}

export function lendemain(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Le congé du bailleur reçu par le locataire à `reception` laisse-t-il le préavis entier avant le terme (le DERNIER
 * JOUR du bail) ? Miroir de `enregistrer_conge` : réception + préavis ≤ terme.
 *
 * Lot T1 (R13-A1) : l'ancienne règle acceptait un jour de plus (≤ terme + 1 jour). Exemples de la notice annexée à
 * l'arrêté du 13 décembre 2017 (point 1-4) : terme le 15 juin → congé au plus tard le 15 décembre ; terme le
 * 30 juin → le 31 décembre ; terme le 31 août → le 28 février (29 les années bissextiles). Quand le quantième
 * n'existe pas dans le mois d'arrivée, le délai expire le dernier jour du mois : c'est ce que fait `ajouterMois`.
 * La notice ne vaut que pour la location nue ; la même règle est appliquée au meublé (trois mois) par prudence.
 */
export function congeBailleurDansLesDelais(reception: string, terme: string, preavisMois: number): boolean {
  return ajouterMois(reception, preavisMois) <= terme.slice(0, 10);
}

/**
 * La dernière date de réception qui laisse le préavis entier avant `terme`. Miroir de la fonction de base
 * `date_limite_conge_bailleur`. En fin de mois, le lendemain convient encore tant que « lendemain + préavis » ne
 * dépasse pas le terme (terme le 30 juin, six mois : 30 décembre, puis 31 décembre).
 */
export function dateLimiteCongeBailleur(terme: string, preavisMois: number): string {
  let limite = ajouterMois(terme, -preavisMois);
  while (congeBailleurDansLesDelais(lendemain(limite), terme, preavisMois)) limite = lendemain(limite);
  return limite;
}

const jourFr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/**
 * Logement acheté alors qu'il était déjà loué (article 15 I de la loi du 6 juillet 1989, location nue). Rend le
 * message du refus, ou `null` quand le congé peut viser `terme`. Gerimmo ne calcule ni la « première reconduction »
 * ni la date d'effet repoussée : il compare seulement le terme visé à la date d'acquisition, et refuse dans le doute
 * (égalité comprise).
 *  · vente : possible au terme en cours quand ce terme intervient plus de trois ans après l'acquisition ;
 *  · reprise : au terme en cours, le congé ne prend effet que deux ans après l'acquisition quand ce terme
 *    intervient moins de deux ans après elle.
 */
export function refusLogementAcheteOccupe(motif: "vente" | "reprise", acquisition: string, terme: string): string | null {
  const annees = motif === "vente" ? 3 : 2;
  if (terme.slice(0, 10) > ajouterMois(acquisition, annees * 12)) return null;
  return motif === "vente"
    ? `Logement acheté déjà loué le ${jourFr(acquisition)} : le terme visé (${jourFr(terme)}) n’intervient pas plus de trois ans après l’acquisition. Dans ce cas, le congé pour vendre ne peut être donné qu’au terme de la première reconduction tacite ou du premier renouvellement du bail en cours (article 15 de la loi du 6 juillet 1989). Gerimmo ne calcule pas cette échéance et ne prépare pas ce congé : faites-le établir par un professionnel (ADIL, avocat, commissaire de justice).`
    : `Logement acheté déjà loué le ${jourFr(acquisition)} : le terme visé (${jourFr(terme)}) n’intervient pas plus de deux ans après l’acquisition. Dans ce cas, le congé pour reprise ne prend effet qu’à l’expiration d’une durée de deux ans à compter de la date d’acquisition (article 15 de la loi du 6 juillet 1989). Gerimmo ne sait pas écrire cette date d’effet et ne prépare pas ce congé : faites-le établir par un professionnel (ADIL, avocat, commissaire de justice).`;
}
