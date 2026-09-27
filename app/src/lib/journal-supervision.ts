// Chaque geste de la console laisse sa ligne dans le journal d'audit (audit
// console du 27/09, majeur 5) : « le super admin garde le contrôle, CHAQUE
// action est enregistrée ». La ligne est écrite par `journaliser_supervision`
// au nom du compte connecté — jamais au nom d'un autre — et n'accepte qu'un
// code d'action court et des détails bornés (ni texte libre long, ni secret).
//
// Les fonctions SQL qui portent déjà leur trace dans leur transaction
// (`regler_mission`, `decider_veille`, `demande_devis_traitee`,
// `enregistrer_plan_continuite`, `controler_organisation`,
// `traiter_inscription_artisan_atomique`, `decider_point_du_matin`…) ne
// passent PAS par ici : une action, une ligne.

type ClientQuiJournalise = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
};

/** Les codes écrits par la console, avec leur libellé (lib/libelles-journaux.ts). */
export const ACTIONS_SUPERVISION = {
  point_du_matin_prepare: "Préparation du point du matin",
  point_du_matin_lu: "Point du matin marqué comme lu",
  mission_lancee: "Lancement immédiat d’une mission",
  mission_en_pause: "Mission mise en pause",
  mission_reprise: "Mission reprise",
  veille_diffusee: "Information réglementaire diffusée",
  veille_ecartee: "Information réglementaire écartée ou retirée",
  publications_proposees: "Sujets d’articles proposés",
  publication_redigee: "Article rédigé avec l’assistant",
  publication_modifiee: "Article modifié",
  publication_parue: "Article paru dans le journal",
  publication_retiree: "Article retiré du journal",
  publication_refusee: "Proposition d’article refusée",
  publication_facebook: "Article diffusé sur Facebook",
  reglages_marketing_modifies: "Réglages marketing modifiés",
  intention_marketing_notee: "Intention de publication notée",
  demande_commerciale_traitee: "Demande commerciale marquée traitée",
  plan_continuite_enregistre: "Plan de continuité enregistré",
  marque_verifiee: "Vérification d’une connexion de marque",
  etude_territoriale_enregistree: "Étude territoriale enregistrée",
  idees_regroupees: "Idées d’utilisateurs regroupées",
  revue_idees_close: "Revue mensuelle des idées close",
  invitation_renvoyee: "Invitation du responsable renvoyée",
  organisation_suspendue: "Organisation suspendue",
  organisation_reactivee: "Organisation réactivée",
  organisation_archivee: "Organisation archivée",
  essai_prolonge: "Essai prolongé",
  compte_bloque: "Compte bloqué",
  compte_debloque: "Compte débloqué",
  second_facteur_reinitialise: "Second facteur réinitialisé",
  controle_compte_echec: "Geste sur un compte non abouti",
} as const;

export type ActionSupervision = keyof typeof ACTIONS_SUPERVISION;

/**
 * Écrit la ligne d'audit d'un geste. Rend `false` si elle n'a pas pu être
 * écrite : l'appelant le dit à l'écran plutôt que d'annoncer un succès complet.
 */
export async function journaliserSupervision(
  db: ClientQuiJournalise,
  action: ActionSupervision,
  details: Record<string, string | number | boolean | null> = {},
  organisation: string | null = null
): Promise<boolean> {
  try {
    const { error } = await db.rpc("journaliser_supervision", {
      p_action: action,
      p_organisation: organisation,
      p_details: details,
    });
    if (error) console.error(`[journal de supervision] ${action} non journalisée:`, error.message);
    return !error;
  } catch (e) {
    console.error(`[journal de supervision] ${action} non journalisée:`, e instanceof Error ? e.message : e);
    return false;
  }
}

/** La phrase ajoutée à un succès quand la ligne d'audit manque. */
export const JOURNAL_A_VERIFIER = " Sa ligne au journal d’audit n’a pas pu être écrite : signalez-le.";
