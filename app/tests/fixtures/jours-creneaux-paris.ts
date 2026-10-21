import { decalerJour, jourParis } from "@/lib/agenda-gestion";

/** Un décalage du calendrier parisien, pas une durée de n × 24 h (jours de 23/25 h). */
export function dansNJours(n: number) {
  return decalerJour(jourParis(new Date()), n);
}

// Dates attendues indépendantes du calcul : J+3, J+4 et J+5 restent consécutifs.
// L'heure UTC des matinées change uniquement à la bascule d'heure de Paris.
export const HORLOGES_CRENEAUX = [
  {
    nom: "heure d'hiver — régression CI783, Paris a déjà changé de jour",
    instant: "2026-10-20T22:15:00Z",
    jours: ["2026-10-24", "2026-10-25", "2026-10-26"],
    heuresUtc: [6, 7, 7],
  },
  {
    nom: "heure d'été — aucun jour sauté",
    instant: "2026-03-24T22:30:00Z",
    jours: ["2026-03-27", "2026-03-28", "2026-03-29"],
    heuresUtc: [7, 7, 6],
  },
  {
    nom: "changement d'année",
    instant: "2026-12-28T23:15:00Z",
    jours: ["2027-01-01", "2027-01-02", "2027-01-03"],
    heuresUtc: [7, 7, 7],
  },
  {
    nom: "année bissextile",
    instant: "2028-02-25T23:15:00Z",
    jours: ["2028-02-29", "2028-03-01", "2028-03-02"],
    heuresUtc: [7, 7, 7],
  },
];
