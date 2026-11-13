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

type Remplacement = { ancien_id: string; nouveau_id: string; date_pose: string };
export function periodesCompteurs<T extends CompteurPeriode>(compteurs: T[], liens: Remplacement[], debut: string, fin: string, categorie: string, lot: string, choix = "") {
  return compteurs.filter(m => m.lot_id === lot && fluideCompatible(m.type, categorie) && m.date_index_initial <= debut
    && !liens.some(l => l.ancien_id === m.id && l.date_pose <= debut)).flatMap(initial => {
    const periodes: { compteur: T; debut: string; fin: string }[] = [];
    let courant = initial, date = debut;
    while (date < fin) {
      const lien = liens.find(l => l.ancien_id === courant.id);
      const borne = lien && lien.date_pose < fin ? lien.date_pose : fin;
      if (borne <= date) throw new Error("Dates de remplacement incohérentes.");
      periodes.push({ compteur: courant, debut: date, fin: borne });
      if (borne === fin) break;
      const suivant = compteurs.find(m => m.id === lien?.nouveau_id);
      if (!suivant || suivant.lot_id !== lot || suivant.type !== initial.type || suivant.unite !== initial.unite || suivant.date_index_initial !== borne) throw new Error("Le compteur de remplacement est indisponible ou incompatible.");
      courant = suivant;
      date = borne;
    }
    return choix && !periodes.some(p => p.compteur.id === choix) ? [] : [periodes];
  });
}

export function chainesDocumentees<T extends CompteurPeriode & {remplacement?:Remplacement|null}>(compteurs:T[], releves:{compteur_id:string;date_releve:string}[], facture:{periode_debut:string;periode_fin:string}, categorie:string, lot:string) {
  const liens = compteurs.flatMap(m => m.remplacement ?? []);
  return periodesCompteurs(compteurs,liens,facture.periode_debut,facture.periode_fin,categorie,lot)
    .filter(chaine => chaine.every(p => compteursPourFacture([p.compteur],releves,{periode_debut:p.debut,periode_fin:p.fin},categorie,lot).length));
}
