type CompteurPeriode = { id: string; lot_id: string | null; type: string; date_index_initial: string; unite: string };
export function fluideCompatible(type:string,categorie:string) {
  return categorie === "eau" ? ["eau_froide","eau_chaude"].includes(type) : categorie.startsWith("electricite") ? type === "electricite" : type === categorie;
}
/** Un ancien compteur reste utilisable pour les périodes qu'il documente. */
export function compteursPourFacture<T extends CompteurPeriode>(compteurs: T[], releves: { compteur_id: string; date_releve: string }[], facture: { periode_debut: string; periode_fin: string }, categorie: string, lotId: string): T[] {
  return compteurs.filter(m => m.lot_id === lotId && m.date_index_initial <= facture.periode_debut
    && fluideCompatible(m.type, categorie)
    && (m.date_index_initial === facture.periode_debut || releves.some(r => r.compteur_id === m.id && r.date_releve === facture.periode_debut))
    && releves.some(r => r.compteur_id === m.id && r.date_releve === facture.periode_fin));
}
