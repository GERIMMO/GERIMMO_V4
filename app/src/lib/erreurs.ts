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
  // Les messages renvoyés par la base, le stockage ou un service extérieur
  // peuvent contenir des noms de tables, du SQL, des adresses réseau ou des
  // références réservées au support. Ces détails restent dans les journaux ;
  // l'utilisateur reçoit une consigne utile et compréhensible.
  if (
    /(?:SQLSTATE|PostgREST|postgres|supabase|row-level security|RLS|violates|constraint|duplicate key|foreign key|relation ["']|column ["']|schema cache|JWT|fetch failed|ECONN|ENOTFOUND|\b5\d\d\b|\bPGRST\d+\b)/i.test(
      propre
    )
  ) {
    return "Gerimmo n’a pas pu terminer cette action. Réessayez dans un instant ; si le problème continue, signalez-le depuis Aide et retours.";
  }
  if (/^[a-z0-9_./:-]+$/i.test(propre) || /[a-f0-9]{8}-[a-f0-9-]{27,}/i.test(propre)) {
    return "Gerimmo n’a pas pu terminer cette action. Réessayez dans un instant.";
  }
  // Le message ne doit pas se terminer par une ponctuation orpheline
  return propre.replace(/\s*[—–-]\s*$/, "").trim() || "Une erreur est survenue.";
}
