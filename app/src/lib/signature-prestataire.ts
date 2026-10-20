import * as zoho from "./zoho-sign";
import type { CircuitBail } from "./signature-bail";

// Le type historique reste lisible ; aucune ancienne demande n'est redirigée vers Zoho.
export type PrestataireSignature = "zoho" | "youtrust";
export type ConfigurationSignature = zoho.ConfigurationZohoSign;
export function prestataireSignature(env: Record<string, string | undefined> = process.env): PrestataireSignature {
  return env.SIGNATURE_BAIL_PRESTATAIRE === "youtrust" ? "youtrust" : "zoho";
}
export const lireDemandeSignature = (c: ConfigurationSignature, id: string) => zoho.lireDemandeZoho(c, id);
export const annulerDemandeSignature = (c: ConfigurationSignature, id: string) => zoho.annulerDemandeZoho(c, id);
export const supprimerBrouillonSignature = (c: ConfigurationSignature, id: string) => zoho.supprimerBrouillonZoho(c, id);
export const telechargerDocumentSignature = (c: ConfigurationSignature, id: string, doc: string) => zoho.telechargerDocumentSigneZoho(c, id, doc);
export const telechargerPreuveSignature = (c: ConfigurationSignature, id: string, _personne: string) => zoho.telechargerPreuveZoho(c, id);
export const preparerCircuitSignature = (p: Parameters<typeof zoho.preparerCircuitZoho>[0]) => zoho.preparerCircuitZoho(p);
export async function activerDemandeSignature(c: ConfigurationSignature, id: string, circuit: CircuitBail) {
  await zoho.activerDemandeZoho(c, id, circuit);
}
