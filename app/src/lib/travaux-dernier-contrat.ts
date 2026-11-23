// Module sans dépendance serveur : il sert au récapitulatif avant signature comme à l'écran (client) des compléments du bail.
const absent = (v: unknown) => v == null || String(v).trim() === "";

/**
 * La rubrique des travaux faits depuis la fin du dernier contrat, telle que le contrat l'imprime (travauxDepuisDernierContrat,
 * documents/modeles/mentions-location.ts) : première location → « Sans objet — première location » ; sans texte de travaux →
 * « Néant » ; sinon les travaux, puis leur montant. Phase 3, lot 45 (T16) : le récapitulatif avant signature et les compléments
 * en lecture seule d'un bail signé suivent cette règle ; des travaux saisis pour une première location, ou un montant saisi
 * sans travaux, ne s'affichent pas, puisque le contrat ne les imprime pas.
 */
export function travauxSelonContrat(bail: { precedente_location?: unknown; travaux_recents?: unknown }): { travaux: string; avecMontant: boolean } {
  if (bail.precedente_location === "premiere") return { travaux: "Sans objet — première location", avecMontant: false };
  if (absent(bail.travaux_recents)) return { travaux: "Néant", avecMontant: false };
  return { travaux: String(bail.travaux_recents), avecMontant: true };
}
