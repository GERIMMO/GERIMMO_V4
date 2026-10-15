// Décision D24-B du dirigeant (14/10/2026, fiches ARC-07 et ARC-04) : une facture externe déposée ne se modifie plus,
// donc un écran de relecture précède le dépôt, et le numéro ne peut servir qu'une fois pour un même artisan, sans tenir
// compte des majuscules ni des espaces autour. Depuis D24-C, la seule correction est l'annulation par un avoir
// (lib/artisan-prive-avoir.ts), suivie d'une nouvelle facture sous un autre numéro.
//
// Ce module ne lit un montant que par `montantEnCentimes`, le lecteur que l'action serveur emploie pour la même
// facture : l'écran de relecture montre donc exactement ce qui sera enregistré, au centime, sans nombre à virgule.
import { formaterTaille } from "@/lib/file-type";
import { montantEnCentimes } from "@/lib/devis-structure";

/** Le texte que la base renvoie (migration 20261014310000) quand le numéro est déjà pris. */
export const MESSAGE_NUMERO_FACTURE_UTILISE =
  "Ce numéro de facture est déjà utilisé dans votre registre (les majuscules et les espaces autour ne comptent pas). Chaque facture doit porter son propre numéro : vérifiez-le sur la pièce jointe.";

/** Aligné sur la base (artisan_externe_ecrire, action « facture ») : l'écart avec le devis doit être expliqué. */
export const JUSTIFICATION_ECART_MIN = 10;

export const MESSAGE_FACTURE_DEFINITIVE =
  "Une fois déposée, la facture ne se modifie plus : en cas d’erreur, vous pourrez seulement l’annuler par un avoir, puis déposer une nouvelle facture sous un autre numéro. Son numéro ne pourra plus servir pour une autre facture. Vérifiez qu’elle correspond exactement à la pièce jointe.";

export type EntreesRelectureFacture = {
  numero: string;
  /** Le montant tel que l'artisan l'a tapé (« 55,00 »). */
  montant: string;
  justification: string;
  fichier: { nom: string; taille: number } | null;
  /** Le total TTC du devis accepté, en centimes ; `null` s'il n'est pas connu de l'écran. */
  devisTtcCents: number | null;
};

export type ResumeRelectureFacture = {
  /** Tel qu'il sera enregistré : les espaces de bord sont retirés, la casse est conservée. */
  numero: string;
  montantCents: number | null;
  devisTtcCents: number | null;
  /** Facture moins devis, en centimes ; `null` quand l'un des deux manque. 0 : aucun écart. */
  ecartCents: number | null;
  justification: string;
  piece: { nom: string; taille: string } | null;
  /** Ce qui empêche le dépôt : l'écran le dit et ne propose alors que de corriger. */
  alertes: string[];
  pret: boolean;
};

/** Ce que l'écran de relecture montre avant le dépôt d'une facture externe, et ce qui bloque ce dépôt. */
export function resumerFacture(entrees: EntreesRelectureFacture): ResumeRelectureFacture {
  const numero = entrees.numero.trim();
  const justification = entrees.justification.trim();
  const lu = montantEnCentimes(entrees.montant);
  const montantCents = lu !== null && lu > 0 ? lu : null;
  const ecartCents = montantCents !== null && entrees.devisTtcCents !== null ? montantCents - entrees.devisTtcCents : null;
  const alertes: string[] = [];
  if (!numero) alertes.push("Indiquez le numéro figurant sur la facture.");
  if (montantCents === null) alertes.push("Indiquez un montant positif, au centime.");
  if (!entrees.fichier) alertes.push("Joignez la facture (PDF, JPEG ou PNG).");
  if (ecartCents !== null && ecartCents !== 0 && [...justification].length < JUSTIFICATION_ECART_MIN) {
    alertes.push(`Le montant diffère du devis accepté : expliquez l’écart (${JUSTIFICATION_ECART_MIN} caractères au moins).`);
  }
  return {
    numero,
    montantCents,
    devisTtcCents: entrees.devisTtcCents,
    ecartCents,
    justification,
    piece: entrees.fichier ? { nom: entrees.fichier.nom, taille: formaterTaille(entrees.fichier.taille) } : null,
    alertes,
    pret: alertes.length === 0,
  };
}
