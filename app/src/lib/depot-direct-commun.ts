export const BUCKET_TRANSIT='depots-temporaires';
export const PREFIXE_DEPOT='gerimmo-depot:';
export const MARQUEUR_DEPOT='__gerimmo_depot_direct';
export const EVENEMENT_DEPOT='gerimmo-depot';
export const MAX_DEPOT_DIRECT=10*1024*1024;
export const MAX_FORMULAIRE_DIRECT=50*1024*1024;
export type DescriptionDepot={nom:string;mime:string;taille:number;empreinte:string};
export function descriptionDepotValide(d:DescriptionDepot):boolean {
 return !!d && typeof d.nom==='string' && d.nom.length>0 && d.nom.length<=200 && !/[\x00-\x1f]/.test(d.nom) &&
 ['application/pdf','image/jpeg','image/png'].includes(d.mime) && Number.isSafeInteger(d.taille) && d.taille>0 && d.taille<=MAX_DEPOT_DIRECT && /^[a-f0-9]{64}$/.test(d.empreinte);
}
