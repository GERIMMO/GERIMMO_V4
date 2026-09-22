const ACTIONS: Record<string, string> = {
  consultation_organisation: "Consultation d’une organisation",
  consultation_document: "Consultation d’un document",
  telechargement_document: "Téléchargement d’un document",
  purge_retention: "Nettoyage des données arrivées à échéance",
  purge_fichier: "Suppression définitive d’un fichier arrivé à échéance",
  connexion: "Connexion à Gerimmo",
  deconnexion: "Déconnexion de Gerimmo",
};

const TACHES: Record<string, string> = {
  signatures: "Classement des signatures terminées",
  abonnements: "Suivi des abonnements",
  rappels: "Envoi des rappels de rendez-vous",
  quittances: "Envoi des quittances",
  appels: "Envoi des avis d’échéance",
  relances: "Envoi des relances d’impayé",
  marketing: "Travail de l’agent marketing",
  territoire: "Étude du développement territorial",
};

/** Traduit une trace interne sans jamais exposer son code brut à l'écran. */
export function libelleActionAudit(action: string | null | undefined): string {
  if (!action) return "Action de supervision";
  if (ACTIONS[action]) return ACTIONS[action];
  if (/purge|retention|suppression/i.test(action)) return "Nettoyage de données arrivé à échéance";
  if (/consult|lecture|voir|open/i.test(action)) return "Consultation d’une information protégée";
  if (/modif|update|change/i.test(action)) return "Modification d’une information protégée";
  if (/creat|ajout|insert/i.test(action)) return "Création d’une information protégée";
  return "Action de supervision enregistrée";
}

export function libelleEvenement(evenement: string | null | undefined): string {
  if (!evenement) return "Événement du service";
  const tache = evenement.match(/^tache_([^_]+)/)?.[1];
  if (tache) return TACHES[tache] ?? "Travail automatique de Gerimmo";
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
