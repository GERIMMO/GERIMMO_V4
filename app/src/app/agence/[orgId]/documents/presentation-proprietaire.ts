import { eur } from "@/lib/ged";
import { presentationDocument } from "@/lib/presentation-document";
import { titreAffiche } from "./titre-document";

type Facture = { montant_ttc_cents: number; validee_le: string | null; decision_motif: string | null };
export function titreDocumentProprietaire(titre: string | null | undefined, contexte?: { incident?: string | null; facture?: Facture | null }) {
  const original = titreAffiche(titre);
  if (!original) return "Document sans titre";
  let nature: string | null = null;
  if (/^Facture .+ — incident INC-/i.test(original)) nature = "Facture d’artisan";
  else if (/^Devis — incident INC-/i.test(original)) nature = "Devis d’intervention";
  else if (/^Chantier \(apres\) — INC-/i.test(original)) nature = "Photo après intervention";
  else if (/^Chantier \(avant\) — INC-/i.test(original)) nature = "Photo avant intervention";
  else if (/^Photo — INC-/i.test(original)) nature = "Photo de l’incident";
  if (!nature) return original;
  const montant = contexte?.facture?.montant_ttc_cents;
  return [nature, contexte?.incident?.trim(), montant != null && Number.isSafeInteger(Number(montant)) && Number(montant) >= 0 ? eur(Number(montant) / 100) : null].filter(Boolean).join(" — ");
}

/** Disponible ne signifie ni vérifié, ni payé, ni signé. Les états probants priment. */
export function presentationDocumentProprietaire(doc: Parameters<typeof presentationDocument>[0], signature: Parameters<typeof presentationDocument>[1] = null, remplace = false, facture?: Facture | null) {
  const presentation = presentationDocument(doc, signature, remplace);
  if (presentation.libelle !== "À vérifier" || doc.expire_le) return presentation;
  if (facture && !facture.validee_le && !facture.decision_motif) return { libelle: "À valider", classe: "puce-prep", detail: "Cette facture attend votre décision dans le dossier d’intervention." };
  return { libelle: "Disponible", classe: "puce-grise", detail: "Fichier disponible. Sa présence ne vaut pas validation de son contenu." };
}
