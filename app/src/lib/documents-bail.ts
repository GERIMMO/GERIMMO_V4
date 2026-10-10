import { TYPES_DIAGNOSTIC } from "@/lib/parc";

export function expirationDiagnostic(type: string, realisation: string): string {
  const mois = TYPES_DIAGNOSTIC[type]?.validite_mois;
  if (mois == null || !dateValide(realisation)) return "";
  const [annee, moisDepart, jour] = realisation.split("-").map(Number);
  const fin = new Date(Date.UTC(annee, moisDepart - 1 + mois, 1));
  const dernier = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth() + 1, 0)).getUTCDate();
  fin.setUTCDate(Math.min(jour, dernier));
  return fin.toISOString().slice(0, 10);
}

function dateValide(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}

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
