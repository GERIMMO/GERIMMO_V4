// OUTIL GRATUIT — SIMULATEUR LMNP, LOCATION MEUBLÉE DE LONGUE DURÉE (29/09).
//
// Hors périmètre : les meublés de tourisme (autres plafonds et abattements),
// le statut de loueur professionnel (LMP), la plus-value à la revente.
//
// Micro-BIC : recettes ≤ 77 700 € ; abattement de 50 % (305 € au minimum) ;
// impôt = base × (TMI + prélèvements sociaux).
//
// Régime réel : résultat avant amortissement = recettes − charges.
// Amortissement annuel = (prix + frais si retenus) × (1 − part du terrain)
// ÷ durée du bâti + mobilier ÷ sa durée + travaux ÷ leur durée.
// L'amortissement déduit ne peut pas créer ni augmenter un déficit (article
// 39 C du CGI) : il est plafonné au résultat positif, l'excédent est reporté
// sans limite de durée. Un résultat négatif AVANT amortissement est un
// déficit, imputable sur les bénéfices de même nature des 10 années suivantes.

import { arrondiCentime } from "./nombres";

export const PLAFOND_MICRO_BIC = 77_700;
export const ABATTEMENT_MICRO_BIC = 0.5;
export const ABATTEMENT_MINIMUM = 305;

export type EntreeLmnp = {
  recettes: number;
  charges: number;
  prix: number;
  frais: number;
  /** Les frais d'acquisition sont-ils ajoutés au prix amorti ? */
  fraisAmortis: boolean;
  /** Part du terrain, non amortissable, en fraction (0,20). */
  partTerrain: number;
  dureeBati: number;
  mobilier: number;
  dureeMobilier: number;
  travaux: number;
  dureeTravaux: number;
  /** Tranche marginale d'imposition, en fraction (0,30). */
  tmi: number;
  prelevementsSociaux: number;
};

/**
 * Les valeurs de départ de la page. Elles sont choisies pour un cas d'école
 * lisible — un studio loué 800 € par mois — et vérifiées dans
 * tests/outils-lmnp.test.ts : impôt au réel nul, micro-BIC 2 265,60 €,
 * amortissement reporté 554,29 €.
 */
export const DEFAUTS_LMNP: EntreeLmnp = {
  recettes: 9600,
  charges: 3800,
  prix: 160_000,
  frais: 14_000,
  fraisAmortis: true,
  partTerrain: 0.2,
  dureeBati: 30,
  mobilier: 5000,
  dureeMobilier: 7,
  travaux: 10_000,
  dureeTravaux: 10,
  tmi: 0.3,
  prelevementsSociaux: 0.172,
};

export type ResultatMicro =
  | { applicable: false; motif: string }
  | { applicable: true; abattement: number; base: number; impot: number };

export type ResultatReel = {
  resultatAvantAmortissement: number;
  amortissementBati: number;
  amortissementMobilier: number;
  amortissementTravaux: number;
  amortissementAnnuel: number;
  /** La part de l'amortissement déduite cette année (plafonnée au résultat positif). */
  amortissementUtilise: number;
  /** La part non déduite, reportée sur les années suivantes. */
  amortissementReporte: number;
  /** Déficit avant amortissement, imputable 10 ans sur les BIC non professionnels. */
  deficitReportable: number;
  base: number;
  impot: number;
};

export type ResultatLmnp = {
  micro: ResultatMicro;
  reel: ResultatReel;
  /** Impôt micro − impôt réel, si le micro-BIC est ouvert (positif : le réel coûte moins). */
  economieReel: number | null;
};

const division = (montant: number, duree: number) => (duree > 0 && montant > 0 ? arrondiCentime(montant / duree) : 0);

export function simulerMicroBic(e: Pick<EntreeLmnp, "recettes" | "tmi" | "prelevementsSociaux">): ResultatMicro {
  if (e.recettes > PLAFOND_MICRO_BIC) {
    return {
      applicable: false,
      motif: `Recettes supérieures à ${PLAFOND_MICRO_BIC.toLocaleString("fr-FR")} € : le micro-BIC n'est pas ouvert, le régime réel s'impose.`,
    };
  }
  const recettes = Math.max(0, e.recettes);
  const abattement = arrondiCentime(Math.min(recettes, Math.max(recettes * ABATTEMENT_MICRO_BIC, ABATTEMENT_MINIMUM)));
  const base = arrondiCentime(recettes - abattement);
  return { applicable: true, abattement, base, impot: arrondiCentime(base * (e.tmi + e.prelevementsSociaux)) };
}

export function simulerReel(e: EntreeLmnp): ResultatReel {
  const resultatAvantAmortissement = arrondiCentime(e.recettes - e.charges);
  const baseBati = (e.prix + (e.fraisAmortis ? e.frais : 0)) * (1 - e.partTerrain);
  const amortissementBati = division(baseBati, e.dureeBati);
  const amortissementMobilier = division(e.mobilier, e.dureeMobilier);
  const amortissementTravaux = division(e.travaux, e.dureeTravaux);
  const amortissementAnnuel = arrondiCentime(amortissementBati + amortissementMobilier + amortissementTravaux);
  const positif = Math.max(0, resultatAvantAmortissement);
  const amortissementUtilise = Math.min(amortissementAnnuel, positif);
  const base = arrondiCentime(positif - amortissementUtilise);
  return {
    resultatAvantAmortissement,
    amortissementBati,
    amortissementMobilier,
    amortissementTravaux,
    amortissementAnnuel,
    amortissementUtilise,
    amortissementReporte: arrondiCentime(amortissementAnnuel - amortissementUtilise),
    deficitReportable: resultatAvantAmortissement < 0 ? -resultatAvantAmortissement : 0,
    base,
    impot: arrondiCentime(base * (e.tmi + e.prelevementsSociaux)),
  };
}

export function simulerLmnp(e: EntreeLmnp): ResultatLmnp {
  const micro = simulerMicroBic(e);
  const reel = simulerReel(e);
  return {
    micro,
    reel,
    economieReel: micro.applicable ? arrondiCentime(micro.impot - reel.impot) : null,
  };
}
