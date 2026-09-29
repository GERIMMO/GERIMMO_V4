// OUTIL GRATUIT — QUITTANCE DE LOYER (29/09).
//
// Total du terme = loyer hors charges + provision (ou forfait) de charges.
// Payé en entier : « Quittance de loyer ». Payé en partie : « Reçu de
// paiement partiel », avec le reste dû, et il NE VAUT PAS quittance (article
// 21 de la loi n° 89-462 du 6 juillet 1989).
//
// Les mentions reprennent mot pour mot celles du modèle de quittance de
// l'application (src/lib/documents/modeles/quittance.ts) : un document
// produit ici et un document produit dans Gerimmo disent la même chose.

import { arrondiCentime } from "./nombres";

export type EntreeQuittance = {
  loyerHc: number | null;
  charges: number | null;
  montantRecu: number | null;
};

export type ResultatQuittance = {
  total: number;
  recu: number;
  /** Payé en entier (ou plus) : quittance ; sinon, reçu de paiement partiel. */
  estQuittance: boolean;
  resteDu: number;
  titre: "Quittance de loyer" | "Reçu de paiement partiel";
};

export function calculerQuittance(e: EntreeQuittance): ResultatQuittance {
  const total = arrondiCentime((e.loyerHc ?? 0) + (e.charges ?? 0));
  const recu = arrondiCentime(e.montantRecu ?? 0);
  const estQuittance = recu >= total;
  return {
    total,
    recu,
    estQuittance,
    resteDu: estQuittance ? 0 : arrondiCentime(total - recu),
    titre: estQuittance ? "Quittance de loyer" : "Reçu de paiement partiel",
  };
}

/** Les mentions de la quittance (modèle de l'application). */
export const MENTIONS_QUITTANCE = [
  "La présente quittance porte sur le seul terme désigné. Elle ne préjuge pas des sommes qui resteraient dues au titre de termes antérieurs.",
  "Elle annule tout reçu pour solde partiel établi au titre de la même période.",
  "La quittance est délivrée gratuitement au locataire qui en fait la demande, conformément à l'article 21 de la loi du 6 juillet 1989.",
  "Ce document constitue un justificatif de domicile et de paiement : le locataire est invité à le conserver.",
];

/** La mention du reçu de paiement partiel (modèle de l'application). */
export const MENTIONS_RECU_PARTIEL = [
  "Le présent reçu constate un paiement partiel : il ne vaut pas quittance. Le solde du terme reste exigible ; une quittance sera délivrée à l'encaissement intégral (article 21 de la loi du 6 juillet 1989).",
];

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** « 2026-09 » → « 2026-10 » ; « 2026-12 » → « 2027-01 ». */
export function moisSuivant(periode: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periode);
  if (!m) return periode;
  const annee = Number(m[1]);
  const mois = Number(m[2]);
  return mois === 12 ? `${annee + 1}-01` : `${annee}-${String(mois + 1).padStart(2, "0")}`;
}

/** « 2026-09 » → « septembre 2026 ». */
export function libellePeriode(periode: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periode);
  if (!m) return "";
  return `${MOIS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Premier et dernier jour du mois, au format JJ/MM/AAAA. */
export function bornesPeriode(periode: string): { du: string; au: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(periode);
  if (!m) return null;
  const annee = Number(m[1]);
  const mois = Number(m[2]);
  if (mois < 1 || mois > 12) return null;
  const dernier = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  return { du: `01/${m[2]}/${annee}`, au: `${dernier}/${m[2]}/${annee}` };
}

/** Le mois d'une date ISO : « 2026-09-29 » → « 2026-09 ». */
export function periodeDe(dateIso: string): string {
  return dateIso.slice(0, 7);
}

/** Ce que l'on retient sur l'appareil, si l'utilisateur l'a demandé. */
export const CLE_STOCKAGE_QUITTANCE = "gerimmo_quittance";

export type QuittanceMemorisee = {
  bailleurNom: string;
  bailleurAdresse: string;
  locataireNom: string;
  logementAdresse: string;
  loyerHc: string;
  charges: string;
};

const CHAMPS_MEMORISES: (keyof QuittanceMemorisee)[] = [
  "bailleurNom",
  "bailleurAdresse",
  "locataireNom",
  "logementAdresse",
  "loyerHc",
  "charges",
];

/** Relit ce qui a été mémorisé ; `null` si rien d'exploitable. */
export function lireQuittanceMemorisee(brut: string | null): QuittanceMemorisee | null {
  if (!brut) return null;
  try {
    const v = JSON.parse(brut) as Record<string, unknown>;
    if (!v || typeof v !== "object") return null;
    const sortie = {} as QuittanceMemorisee;
    for (const c of CHAMPS_MEMORISES) sortie[c] = typeof v[c] === "string" ? (v[c] as string).slice(0, 500) : "";
    return sortie;
  } catch {
    return null;
  }
}
