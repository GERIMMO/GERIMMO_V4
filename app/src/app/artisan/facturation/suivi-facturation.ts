import type { LigneAgenda } from "../acces";

export function classerFacturation(lignes: LigneAgenda[]) {
  const terminees = lignes.filter(l => l.statut === "terminee");
  const deposees = terminees.filter(l => l.facture_deposee);
  const aFacturer = terminees.filter(l => !l.facture_deposee && l.compte_rendu_depose && l.photo_apres_deposee);
  const aCompleter = lignes.filter(l => !l.facture_deposee && (l.statut === "en_cours" || l.statut === "terminee") && (!l.compte_rendu_depose || !l.photo_apres_deposee));
  return { terminees, deposees, aFacturer, aCompleter };
}

/** Le devis ou l’avenant est une référence, pas le montant de la facture ni un encaissement. */
export function montantEngage(ligne: LigneAgenda) {
  return ligne.montant_plafond_cents ?? ligne.montant_ttc_cents;
}
