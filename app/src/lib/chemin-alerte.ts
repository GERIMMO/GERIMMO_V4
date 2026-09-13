// Les alertes qui se traitent SUR LE BAIL, et l'ancre de la carte où le geste
// se fait : la fiche d'un bail dépasse le millier de lignes, y atterrir en
// haut fait recommencer le défilement (relevé du 11/09).
// Chaque entrée a été vérifiée dans la migration qui POSE l'alerte — la charge
// utile doit porter `bail_id`, sinon le lien construit une adresse fausse :
//   · conge_intention / edl_sortie → enregistrer_conge, 20260906101000:81-83
//   · restitution_echeance        → generer_alertes_restitution, 20260830120000:497
//   · decompte / decompte_lrar    → finaliser_decompte, 20260911124500:102
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
]);

// « Traiter » emmène là où le geste se fait : un message se lit sur la fiche
// de la personne, une intention de congé se confirme sur le bail.
export function cheminFicheAlerte(a: { type?: string; details: Record<string, unknown> | null }, orgId: string): string | null {
  if (
    (a.type === "message_locataire" || a.type === "piece_deposee") &&
    typeof a.details?.person_id === "string"
  ) {
    return `/agence/${orgId}/personnes/${a.details.person_id}`;
  }
  const ancre = a.type ? ANCRES_BAIL.get(a.type) : undefined;
  if (ancre !== undefined && typeof a.details?.bail_id === "string") {
    return `/agence/${orgId}/baux/${a.details.bail_id}${ancre}`;
  }
  // Un document signé retourné se contrôle puis se classe sur sa fiche GED
  if (a.type === "signature_retournee" && typeof a.details?.document_id === "string") {
    return `/agence/${orgId}/documents?sel=${a.details.document_id}`;
  }
  return null;
}

