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

export type MontantLu = { montant: number } | { erreur: string };

/**
 * Lit un montant saisi, au centime près. « 12,5 » et « 12.5 » valent la même
 * chose ; « 12.345 » est refusé plutôt qu'arrondi en silence (le journal
 * comptable doit dire ce que la banque a dit).
 */
export function lireMontant(brut: FormDataEntryValue | null): MontantLu {
  const texte = String(brut ?? "").trim().replace(",", ".");
  if (/^\d+(\.\d{1,2})?$/.test(texte)) {
    const montant = Number(texte);
    if (montant <= 0) return { erreur: "Montant invalide." };
    if (montant > MONTANT_MAX) return { erreur: "Montant trop élevé : vérifiez la saisie." };
    return { montant };
  }
  if (/^\d+\.\d{3,}$/.test(texte) && Number(texte) > 0) {
    return { erreur: "Le montant s'exprime au centime près : deux décimales au plus." };
  }
  return { erreur: "Montant invalide." };
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
