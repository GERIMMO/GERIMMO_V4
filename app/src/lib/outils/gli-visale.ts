// OUTIL GRATUIT — COMPARATEUR GLI / VISALE (29/09).
//
// Règles Visale vérifiées le 29/09/2026 auprès d'Action Logement, à revérifier
// chaque mois de janvier (les plafonds sont revus en début d'année). La page
// le dit en toutes lettres.
//
// Le coût d'une garantie des loyers impayés (GLI) dépend du contrat de
// l'assureur : le taux est saisi par l'utilisateur (2,7 % par défaut, simple
// point de départ). Sa prime se déduit des revenus fonciers au régime réel :
// le coût net = brut × (1 − (TMI + prélèvements sociaux)).

import { arrondiCentime } from "./nombres";

export const DATE_VERIFICATION_VISALE = "29/09/2026";

export type ZoneVisale = "ile-de-france" | "grande-agglomeration" | "reste";

export const ZONES_VISALE: { valeur: ZoneVisale; libelle: string }[] = [
  { valeur: "ile-de-france", libelle: "Île-de-France" },
  {
    valeur: "grande-agglomeration",
    libelle: "Agglomération de plus de 100 000 habitants, Corse ou outre-mer",
  },
  { valeur: "reste", libelle: "Reste du territoire" },
];

/** Plafonds de loyer charges comprises, 2026 (Action Logement, vérifiés le 29/09/2026). */
export const PLAFONDS_VISALE_2026: Record<ZoneVisale, { general: number; etudiantSansRevenus: number }> = {
  "ile-de-france": { general: 1940, etudiantSansRevenus: 1000 },
  "grande-agglomeration": { general: 1575, etudiantSansRevenus: 840 },
  reste: { general: 1365, etudiantSansRevenus: 680 },
};

/** Au-delà de 30 ans, le motif qui ouvre Visale. */
export type SituationTrentePlus =
  | "salarie-recent"
  | "revenu-modeste"
  | "mobilite"
  | "autre";

export const SITUATIONS_TRENTE_PLUS: { valeur: SituationTrentePlus; libelle: string }[] = [
  { valeur: "salarie-recent", libelle: "Salarié du privé embauché depuis moins de 6 mois" },
  { valeur: "revenu-modeste", libelle: "Revenu inférieur ou égal à 1 710 € net par mois" },
  { valeur: "mobilite", libelle: "En mobilité professionnelle ou avec une promesse d'embauche" },
  { valeur: "autre", libelle: "Autre situation" },
];

export type EntreeVisale = {
  zone: ZoneVisale;
  moinsDe30Ans: boolean;
  /** Seulement si 30 ans ou plus. */
  situation: SituationTrentePlus;
  etudiantSansRevenus: boolean;
  loyerCc: number | null;
};

export type ResultatVisale = {
  eligible: boolean;
  plafond: number;
  motifs: string[];
};

export function evaluerVisale(e: EntreeVisale): ResultatVisale {
  const p = PLAFONDS_VISALE_2026[e.zone];
  const plafond = e.etudiantSansRevenus ? p.etudiantSansRevenus : p.general;
  const motifs: string[] = [];
  if (!e.moinsDe30Ans && e.situation === "autre") {
    motifs.push(
      "À partir de 30 ans, Visale n'est ouverte qu'aux salariés du privé embauchés depuis moins de 6 mois, aux personnes gagnant au plus 1 710 € net par mois, ou en mobilité professionnelle ou avec une promesse d'embauche."
    );
  }
  if (e.loyerCc != null && e.loyerCc > plafond) {
    motifs.push(
      `Le loyer charges comprises dépasse le plafond Visale de la zone (${plafond.toLocaleString("fr-FR")} €${
        e.etudiantSansRevenus ? " pour un étudiant sans revenus" : ""
      }).`
    );
  }
  return { eligible: motifs.length === 0, plafond, motifs };
}

/** Ce que couvre Visale (Action Logement, vérifié le 29/09/2026). */
export const COUVERTURE_VISALE = [
  "Jusqu'à 36 mois d'impayés de loyer et de charges, survenus pendant les 3 premières années du bail.",
  "Les dégradations locatives, jusqu'à 2 mois de loyer charges comprises.",
  "Gratuite pour le bailleur comme pour le locataire.",
  "Pas de cumul avec une assurance loyers impayés (GLI) ni avec une caution personne physique.",
];

export const TAUX_GLI_PAR_DEFAUT = 0.027;
export const PRELEVEMENTS_SOCIAUX = 0.172;

export type EntreeGli = {
  loyerCc: number | null;
  /** Taux de la prime, en fraction du loyer charges comprises annuel. */
  taux: number | null;
  /** Tranche marginale d'imposition, en fraction (0,30). */
  tmi: number;
  prelevementsSociaux?: number;
};

export type ResultatGli = { brutAnnuel: number; netAnnuel: number; netMensuel: number };

export function coutGli(e: EntreeGli): ResultatGli | null {
  if (e.loyerCc == null || e.taux == null || e.loyerCc <= 0 || e.taux < 0) return null;
  const brutAnnuel = arrondiCentime(e.loyerCc * 12 * e.taux);
  const ps = e.prelevementsSociaux ?? PRELEVEMENTS_SOCIAUX;
  const netAnnuel = arrondiCentime(brutAnnuel * (1 - (e.tmi + ps)));
  return { brutAnnuel, netAnnuel, netMensuel: arrondiCentime(netAnnuel / 12) };
}

/** Les tranches marginales du barème de l'impôt sur le revenu. */
export const TRANCHES_TMI = [0, 0.11, 0.3, 0.41, 0.45];
