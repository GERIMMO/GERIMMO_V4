// OUTIL GRATUIT — RENTABILITÉ LOCATIVE (29/09).
//
// Prix total = prix d'achat + frais d'acquisition + travaux.
// Rentabilité brute = loyer annuel hors charges ÷ prix total.
// Rentabilité nette de charges = (loyer annuel − charges non récupérables
// − taxe foncière − assurance propriétaire non occupant − frais de gestion
// − vacance, comptée en mois de loyer) ÷ prix total.
// Cash-flow mensuel, seulement si un crédit est saisi : revenu net de charges
// ÷ 12 − mensualité. La mensualité est saisie, ou calculée par la formule
// d'annuité M = C · t ÷ (1 − (1 + t)^−n), t mensuel, n en mois.
//
// Aucune fiscalité ici : l'impôt dépend du régime (nu, meublé, micro, réel).
// Pour un meublé, le simulateur LMNP prend le relais.

import { arrondiCentime } from "./nombres";

export type Credit =
  | { mode: "aucun" }
  | { mode: "mensualite"; mensualite: number }
  | { mode: "calcul"; montant: number; tauxAnnuel: number; dureeAnnees: number };

export type EntreeRentabilite = {
  prix: number;
  frais: number;
  travaux: number;
  loyerMensuel: number;
  /** Montants annuels. */
  chargesNonRecuperables: number;
  taxeFonciere: number;
  assurancePno: number;
  fraisGestion: number;
  /** Vacance locative attendue, en mois de loyer par an. */
  vacanceMois: number;
  credit: Credit;
};

export type ResultatRentabilite = {
  prixTotal: number;
  loyerAnnuel: number;
  /** Loyer annuel net des charges et de la vacance. */
  revenuNet: number;
  /** En fraction (0,0529 = 5,29 %) ; null si le prix total est nul. */
  rentabiliteBrute: number | null;
  rentabiliteNette: number | null;
  mensualite: number | null;
  cashFlowMensuel: number | null;
};

/** Mensualité d'un prêt amortissable à taux fixe (hors assurance emprunteur). */
export function mensualiteCredit(montant: number, tauxAnnuel: number, dureeAnnees: number): number | null {
  const n = Math.round(dureeAnnees * 12);
  if (!(montant > 0) || !(n > 0) || tauxAnnuel < 0) return null;
  const t = tauxAnnuel / 12;
  if (t === 0) return arrondiCentime(montant / n);
  return arrondiCentime((montant * t) / (1 - Math.pow(1 + t, -n)));
}

export function calculerRentabilite(e: EntreeRentabilite): ResultatRentabilite {
  const prixTotal = arrondiCentime(e.prix + e.frais + e.travaux);
  const loyerAnnuel = arrondiCentime(e.loyerMensuel * 12);
  const revenuNet = arrondiCentime(
    loyerAnnuel -
      e.chargesNonRecuperables -
      e.taxeFonciere -
      e.assurancePno -
      e.fraisGestion -
      e.vacanceMois * e.loyerMensuel
  );
  const mensualite =
    e.credit.mode === "mensualite"
      ? e.credit.mensualite > 0
        ? arrondiCentime(e.credit.mensualite)
        : null
      : e.credit.mode === "calcul"
        ? mensualiteCredit(e.credit.montant, e.credit.tauxAnnuel, e.credit.dureeAnnees)
        : null;
  return {
    prixTotal,
    loyerAnnuel,
    revenuNet,
    rentabiliteBrute: prixTotal > 0 ? loyerAnnuel / prixTotal : null,
    rentabiliteNette: prixTotal > 0 ? revenuNet / prixTotal : null,
    mensualite,
    cashFlowMensuel: mensualite == null ? null : arrondiCentime(revenuNet / 12 - mensualite),
  };
}

/** L'exemple pré-rempli de la page (vérifié dans tests/outils-rentabilite.test.ts). */
export const EXEMPLE_RENTABILITE: EntreeRentabilite = {
  prix: 150_000,
  frais: 11_000,
  travaux: 9000,
  loyerMensuel: 750,
  chargesNonRecuperables: 400,
  taxeFonciere: 800,
  assurancePno: 120,
  fraisGestion: 0,
  vacanceMois: 1,
  credit: { mode: "calcul", montant: 160_000, tauxAnnuel: 0.035, dureeAnnees: 20 },
};
