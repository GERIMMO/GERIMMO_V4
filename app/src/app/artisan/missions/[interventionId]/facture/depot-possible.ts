import type { LigneAgenda } from "../../../acces";

type EtatFacture = Pick<LigneAgenda, "statut" | "compte_rendu_depose" | "photo_apres_deposee" | "facture_deposee">;

/**
 * La facture d'une mission se dépose une fois l'intervention terminée, son compte rendu et la photo du travail réalisé
 * déposés, et une seule fois (wiki, concepts/Devis ; la base le revérifie). La page /facture ne s'ouvre qu'à ces
 * conditions, et la fiche de mission ne montre « Déposer ma facture » qu'à elles.
 */
export function factureDeposable(mission: EtatFacture): boolean {
  return mission.statut === "terminee" && mission.compte_rendu_depose && mission.photo_apres_deposee && !mission.facture_deposee;
}

/**
 * Relevé du 26/11 (plan de corrections, L4) : ouverte trop tôt (favori, historique, adresse tapée) ou une fois la
 * facture déposée, /facture renvoyait à la fiche de mission sans un mot, comme le bilan avant le 25/09 (A12). Le renvoi
 * porte `?raison=facture`, et la fiche écrit pourquoi, tant que c'est encore vrai : rien si la facture est de nouveau
 * déposable.
 */
export function raisonRetourFacture(mission: EtatFacture): string | null {
  if (factureDeposable(mission)) return null;
  if (mission.facture_deposee) return "Votre facture est déjà déposée : elle ne se dépose qu’une fois, et son suivi se lit ci-dessous.";
  return "La facture se dépose une fois l’intervention terminée, avec son compte rendu et la photo du travail réalisé.";
}
