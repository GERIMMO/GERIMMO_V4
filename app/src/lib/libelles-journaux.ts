import { TACHES_SUIVIES } from "./missions";
import { ACTIONS_SUPERVISION } from "./journal-supervision";
import { GESTES_TRACE } from "./gestes-trace";

const ACTIONS: Record<string, string> = {
  consultation_organisation: "Consultation d’une organisation",
  traversee_espace: "Consultation d’un espace client par la supervision",
  // D08 (audit du 13/10, SA-01) : la ligne dit la page, l'objet et la décision d'accès ; elle ne part plus qu'à un geste.
  traversee_action: "Action dans un espace client par la supervision (écriture possible)",
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
  // Audit du 13/10 (migration 20261013120000) : ces deux gestes laissent désormais une trace.
  detention_supprimee: "Détention d’un lot supprimée",
  // Audit du 13/10 (SA-08) : neuf codes écrits au journal n'avaient aucun libellé, dont l'octroi d'un accès et la
  // suppression d'un encaissement, que le repli par expression régulière présentait comme un nettoyage de données.
  adhesion_creee: "Accès à une organisation accordé (le rôle est indiqué)",
  adhesion_retiree: "Accès à une organisation retiré",
  decision_retour: "Décision sur un retour d’utilisateur",
  bien_retabli: "Bien rétabli après son retrait",
  bien_retire: "Bien retiré du parc",
  invitation_locataire: "Invitation d’un locataire envoyée",
  invitation_locataire_acceptee: "Invitation d’un locataire acceptée",
  invitation_locataire_envoi_echec: "Envoi d’une invitation de locataire en échec",
  suppression_encaissement: "Encaissement supprimé, contre-écritures passées",
  suppression_encaissement_depot: "Encaissement de dépôt de garantie supprimé",
  contre_ecriture: "Écriture comptable annulée par une contre-écriture",
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
  // Les gestes de la console (audit console du 27/09) : chacun a sa ligne.
  point_du_matin_decide: "Décision prise depuis le point du matin",
  examen_inscription_artisan: "Examen d’une inscription d’artisan",
  // D13 (SUP-05, 14/10) : les faits de direction traversent toutes les organisations, chaque traversée est tracée.
  preparation_faits_direction: "Préparation des faits de direction",
  consultation_faits_direction: "Consultation des faits de direction (une ligne par organisation citée)",
  effacement_instantanes_faits_direction: "Effacement des anciens faits de direction, qui pouvaient contenir des noms",
  // X18 (SA-09, 14/10) : écrite par `rechercher_reference_supervision` dans sa transaction (jamais le texte d'un nom).
  recherche_reference: "Recherche d’un bien, d’un lot ou d’un incident par sa référence",
  ...ACTIONS_SUPERVISION,
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
  // Plus de repli sur « suppression » : un geste humain de suppression n'est pas un nettoyage automatique (audit du 13/10, SA-08).
  if (/purge|retention/i.test(action)) return "Nettoyage de données arrivé à échéance";
  if (/consult|lecture|voir|open/i.test(action)) return "Consultation d’une information protégée";
  if (/modif|update|change/i.test(action)) return "Modification d’une information protégée";
  if (/creat|ajout|insert/i.test(action)) return "Création d’une information protégée";
  // Un code inconnu se DIT inconnu (24/09) : « Action de supervision
  // enregistrée » laissait croire à un libellé voulu.
  return "Action enregistrée (libellé manquant)";
}

// Les événements que l'application écrit elle-même (audit console 27/09) :
// « Événement du service enregistré · depuis : compte » ne disait rien.
const EVENEMENTS: Record<string, string> = {
  changement_mot_de_passe: "Changement de mot de passe",
  erreur_ecran: "Problème d’affichage",
  remise_rapport_mensuel: "Envoi d’un compte rendu mensuel",
  veille_analyse_echec: "Étude d’une information de veille à reprendre",
  rendez_vous_fixe: "Rendez-vous d’intervention fixé",
  mission_refusee: "Mission refusée par un artisan",
  mission_confiee: "Mission confiée à un artisan",
  mission_annulee: "Mission annulée",
  devis_recu: "Devis reçu",
  devis_demande: "Devis demandé",
  creneaux_proposes: "Créneaux proposés",
  creneaux_contre_proposes: "Autres créneaux proposés",
  creneau_choisi: "Créneau choisi",
  signature_demandee: "Signature électronique demandée",
  reponse_gestionnaire: "Réponse du gestionnaire",
  notification_rappel: "Rappel envoyé",
  incident_urgent: "Incident urgent signalé",
  // D48 (IA-11, 14/10) : le nettoyage des registres d'exécution ne garde que des nombres.
  purge_registres_execution: "Nettoyage des registres d’exécution arrivés à échéance",
};

export function libelleEvenement(evenement: string | null | undefined): string {
  if (!evenement) return "Événement du service";
  if (Object.hasOwn(EVENEMENTS, evenement)) return EVENEMENTS[evenement];
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
 * (25/09). Une liste indicative : les liens vers un code inconnu restent valables.
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
// Clés internes jamais présentées (audit console 27/09) : l'empreinte d'une
// erreur (« digest : 101828213 ») et l'origine technique d'un appel.
// « action_ref » (D08) : l'empreinte technique d'une action serveur, utile au développeur, pas à l'écran.
const CLES_MASQUEES = new Set(["digest", "depuis", "empreinte", "action_ref"]);
const CLES_LIBELLES: Record<string, string> = {
  espace: "espace", ecran: "écran", avant: "état précédent", apres: "nouvel état", avant_active: "active avant", jours: "jours", essai_fin: "fin d’essai",
  // Traversée d'un espace client par la supervision (D08) : décision d'accès, nature de la requête, geste, rubrique
  // ouverte. « accès » et non « résultat » : la ligne est posée AVANT le geste, elle ne dit pas qu'il a réussi.
  resultat: "accès", requete: "requête", geste: "geste", rubrique: "rubrique", motif: "motif", org_demandee: "organisation demandée",
  // Recherche par référence de la console (X18) : la forme de la saisie, le nombre d'objets trouvés, les identifiants relevés.
  forme: "recherche par", reference: "référence", resultats: "objets trouvés", organisations: "organisations concernées", objets: "identifiants relevés",
};
// Les valeurs de ces clés se disent en français ; les autres s'affichent telles quelles (codes courts).
const VALEURS_LIBELLES: Record<string, Record<string, string>> = {
  resultat: { autorise: "autorisé", refuse: "refusé" },
  requete: { page: "page", action_serveur: "action", formulaire: "formulaire" },
  geste: GESTES_TRACE,
  motif: { organisation_introuvable: "organisation introuvable" },
  forme: { identifiant: "identifiant", numero: "numéro d’incident", libelle: "nom ou référence interne" },
};

export function detailsExpurges(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const morceaux: string[] = [];
  for (const [cle, valeur] of Object.entries(details as Record<string, unknown>)) {
    if (!/^[a-z][a-z0-9_]{0,40}$/i.test(cle) || CLES_MASQUEES.has(cle)) continue;
    const libelle = CLES_LIBELLES[cle] ?? cle.replace(/_/g, " ");
    if (typeof valeur === "number" && Number.isFinite(valeur)) morceaux.push(`${libelle} : ${valeur}`);
    else if (typeof valeur === "boolean") morceaux.push(`${libelle} : ${valeur ? "oui" : "non"}`);
    else if (Array.isArray(valeur)) morceaux.push(`${libelle} : ${valeur.length} élément${valeur.length > 1 ? "s" : ""}`);
    else if (typeof valeur === "string" && /^[a-z0-9_.-]{1,40}$/i.test(valeur) && !/^[0-9a-f-]{32,}$/i.test(valeur)) {
      const dit = Object.hasOwn(VALEURS_LIBELLES, cle) && Object.hasOwn(VALEURS_LIBELLES[cle], valeur) ? VALEURS_LIBELLES[cle][valeur] : valeur;
      morceaux.push(`${libelle} : ${dit}`);
    }
    if (morceaux.length >= 8) break;
  }
  return morceaux.length > 0 ? morceaux.join(" · ") : null;
}
