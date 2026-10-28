import { formaterDate } from "./ged";
import { aujourdhuiParis, jourIsoValide } from "./dates";
export function jourValide(jour: string | null | undefined): jour is string {
  return jourIsoValide(jour);
}
export function jourAParis(date = new Date()) {
  return aujourdhuiParis(date);
}
type Document = { expire_le?: string | null; verifie_le?: string | null; purged_at?: string | null };
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
  return { libelle: "À vérifier", classe: "puce-grise", detail: "Fichier disponible, sans vérification ni échéance renseignée." };
}
