import { DetailFacture } from "./parcours-depense";
import { FicheFactureFourniture, type Props } from "./consommations-formulaires";
import { eur, formaterDate } from "@/lib/ged";
import { ApercuDocumentEspace } from "./apercu-document-espace";
import styles from "./consommations.module.css";

/** Lecture des factures communes, sans créer une seconde dépense sur le logement. */
export function ChargesCommunesLot({p,lotId}:{p:Props;lotId:string}) {
  const {base}=p;
  const contrats={data:p.contrats.filter(c=>!c.lot_id)};
  const ids=new Set(contrats.data.map(c=>c.id));
  const factures={data:p.factures.filter(f=>ids.has(f.contrat_id))};
  const parFacture=new Map(p.repartitions.map(r=>[r.facture_id,r]));
  const visibles=[...factures.data].sort((a,b)=>b.periode_fin.localeCompare(a.periode_fin)||a.id.localeCompare(b.id)).filter(f=>{const r=parFacture.get(f.id);return !r||r.lignes.some(l=>l.lot_id===lotId)});
  if(!visibles.length)return null;
  return <div className={styles.list}>
    <h3 className="text-sm font-semibold">Parties communes du bâtiment</h3>
    {!visibles.length?<p className={styles.muted}>Aucune facture commune concernant ce logement.</p>:<ul className={styles.list}>{visibles.map(f=>{
      const r=parFacture.get(f.id);const lignes=r?.lignes.filter(l=>l.lot_id===lotId)??[];
      const total=lignes.reduce((s,l)=>s+Number(l.montant_cents),0);
      const recuperable=lignes.filter(l=>l.recuperable).reduce((s,l)=>s+Number(l.montant_cents),0);
      return <li key={f.id} className={styles.invoice}>
        <div className={styles.line}><strong>{contrats.data.find(c=>c.id===f.contrat_id)?.fournisseur} · {f.reference}</strong><span className={styles.badge}>{r?.statut==="validee"?"Répartition validée":r?"Répartition à vérifier":"À répartir"}</span></div>
        <p className={styles.caption}>Du {formaterDate(f.periode_debut)} au {formaterDate(f.periode_fin)} · Facture du bâtiment : {eur(Number(f.total_cents)/100)}</p>
        {lignes.length>0?<><p className="text-sm">Part de ce logement{r?.statut!=="validee"?" proposée":""} : <strong>{eur(total/100)}</strong></p><p className={styles.caption}>Dont part locataire : {eur(recuperable/100)} · Part propriétaire : {eur((total-recuperable)/100)}. Les provisions déjà versées seront déduites dans le décompte.</p></>:<p className={styles.muted}>Part du logement à déterminer avec les logements concernés et leur clé de répartition.</p>}
        <DetailFacture id={f.id}><FicheFactureFourniture p={p} c={contrats.data.find(c=>c.id===f.contrat_id)!} f={f} repartirDirectement /></DetailFacture>
        <div className={styles.actions}>{f.document_id&&<ApercuDocumentEspace fichier={`${base}/documents/${f.document_id}/fichier`} titre={`Facture ${f.reference}`} />}</div>
      </li>;
    })}</ul>}
  </div>;
}
