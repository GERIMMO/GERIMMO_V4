// Les messages d'erreur de l'espace privé de l'artisan (clients externes, chantiers, devis, factures, règlements).
//
// Audit du 13/10/2026 (ARC-01, ARC-06). Une seule traduction servait toutes les actions : un client en doublon parlait
// de « cette facture », un nom resté vide demandait de « joindre votre justificatif » sur un formulaire qui n'en a
// pas, et l'échec du rendu PDF montrait le nom d'une variable d'environnement. Le message dépend ici de l'action et de
// la contrainte que la base a invoquée ; ce qui est technique est journalisé sous une référence, jamais affiché.

/** Les actions dont le formulaire demande un justificatif (le devis valide génère le sien). */
const ACTIONS_AVEC_JUSTIFICATIF = new Set(["decision", "bilan", "facture", "reglement", "annuler_reglement"]);

/**
 * Le doublon est détecté par la base (index unique) : elle répond par une phrase unique qui ne dit pas de quoi il s'agit.
 * Seule l'action permet de savoir ce que l'artisan essayait de faire.
 */
const DOUBLON_PAR_ACTION: Record<string, string> = {
  client: "Ce client existe déjà dans votre carnet (même nom, même e-mail, même adresse). Ouvrez sa fiche au lieu d’en créer un second.",
  modifier_client: "Un autre client actif a déjà ce nom, cet e-mail et cette adresse. Modifiez l’un des trois.",
  archiver_client: "Un client actif identique existe déjà : celui-ci ne peut pas être réactivé.",
  devis: "Une autre version du devis vient d’être enregistrée. Rechargez la page avant de recommencer.",
  planning: "Ce chantier a déjà un rendez-vous retenu. Rechargez la page pour voir le rendez-vous actuel.",
  facture: "Une facture est déjà déposée pour ce chantier, ou ce numéro de facture est déjà utilisé. Vérifiez le numéro, puis rechargez la page.",
};
const DOUBLON_PAR_DEFAUT = "Cet enregistrement existe déjà. Rechargez la page avant de recommencer.";

const MONTANT_HORS_LIMITES = "Le montant doit être positif, au centime, et inférieur à un milliard d’euros.";

/** Les contraintes `check` des tables de l'espace privé, par le nom que Postgres leur donne (`table_colonne_check`). */
const CONTRAINTES: Record<string, string> = {
  artisan_clients_nom_check: "Indiquez le nom du client.",
  artisan_clients_adresse_check: "Indiquez l’adresse du client.",
  artisan_clients_email_check: "L’adresse e-mail du client n’est pas valide.",
  artisan_clients_telephone_check: "Le numéro de téléphone du client est trop long (40 caractères au plus).",
  artisan_clients_type_check: "Choisissez le type de client.",
  artisan_chantiers_titre_check: "Indiquez le titre du chantier.",
  artisan_chantiers_adresse_check: "Indiquez l’adresse du chantier.",
  artisan_chantiers_description_check: "Décrivez le chantier.",
  artisan_devis_externes_description_check: "Décrivez les travaux proposés.",
  artisan_factures_externes_numero_check: "Indiquez le numéro figurant sur la facture.",
  artisan_factures_externes_montant_ttc_cents_check: MONTANT_HORS_LIMITES,
  artisan_reglements_montant_cents_check: MONTANT_HORS_LIMITES,
  artisan_reglements_reference_check: "Indiquez la référence ou la description du règlement.",
  artisan_reglements_moyen_check: "Choisissez le moyen de règlement.",
};

/** Les colonnes obligatoires, quand la base signale un champ absent plutôt que vide. */
const COLONNES: Record<string, string> = {
  nom: "le nom du client",
  adresse: "l’adresse",
  titre: "le titre du chantier",
  description: "la description",
  numero: "le numéro de la facture",
  reference: "la référence du règlement",
};

/**
 * Le message à montrer pour l'erreur d'une action de l'espace privé.
 * Les phrases métier déjà rédigées par la base (« La fiche a changé : rechargez… ») passent telles quelles ; seules les
 * erreurs de contrainte, qui sont du texte technique, sont traduites.
 */
export function messageErreurPrive(action: string, message: string): string {
  if (/Ce dossier ou cette facture existe déjà|duplicate key|unique constraint/i.test(message)) {
    return DOUBLON_PAR_ACTION[action] ?? DOUBLON_PAR_DEFAUT;
  }
  const contrainte = /violates check constraint "([^"]+)"/.exec(message)?.[1];
  if (contrainte && CONTRAINTES[contrainte]) return CONTRAINTES[contrainte];
  const colonne = /null value in column "([^"]+)"/.exec(message)?.[1];
  if (colonne && COLONNES[colonne]) return `Complétez ${COLONNES[colonne]}.`;
  if (/violates|null value/.test(message)) {
    return ACTIONS_AVEC_JUSTIFICATIF.has(action)
      ? "Complétez tous les champs et joignez votre justificatif."
      : "Complétez tous les champs obligatoires.";
  }
  return message;
}

/**
 * Le message quand le moteur PDF échoue (navigateur absent, délai dépassé…) : métier, avec une référence à transmettre au
 * support. Le détail technique part au journal du serveur, jamais à l'écran (même règle que les autres documents).
 */
export function messageRenduPdfEchoue(erreur: unknown): string {
  const reference = `DOC-${Date.now().toString(36).toUpperCase()}`;
  console.error(`[artisan-prive] rendu du PDF du devis en échec (${reference})`, erreur);
  return `Le PDF du devis n’a pas pu être généré (réf. ${reference}). Votre devis est conservé : réessayez dans un instant ; si cela persiste, transmettez la référence au support.`;
}
