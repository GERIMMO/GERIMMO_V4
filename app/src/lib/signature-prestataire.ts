import * as youtrust from "./youtrust";
import * as zoho from "./zoho-sign";
import type { CircuitBail } from "./signature-bail";

export type PrestataireSignature = "zoho" | "youtrust";
export type ConfigurationSignature = zoho.ConfigurationZohoSign | (youtrust.ConfigurationYoutrust & { prestataire: "youtrust" });
export function prestataireSignature(env: Record<string, string | undefined> = process.env): PrestataireSignature {
  return env.SIGNATURE_BAIL_PRESTATAIRE === "youtrust" ? "youtrust" : "zoho";
}
export const lireDemandeSignature = (c: ConfigurationSignature, id: string) => c.prestataire === "zoho" ? zoho.lireDemandeZoho(c, id) : youtrust.lireDemandeYoutrust(c, id);
export const annulerDemandeSignature = (c: ConfigurationSignature, id: string) => c.prestataire === "zoho" ? zoho.annulerDemandeZoho(c, id) : youtrust.annulerDemandeYoutrust(c, id);
export const supprimerBrouillonSignature = (c: ConfigurationSignature, id: string) => c.prestataire === "zoho" ? zoho.supprimerBrouillonZoho(c, id) : youtrust.supprimerBrouillonYoutrust(c, id);
export const telechargerDocumentSignature = (c: ConfigurationSignature, id: string, doc: string) => c.prestataire === "zoho" ? zoho.telechargerDocumentSigneZoho(c, id, doc) : youtrust.telechargerDocumentSigneYoutrust(c, id, doc);
export const telechargerPreuveSignature = (c: ConfigurationSignature, id: string, personne: string) => c.prestataire === "zoho" ? zoho.telechargerPreuveZoho(c, id) : youtrust.telechargerPreuveYoutrust(c, id, personne);
export function preparerCircuitSignature(p: Omit<Parameters<typeof youtrust.preparerCircuitYoutrust>[0], "config"> & { config: ConfigurationSignature }) {
  return p.config.prestataire === "zoho" ? zoho.preparerCircuitZoho({ ...p, config: p.config }) : youtrust.preparerCircuitYoutrust({ ...p, config: p.config });
}
export async function activerDemandeSignature(c: ConfigurationSignature, id: string, circuit: CircuitBail) {
  if (c.prestataire === "zoho") await zoho.activerDemandeZoho(c, id, circuit);
  else await youtrust.activerDemandeYoutrust(c, id);
}
