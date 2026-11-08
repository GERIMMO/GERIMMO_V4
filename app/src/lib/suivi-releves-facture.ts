import { compteursPourFacture } from "./compteurs-facture";
import { controleCompteurGeneral, indexDate } from "./controle-compteur-general";
import type { CompteurConsommation, FactureFourniture, ReleveConsommation } from "./consommations";
/** Disponibilité des index, distincte de la validation métier de la répartition. */
export function relevesFactureComplets(facture: Pick<FactureFourniture,"periode_debut"|"periode_fin"|"unite_consommation">, categorie:string, lots:{id:string}[], compteurs:CompteurConsommation[], releves:ReleveConsommation[], baux:{lot_id:string;date_debut:string;date_fin:string|null}[]=[]):boolean {
  if (!lots.length) return false;
  const ids:string[]=[];
  for (const lot of lots) {
    const possibles=compteursPourFacture(compteurs,releves,facture,categorie,lot.id);
    if(possibles.length!==1) return false;
    const m=possibles[0];
    const a=Number(indexDate(m,releves,facture.periode_debut)),b=Number(indexDate(m,releves,facture.periode_fin));
    if(!Number.isFinite(a)||!Number.isFinite(b)||b<a||(facture.unite_consommation && m.unite!==facture.unite_consommation)) return false;
    const limites=baux.filter(b=>b.lot_id===lot.id).flatMap(b=>[b.date_debut,b.date_fin]).filter((j):j is string=>!!j && j>facture.periode_debut && j<facture.periode_fin);
    if(limites.some(j=>indexDate(m,releves,j)==null)) return false;
    ids.push(m.id);
  }
  try { controleCompteurGeneral(compteurs,releves,ids,facture.periode_debut,facture.periode_fin); return true; }
  catch { return false; }
}
