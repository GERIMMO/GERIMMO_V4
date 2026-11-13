import { chainesDocumentees } from "./compteurs-facture";
import { consommationMesuree, controleCompteurGeneral, indexDate } from "./controle-compteur-general";
import type { CompteurConsommation, FactureFourniture, ReleveConsommation } from "./consommations";
/** Disponibilité des index, distincte de la validation métier de la répartition. */
export function relevesFactureComplets(facture: Pick<FactureFourniture,"periode_debut"|"periode_fin"|"unite_consommation">, categorie:string, lots:{id:string}[], compteurs:CompteurConsommation[], releves:ReleveConsommation[], baux:{lot_id:string;date_debut:string;date_fin:string|null}[]=[]):boolean {
  if (!lots.length) return false;
  const periodes = new Map<string,{debut:string;fin:string}>();
  try {
    for (const lot of lots) {
      const chaines = chainesDocumentees(compteurs,releves,facture,categorie,lot.id);
      if (chaines.length !== 1) return false;
      const limites = baux.filter(b=>b.lot_id===lot.id).flatMap(b=>[b.date_debut,b.date_fin]);
      for (const {compteur,debut,fin} of chaines[0]) {
        if (facture.unite_consommation && compteur.unite !== facture.unite_consommation) return false;
        consommationMesuree(compteur,releves,debut,fin);
        if (limites.some(j => j && j>debut && j<fin && indexDate(compteur,releves,j)==null)) return false;
        periodes.set(compteur.id,{debut,fin});
      }
    }
    controleCompteurGeneral(compteurs,releves,[...periodes.keys()],facture.periode_debut,facture.periode_fin,periodes);
    return true;
  } catch { return false; }
}
