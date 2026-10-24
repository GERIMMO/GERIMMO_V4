/** Choix explicite par modèle, indépendant du titre libre d'un fichier déposé. */
export const DOCUMENTS_ZOHO = {
  bail: "Bail de location",
  devis_artisan: "Acceptation du devis",
  avenant: "Avenant au bail",
  cautionnement: "Acte de cautionnement",
  edl: "État des lieux",
  protocole_apurement: "Accord d’échelonnement",
  autorisation_travaux: "Accord de travaux",
} as const;
export type ModeleSignature = keyof typeof DOCUMENTS_ZOHO;
export type SelectionSignature = { code: ModeleSignature; cibleId: string; options?: Record<string, string> };
export const DOCUMENTS_SIGNATURE_ENREGISTREE = new Set([
  "quittance", "avis_echeance", "recu_depot", "revision_irl", "prorata", "rappel_assurance",
  "decompte_restitution", "conge_bailleur", "attestation_loyer", "attestation_caf", "relance_simple",
  "seconde_relance", "mise_en_demeure", "situation_dette", "accuse_conge", "decompte_retenues", "attestation_fin_bail",
]);
export function modeSignatureDocument(code: string): "zoho" | "enregistree" | "original" {
  if (Object.hasOwn(DOCUMENTS_ZOHO, code) || ["bail_nu", "bail_meuble", "bail_colocation", "bail_individuel"].includes(code)) return "zoho";
  return DOCUMENTS_SIGNATURE_ENREGISTREE.has(code) ? "enregistree" : "original";
}
export function selectionSignatureValide(value: SelectionSignature): SelectionSignature {
  if (!value || !Object.hasOwn(DOCUMENTS_ZOHO, value.code) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.cibleId)) throw new Error("Document à signer invalide.");
  const autorisees: Record<ModeleSignature, string[]> = {
    devis_artisan: [], bail: [], avenant: ["objet", "modifications"], cautionnement: ["garant", "forme", "montant_max", "sans_garantie_cumulee"],
    edl: [], protocole_apurement: ["mensualites", "premiere_echeance", "conditions"],
    autorisation_travaux: ["travaux", "intervenant", "periode", "prise_en_charge", "conditions"],
  };
  const options: Record<string,string> = {};
  for (const cle of autorisees[value.code]) {
    const contenu = value.options?.[cle];
    if (contenu !== undefined) {
      if (typeof contenu !== "string" || contenu.length > 6000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(contenu)) throw new Error("Une information du document est invalide.");
      options[cle] = contenu.trim();
    }
  }
  return { code: value.code, cibleId: value.cibleId, options };
}
/** Estimation minimale : 5 crédits par enveloppe + 0,5 par premier SMS.
 * Les renvois de SMS chez Zoho ne sont pas observables à partir du seul envoi. */
export function estimationSignature(nombreSignataires: number) {
  if (!Number.isInteger(nombreSignataires) || nombreSignataires < 1 || nombreSignataires > 25) throw new Error("Prévoyez de 1 à 25 signataires par document.");
  return { demiCredits: 10 + nombreSignataires, credits: 5 + nombreSignataires / 2 };
}
