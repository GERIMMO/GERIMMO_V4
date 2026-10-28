import { deElide } from "@/lib/elision";
import { eur } from "@/lib/ged";

/** Une ligne de l'échéancier du locataire (mon_echeancier_locataire) en retard : impayée ou partiellement réglée. */
export type EcheanceEnRetard = {
  periode: string;
  montant_du: number | string;
  montant_couvert: number | string;
  statut: string;
};

/** « septembre 2026 » pour « 2026-09-01 » (jour UTC, comme l'échéancier). */
export const moisLongLocataire = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

const nomMois = (d: string) => new Date(d).toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" });
const enumeration = (mots: string[]) =>
  mots.length <= 1 ? mots.join("") : `${mots.slice(0, -1).join(", ")} et ${mots[mots.length - 1]}`;
const resteCentimes = (l: EcheanceEnRetard) =>
  Math.max(0, Math.round(Number(l.montant_du) * 100) - Math.round(Number(l.montant_couvert) * 100));

/** « septembre et octobre 2026 » quand les mois sont de la même année, « décembre 2026 et janvier 2027 » sinon. */
export function listerMois(periodes: string[]): string {
  const annees = new Set(periodes.map((p) => p.slice(0, 4)));
  if (annees.size === 1) return `${enumeration(periodes.map(nomMois))} ${[...annees][0]}`;
  return enumeration(periodes.map(moisLongLocataire));
}

/**
 * La tâche « loyer à régler » de l'accueil du locataire, bâtie sur TOUTES les échéances en retard, pas seulement la plus
 * ancienne (audit final du 27/10, DRT-01 : « Il reste 400,00 € » taisait les 700,00 € d'octobre, et un locataire qui payait
 * 400 € se croyait à jour). Les montants s'additionnent au centime. `null` sans échéance en retard.
 */
export function tacheLoyerEnRetard(retards: EcheanceEnRetard[]): { titre: string; detail: string } | null {
  const lignes = [...retards].sort((a, b) => a.periode.localeCompare(b.periode));
  if (!lignes.length) return null;
  const total = lignes.reduce((s, l) => s + resteCentimes(l), 0) / 100;
  const premiere = lignes[0];
  if (lignes.length === 1) {
    return {
      titre: `Loyer ${deElide(moisLongLocataire(premiere.periode))} à régler`,
      detail: premiere.statut === "partiel"
        ? `Il reste ${eur(total)} à régler par virement à votre gestionnaire.`
        : `${eur(total)} à régler par virement à votre gestionnaire.`,
    };
  }
  return {
    titre: `Loyers ${deElide(listerMois(lignes.map((l) => l.periode)))} à régler`,
    detail: `${eur(total)} restent dus sur ${lignes.length} échéances, dont ${eur(resteCentimes(premiere) / 100)} ${deElide(moisLongLocataire(premiere.periode))}, à régler par virement à votre gestionnaire.`,
  };
}
