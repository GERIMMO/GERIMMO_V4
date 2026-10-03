// Ligne du RPC mon_bail_locataire (v4 — migration espace_locataire_v10)
export type BailLocataire = {
  bail_id: string;
  type: string;
  etat: string;
  loyer_hc: number | null;
  charges: number | null;
  date_debut: string | null;
  date_fin: string | null;
  lot_nom: string;
  document_signe: string | null;
  charges_mode: string | null;
  jour_echeance: number | null;
  surface_m2: number | null;
  pieces: number | null;
  etage: string | null;
  meuble: boolean | null;
  adresse: string | null;
  ville: string | null;
  zone_tendue: boolean | null;
};

// Recette 03/10 : un locataire dont le bail est encore en brouillon (le
// gestionnaire n'a pas déposé le contrat signé) voyait partout « Signaler un
// problème », et la page de signalement le renvoyait à son gestionnaire. La
// base n'accepte une déclaration que sur un bail actif ou en préavis
// (RM-7.1) : c'est ici que les écrans le lisent, une fois pour tous.
export function signalementOuvert(baux: { etat: string }[] | null | undefined): boolean {
  return (baux ?? []).some((b) => b.etat === "actif" || b.etat === "preavis");
}

/** Ce qui se lit à la place du bouton tant que le bail n'est pas actif. */
export const NOTE_SIGNALEMENT_FERME =
  "Le signalement s'ouvrira dès que votre bail sera actif, c'est-à-dire une fois le contrat signé déposé par votre gestionnaire.";
