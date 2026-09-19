// La porte de santé : on n'ouvre pas un département quand le produit va mal
// là où il est déjà.
//
// C'est la limite « santé » du cadre d'expansion (wiki : « Expansion
// territoriale autonome », 19/09), rendue calculable avec les capteurs posés
// le même jour. Trois signaux, trois seuils :
//  · chaque tâche quotidienne a consigné une passe récemment — sinon quelque
//    chose ne tourne plus, et on le saurait seulement par un locataire qui
//    n'a pas reçu son avis ;
//  · peu d'écrans en erreur sur 24 h ;
//  · aucun bug bloquant ouvert.
//
// UN SIGNAL INCONNU FERME LA PORTE. « On ne sait pas » n'est pas « tout va
// bien » : si les compteurs ne se lisent pas, on n'ouvre pas.
//
// LES SEUILS SONT DES DÉFAUTS, PAS DES VÉRITÉS. Ils sont ici pour être lus et
// changés en un seul endroit ; le porteur du projet n'a pas encore fixé les
// siens (point à trancher dans le wiki). Le motif de chaque fermeture est
// écrit en clair, pour le compte rendu.

export type SeuilsSante = {
  /** Les tâches dont on attend une passe consignée (`tache_<nom>`). */
  tachesAttendues: readonly string[];
  /** Au-delà, une tâche est considérée comme arrêtée (elles sont quotidiennes). */
  retardTacheHeures: number;
  erreursEcranMax24h: number;
  bugsBloquantsMax: number;
};

export const SEUILS_SANTE: SeuilsSante = {
  tachesAttendues: ["quittances", "abonnements", "appels", "rappels"],
  retardTacheHeures: 36,
  erreursEcranMax24h: 5,
  bugsBloquantsMax: 0,
};

export type SignauxSante = {
  /** La dernière passe de chaque tâche, telle que `dernieresTaches` la rend. */
  passes: Record<string, { le: string }>;
  /** null = compteur illisible. */
  erreursEcran24h: number | null;
  /** Bugs ouverts de gravité bloquante (N1). null = compteur illisible. */
  bugsBloquantsOuverts: number | null;
};

export type Porte = { ouverte: boolean; motifs: string[] };

export function evaluerPorte(
  signaux: SignauxSante,
  seuils: SeuilsSante = SEUILS_SANTE,
  maintenant: Date = new Date()
): Porte {
  const motifs: string[] = [];

  for (const tache of seuils.tachesAttendues) {
    const passe = signaux.passes[tache];
    if (!passe) {
      motifs.push(`tâche « ${tache} » : aucune passe consignée`);
      continue;
    }
    const heures = (maintenant.getTime() - Date.parse(passe.le)) / 3_600_000;
    if (!Number.isFinite(heures) || heures > seuils.retardTacheHeures) {
      motifs.push(
        `tâche « ${tache} » : dernière passe il y a ${Number.isFinite(heures) ? Math.round(heures) : "?"} h (limite ${seuils.retardTacheHeures} h)`
      );
    }
  }

  if (signaux.erreursEcran24h === null) motifs.push("erreurs d'écran : compteur illisible");
  else if (signaux.erreursEcran24h > seuils.erreursEcranMax24h)
    motifs.push(`erreurs d'écran : ${signaux.erreursEcran24h} sur 24 h (limite ${seuils.erreursEcranMax24h})`);

  if (signaux.bugsBloquantsOuverts === null) motifs.push("bugs bloquants : compteur illisible");
  else if (signaux.bugsBloquantsOuverts > seuils.bugsBloquantsMax)
    motifs.push(`bugs bloquants ouverts : ${signaux.bugsBloquantsOuverts} (limite ${seuils.bugsBloquantsMax})`);

  return { ouverte: motifs.length === 0, motifs };
}
