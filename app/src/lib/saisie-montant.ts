// Les montants et les dates d'un encaissement, vérifiés une seule fois, côté serveur.
//
// Audit du 13/10/2026 (PROP-12, PROP-13, AUD-C-01) : l'encaissement acceptait
// 12,345 € (la base stocke 12.345, l'écran additionne puis arrondit : « reste
// dû » faux d'un centime d'une ligne à l'autre) et une date du 01/01/2027 (le
// montant était compté comme déjà reçu). Le champ HTML dit `step="0.01"`, mais
// un appel direct à l'action contourne le navigateur.
import { aujourdhuiParis } from "@/lib/ged";

/** Au-delà, la colonne `numeric(12,2)` déborderait : mieux vaut le dire. */
export const MONTANT_MAX = 9_999_999.99;

/**
 * Le seul message d'un montant illisible, dit à un seul endroit pour toutes les actions (VFL-04) : « 1 234,50 » et
 * « 1.234,50 » sont refusés plutôt que devinés (« 1.234 » est-il mille deux cent trente-quatre ou un euro
 * vingt-trois ?), et le refus doit dire quoi écrire.
 */
export const MESSAGE_MONTANT_INVALIDE = "Montant invalide : écrivez 1234,50, sans espace ni point de milliers.";

/** Même chose pour un nombre qui n'est pas de l'argent (l'indice IRL : 145,17). */
export const MESSAGE_DECIMAL_INVALIDE = "Valeur invalide : écrivez 145,17, sans espace.";

/**
 * Nomme le champ fautif quand un formulaire en porte plusieurs (« Loyer hors charges : montant invalide : écrivez
 * 1234,50… ») : la première lettre du message passe en minuscule, comme le fait déjà l'écran de fiscalité.
 */
export function erreurDuChamp(nom: string, erreur: string): string {
  return `${nom} : ${erreur.charAt(0).toLowerCase()}${erreur.slice(1)}`;
}

export type MontantLu = { montant: number } | { erreur: string };

/**
 * Lit un montant saisi, au centime près. « 12,5 » et « 12.5 » valent la même
 * chose ; « 12.345 » est refusé plutôt qu'arrondi en silence (le journal
 * comptable doit dire ce que la banque a dit).
 *
 * Le champ qui envoie ce texte est `type="text" inputMode="decimal"`, jamais
 * `type="number"` : un navigateur dont la langue n'est pas le français lit la
 * virgule de « 840,00 » comme un séparateur de milliers et envoie « 84000 »
 * (VER-TS-02). Seul le texte brut permet à cette fonction de voir la virgule.
 */
export function lireMontant(brut: FormDataEntryValue | null): MontantLu {
  const texte = String(brut ?? "").trim().replace(",", ".");
  if (/^\d+(\.\d{1,2})?$/.test(texte)) {
    const montant = Number(texte);
    if (montant <= 0) return { erreur: MESSAGE_MONTANT_INVALIDE };
    if (montant > MONTANT_MAX) return { erreur: "Montant trop élevé : vérifiez la saisie." };
    return { montant };
  }
  if (/^\d+\.\d{3,}$/.test(texte) && Number(texte) > 0) {
    return { erreur: "Le montant s'exprime au centime près : deux décimales au plus." };
  }
  return { erreur: MESSAGE_MONTANT_INVALIDE };
}

/**
 * Un montant facultatif : vide vaut « non renseigné » (`null`), zéro est admis,
 * le reste se lit comme `lireMontant`. Un texte illisible est refusé, jamais
 * pris pour « non renseigné » : converti en NaN, il deviendrait `null` dans
 * l'appel à la base et la saisie disparaîtrait sans que personne ne le voie.
 */
export function lireMontantFacultatif(brut: FormDataEntryValue | null): { montant: number | null } | { erreur: string } {
  const texte = String(brut ?? "").trim();
  if (texte === "") return { montant: null };
  if (/^0+([.,]0{1,2})?$/.test(texte)) return { montant: 0 };
  return lireMontant(texte);
}

export type DecimalLu = { valeur: number } | { erreur: string };

/**
 * Lit un nombre décimal qui n'est pas un montant (l'indice IRL, 145,17), tel que tapé : « 145,17 » et « 145.17 »
 * valent la même chose, jamais 14517. Ni arrondi ni seuil : ce que la base accepte, elle l'arrondit ou le refuse
 * elle-même. Comme pour un montant, le champ qui envoie ce texte est `type="text" inputMode="decimal"`.
 */
export function lireDecimal(brut: FormDataEntryValue | null): DecimalLu {
  const texte = String(brut ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(texte)) return { erreur: MESSAGE_DECIMAL_INVALIDE };
  const valeur = Number(texte);
  // Mille chiffres de suite ne sont pas un nombre : `Number` rend Infinity.
  if (!Number.isFinite(valeur)) return { erreur: MESSAGE_DECIMAL_INVALIDE };
  return { valeur };
}

/** Un décimal facultatif : vide vaut « non renseigné » (`null`), jamais zéro ; le reste se lit comme `lireDecimal`. */
export function lireDecimalFacultatif(brut: FormDataEntryValue | null): { valeur: number | null } | { erreur: string } {
  if (String(brut ?? "").trim() === "") return { valeur: null };
  return lireDecimal(brut);
}

/**
 * Une date d'événement qui a déjà eu lieu : vide (la base posera le jour),
 * ou une date valide qui n'est pas dans le futur à l'heure de Paris.
 */
export function verifierDateDejaPassee(
  brut: string | null,
  nom = "La date",
  aujourdhui: string = aujourdhuiParis()
): string | null {
  if (!brut) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(brut)) return `${nom} n'est pas valide.`;
  const d = new Date(`${brut}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== brut) return `${nom} n'est pas valide.`;
  if (brut > aujourdhui) return `${nom} ne peut pas être dans le futur : un encaissement a déjà eu lieu.`;
  return null;
}
