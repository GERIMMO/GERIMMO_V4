// Où va-t-on pour TRAITER une alerte — et l'alerte se ferme-t-elle d'elle-même
// une fois le geste fait.
//
// CE QUE CE FICHIER CORRIGE, RAPPORTÉ LE 19/09. Devant « Assurance habitation —
// Moreau : défaut d'assurance persistant », la modale de traitement n'offrait
// que deux gestes : confier l'alerte à quelqu'un, ou écrire ce qu'on a fait
// pour la marquer traitée. Aucun chemin vers l'endroit où l'attestation se
// dépose. L'agent ne pouvait que déléguer ou DÉCLARER — un écran qui apprend à
// fermer les alertes sans faire le travail.
//
// Le plus grave était invisible : DOUZE types d'alerte se ferment TOUT SEULS
// quand le geste réel est accompli (déclencheurs de la base, 29/08 et 11/09 —
// `fermer_alertes_origine`). Pour eux, « marquer traitée » n'est pas le chemin
// normal, c'est l'exception. La modale présentait l'exception comme la règle.
//
// Chaque destination ci-dessous a été vérifiée dans la migration qui POSE
// l'alerte : la charge utile doit porter la clé lue ici, sinon le lien
// fabrique une adresse fausse.

/** Le geste qui traite vraiment l'alerte, et où il se fait. */
export type GesteAlerte = {
  /** L'adresse de l'écran où le geste se fait, ancrée sur la bonne carte. */
  href: string;
  /** Ce qu'on va y faire, à l'infinitif — le libellé du bouton. */
  libelle: string;
  /**
   * L'alerte se referme SEULE quand ce geste est fait (déclencheur de base).
   * Vrai pour les douze types listés par `fermer_alertes_origine` ; pour les
   * autres, l'alerte reste ouverte et c'est bien à l'agent de la fermer.
   */
  seFermeSeule: boolean;
};

// Les alertes qui se traitent SUR LE BAIL, et l'ancre de la carte où le geste
// se fait : la fiche d'un bail dépasse le millier de lignes, y atterrir en
// haut fait recommencer le défilement (relevé du 11/09).
// Chaque entrée a été vérifiée dans la migration qui POSE l'alerte — la charge
// utile doit porter `bail_id`, sinon le lien construit une adresse fausse :
//   · conge_intention / edl_sortie → enregistrer_conge, 20260906101000:81-83
//   · restitution_echeance        → generer_alertes_restitution, 20260830120000:497
//   · decompte / decompte_lrar    → finaliser_decompte, 20260911124500:102
//   · loyer_impaye                → suivre_impayes_bail, 20260911200000:189
// `retenue_sans_justificatif` est DÉLIBÉRÉMENT absente : ses trois définitions
// successives d'`ajouter_retenue` (la vivante en 20260909190000:355-356) posent
// {retenue_id, restitution_id, libelle, montant} — aucun bail_id. La router
// exigerait une lecture restitution → bail que cet écran n'a pas.
const ANCRES_BAIL = new Map<string, string>([
  ["conge_intention", ""],
  ["edl_entree", "#edl"],
  ["edl_sortie", "#edl"],
  ["restitution_echeance", "#restitution"],
  ["decompte", "#restitution"],
  ["decompte_lrar", "#restitution"],
  ["loyer_impaye", "#loyers"],
]);

/**
 * Les types dont la base ferme l'alerte d'elle-même dès que l'objet d'origine
 * bouge — relevé exhaustif des appels à `fermer_alertes_origine` :
 * document remplacé, diagnostic archivé, impayé soldé, écart régularisé,
 * état des lieux signé, décompte envoyé, versement rapproché, justificatif
 * déposé. Pour ceux-là, le geste SUFFIT.
 */
const SE_FERMENT_SEULES = new Set([
  "assurance_expiration",
  "attestation_a_verifier",
  "decompte",
  "decompte_lrar",
  "diagnostic_expiration",
  "ecart_versement",
  "edl_entree",
  "edl_sortie",
  "loyer_impaye",
  "restitution_echeance",
  "retenue_sans_justificatif",
  "versement_proprietaire",
]);

// Ce qu'on va faire là-bas, dit à l'infinitif et sans jargon : le bouton
// annonce LE GESTE, pas la destination (« Déposer l'attestation », pas
// « Ouvrir la fiche de la personne »).
const LIBELLES = new Map<string, string>([
  ["assurance_expiration", "Déposer l’attestation d’assurance"],
  ["attestation_a_verifier", "Contrôler l’attestation déposée"],
  ["conge_intention", "Confirmer le congé sur le bail"],
  ["decompte", "Ouvrir le décompte de restitution"],
  ["decompte_lrar", "Envoyer le décompte en recommandé"],
  ["diagnostic_expiration", "Redéposer le diagnostic"],
  ["edl_entree", "Faire l’état des lieux d’entrée"],
  ["edl_sortie", "Faire l’état des lieux de sortie"],
  ["incident_a_qualifier", "Qualifier l’incident"],
  ["incident_conteste", "Reprendre l’imputation contestée"],
  ["incident_imputation_a_reviser", "Réviser l’imputation"],
  ["loyer_impaye", "Ouvrir les loyers du bail"],
  ["message_locataire", "Lire et répondre au message"],
  ["piece_deposee", "Contrôler la pièce déposée"],
  ["restitution_echeance", "Ouvrir la restitution"],
  ["signature_retournee", "Contrôler le document signé"],
]);

type Alerte = { type?: string; details: Record<string, unknown> | null };

/** La valeur d'une clé de la charge utile, si elle est bien une chaîne. */
function texte(details: Record<string, unknown> | null, cle: string): string | null {
  const v = details?.[cle];
  return typeof v === "string" && v.length > 0 ? v : null;
}

// « Traiter » emmène là où le geste se fait : un message se lit sur la fiche
// de la personne, une intention de congé se confirme sur le bail.
export function cheminFicheAlerte(a: Alerte, orgId: string): string | null {
  const type = a.type;

  // Une attestation d'assurance — celle qui manque, ou celle qui vient d'être
  // déposée — vit dans les PIÈCES JUSTIFICATIVES de la personne : c'est là
  // qu'on la dépose et qu'on la contrôle, pas dans la GED générale.
  if (
    type === "message_locataire" ||
    type === "piece_deposee" ||
    type === "assurance_expiration" ||
    type === "attestation_a_verifier"
  ) {
    const personne = texte(a.details, "person_id");
    if (personne) {
      const ancre = type === "message_locataire" ? "#messages" : "#pieces";
      return `/agence/${orgId}/personnes/${personne}${ancre}`;
    }
    // L'alerte d'assurance porte aussi le document : à défaut de la personne,
    // la fiche GED reste un endroit honnête où le lire.
    const document = texte(a.details, "document_id");
    if (document && type !== "message_locataire" && type !== "piece_deposee") {
      return `/agence/${orgId}/documents?sel=${document}`;
    }
    return null;
  }

  const ancre = type ? ANCRES_BAIL.get(type) : undefined;
  const bail = texte(a.details, "bail_id");
  if (ancre !== undefined && bail) {
    return `/agence/${orgId}/baux/${bail}${ancre}`;
  }

  // Un diagnostic ne dit pas où il est posé : sa charge utile ne porte que son
  // identifiant ({diagnostic_id, type_diagnostic} — 20260830120000:372). Le
  // bien ou le lot se lisent en base ; cette route les résout et redirige, ce
  // qui garde CETTE fonction pure et utilisable depuis le navigateur.
  if (type === "diagnostic_expiration") {
    const diagnostic = texte(a.details, "diagnostic_id");
    if (diagnostic) return `/agence/${orgId}/diagnostics/${diagnostic}`;
    return null;
  }

  // Les incidents s'ouvraient déjà, mais recopiés à la main dans deux écrans.
  if (
    type === "incident_a_qualifier" ||
    type === "incident_conteste" ||
    type === "incident_imputation_a_reviser"
  ) {
    const incident = texte(a.details, "incident_id");
    if (incident) return `/agence/${orgId}/incidents?sel=${incident}`;
    return null;
  }

  // Un document signé retourné se contrôle puis se classe sur sa fiche GED
  if (type === "signature_retournee") {
    const document = texte(a.details, "document_id");
    if (document) return `/agence/${orgId}/documents?sel=${document}`;
  }
  return null;
}

/**
 * Le geste complet : où aller, ce qu'on y fait, et si l'alerte se refermera
 * seule. C'est ce que la modale de traitement met EN PREMIER — avant de
 * confier à quelqu'un, et bien avant de marquer traitée à la main.
 */
export function gesteAlerte(a: Alerte, orgId: string): GesteAlerte | null {
  const href = cheminFicheAlerte(a, orgId);
  if (!href || !a.type) return null;
  return {
    href,
    libelle: LIBELLES.get(a.type) ?? "Ouvrir le dossier concerné",
    seFermeSeule: SE_FERMENT_SEULES.has(a.type),
  };
}
