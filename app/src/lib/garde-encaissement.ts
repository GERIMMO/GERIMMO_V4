// Un encaissement de loyer très supérieur à ce qui est dû demande une confirmation (jamais un refus).
//
// Décision du dirigeant du 14/10/2026, D04 (2), option A, fiche VER-TS-02 : un « 840,00 » lu « 84000 » par un
// navigateur non francophone était encaissé sans alerte (84 000 €, deux quittances). Le champ est maintenant un
// texte que le serveur sait lire (lib/saisie-montant.ts) ; cette garde couvre l'autre moitié du risque, la faute de
// frappe qui reste un montant lisible (un zéro de trop, une virgule oubliée).
//
// RÈGLE. Au-delà de 2 × (reste dû + un terme), le serveur ne refuse pas : il renvoie un état « confirmation
// requise » avec le montant et le calcul. Le formulaire se ressoumet avec le drapeau `confirmation_montant`, qui
// porte le montant confirmé. Un drapeau qui ne porte pas EXACTEMENT le montant saisi ne confirme rien : rejouer la
// requête sans le drapeau, ou avec un autre montant, retombe sur la confirmation. « Au seuil » ne demande rien (la
// confirmation commence strictement au-delà).
//
// Tout se calcule en centimes entiers : 0,1 + 0,2 ne vaut pas 0,30000000000000004 ici.
import { eur } from "@/lib/ged";
import { lireMontant } from "@/lib/saisie-montant";

/** Une ligne de `etat_loyers_bail` : un terme appelé et la part déjà couverte par les encaissements. */
export type LigneTerme = { montant_du: number | string; montant_couvert: number | string };

/** Ce que le serveur renvoie au formulaire à la place d'un enregistrement. Sérialisable. */
export type ConfirmationEncaissement = {
  /** Le montant lu, au centime : celui que le drapeau de confirmation devra porter. */
  montant: number;
  resteDu: number;
  /** Le terme de référence : le plus élevé des termes appelés (à défaut, le loyer du bail). */
  terme: number;
  /** 2 × (reste dû + un terme) : la confirmation commence strictement au-delà. */
  seuil: number;
  message: string;
};

export type VerdictEncaissement =
  | { confirmationRequise: false }
  | { confirmationRequise: true; confirmation: ConfirmationEncaissement };

/** Nom du champ (bouton « Oui, encaisser ») qui porte le montant confirmé. */
export const CHAMP_CONFIRMATION_MONTANT = "confirmation_montant";

/** Les montants viennent de la base (numeric, rendu en nombre ou en texte) : on les passe en centimes entiers. */
function enCentimes(valeur: number | string | null | undefined): number {
  const n = Math.round(Number(valeur ?? 0) * 100);
  return Number.isFinite(n) ? n : 0;
}

export function seuilDeConfirmation(resteDu: number, terme: number): number {
  return (2 * (enCentimes(resteDu) + enCentimes(terme))) / 100;
}

function messageDeConfirmation(montant: number, resteDu: number, terme: number, seuil: number): string {
  if (enCentimes(resteDu) === 0 && enCentimes(terme) === 0) {
    return (
      `Rien n'est encore enregistré. Aucun loyer n'est appelé sur ce bail et le bail n'indique pas de loyer : ` +
      `impossible de dire si ${eur(montant)} est un montant habituel. ` +
      `Si le locataire a bien versé ${eur(montant)}, confirmez ; sinon corrigez le montant.`
    );
  }
  const attendu = (enCentimes(resteDu) + enCentimes(terme)) / 100;
  return (
    `Rien n'est encore enregistré. ${eur(montant)} dépasse le double de ce qui est attendu ` +
    `(reste dû ${eur(resteDu)} + un terme de ${eur(terme)} = ${eur(attendu)}, soit ${eur(seuil)} au plus pour un versement habituel). ` +
    `Vérifiez la virgule et les zéros. Si le locataire a bien versé ${eur(montant)}, confirmez ; sinon corrigez le montant.`
  );
}

/**
 * Dit si ce montant doit être confirmé. `lignes` est l'état des loyers du bail AVANT l'encaissement ;
 * `termeDeSecours` est le loyer + les charges du bail, utilisé quand aucun terme n'est encore appelé.
 */
export function evaluerEncaissement(montant: number, lignes: LigneTerme[], termeDeSecours = 0): VerdictEncaissement {
  const resteDuCentimes = lignes.reduce(
    (somme, l) => somme + Math.max(0, enCentimes(l.montant_du) - enCentimes(l.montant_couvert)),
    0
  );
  const termeCentimes = lignes.length > 0 ? Math.max(...lignes.map((l) => enCentimes(l.montant_du))) : enCentimes(termeDeSecours);
  const resteDu = resteDuCentimes / 100;
  const terme = termeCentimes / 100;
  const seuil = seuilDeConfirmation(resteDu, terme);
  if (enCentimes(montant) <= 2 * (resteDuCentimes + termeCentimes)) return { confirmationRequise: false };
  return {
    confirmationRequise: true,
    confirmation: { montant, resteDu, terme, seuil, message: messageDeConfirmation(montant, resteDu, terme, seuil) },
  };
}

/**
 * Le drapeau reçu confirme-t-il CE montant ? Il doit porter le montant saisi, au centime : un drapeau vide, illisible,
 * ou celui d'un autre montant ne confirme rien.
 */
export function confirmationDonnee(brut: FormDataEntryValue | null, montant: number): boolean {
  const lu = lireMontant(brut);
  return !("erreur" in lu) && enCentimes(lu.montant) === enCentimes(montant);
}
