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

/**
 * La même rubrique pour un bail sorti du brouillon (compléments du contrat en lecture seule), dont le contrat est déjà établi.
 * Phase 3, reprise du lot 45 (T16) : un contrat préparé avant les modèles actuels (tout bail préparé avant la version g8 des
 * documents, que l'activation relit avec `typographieArchivee` dans bail-nu.ts et bail-meuble.ts) imprime les travaux saisis
 * et leur montant, ou « Néant » sans travaux saisis, même pour une première location ; un contrat préparé depuis imprime
 * « Sans objet — première location ». Rien dans le dossier ne dit avec quels modèles un contrat signé a été préparé.
 * Hors première location, les deux disent la même chose (travaux et montant, ou « Néant »). Pour une première location,
 * l'écran montre la saisie (les travaux et leur montant, ou « Néant ») et renvoie au contrat signé (`renvoiContrat`), sans
 * affirmer l'une ou l'autre phrase. Phase 3, lot 48 (U03) : sans travaux saisis, l'écran affirmait « Sans objet — première
 * location », alors qu'un contrat préparé avant g8 imprime « Néant. — montant : —. ».
 */
export function travauxBailEtabli(bail: { precedente_location?: unknown; travaux_recents?: unknown }): { travaux: string; avecMontant: boolean; renvoiContrat: boolean } {
  if (bail.precedente_location === "premiere" && !absent(bail.travaux_recents)) return { travaux: String(bail.travaux_recents), avecMontant: true, renvoiContrat: true };
  if (bail.precedente_location === "premiere") return { travaux: "Néant", avecMontant: false, renvoiContrat: true };
  return { ...travauxSelonContrat(bail), renvoiContrat: false };
}

/** Le renvoi au contrat signé, sous la rubrique, quand `travauxBailEtabli` ne peut pas dire ce qu'il imprime. */
export const RENVOI_TRAVAUX_PREMIERE_LOCATION = "Ces travaux ont été saisis pour une première location. Un contrat préparé avec les modèles actuels porte « Sans objet — première location » à cette rubrique ; un contrat préparé auparavant reprend ces travaux et leur montant. Reportez-vous au contrat signé.";
/** Le même renvoi, pour une première location sans travaux saisis (lot 48, U03). */
export const RENVOI_SANS_TRAVAUX_PREMIERE_LOCATION = "Aucune saisie de travaux pour cette première location. Un contrat préparé avec les modèles actuels porte « Sans objet — première location » à cette rubrique ; un contrat préparé auparavant porte « Néant ». Reportez-vous au contrat signé.";
