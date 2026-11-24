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

/**
 * Reprise du lot 60 (R6) — ce que la carte de l'agenda écrit pour une mission dont des dates sont chez le locataire.
 *
 * Le compteur de l'agenda (`creneaux_en_attente`) compte toutes les dates proposées sans réponse ; la liste lue
 * (`mes_creneaux_artisan`) ne rend que celles qui peuvent encore être retenues (à venir, sur une plage restée libre). La
 * carte écrivait donc « 3 dates au choix du locataire » au-dessus de 2 dates, ou sans aucune. Quand la lecture réussit, le
 * nombre est celui de la liste ; s'il n'en reste aucune, la carte le dit, comme la fiche de mission (« Proposez de
 * nouvelles dates »). `lues` vaut `null` quand la lecture a échoué : le compteur reste, avec le renvoi à la fiche.
 */
export const CONSIGNE_PLUS_DE_DATE = "Plus aucune date proposée n’est disponible : proposez-en de nouvelles";
export function consigneDatesProposees(compteur: number, lues: CreneauMission[] | null): string {
  const phrase = (n: number) => `${n} date${n > 1 ? "s" : ""} au choix du locataire`;
  if (lues === null) return `${phrase(compteur)} — dates à vérifier sur la fiche`;
  const n = datesAGarder(lues).length;
  return n === 0 ? CONSIGNE_PLUS_DE_DATE : phrase(n);
}
