const ACTIONS: Record<string, string> = {
  consultation_organisation: "Consultation d’une organisation",
  traversee_espace: "Consultation d’un espace client par la supervision",
  traversee_action: "Accès à une action dans un espace client par la supervision",
  consultation_piece_artisan: "Consultation d’un justificatif artisan",
  consultation_document: "Consultation d’un document",
  telechargement_document: "Téléchargement d’un document",
  purge_retention: "Nettoyage des données arrivées à échéance",
  purge_fichier: "Suppression définitive d’un fichier arrivé à échéance",
  connexion: "Connexion à Gerimmo",
  deconnexion: "Déconnexion de Gerimmo",
  // Les codes que l'application écrit sans libellé jusqu'au 24/09 : ils
  // tombaient sur le libellé de repli, qui ne disait pas ce qui s'était passé
  // (migrations `…rouvrir_detention`, `…s6_ecritures_fondation`,
  // `…s9a_proprietaire_direct` et suivantes).
  detention_rouverte: "Détention d’un lot rouverte",
  mois_reouvert: "Mois comptable rouvert",
  inscription_proprietaire: "Inscription d’un propriétaire bailleur",
  organisation_ouverte: "Ouverture d’une organisation",
  abonnement_statut: "Changement de statut d’abonnement",
  paiement_en_defaut: "Paiement d’abonnement en défaut",
  paiement_regularise: "Paiement d’abonnement régularisé",
  avantage_parrainage: "Avantage de parrainage accordé",
  devis_document_consulte: "Consultation d’un document de devis",
  ouverture_session_artisan: "Entrée dans la session d’un artisan",
  fermeture_session_artisan: "Sortie de la session d’un artisan",
  relais_supervision_cree: "Relais de supervision ouvert",
  relais_supervision_revoque: "Relais de supervision retiré",
  developpement_decide: "Décision sur une amélioration du logiciel",
};

const TACHES: Record<string, string> = {
  orchestrateur: "Suivi des dossiers",
  signatures: "Classement des signatures terminées",
  abonnements: "Suivi des abonnements",
  rappels: "Envoi des rappels de rendez-vous",
  quittances: "Envoi des quittances",
  appels: "Envoi des avis d’échéance",
  relances: "Envoi des relances d’impayé",
  marketing: "Travail de l’agent marketing",
  territoire: "Étude du développement territorial",
  veille: "Veille réglementaire",
};

/** Traduit une trace interne sans jamais exposer son code brut à l'écran. */
export function libelleActionAudit(action: string | null | undefined): string {
  if (!action) return "Action de supervision";
  if (Object.hasOwn(ACTIONS, action)) return ACTIONS[action];
  if (/purge|retention|suppression/i.test(action)) return "Nettoyage de données arrivé à échéance";
  if (/consult|lecture|voir|open/i.test(action)) return "Consultation d’une information protégée";
  if (/modif|update|change/i.test(action)) return "Modification d’une information protégée";
  if (/creat|ajout|insert/i.test(action)) return "Création d’une information protégée";
  // Un code inconnu se DIT inconnu (24/09) : « Action de supervision
  // enregistrée » laissait croire à un libellé voulu.
  return "Action enregistrée (libellé manquant)";
}

export function libelleEvenement(evenement: string | null | undefined): string {
  if (!evenement) return "Événement du service";
  const tache = evenement.match(/^tache_([^_]+)/)?.[1];
  if (tache) return Object.hasOwn(TACHES, tache) ? TACHES[tache] : "Travail automatique de Gerimmo";
  if (/erreur|exception|echec/i.test(evenement)) return "Une action n’a pas pu être terminée";
  if (/connexion|auth|session|mfa/i.test(evenement)) return "Événement de connexion ou de sécurité";
  if (/stripe|paiement|abonnement/i.test(evenement)) return "Événement de paiement ou d’abonnement";
  if (/facebook|marketing|publication/i.test(evenement)) return "Événement de publication";
  if (/signature/i.test(evenement)) return "Événement de signature électronique";
  return "Événement du service enregistré";
}

export function libelleAccesDocument(action: string | null | undefined): string {
  if (/telecharg|download/i.test(action ?? "")) return "Téléchargement";
  if (/consult|lecture|view|open/i.test(action ?? "")) return "Consultation";
  return "Accès au document";
}
