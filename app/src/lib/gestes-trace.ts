/**
 * Les gestes financiers que la trace d'entrée du super-administrateur sait nommer (audit du 13/10, SA-01,
 * décision D08 option A, relecture).
 *
 * Avant : la ligne d'audit d'un geste disait la page d'où il part (« rubrique parc ») et l'empreinte
 * illisible de l'action serveur. Un encaissement saisi depuis la fenêtre de lot ne disait ni « encaissement »
 * ni quel bail : l'adresse de cette fenêtre ne porte aucun identifiant de bail.
 *
 * Maintenant, chaque action financière passe son NOM (le code ci-dessous) et sa CIBLE (l'identifiant du
 * bail, du rapport, de l'écriture… qu'elle modifie) à `verifierGerant`. La ligne écrit `geste` et `objet_id`
 * (la cible l'emporte sur l'objet de la page) ; la console dit le geste en français, sans l'identifiant.
 *
 * Aucun droit ne change : ce n'est qu'une description de la ligne d'audit. Le code n'a que des minuscules,
 * des chiffres et des tirets bas, et il est limité à cette liste : un nom inconnu n'est jamais écrit.
 * Chaque nouvelle action financière s'y ajoute (tests/gestes-trace.test.ts le vérifie sur le code).
 */
export const GESTES_TRACE = {
  // Loyers et quittances d'un bail (actions/loyers.ts, actions/quittancement.ts)
  envoi_quittance: "envoi d’une quittance au locataire",
  ajout_relance: "ajout d’une relance de loyer",
  suppression_relance: "suppression d’une relance de loyer",
  regularisation_charges: "régularisation des charges d’un bail",
  generation_appels: "génération des appels de loyer d’un bail",
  encaissement: "encaissement d’un loyer",
  suppression_encaissement: "suppression d’un encaissement de loyer",
  revision_loyer: "révision du loyer d’un bail",
  emission_quittances: "émission des reçus et quittances d’un bail",
  encaissement_reste: "encaissement du reste dû d’un appel",
  emission_quittance_bail: "émission des reçus et quittances d’un bail soldé",
  envoi_quittances_mois: "envoi groupé des quittances d’un mois",
  // Comptabilité du mandat (actions/compta.ts)
  generation_rapport: "génération d’un rapport de gestion",
  envoi_rapport: "envoi d’un rapport de gestion",
  versement_proprietaire: "enregistrement d’un versement au propriétaire",
  ecriture_comptable: "ajout d’une écriture comptable",
  contre_ecriture: "passage d’une contre-écriture",
  ventilation_depense: "ventilation d’une dépense",
  cloture_mois: "clôture d’un mois comptable",
  // Dépôt de garantie (actions/depot.ts) et restitution (actions/restitution.ts)
  encaissement_depot: "encaissement d’un dépôt de garantie",
  suppression_encaissement_depot: "suppression d’un encaissement de dépôt de garantie",
  demarrage_restitution: "ouverture du décompte de restitution du dépôt",
  ajout_retenue: "ajout d’une retenue sur le dépôt",
  suppression_retenue: "suppression d’une retenue sur le dépôt",
  justification_retenue: "justification d’une retenue sur le dépôt",
  actualisation_restitution: "actualisation des montants de la restitution",
  decompte_envoye: "décompte de restitution marqué comme envoyé",
  finalisation_decompte: "finalisation du décompte de restitution",
  // Règlement déclaratif de la facture d'intervention (actions/reglement-facture.ts, décision D23)
  reglement_facture: "déclaration du règlement d’une facture d’intervention",
  retrait_reglement_facture: "retrait d’un règlement de facture d’intervention",
  // Appels de charges (actions/appels-charges.ts)
  creation_appel_charges: "création d’un appel de charges",
  ajout_poste_charge: "ajout d’un poste de charges",
  modification_poste_charge: "modification d’un poste de charges",
  suppression_poste_charge: "suppression d’un poste de charges",
  validation_ventilation: "validation de la ventilation des charges",
  suppression_appel_charges: "suppression d’un appel de charges",
} as const;

export type CodeGeste = keyof typeof GESTES_TRACE;

/** Ce qu'une action financière dit d'elle-même à la porte des gestes : son nom et la cible qu'elle modifie. */
export type GesteTrace = { geste: CodeGeste; cible?: string | null };

export function estCodeGeste(valeur: unknown): valeur is CodeGeste {
  return typeof valeur === "string" && Object.hasOwn(GESTES_TRACE, valeur);
}
