import type { ValeursParcoursBail } from "./champs-etape-bail";
import { formaterDate } from "./ged";
import { numeroTrimestreIrl } from "./baux";

/** Un bail terminé ou en préavis du lot, tel que le lisent commencerBail et la page du bail pour préparer une
 * relocation (décision du 27/10, CB-08) : chaque `select` reste un littéral dans son fichier (contrôle des embeds). */
export type BailPrecedent = {
  id: string;
  chambre_id: string | null;
  type: string;
  date_debut: string | null;
  date_fin: string | null;
  date_sortie_reelle: string | null;
  loyer_hc: number | null;
  charges: number | null;
  charges_mode: string | null;
  jour_echeance: number | null;
  paiement_echeance: string | null;
  revision_irl: boolean | null;
  irl_trimestre: string | null;
  irl_valeur: number | null;
};

/** Champs de l’étape Loyer proposés au nouveau brouillon depuis le bail précédent. Jamais le locataire, les garants,
 * les dates ni le dépôt de garantie versé : la mention « Repris du bail précédent » et son effacement portent sur eux. */
export const CHAMPS_LOYER_REPRIS = ["loyer_hc", "charges", "charges_mode", "jour_echeance", "paiement_echeance", "revision_irl", "irl_trimestre", "irl_valeur"] as const;

/** Fin d’occupation connue (sortie réelle, sinon terme), à défaut le début : sert à désigner le bail le plus récent. */
const finOccupation = (bail: BailPrecedent) => bail.date_sortie_reelle ?? bail.date_fin ?? bail.date_debut ?? "";

/** Le bail précédent le plus récent du lot entier, ou de la même chambre pour une colocation à baux individuels :
 * un bail de chambre n’est jamais repris pour le lot entier, ni l’inverse. Les baux sont déjà filtrés (terminés ou en préavis). */
export function bailPrecedentDuLot<T extends BailPrecedent>(baux: readonly T[], chambreId: string | null = null): T | null {
  return baux.filter(bail => (bail.chambre_id ?? null) === chambreId)
    .sort((a, b) => finOccupation(b).localeCompare(finOccupation(a)) || b.id.localeCompare(a.id))[0] ?? null;
}

/** Valeurs proposées au nouveau brouillon. Le type n’est repris que s’il est nu ou meublé ; un bail nu garde des
 * provisions sur charges, le forfait n’étant ouvert qu’à la colocation ou au meublé (contrat type, section IV.B). */
export function valeursReprisesDuBail(precedent: BailPrecedent, typeParDefaut: "nu" | "meuble"): ValeursParcoursBail {
  const reprises: ValeursParcoursBail = { type: precedent.type === "nu" || precedent.type === "meuble" ? precedent.type : typeParDefaut };
  for (const nom of CHAMPS_LOYER_REPRIS) if (precedent[nom] != null) reprises[nom] = precedent[nom];
  // Le trimestre IRL est repris sans son année : l'indice de référence du nouveau contrat est celui publié à sa
  // signature, l'année reste à choisir (relecture BAIL-02).
  const trimestre = numeroTrimestreIrl(precedent.irl_trimestre);
  if (precedent.irl_trimestre != null) reprises.irl_trimestre = trimestre ? `T${trimestre}` : precedent.irl_trimestre;
  if (reprises.type === "nu" && reprises.charges_mode === "forfait") reprises.charges_mode = "provision";
  return reprises;
}

/** « du 01/09/2023 au 31/08/2026 » ; sans fin connue (préavis en cours), « depuis le 01/09/2023 ». */
export function periodeBailPrecedent(precedent: BailPrecedent): string {
  const fin = precedent.date_sortie_reelle ?? precedent.date_fin;
  if (!precedent.date_debut) return fin ? `jusqu’au ${formaterDate(fin)}` : "";
  return fin ? `du ${formaterDate(precedent.date_debut)} au ${formaterDate(fin)}` : `depuis le ${formaterDate(precedent.date_debut)}`;
}
