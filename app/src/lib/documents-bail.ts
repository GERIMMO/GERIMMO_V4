import { TYPES_DIAGNOSTIC } from "@/lib/parc";
import { ajouterMois, jourIsoValide } from "@/lib/dates";

export function expirationDiagnostic(type: string, realisation: string): string {
  const mois = TYPES_DIAGNOSTIC[type]?.validite_mois;
  if (mois == null || !dateValide(realisation)) return "";
  return echeanceReglementaire(type, realisation, dateApresMois(realisation, mois)) ?? "";
}

// Constat de risque d'exposition au plomb (CREP) qui relève du plomb au-dessus du seuil : il doit dater de moins de
// six ans à la signature du bail (art. L. 1334-7 et R. 1334-11 du code de la santé publique) ; sans plomb au-dessus
// du seuil, il n'a pas de limite de validité (DOC-07).
export const VALIDITE_CREP_POSITIF_MOIS = 72;
export function expirationCrepPositif(realisation: string): string {
  return dateValide(realisation) ? dateApresMois(realisation, VALIDITE_CREP_POSITIF_MOIS) : "";
}

const dateApresMois = ajouterMois;

// Décret n° 2020-1610 du 17/12/2020, art. 1 (art. D. 134-4-2 du CCH) : un DPE vaut dix ans, sauf ceux réalisés
// avant le 1er juillet 2021 — du 01/01/2013 au 31/12/2017 : valables jusqu'au 31/12/2022 ; du 01/01/2018 au
// 30/06/2021 : jusqu'au 31/12/2024. Le rapport de l'époque imprimait « dix ans » : cette échéance-là ne vaut plus.
// Même règle en base : public.echeance_reglementaire_diagnostic (blocage de mise en location, alertes).
export function plafondDpe(realisation: string | null | undefined): string | null {
  if (!realisation || !dateValide(realisation)) return null;
  if (realisation >= "2013-01-01" && realisation <= "2017-12-31") return "2022-12-31";
  if (realisation >= "2018-01-01" && realisation <= "2021-06-30") return "2024-12-31";
  return null;
}

// L'échéance qui fait foi : celle saisie, ramenée au plafond réglementaire quand il y en a un. Lecture seulement :
// l'échéance enregistrée n'est pas réécrite, elle est plafonnée partout où on la lit.
export function echeanceReglementaire(type: string, realisation: string | null | undefined, expiration: string | null): string | null {
  const plafond = type === "dpe" ? plafondDpe(realisation) : null;
  if (!plafond) return expiration;
  return expiration && expiration < plafond ? expiration : plafond;
}

export function avecEcheanceReglementaire<T extends { type: string; date_realisation: string | null; date_expiration: string | null }>(lignes: T[]): T[] {
  return lignes.map((d) => {
    const echeance = echeanceReglementaire(d.type, d.date_realisation, d.date_expiration);
    return echeance === d.date_expiration ? d : { ...d, date_expiration: echeance };
  });
}

// Refus d'une échéance de DPE postérieure au plafond réglementaire (le formulaire la pré-remplit déjà plafonnée).
export function erreurEcheanceDpe(type: string, realisation: string, expiration: string): string | undefined {
  const plafond = type === "dpe" ? plafondDpe(realisation) : null;
  if (!plafond || !expiration || expiration <= plafond) return undefined;
  const periode = plafond === "2022-12-31"
    ? "entre le 1er janvier 2013 et le 31 décembre 2017"
    : "entre le 1er janvier 2018 et le 30 juin 2021";
  return `Un DPE réalisé ${periode} n’est valable que jusqu’au ${plafond.split("-").reverse().join("/")} (décret n° 2020-1610), même si le rapport indique une date plus lointaine. Corrigez l’échéance.`;
}

const dateValide = jourIsoValide;

export function erreurDiagnosticBail(form: FormData, aujourd: string): string | undefined {
  const type = String(form.get("type") ?? ""), realisation = String(form.get("date_realisation") ?? ""), expiration = String(form.get("date_expiration") ?? "");
  if (!TYPES_DIAGNOSTIC[type]) return "Choisissez le type de diagnostic.";
  if (!dateValide(realisation) || realisation > aujourd) return "Recopiez une date de réalisation valide, non future, figurant sur le rapport.";
  if (expiration && (!dateValide(expiration) || expiration <= realisation)) return "La date d’expiration doit être valide et postérieure à la réalisation.";
  if (TYPES_DIAGNOSTIC[type].validite_mois != null && !expiration) return "Renseignez la date d’expiration indiquée sur le rapport.";
  if (type === "dpe" && !/^[A-G]$/.test(String(form.get("classe_dpe") ?? ""))) return "Renseignez la classe A à G du DPE.";
}

export type DiagnosticBail = {
  id: string; type: string; date_realisation: string; date_expiration: string | null;
  document_id: string | null; classe_dpe: string | null; niveau: "lot" | "bien";
};
export function statutPieceDiagnostic(d: DiagnosticBail, aujourd: string) {
  if (!d.document_id) return { libelle: "Fichier manquant", ton: "attention" };
  if (d.date_expiration && d.date_expiration < aujourd) return { libelle: "Expiré", ton: "attention" };
  if (!d.date_expiration && TYPES_DIAGNOSTIC[d.type]?.validite_mois != null) return { libelle: "Date à compléter", ton: "attention" };
  if (d.type === "dpe" && !d.classe_dpe) return { libelle: "Classe à compléter", ton: "attention" };
  return { libelle: "Disponible", ton: "ok" };
}

export type PieceBail = { id: string; titre: string | null; type: string; purged_at: string | null };
export function classerPiecesBail(pieces: PieceBail[], diagnosticIds: string[], reglementId: string | null) {
  const uniques = [...new Map(pieces.filter(p => !p.purged_at).map(p => [p.id, p])).values()];
  const notices = uniques.filter(p => p.type === "courrier" && p.titre === "Notice d'information (annexe au bail)");
  const exclus = new Set([...diagnosticIds, ...notices.map(p => p.id), reglementId]);
  const autres = uniques.filter(p => !exclus.has(p.id) && !["bail", "etat_des_lieux", "diagnostic", "reglement_copropriete"].includes(p.type));
  return { notices, autres };
}
