import { formaterDate } from "./ged";
export function jourValide(jour: string | null | undefined): jour is string {
  return Boolean(jour && /^\d{4}-\d{2}-\d{2}$/.test(jour) && Number.isFinite(Date.parse(jour)) && new Date(jour).toISOString().slice(0, 10) === jour);
}
export function jourAParis(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
type Document = { type?: string | null; expire_le?: string | null; verifie_le?: string | null; purged_at?: string | null };
// Les pièces que l'application produit ou reçoit dans un parcours (photo d'incident, devis et facture d'artisan, quittance,
// rapport, bail…) n'ont ni échéance ni vérification à faire : « À vérifier » n'appelle là aucune action (audit final, DOC-22).
// L'étiquette reste pour les pièces qui se contrôlent : diagnostic, assurance, identité, justificatif, et le type inconnu.
const TYPES_A_CONTROLER = new Set(["diagnostic", "attestation_assurance", "piece_identite", "justificatif"]);
/** Ne déduit jamais une validité du titre du fichier ni de sa durée de conservation. */
export function presentationDocument(doc: Document, signature: "signe" | "original" | "en_cours" | null = null, remplace = false) {
  if (doc.purged_at) return { libelle: "Fichier supprimé", classe: "puce-grise", detail: "Le fichier n’est plus disponible." };
  if (remplace) return { libelle: "Remplacé", classe: "puce-grise", detail: "Consultez la version courante." };
  if (jourValide(doc.expire_le) && doc.expire_le < jourAParis()) return { libelle: "Expiré", classe: "puce-prep", detail: `Non valide depuis le ${formaterDate(doc.expire_le)} : à renouveler.` };
  if (signature === "signe") return { libelle: "Signé", classe: "puce-loue", detail: "Signature terminée et document signé archivé. L’activation de la location se vérifie sur le bail." };
  if (signature === "original") return { libelle: "Original non signé", classe: "puce-grise", detail: "La version signée est un document distinct dans ce dossier." };
  if (signature === "en_cours") return { libelle: "Signature en cours", classe: "puce-prep", detail: "La signature complète n’est pas encore archivée." };
  if (jourValide(doc.expire_le)) return { libelle: "Valide", classe: "puce-loue", detail: `Valide jusqu’au ${formaterDate(doc.expire_le)}, selon l’échéance renseignée.` };
  if (doc.expire_le) return { libelle: "À vérifier", classe: "puce-grise", detail: "L’échéance renseignée n’est pas une date valide." };
  if (doc.verifie_le) return { libelle: "Vérifié", classe: "puce-loue", detail: `Vérifié le ${formaterDate(doc.verifie_le)}. Aucune échéance renseignée.` };
  if (doc.type && !TYPES_A_CONTROLER.has(doc.type)) return { libelle: "Classé", classe: "puce-grise", detail: "Fichier disponible dans vos documents." };
  return { libelle: "À vérifier", classe: "puce-grise", detail: "Fichier disponible, sans vérification ni échéance renseignée." };
}
