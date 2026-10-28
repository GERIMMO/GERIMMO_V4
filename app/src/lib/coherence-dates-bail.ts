import type { AvertissementLoyer } from "./coherence-loyer";
import { formaterDate } from "./ged";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const lire = (v: unknown) => (typeof v === "string" && DATE.test(v) ? v : null);

/** Décalage d'une date ISO de `mois` mois (en jour de Paris, comparaison de chaînes AAAA-MM-JJ). */
function moinsMois(iso: string, mois: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - mois);
  return d.toISOString().slice(0, 10);
}

/** Aide de cohérence des dates du bail, jamais un refus (audit final, BAIL-01) : un contrat conclu après l'entrée
 * et une entrée ancienne (reprise d'un bail en cours, import du parc, relocation) sont des cas légitimes, mais une
 * date tapée à l'envers s'imprimerait telle quelle dans le contrat. */
export function avertissementsDatesBail(bail: { date_debut?: unknown; date_conclusion_prevue?: unknown }, aujourdhui: string): AvertissementLoyer[] {
  const debut = lire(bail.date_debut), conclusion = lire(bail.date_conclusion_prevue);
  const avertissements: AvertissementLoyer[] = [];
  if (debut && conclusion && conclusion > debut) {
    avertissements.push({ code: "conclusion_apres_entree", message: `La date prévue du contrat (${formaterDate(conclusion)}) est postérieure à la date d’entrée (${formaterDate(debut)}) : vérifiez les deux dates.` });
  }
  if (debut && DATE.test(aujourdhui) && debut < moinsMois(aujourdhui, 3)) {
    avertissements.push({ code: "entree_ancienne", message: `L’entrée date de plus de trois mois (${formaterDate(debut)}) : s’agit-il d’un bail déjà en cours que vous reprenez ? Sinon, vérifiez la date d’entrée.` });
  }
  return avertissements;
}
