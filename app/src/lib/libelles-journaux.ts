import { TACHES_SUIVIES } from "./missions";

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

// Les noms des tâches viennent de la table partagée (lib/missions.ts, 25/09) :
// Santé, Équipes et Journaux disaient trois noms pour la même mission.
const TACHES: Record<string, string> = Object.fromEntries(
  Object.entries(TACHES_SUIVIES).map(([cle, t]) => [cle, t.nom])
);

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

/**
 * Les codes que les journaux écrivent, pour proposer un filtre par type
 * (25/09). Une liste indicative : un code inconnu reste filtrable en le tapant.
 */
export function codesConnusJournaux(): { audit: string[]; technique: string[] } {
  return {
    audit: Object.keys(ACTIONS),
    technique: [...Object.keys(TACHES).map((t) => `tache_${t}`), "erreur_ecran", "remise_rapport_mensuel", "changement_mot_de_passe"],
  };
}

/**
 * Le détail d'un événement, expurgé (25/09) : nombres, oui/non, codes courts
 * et tailles de listes — jamais un texte libre, une adresse ni un identifiant
 * long. « Événement du service enregistré » sans rien d'autre ne permettait
 * pas de déboguer.
 */
export function detailsExpurges(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const morceaux: string[] = [];
  for (const [cle, valeur] of Object.entries(details as Record<string, unknown>)) {
    if (!/^[a-z][a-z0-9_]{0,40}$/i.test(cle)) continue;
    const libelle = cle.replace(/_/g, " ");
    if (typeof valeur === "number" && Number.isFinite(valeur)) morceaux.push(`${libelle} : ${valeur}`);
    else if (typeof valeur === "boolean") morceaux.push(`${libelle} : ${valeur ? "oui" : "non"}`);
    else if (Array.isArray(valeur)) morceaux.push(`${libelle} : ${valeur.length} élément${valeur.length > 1 ? "s" : ""}`);
    else if (typeof valeur === "string" && /^[a-z0-9_.-]{1,40}$/i.test(valeur) && !/^[0-9a-f-]{32,}$/i.test(valeur)) morceaux.push(`${libelle} : ${valeur}`);
    if (morceaux.length >= 8) break;
  }
  return morceaux.length > 0 ? morceaux.join(" · ") : null;
}
