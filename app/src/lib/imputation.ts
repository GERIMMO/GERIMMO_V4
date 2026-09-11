import { eur, moisEnFrancais } from "@/lib/ged";

// Compte rendu d'un encaissement — « ce que la base vient de faire », dit à
// l'agent.
//
// Un encaissement ne se pose pas sur le terme qu'on regarde : il s'impute du
// terme le PLUS ANCIEN au plus récent (RM-3.3.2, règle légale de l'ancienneté
// de la dette — wiki/processus/Quittancement des loyers.md). L'écran ne peut
// donc pas annoncer à l'avance où ira l'argent ligne par ligne ; il doit
// rendre compte après coup.
//
// La couverture n'est stockée nulle part : etat_loyers_bail la RECALCULE à
// chaque lecture depuis le total encaissé. Le seul compte rendu fidèle est
// donc la différence entre l'état d'avant et l'état d'après — pas un compteur
// d'écritures. C'est aussi la raison pour laquelle on ne peut pas se fier au
// nombre de documents rendu par emettre_quittances : un déclencheur
// (encaissement_quittances) a déjà resynchronisé les documents pendant
// l'INSERT, si bien que l'appel qui suit ne trouve plus rien à faire et
// renvoie 0 — « aucun reçu ni quittance à émettre » juste après en avoir émis.

/** Une ligne d'`etat_loyers_bail` — les seuls champs que le compte rendu lit. */
export type EtatAppel = {
  appel_id: string;
  periode: string;
  montant_du: number | string;
  montant_couvert: number | string;
};

export type ImputationTerme = {
  appel_id: string;
  periode: string;
  /** Ce que CE terme a reçu de l'encaissement */
  montant: number;
  /** Terme intégralement couvert : quittance libératoire (RM-3.4.1) */
  solde: boolean;
  /** Ce que le terme doit encore après imputation */
  reste: number;
};

// Les montants passent par numeric côté base et par le JSON de PostgREST :
// comparer à zéro strictement ferait passer un centime d'arrondi pour une
// imputation. Un demi-centime est en dessous de tout montant réel.
const CENTIME = 0.005;

const arrondi = (v: number) => Math.round(v * 100) / 100;

/**
 * Les termes réellement servis par l'écriture : on compare la couverture de
 * chaque appel avant et après. Rendu du plus ancien au plus récent, l'ordre
 * dans lequel la règle les a servis.
 */
export function imputationsRealisees(avant: EtatAppel[], apres: EtatAppel[]): ImputationTerme[] {
  const couvertAvant = new Map(avant.map((l) => [l.appel_id, Number(l.montant_couvert)]));
  return [...apres]
    .sort((a, b) => a.periode.localeCompare(b.periode))
    .flatMap((l) => {
      const du = Number(l.montant_du);
      const couvert = Number(l.montant_couvert);
      const recu = couvert - (couvertAvant.get(l.appel_id) ?? 0);
      if (recu <= CENTIME) return [];
      return [
        {
          appel_id: l.appel_id,
          periode: l.periode,
          montant: arrondi(recu),
          solde: du - couvert <= CENTIME,
          reste: Math.max(0, arrondi(du - couvert)),
        },
      ];
    });
}

/** « juillet 2026 soldé, 500,00 € → quittance » — un terme, ce qu'il a reçu, ce qu'il produit. */
export function libelleImputation(imputations: ImputationTerme[]): string {
  return imputations
    .map((i) =>
      i.solde
        ? `${moisEnFrancais(i.periode)} soldé, ${eur(i.montant)} → quittance`
        : `${moisEnFrancais(i.periode)} réglé en partie, ${eur(i.montant)} (reste ${eur(i.reste)}) → reçu`
    )
    .join(" ; ");
}

/**
 * Le compte rendu complet affiché à l'agent après un encaissement :
 * combien, sur quels termes, et ce que chacun a produit.
 *
 * L'excédent n'est pas remboursé spontanément : il reste en avance sur le
 * prochain appel (RM-3.5.1). Le taire laisserait croire à de l'argent perdu.
 */
export function compteRenduEncaissement(
  montant: number,
  avant: EtatAppel[],
  apres: EtatAppel[]
): string {
  const imputations = imputationsRealisees(avant, apres);
  const impute = imputations.reduce((somme, i) => somme + i.montant, 0);
  const avance = arrondi(montant - impute);

  const phrases = [`${eur(montant)} encaissés`];
  phrases.push(
    imputations.length === 0
      ? "aucun terme à couvrir"
      : `imputés du terme le plus ancien au plus récent (RM-3.3.2) : ${libelleImputation(imputations)}`
  );
  if (avance > CENTIME) phrases.push(`${eur(avance)} en avance sur le prochain appel`);

  // Dire POURQUOI c'est un reçu et pas une quittance : quittancer un partiel,
  // c'est renoncer au solde (RM-3.4.2). Le reçu sera promu au solde (RM-3.4.1).
  const partiel = imputations.some((i) => !i.solde);
  const note = partiel
    ? " Un reçu constate le versement ; la quittance ne libère qu'au solde (RM-3.4.2)."
    : "";
  return `${phrases.join(" · ")}.${note}`;
}
