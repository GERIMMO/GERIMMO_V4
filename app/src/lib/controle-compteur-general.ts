import { indexEnMillUnites } from "./consommations";

type Compteur = { id:string; lot_id:string|null; type:string; unite:string; compteur_principal_id?:string|null; date_index_initial:string; index_initial:string|number };
type Releve = {compteur_id:string; date_releve:string; index_releve:string|number};
export function indexDate(m:Compteur, releves:Releve[], jour:string) {
  return releves.find(r=>r.compteur_id===m.id && r.date_releve===jour)?.index_releve ?? (m.date_index_initial===jour ? m.index_initial : null);
}
/** Vérifie aussi les index intermédiaires : comparer les deux bornes seules
 * peut masquer une remise à zéro au milieu de la facture. */
export function consommationMesuree(m: Compteur, releves: Releve[], debut: string, fin: string) {
  const initial = indexDate(m, releves, debut);
  const dernier = indexDate(m, releves, fin);
  if (initial == null || dernier == null) {
    throw new Error("Relevé manquant au " + (initial == null ? debut : fin) + " sur le compteur " + (m.lot_id ? "divisionnaire" : "principal") + ".");
  }
  const base = indexEnMillUnites(initial);
  let precedent = base;
  const mesures = releves.filter(r => r.compteur_id === m.id && r.date_releve > debut && r.date_releve <= fin)
    .sort((a,b) => a.date_releve.localeCompare(b.date_releve));
  for (const mesure of mesures) {
    const valeur = indexEnMillUnites(mesure.index_releve);
    if (valeur < precedent) throw new Error("Index décroissant. Vérifiez si le compteur a été remplacé.");
    precedent = valeur;
  }
  return indexEnMillUnites(dernier) - base;
}
export function controleCompteurGeneral(compteurs:Compteur[], releves:Releve[], idsEnfants:string[], debut:string, fin:string, periodes?:ReadonlyMap<string,{debut:string;fin:string}>) {
  const groupes = new Map<string,Compteur[]>();
  for (const id of new Set(idsEnfants)) {
    const enfant = compteurs.find(m=>m.id===id);
    if (!enfant?.compteur_principal_id) continue;
    const groupe = groupes.get(enfant.compteur_principal_id) ?? [];
    groupe.push(enfant); groupes.set(enfant.compteur_principal_id,groupe);
  }
  const bilans:{id:string;unite:string;general:number;divisionnaires:number;ecart:number}[]=[];
  for (const [id,enfants] of groupes) {
    const principal=compteurs.find(m=>m.id===id && !m.lot_id);
    if (!principal) throw new Error("Le compteur principal lié est indisponible.");
    const general=consommationMesuree(principal, releves, debut, fin);
    let somme=BigInt(0);
    for(const enfant of enfants) {
      if(enfant.unite!==principal.unite || enfant.type!==principal.type) throw new Error("Le compteur principal et ses divisionnaires doivent mesurer le même fluide dans la même unité.");
      const periode = periodes?.get(enfant.id);
      somme+=consommationMesuree(enfant, releves, periode?.debut ?? debut, periode?.fin ?? fin);
    }
    if(somme>general) throw new Error("Les divisionnaires dépassent le compteur principal. Vérifiez les index.");
    bilans.push({id,unite:principal.unite,general:Number(general)/1000,divisionnaires:Number(somme)/1000,ecart:Number(general-somme)/1000});
  }
  return bilans;
}
