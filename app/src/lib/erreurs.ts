// Les règles métier sont défendues en base : leurs messages d'exception
// remontent tels quels à l'écran. Ils portent une référence interne au
// référentiel — utile dans les journaux, illisible pour un agent qui débute.
//
// On la retire à la présentation plutôt que dans les 13 fonctions SQL
// concernées : la trace reste en base et dans les logs, l'écran reste en
// français courant.
//
//   « Mois clôturé : imputez au mois ouvert… (RM-4.4.1) »
//   → « Mois clôturé : imputez au mois ouvert… »

const CODE_INTERNE = /\s*[([]RM-[0-9][\w.\-/]*[)\]]\s*\.?/gi;

export function sansJargon(message: string | null | undefined): string {
  if (!message) return "Une erreur est survenue.";
  // On ne recolle que le point et la virgule : en français, le deux-points et
  // le point-virgule gardent leur espace insécable devant.
  const propre = message.replace(CODE_INTERNE, "").replace(/\s+([.,])/g, "$1").trim();
  // Le message ne doit pas se terminer par une ponctuation orpheline
  return propre.replace(/\s*[—–-]\s*$/, "").trim() || "Une erreur est survenue.";
}
