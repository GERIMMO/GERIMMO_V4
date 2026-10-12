import type { PropositionDevis, LigneProposee } from "./proposition-devis-ia";
export type BrouillonDevis = {
  diagnostic: string; delai: string; duree: string; contraintes: string; observations: string;
  valideJusquAu: string; lignes: LigneProposee[]; prestations?: string;
};
export type ProfilDocumentArtisan = { adresse: string; mentions: string; logo_data: string | null };
export type PreparationDevis = {
  sollicitation_id: string; artisan_id: string; reference_id: string; revision: number;
  saisie: BrouillonDevis; proposition: PropositionDevis | null; entreprise: Record<string, unknown> | null;
  statut: "brouillon" | "valide" | "envoye"; pdf_path: string | null; pdf_sha: string | null;
  pdf_taille: number | null; pdf_bucket: "documents" | "devis-preparations"; devis_id: string | null; email_statut: "non_envoye" | "envoye" | "echec";
};
export function brouillonDepuisFormulaire(form: FormData): BrouillonDevis {
  const t = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const lignes = JSON.parse(String(form.get("lignes_devis") ?? "[]"));
  if (!Array.isArray(lignes) || lignes.length > 100) throw new Error("Vérifiez les prestations.");
  if (lignes.some(l => !l || typeof l !== "object" || typeof l.libelle !== "string" || l.libelle.length > 1000 ||
    (l.code !== undefined && (typeof l.code !== "string" || l.code.length > 100)) ||
    [l.quantite, l.prix_unitaire_ht_cents, l.tva_bps].some(n => n !== null && (typeof n !== "number" || !Number.isFinite(n) || n < 0)))) {
    throw new Error("Vérifiez les libellés et les montants des prestations.");
  }
  return { diagnostic:t("diagnostic",4000), delai:t("delai",240), duree:t("duree",240),
    contraintes:t("contraintes",3000), observations:t("observations",3000),
    valideJusquAu:t("valide_jusqu_au",10), lignes };
}
