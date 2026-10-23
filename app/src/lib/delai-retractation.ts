// LE DÉLAI DE RÉTRACTATION (plan de conformité du 23/10/2026, R01, R02, R37).
//
// La règle retenue par le plan, la plus protectrice du consommateur :
//  · le jour de la conclusion (souscription, ou demande de passage à l'annuel) n'est pas compté ;
//  · on ajoute quatorze jours ;
//  · une échéance un samedi, un dimanche ou un jour férié passe au premier jour suivant qui n'est ni l'un ni l'autre ;
//  · la déclaration est reçue jusqu'à 23 h 59 min 59 s, heure de Paris, ce jour-là.
// À relire par le juriste (source non ouverte le 23/10/2026) : code de la consommation, L. 221-18 à L. 221-21 et
// D. 221-5 (version du 19/06/2026), et la règle de prorogation d'un délai qui expire un jour non ouvrable.
//
// Module pur : aucune base, aucun fuseau de la machine. Les dates « AAAA-MM-JJ » sont des jours civils de Paris.

import { dateParis, instantParis, isodow, lendemain } from "@/lib/heure-paris-calcul";

/** Durée du délai, en jours. */
export const DUREE_RETRACTATION_JOURS = 14;

/** Le dimanche de Pâques (calendrier grégorien, algorithme de Meeus, Jones et Butcher), « AAAA-MM-JJ ». */
export function dimancheDePaques(annee: number): string {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return `${annee}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

function plusJours(jour: string, n: number): string {
  const [a, m, j] = jour.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}

/**
 * Les onze jours fériés nationaux (code du travail, L. 3133-1) : 1er janvier, lundi de Pâques, 1er mai, 8 mai,
 * Ascension, lundi de Pentecôte, 14 juillet, 15 août, 1er novembre, 11 novembre, 25 décembre. Les jours propres à
 * l'Alsace-Moselle et aux outre-mer n'y sont pas. À relire par le juriste (source non ouverte le 23/10/2026).
 */
export function joursFeries(annee: number): Set<string> {
  const paques = dimancheDePaques(annee);
  const fixes = ["01-01", "05-01", "05-08", "07-14", "08-15", "11-01", "11-11", "12-25"].map((md) => `${annee}-${md}`);
  return new Set([...fixes, plusJours(paques, 1), plusJours(paques, 39), plusJours(paques, 50)]);
}

export function estJourFerie(jour: string): boolean {
  return joursFeries(Number(jour.slice(0, 4))).has(jour.slice(0, 10));
}

/** Ni samedi, ni dimanche, ni jour férié. */
export function estJourOuvrableDuDelai(jour: string): boolean {
  const j = isodow(jour);
  return j !== 6 && j !== 7 && !estJourFerie(jour);
}

/** Le dernier jour du délai ouvert par une conclusion à cet instant (jour de Paris). */
export function dernierJourRetractation(conclusion: Date): string {
  let jour = plusJours(dateParis(conclusion), DUREE_RETRACTATION_JOURS);
  while (!estJourOuvrableDuDelai(jour)) jour = lendemain(jour);
  return jour;
}

/** Le dernier instant où une déclaration est reçue : 23 h 59 min 59 s, heure de Paris, le dernier jour. */
export function finDuDelaiRetractation(conclusion: Date): Date {
  return new Date(instantParis(dernierJourRetractation(conclusion), 23, 59).getTime() + 59_000);
}

/** Le délai court-il encore à cet instant ? */
export function retractationOuverte(conclusion: Date | null | undefined, maintenant: Date = new Date()): boolean {
  if (!conclusion || !Number.isFinite(conclusion.getTime())) return false;
  return maintenant.getTime() <= finDuDelaiRetractation(conclusion).getTime();
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « 9 novembre 2026 » pour « 2026-11-09 ». */
export function jourEnLettres(jour: string): string {
  const [a, m, j] = jour.slice(0, 10).split("-").map(Number);
  return `${j === 1 ? "1er" : j} ${MOIS[m - 1]} ${a}`;
}
