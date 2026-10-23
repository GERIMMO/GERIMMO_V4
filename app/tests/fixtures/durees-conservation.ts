// LES DURÉES DE CONSERVATION ANNONCÉES PAR LA PAGE CONFIDENTIALITÉ (plan de conformité du 23/10/2026, lots 2 et 4,
// constats R14, R38 à R47, R61, R62 ; décisions du dirigeant du 23/10, dont « non commerçant » pour les factures).
//
// Une ligne par règle et par ligne du tableau « Combien de temps » de /confidentialite. Le texte affiché reste écrit
// dans la page, en français lisible ; cette liste en est le miroir machine, réservé aux tests (relecture du 23/10 : elle
// vivait dans src/lib, qui n'en avait pas l'usage) :
//   - tests/durees-conservation.test.ts vérifie que la durée AFFICHÉE dans chaque ligne du tableau correspond à
//     `duree_mois` (et qu'aucune ligne du tableau n'est sans référence) ;
//   - le même test lit la table `retention_rules` d'une base de test (SUPABASE_DB_URL) : les règles existantes que le
//     lot 2 ne touche pas doivent y avoir la même durée, le même déclencheur (libellé EXACT, que la fonction de
//     conservation compare) et le même sort ; toute règle active de la base doit être annoncée ; une fois le lot 2
//     appliqué (règle `archive:preuve_contrat` présente), TOUTES les règles annoncées sont comparées à la base.
//
// `data_type: null` : la durée n'est pas tenue par `retention_rules` (purge propre à une table, conservation chez un
// prestataire, ou absence de durée) ; `tenue_par` dit où elle l'est. `actif_au_deploiement` reprend la colonne du
// lot 2 : une règle qui n'est pas « oui » est publiée dans la page mais ne s'applique qu'une fois activée.
//
// Aucune de ces durées n'a été relue par un juriste : les sources (Légifrance, CNIL) n'ont pas pu être ouvertes le
// 23/10/2026 (plan, section 5).

export type Activation = "oui" | "apres_bilan" | "plus_tard";

export type DureeConservation = {
  /** Début exact de la cellule « Données » de la ligne du tableau, apostrophes typographiques comprises. */
  donnees: string;
  /** Clé de la règle `retention_rules.data_type`, ou `null` si la durée est tenue ailleurs. */
  data_type: string | null;
  /** Durée en mois ; `null` quand elle ne se compte pas en mois (« tant que le compte existe », un jour). */
  duree_mois: number | null;
  /** Libellé exact du déclencheur dans `retention_rules` (ou, hors table, l'événement qui fait courir la durée). */
  declencheur: string;
  /** La durée telle que la cellule « Durée » l'écrit ; elle doit exprimer `duree_mois`. */
  duree_affichee: string;
  /**
   * Lot 2, colonne « actif au déploiement » : « oui » ; « apres_bilan » (activée une à une après le bilan sans
   * suppression : « oui après le bilan », « oui après comptage », « non, puis oui après le bilan ») ; « plus_tard »
   * (attend du code : lot 1E et V1 en production pour `compte:inactif` ; lot 5 pour les fiches, messages, loyers et
   * incidents, dont le premier terme possible tombe en novembre 2028 : un incident clos ou un bail fini en novembre
   * 2026, plus 24 mois — le plan disait « avant 2029 », ce qui est trop tard). `null` hors `retention_rules`.
   */
  actif_au_deploiement: Activation | null;
  /** Où la durée est tenue quand ce n'est pas `retention_rules`. */
  tenue_par?: string;
};

const ligne = (d: DureeConservation) => d;

export const DUREES_CONSERVATION: readonly DureeConservation[] = [
  // ── Comptes ──────────────────────────────────────────────────────────────────────────────────────────────────────
  ligne({
    donnees: "Compte et données de l’organisation cliente",
    data_type: "compte:inactif",
    duree_mois: 24,
    declencheur: "Dernière connexion d'un membre ou fin du dernier abonnement payé",
    duree_affichee: "vingt-quatre mois",
    actif_au_deploiement: "plus_tard",
  }),
  ligne({
    donnees: "Compte de connexion d’un locataire, d’une caution ou d’un artisan",
    data_type: "compte:inactif",
    duree_mois: 24,
    declencheur: "Dernière connexion d'un membre ou fin du dernier abonnement payé",
    duree_affichee: "24 mois",
    actif_au_deploiement: "plus_tard",
  }),
  ligne({
    donnees: "Comptes créés pour une invitation et jamais activés",
    data_type: "compte:invitation_jamais_utilisee",
    duree_mois: 3,
    declencheur: "Expiration, refus ou annulation de la dernière invitation",
    duree_affichee: "3 mois",
    actif_au_deploiement: "apres_bilan",
  }),
  ligne({
    donnees: "Inscriptions jamais confirmées",
    data_type: "compte:inscription_non_confirmee",
    duree_mois: 1,
    declencheur: "Création de l'inscription",
    duree_affichee: "1 mois",
    actif_au_deploiement: "apres_bilan",
  }),
  ligne({
    donnees: "Invitations (locataires, artisans)",
    data_type: "invitation:locataire",
    duree_mois: 3,
    declencheur: "Expiration ou refus/annulation",
    duree_affichee: "3 mois",
    actif_au_deploiement: "apres_bilan",
  }),
  ligne({
    donnees: "Invitations (locataires, artisans)",
    data_type: "invitation:artisan",
    duree_mois: 3,
    declencheur: "Expiration ou refus/annulation",
    duree_affichee: "3 mois",
    actif_au_deploiement: "apres_bilan",
  }),

  // ── Dossiers de location ─────────────────────────────────────────────────────────────────────────────────────────
  ligne({
    donnees: "Pièces du dossier locataire (identité, revenus, imposition)",
    data_type: "document:piece_identite",
    duree_mois: 36,
    declencheur: "Fin du dernier bail",
    duree_affichee: "3 ans",
    actif_au_deploiement: "oui",
  }),
  ligne({
    donnees: "Pièces du dossier locataire (identité, revenus, imposition)",
    data_type: "document:justificatif",
    duree_mois: 36,
    declencheur: "Fin du dernier bail",
    duree_affichee: "3 ans",
    actif_au_deploiement: "oui",
  }),
  ligne({
    donnees: "Baux et états des lieux",
    data_type: "document:bail",
    duree_mois: 36,
    declencheur: "Fin du bail",
    duree_affichee: "3 ans",
    actif_au_deploiement: "oui",
  }),
  ligne({
    donnees: "Baux et états des lieux",
    data_type: "document:etat_des_lieux",
    duree_mois: 36,
    declencheur: "Fin du bail",
    duree_affichee: "3 ans",
    actif_au_deploiement: "oui",
  }),
  ...["document:attestation_assurance", "document:courrier", "document:reglement_copropriete"].map((data_type) =>
    ligne({
      donnees: "Attestations d’assurance, courriers, règlements de copropriété et autres documents d’un bail",
      data_type,
      duree_mois: 36,
      declencheur: "Fin du bail",
      duree_affichee: "3 ans",
      actif_au_deploiement: "oui",
    })
  ),
  ligne({
    donnees: "Autres documents non rattachés à un bail",
    data_type: "document:autre",
    duree_mois: 60,
    declencheur: "Dépôt",
    duree_affichee: "5 ans",
    actif_au_deploiement: "oui",
  }),
  ligne({
    donnees: "Quittances",
    data_type: "document:quittance",
    duree_mois: 36,
    declencheur: "Fin du bail",
    duree_affichee: "3 ans",
    actif_au_deploiement: "oui",
  }),
  ligne({
    donnees: "Mandats de gestion",
    data_type: "document:mandat",
    duree_mois: 60,
    declencheur: "Fin du mandat",
    duree_affichee: "5 ans",
    actif_au_deploiement: "oui",
  }),
  ligne({
    donnees: "Diagnostics du bien",
    data_type: "document:diagnostic",
    duree_mois: 60,
    declencheur: "Fin de gestion du bien",
    duree_affichee: "5 ans",
    actif_au_deploiement: "oui",
  }),
  ligne({
    donnees: "Rapports de gestion et factures d’honoraires (agences)",
    data_type: "document:rapport_gestion",
    duree_mois: 120,
    declencheur: "Émission",
    duree_affichee: "10 ans",
    actif_au_deploiement: "oui",
  }),
  ligne({
    donnees: "Pièces d’une personne sans bail",
    data_type: "dossier:sans_bail",
    duree_mois: 3,
    declencheur: "Dernier dépôt de pièce sur une personne sans bail",
    duree_affichee: "3 mois",
    actif_au_deploiement: "apres_bilan",
  }),
  ligne({
    donnees: "Fiche de la personne (identité, coordonnées) et historique des paiements",
    data_type: "personne:fiche",
    duree_mois: 36,
    declencheur: "Fin du dernier bail et clôture des comptes",
    duree_affichee: "3 ans",
    actif_au_deploiement: "plus_tard",
  }),
  ligne({
    donnees: "Fiche de la personne (identité, coordonnées) et historique des paiements",
    data_type: "comptable:loyers",
    duree_mois: 36,
    declencheur: "Fin du dernier bail et clôture des comptes",
    duree_affichee: "3 ans",
    actif_au_deploiement: "plus_tard",
  }),
  ligne({
    donnees: "Messages de la location",
    data_type: "message:locatif",
    duree_mois: 24,
    declencheur: "Fin du dernier bail et clôture des comptes",
    duree_affichee: "2 ans",
    actif_au_deploiement: "plus_tard",
  }),
  ligne({
    donnees: "Incidents",
    data_type: "incident:dossier",
    duree_mois: 24,
    declencheur: "Clôture de l'incident",
    duree_affichee: "2 ans",
    actif_au_deploiement: "plus_tard",
  }),
  ligne({
    donnees: "Photos d’incident",
    data_type: "document:photo_incident",
    duree_mois: 24,
    declencheur: "Clôture de l'incident",
    duree_affichee: "2 ans",
    actif_au_deploiement: "oui",
  }),
  ligne({
    donnees: "Documents signés électroniquement, annexes et certificats",
    data_type: "preuve:signature",
    duree_mois: 36,
    declencheur: "Fin du bail",
    duree_affichee: "3 ans",
    actif_au_deploiement: "oui",
  }),
  ligne({
    donnees: "Devis et factures d’artisans",
    data_type: null,
    duree_mois: null,
    declencheur: "Dépôt",
    duree_affichee: "Tant que le compte existe",
    actif_au_deploiement: null,
    tenue_par: "aucune règle : durée propre en cours de définition (plan du 23/10, section 5)",
  }),
  ligne({
    donnees: "Demandes de congé envoyées depuis l’espace locataire, une fois traitées",
    data_type: "contrat:intention_conge",
    duree_mois: 24,
    declencheur: "Traitement",
    duree_affichee: "2 ans",
    actif_au_deploiement: "oui",
  }),
  ligne({
    donnees: "Alertes traitées",
    data_type: "alerte:traitee",
    duree_mois: 12,
    declencheur: "Fermeture de l'alerte",
    duree_affichee: "1 an",
    actif_au_deploiement: "oui",
  }),

  // ── Artisans ─────────────────────────────────────────────────────────────────────────────────────────────────────
  ligne({
    donnees: "Évaluations des artisans",
    data_type: "artisan:evaluation",
    duree_mois: 36,
    declencheur: "Dépôt de l'évaluation",
    duree_affichee: "3 ans",
    actif_au_deploiement: "apres_bilan",
  }),
  ligne({
    donnees: "Contestation d’une évaluation d’artisan",
    data_type: "support:contestation",
    duree_mois: 36,
    declencheur: "Clôture de la contestation",
    duree_affichee: "3 ans",
    actif_au_deploiement: "apres_bilan",
  }),
  // Le motif d'une exclusion porte sa propre échéance (`purge_motif_le`, module 8 du 11/09/2026) : 3 ans pour une
  // exclusion propre à un espace client, 5 ans pour une exclusion du réseau. La purge n'est pas planifiée
  // (20261014210000_maintenance_artisans_expiration_cron.sql) : elle se lance à la main depuis la supervision.
  ligne({
    donnees: "Motif d’exclusion d’un artisan",
    data_type: null,
    duree_mois: 36,
    declencheur: "Décision d'exclusion",
    duree_affichee: "3 ans",
    actif_au_deploiement: null,
    tenue_par: "artisans.purge_motif_le (exclusion propre à un espace client), purge par maintenance_artisans()",
  }),
  ligne({
    donnees: "Motif d’exclusion d’un artisan",
    data_type: null,
    duree_mois: 60,
    declencheur: "Décision d'exclusion",
    duree_affichee: "5 ans",
    actif_au_deploiement: null,
    tenue_par: "artisans.purge_motif_le (exclusion du réseau), purge par maintenance_artisans()",
  }),

  // ── Aide, demandes et journaux ───────────────────────────────────────────────────────────────────────────────────
  ligne({
    donnees: "Signalements de problème (Aide et retours)",
    data_type: "support:bug",
    duree_mois: 6,
    declencheur: "Date du signalement",
    duree_affichee: "6 mois",
    actif_au_deploiement: "oui",
  }),
  ligne({
    donnees: "Questions et idées envoyées depuis « Aide et retours »",
    data_type: "support:question_idee",
    duree_mois: 24,
    declencheur: "Dernier échange",
    duree_affichee: "24 mois",
    actif_au_deploiement: "apres_bilan",
  }),
  ligne({
    donnees: "Demandes sur vos données personnelles et nos réponses",
    data_type: "support:demande_droits",
    duree_mois: 36,
    declencheur: "Clôture de la demande",
    duree_affichee: "3 ans",
    actif_au_deploiement: "apres_bilan",
  }),
  ligne({
    donnees: "Liste des effacements à rejouer après la restauration d’une sauvegarde",
    data_type: "journal:effacements_a_reappliquer",
    duree_mois: 4,
    declencheur: "Exécution de la fermeture",
    duree_affichee: "4 mois",
    actif_au_deploiement: "oui",
  }),
  ...(
    [
      ["journal:agent_passages", "Début du passage"],
      ["journal:supervision_operations", "Date de l’opération"],
      ["journal:points_du_matin", "Génération du point"],
      ["journal:decisions_du_matin", "Création de la décision"],
      ["journal:brief_direction_snapshots", "Génération des faits"],
      ["journal:relais_alertes_envois", "Jour du passage"],
      ["journal:relais_urgences", "Traitement de l’urgence"],
      ["journal:relais_urgences_envois", "Début de l’envoi"],
      ["journal:ia_appels_jour", "Jour des appels"],
      ["journal:cron_job_run_details", "Fin du passage"],
    ] as const
  ).map(([data_type, declencheur]) =>
    ligne({
      donnees: "Registres des automatismes et gestes de la supervision",
      data_type,
      duree_mois: 6,
      declencheur,
      duree_affichee: "6 mois",
      actif_au_deploiement: "oui",
    })
  ),
  ligne({
    donnees: "Journal technique (connexions, erreurs)",
    data_type: "journal:tech_log",
    duree_mois: 6,
    declencheur: "Événement",
    duree_affichee: "6 mois",
    actif_au_deploiement: "oui",
  }),
  ligne({
    donnees: "Journal des consultations de pièces",
    data_type: "journal:acces_pieces",
    duree_mois: 12,
    declencheur: "Consultation",
    duree_affichee: "1 an",
    actif_au_deploiement: "oui",
  }),
  ligne({
    donnees: "Demandes de lien de connexion et tentatives de confirmation",
    data_type: null,
    duree_mois: null,
    declencheur: "Demande",
    duree_affichee: "1 jour",
    actif_au_deploiement: null,
    tenue_par: "purge à chaque demande : demandes_lien_mot_de_passe (20260930140000), tentatives_confirmation_auth (20261016150000)",
  }),
  ligne({
    donnees: "Journal d’audit (actions sensibles)",
    data_type: "journal:audit_log",
    duree_mois: 12,
    declencheur: "Action",
    duree_affichee: "1 an",
    actif_au_deploiement: "oui",
  }),
  // « 3 ans pour les accès de la supervision et les preuves d'effacement » : voir ACTIONS_CONTROLE_INTERNE.
  ligne({
    donnees: "Journal d’audit (actions sensibles)",
    data_type: "journal:audit_controle_interne",
    duree_mois: 36,
    declencheur: "Action",
    duree_affichee: "3 ans",
    actif_au_deploiement: "oui",
  }),

  // ── Contacts, listes d'attente et prospection ────────────────────────────────────────────────────────────────────
  ligne({
    donnees: "Demandes de devis reçues depuis le site",
    data_type: "contact:devis",
    duree_mois: 24,
    declencheur: "Dernier traitement ou dépôt",
    duree_affichee: "24 mois",
    actif_au_deploiement: "oui",
  }),
  ligne({
    donnees: "Liste d’attente des agences",
    data_type: "contact:attente_agences",
    duree_mois: 36,
    declencheur: "Inscription",
    duree_affichee: "trois ans",
    actif_au_deploiement: "apres_bilan",
  }),
  // Lot 2 : une inscription « convertie » est supprimée trois mois après la conversion, par la même purge.
  ligne({
    donnees: "Liste d’attente des agences",
    data_type: null,
    duree_mois: 3,
    declencheur: "Conversion de l'inscription",
    duree_affichee: "trois mois",
    actif_au_deploiement: null,
    tenue_par: "purge des contacts du lot 2 (inscription « convertie »), sous la règle contact:attente_agences",
  }),
  ligne({
    donnees: "Liste d’attente des propriétaires",
    data_type: "contact:attente",
    duree_mois: 36,
    declencheur: "Inscription",
    duree_affichee: "3 ans",
    actif_au_deploiement: "apres_bilan",
  }),
  ligne({
    donnees: "Opposition à la prospection (empreinte de l’adresse seule)",
    data_type: "prospect:opposition",
    duree_mois: 36,
    declencheur: "Opposition",
    duree_affichee: "3 ans",
    actif_au_deploiement: "oui",
  }),
  ligne({
    donnees: "Suivi commercial (professionnels, et particuliers qui l’ont accepté)",
    data_type: "contact:prospect",
    duree_mois: 36,
    declencheur: "Dernier contact émanant du prospect",
    duree_affichee: "3 ans",
    actif_au_deploiement: "oui",
  }),

  // ── Contrat, paiement et facturation ─────────────────────────────────────────────────────────────────────────────
  ligne({
    donnees: "Preuve de votre contrat",
    data_type: "archive:preuve_contrat",
    duree_mois: 120,
    declencheur: "Fin du dernier abonnement payé",
    duree_affichee: "10 ans",
    actif_au_deploiement: "oui",
  }),
  ligne({
    donnees: "Preuve d’une rétractation",
    data_type: "contrat:retractation",
    duree_mois: 120,
    declencheur: "Date de la rétractation",
    duree_affichee: "10 ans",
    actif_au_deploiement: "oui",
  }),
  // Décision du dirigeant du 23/10/2026 (« je ne suis pas commerçant ») : au moins six ans (livre des procédures
  // fiscales, art. L. 102 B, à recomparer sur Légifrance), et non dix (C. com. L. 123-22, propre aux commerçants).
  // Les factures sont émises et tenues par le prestataire de paiement, selon sa propre politique (le client n'y est
  // jamais supprimé, plan lot 1E) ; la copie jointe à l'archive d'un compte fermé est retirée six ans après
  // l'émission (archives_comptes.factures_conservees_jusqu_au, purger_archives_comptes : migration du socle
  // 20261024090000, à brancher sur une tâche par le lot de conservation).
  ligne({
    donnees: "Factures d’abonnement émises par Gerimmo",
    data_type: null,
    duree_mois: 72,
    declencheur: "Émission",
    duree_affichee: "6 ans",
    actif_au_deploiement: null,
    tenue_par: "Stripe (prestataire de paiement) ; copie dans archives_comptes.factures, retirée six ans après l'émission",
  }),
  ligne({
    donnees: "Coordonnées bancaires (IBAN) du bailleur imprimées sur ses baux",
    data_type: null,
    duree_mois: null,
    declencheur: "Saisie",
    duree_affichee: "Tant que le compte est utilisé",
    actif_au_deploiement: null,
    tenue_par: "fiche du bailleur, supprimée avec le compte",
  }),
  ligne({
    donnees: "Événements de paiement (références du prestataire)",
    data_type: "journal:abonnement_evenements",
    duree_mois: 6,
    declencheur: "Traitement de l'événement",
    duree_affichee: "6 mois",
    actif_au_deploiement: "oui",
  }),
];

/**
 * Les actions du journal d'audit gardées trois ans (`journal:audit_controle_interne`), motifs LIKE. Le lot 2 du plan
 * cite `traversee%`, `support_%`, `maintenance_%`, `purge_retention` et `compte_ferme` ; la page promet aussi trois
 * ans pour TOUS les accès de la supervision, et la fiche d'une organisation dans la console le dit
 * (admin/organisations/[orgId], « y compris l'ouverture de cette fiche »). Or ces ouvertures s'écrivent
 * `consultation_organisation`, `consultation_piece_artisan` et `consultation_faits_direction` (log_sa_access, que
 * 20261014220000_traversee_trace_precise.sql traite déjà comme des traversées, RM-A1.11) : relecture du 23/10, le
 * motif `consultation\_%` est EXIGÉ du lot 2. Le test le vérifie sur la base dès que la règle existe.
 */
export const ACTIONS_CONTROLE_INTERNE = [
  "traversee%",
  "consultation\\_%",
  "support\\_%",
  "maintenance\\_%",
  "purge_retention",
  "compte_ferme",
] as const;

/** Les règles de `retention_rules` que la page annonce, une fois chacune : ce que l'intégration comparera à la base. */
export function reglesAnnoncees(): { data_type: string; duree_mois: number | null; declencheur: string }[] {
  const vues = new Map<string, { data_type: string; duree_mois: number | null; declencheur: string }>();
  for (const d of DUREES_CONSERVATION) {
    if (d.data_type && !vues.has(d.data_type)) vues.set(d.data_type, { data_type: d.data_type, duree_mois: d.duree_mois, declencheur: d.declencheur });
  }
  return [...vues.values()];
}

const NOMBRES: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, dix: 10, douze: 12, "vingt-quatre": 24, "trente-six": 36,
};

/**
 * La durée en mois d'une expression comme « 3 ans », « 24 mois », « vingt-quatre mois » ou « trois ans » ; `null`
 * pour une durée qui ne se compte pas en mois (« 1 jour », « Tant que le compte existe »).
 */
export function moisDeLExpression(expression: string): number | null {
  const m = /^(\d+|[a-zà-ü-]+)\s+(ans?|mois)$/i.exec(expression.trim());
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NOMBRES[m[1].toLowerCase()];
  if (!n) return null;
  return m[2].toLowerCase().startsWith("an") ? n * 12 : n;
}

const EXPRESSION = new RegExp(`(?<![\\p{L}\\d-])(\\d+|${Object.keys(NOMBRES).join("|")})\\s+(ans?|mois)(?![\\p{L}])`, "giu");

/**
 * Les durées en mois qu'une cellule « Durée » annonce, sans ses parenthèses (les préavis, comme « deux mois puis quinze
 * jours avant », y sont écrits) ; les jours ne comptent pas. Sert au test de la page : l'ensemble obtenu doit être celui
 * des `duree_mois` de la ligne.
 */
export function dureesDuTexte(texte: string): number[] {
  const sansParentheses = texte.replace(/\([^)]*\)/g, " ");
  return [...sansParentheses.matchAll(EXPRESSION)].map((m) => moisDeLExpression(`${m[1]} ${m[2]}`)).filter((n): n is number => n !== null);
}
