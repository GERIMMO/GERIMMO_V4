// Le règlement déclaratif de la facture d'intervention (décision D23 du 14/10/2026, option A ; fiches PRO2-21, CHN-02).
//
// Le propriétaire ou le gérant DÉCLARE avoir réglé l'artisan : date, moyen, montant (partiel admis), référence
// facultative. Gerimmo n'exécute aucun paiement, aucun virement, aucun prélèvement. La base écrit, dans la même
// transaction, le règlement et la dépense comptable liée (migration 20261014610000) ; ce module ne porte que les règles
// d'affichage et de lecture d'un formulaire, communes aux écrans du gérant et de l'artisan et aux tests.
//
// AUCUN NOMBRE N'EST LU ICI AVEC Number() SUR UNE SAISIE : les montants passent par `lireMontant` (lib/saisie-montant.ts).
import { eur, formaterDate } from "@/lib/ged";

/** Les moyens de règlement, mêmes valeurs que le registre privé de l'artisan (`artisan_reglements.moyen`). */
export const MOYENS_REGLEMENT = {
  virement: "Virement",
  cheque: "Chèque",
  especes: "Espèces",
  carte: "Carte",
  autre: "Autre",
} as const;

export type MoyenReglement = keyof typeof MOYENS_REGLEMENT;

export const MESSAGE_MOYEN_INVALIDE = "Choisissez le moyen de règlement : virement, chèque, espèces, carte ou autre.";

/** Lit le moyen choisi dans le formulaire : une des cinq valeurs, sinon un refus qui les nomme. */
export function lireMoyenReglement(brut: FormDataEntryValue | null): { moyen: MoyenReglement } | { erreur: string } {
  const texte = typeof brut === "string" ? brut.trim() : "";
  if (Object.hasOwn(MOYENS_REGLEMENT, texte)) return { moyen: texte as MoyenReglement };
  return { erreur: MESSAGE_MOYEN_INVALIDE };
}

/** « par virement », « par chèque »… : la tournure d'une phrase (« Réglée le 10/10/2026 par virement »). */
export function moyenEnToutesLettres(moyen: string | null | undefined): string {
  const libelle = moyen && Object.hasOwn(MOYENS_REGLEMENT, moyen) ? MOYENS_REGLEMENT[moyen as MoyenReglement] : null;
  if (!libelle) return "";
  return libelle === "Autre" ? "par un autre moyen" : `par ${libelle.toLowerCase()}`;
}

/**
 * La date d'un règlement déclaré : obligatoire, valide, jamais dans le futur à l'heure de Paris. La base refait le même
 * contrôle au jour de Paris (`aujourdhui_paris()`) ; l'action le fait d'abord pour répondre dans les mots du formulaire.
 */
export function verifierDateReglement(brut: string | null, aujourdhui: string): string | null {
  if (!brut) return "Indiquez la date du règlement.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(brut)) return "La date du règlement n'est pas valide.";
  const d = new Date(`${brut}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== brut) return "La date du règlement n'est pas valide.";
  if (brut > aujourdhui) return `La date du règlement ne peut pas être dans le futur (aujourd'hui : ${formaterDate(aujourdhui)}).`;
  return null;
}

/** L'état calculé d'une facture : déposée → validée → partiellement réglée → réglée (B.4). */
export type EtatReglementFacture = "deposee" | "validee" | "partiellement_reglee" | "reglee";

export type FacturePourEtat = { montant_ttc_cents: number | string; validee_le: string | Date | null };
export type ReglementPourEtat = { montant_cents: number | string; retire_le: string | Date | null };

/**
 * La même règle que `public.etat_facture_intervention` (la base), appliquée aux lignes que l'écran du gérant lit par la
 * politique de l'organisation : les règlements retirés ne comptent pas ; le total ne dépasse jamais la facture (la base
 * le garantit), mais l'écran ne présume rien et plafonne le reste à zéro.
 */
export function etatReglementFacture(
  facture: FacturePourEtat,
  reglements: readonly ReglementPourEtat[]
): { etat: EtatReglementFacture; totalRegleCents: number; resteCents: number } {
  const montant = Number(facture.montant_ttc_cents);
  const totalRegleCents = reglements.filter((r) => !r.retire_le).reduce((somme, r) => somme + Number(r.montant_cents), 0);
  const resteCents = Math.max(0, montant - totalRegleCents);
  const etat: EtatReglementFacture = !facture.validee_le
    ? "deposee"
    : totalRegleCents === 0
      ? "validee"
      : totalRegleCents < montant
        ? "partiellement_reglee"
        : "reglee";
  return { etat, totalRegleCents, resteCents };
}

/** Ce que lit le gérant sur la facture (B.8). */
export const LIBELLES_ETAT_REGLEMENT: Record<EtatReglementFacture, string> = {
  deposee: "Déposée, à contrôler",
  validee: "Validée, à régler",
  partiellement_reglee: "Partiellement réglée",
  reglee: "Réglée",
};

/**
 * La phrase d'état côté gérant : « Réglée le 12/10/2026 » ou « Reste à régler : 139,68 € » (B.8). `regleeLe` est la date
 * du dernier règlement quand la facture est soldée (colonne `reglee_le`).
 */
export function phraseEtatReglement(etat: EtatReglementFacture, resteCents: number, regleeLe: string | Date | null): string {
  if (etat === "reglee") return regleeLe ? `Réglée le ${formaterDate(typeof regleeLe === "string" ? regleeLe : regleeLe.toISOString())}` : "Réglée";
  if (etat === "partiellement_reglee") return `Reste à régler : ${eur(resteCents / 100)}`;
  if (etat === "validee") return `Reste à régler : ${eur(resteCents / 100)}`;
  return "Facture déposée, à contrôler avant tout règlement";
}

/** Un règlement vu par l'artisan : la date et le moyen seulement (réponse 3 de la fiche B.15). */
export type ReglementVuParArtisan = { date_reglement: string; moyen: string };

export type FactureVueParArtisan = {
  facture_id: string;
  intervention_id: string;
  organization_id: string;
  numero: string;
  montant_ttc_cents: number;
  validee_le: string | null;
  etat: EtatReglementFacture;
  reglee_le: string | null;
  reglements: ReglementVuParArtisan[];
};

/**
 * Ce que lit l'artisan sur sa facture : l'état déclaré par son client, sans montant de règlement (B.8, B.15-3).
 *  - « Réglée le 12/10/2026 par chèque (déclaré par votre client) »
 *  - « Partiellement réglée : 2 règlements déclarés par votre client »
 *  - « Validée par votre client, règlement à venir » / « Déposée, en attente de contrôle »
 */
export function phraseEtatPourArtisan(f: Pick<FactureVueParArtisan, "etat" | "reglee_le" | "reglements">): string {
  if (f.etat === "reglee") {
    const dernier = f.reglements[f.reglements.length - 1];
    const quand = f.reglee_le ?? dernier?.date_reglement ?? null;
    const moyen = dernier ? moyenEnToutesLettres(dernier.moyen) : "";
    return `Réglée${quand ? ` le ${formaterDate(quand)}` : ""}${moyen ? ` ${moyen}` : ""} (déclaré par votre client)`;
  }
  if (f.etat === "partiellement_reglee") {
    const n = f.reglements.length;
    return `Partiellement réglée : ${n} règlement${n > 1 ? "s" : ""} déclaré${n > 1 ? "s" : ""} par votre client`;
  }
  if (f.etat === "validee") return "Validée par votre client, règlement à venir";
  return "Déposée, en attente de contrôle";
}

/** La ligne d'un règlement vu par l'artisan : « Règlement déclaré le 01/10/2026 par virement ». */
export function ligneReglementPourArtisan(r: ReglementVuParArtisan): string {
  const moyen = moyenEnToutesLettres(r.moyen);
  return `Règlement déclaré le ${formaterDate(r.date_reglement)}${moyen ? ` ${moyen}` : ""}`;
}

/**
 * Le bandeau quand l'incident est imputé au locataire (réponse 2 de la fiche B.15, décision D23) : le propriétaire règle
 * l'artisan ; la refacturation au locataire n'est pas gérée dans cette version, aucune créance n'est créée sur le bail.
 */
export const MESSAGE_IMPUTATION_LOCATAIRE =
  "Cet incident est imputé au locataire. Le règlement enregistré ici est celui que vous faites à l'artisan : la refacturation au locataire n'est pas gérée dans cette version, aucune créance n'est créée sur le bail.";

/** Le rappel posé sous le formulaire et sur la facture : rien ne part de la banque par Gerimmo. */
export const MESSAGE_AUCUN_PAIEMENT = "Aucun paiement bancaire n'est effectué par Gerimmo : vous déclarez un règlement déjà fait.";

/** Les imputations pour lesquelles le bandeau s'affiche. */
export function imputationAuLocataire(imputation: string | null | undefined): boolean {
  return imputation === "locataire" || imputation === "degradation_fautive";
}
