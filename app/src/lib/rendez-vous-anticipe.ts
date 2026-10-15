// Démarrer, terminer ou facturer avant le rendez-vous confirmé (audit du 13/10/2026, ART-21, décision D20,
// option B) : rien n'est bloqué — une arrivée anticipée ou une urgence sont légitimes — mais l'artisan est
// prévenu avant le geste, et l'écart s'écrit à la chronologie de l'incident.
//
// LA MARGE EST DE DEUX HEURES, et elle est écrite aux DEUX endroits qui la jugent : ici (l'avertissement affiché
// avant le geste) et en base, dans `public.ecart_rendez_vous` (migration 20261014301000), qui écrit l'écart à la
// chronologie. Le test `rendez-vous-anticipe.test.ts` garde les deux ensemble.

/** Une marge de deux heures avant le début du rendez-vous confirmé. */
export const MARGE_RENDEZ_VOUS_ANTICIPE_MS = 2 * 60 * 60 * 1000;

/** Les gestes de l'artisan que l'avertissement accompagne. */
export type GesteAnticipe = "demarrer" | "terminer" | "facturer";

/**
 * Le geste a-t-il lieu plus de deux heures avant le début du rendez-vous confirmé ? Sans rendez-vous confirmé
 * (dépannage démarré avant qu'un créneau soit calé), ou une date illisible : non, il n'y a rien à comparer.
 */
export function avantRendezVous(
  debutPrevu: string | null | undefined,
  maintenant: Date = new Date()
): boolean {
  if (!debutPrevu) return false;
  const debut = Date.parse(debutPrevu);
  if (Number.isNaN(debut)) return false;
  return maintenant.getTime() < debut - MARGE_RENDEZ_VOUS_ANTICIPE_MS;
}

/** La phrase affichée à l'artisan AVANT le geste. Elle dit que le geste reste possible. */
export function phraseAvantLeGeste(geste: GesteAnticipe): string {
  switch (geste) {
    case "demarrer":
      return "Vous pouvez démarrer dès maintenant, rien ne vous en empêche : le démarrage avant le rendez-vous sera inscrit au dossier de l’incident.";
    case "terminer":
      return "Vous pouvez rendre compte dès maintenant, rien ne vous en empêche : l’écart avec le rendez-vous sera inscrit au dossier de l’incident.";
    case "facturer":
      return "Vous pouvez déposer votre facture dès maintenant, rien ne vous en empêche : l’écart avec le rendez-vous sera inscrit au dossier de l’incident, et l’agence le lira avant de la valider.";
  }
}

/** Un écart en minutes, dit en mots : « 5 jours », « 1 jour », « 3 h ». Toujours au moins deux heures ici. */
export function ecartEnMots(minutes: number): string {
  const heures = Math.floor(minutes / 60);
  if (heures >= 24) {
    const jours = Math.floor(heures / 24);
    return `${jours} jour${jours > 1 ? "s" : ""}`;
  }
  return `${heures} h`;
}

type DetailsEvenement = Record<string, unknown> | null | undefined;

/**
 * La mention d'écart d'un événement de la chronologie (« 5 jours avant le rendez-vous prévu le … »), ou null quand
 * l'événement n'en porte pas. Le libellé de l'événement dit déjà ce qui s'est passé (« Intervention démarrée »).
 * `formaterDateHeure` est passé par l'appelant : cette fonction reste pure et sans fuseau.
 */
export function mentionEcartChronologie(
  details: DetailsEvenement,
  formaterDateHeure: (iso: string) => string
): string | null {
  if (!details || details.avant_rendez_vous !== true) return null;
  const debut = typeof details.debut_prevu === "string" ? details.debut_prevu : null;
  if (!debut) return null;
  const minutes = typeof details.ecart_minutes === "number" ? details.ecart_minutes : null;
  const quand = minutes !== null && minutes >= 120 ? `${ecartEnMots(minutes)} avant` : "avant";
  return `${quand} le rendez-vous prévu le ${formaterDateHeure(debut)}`;
}
