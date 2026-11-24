import type { CreneauMission } from "../acces";
import { jourCivil } from "../libelles";

/**
 * Phase 3, lot 60 (E006, E116) — les dates que l'artisan doit garder libres.
 *
 * Quand il a proposé des dates et que le locataire n'a pas encore choisi, la fiche de mission lui dit « Gardez-les libres
 * jusqu'à sa réponse ». L'agenda, lui, ne connaissait que leur nombre : ces jours-là s'y lisaient vides (« — »), au risque
 * d'un autre engagement pris dessus. Même règle que la fiche de mission : seules comptent les dates proposées par
 * l'artisan et encore en attente.
 */
export function datesAGarder(creneaux: CreneauMission[]): CreneauMission[] {
  return creneaux
    .filter((c) => c.statut === "propose" && c.propose_par === "artisan")
    .sort((a, b) => a.debut.localeCompare(b.debut));
}

/** Par jour civil de Paris (AAAA-MM-JJ), le nombre de dates à garder libres, toutes missions confondues. */
export function joursAGarder(parMission: Iterable<CreneauMission[]>): Map<string, number> {
  const jours = new Map<string, number>();
  for (const creneaux of parMission) {
    for (const c of datesAGarder(creneaux)) {
      const cle = jourCivil(c.debut);
      jours.set(cle, (jours.get(cle) ?? 0) + 1);
    }
  }
  return jours;
}
