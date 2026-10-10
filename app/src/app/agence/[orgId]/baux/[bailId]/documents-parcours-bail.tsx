import { PastilleBail } from "@/components/pastille-bail";
import { createClient } from "@/lib/supabase/server";
import { premier } from "@/lib/postgrest";
import { aujourdhuiParis } from "@/lib/ged";
import { classerPiecesBail, type DiagnosticBail, type PieceBail } from "@/lib/documents-bail";
import { FileCheck2, BookOpen, Building2, Paperclip } from "lucide-react";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import { FormulaireReglementCopropriete } from "./formulaires-bail";
import { FormulaireAnnexeBail } from "./formulaire-annexe-bail";
import { DiagnosticsBail } from "./diagnostics-bail";
import styles from "./documents-bail.module.css";
import type { ReactNode } from "react";

export async function DocumentsParcoursBail({orgId,bailId,lotId,bienId,annexes,copropriete,reglementId}:{orgId:string;bailId:string;lotId:string;bienId:string;annexes:ReactNode;copropriete:boolean|null;reglementId:string|null}) {
 const db=await createClient();
 const champs="id,type,date_realisation,date_expiration,document_id,classe_dpe,document:documents!diagnostics_document_meme_org_fk(id,purged_at)";
 const [lot,bien,docs]=await Promise.all([
  db.from("diagnostics").select(champs).eq("organization_id",orgId).eq("lot_id",lotId).is("archived_at",null).order("date_realisation",{ascending:false}),
  db.from("diagnostics").select(champs).eq("organization_id",orgId).eq("bien_id",bienId).is("lot_id",null).is("archived_at",null).order("date_realisation",{ascending:false}),
  db.from("document_liens").select("document:documents(id,titre,type,purged_at,created_at)").eq("organization_id",orgId).eq("entite","bail").eq("entite_id",bailId),
 ]);
 const diagnostics:DiagnosticBail[]=[...(lot.data??[]).map(d=>({...d,niveau:"lot" as const})),...(bien.data??[]).map(d=>({...d,niveau:"bien" as const}))].map(d=>{
  const document=premier(d.document);
  return {...d,document_id:document&&!document.purged_at?d.document_id:null};
 });
 const documents=(docs.data??[]).map(d=>premier(d.document)).filter((d):d is NonNullable<typeof d>=>Boolean(d)).sort((a,b)=>b.created_at.localeCompare(a.created_at));
 const {notices,autres}=classerPiecesBail(documents as PieceBail[],diagnostics.map(d=>d.document_id).filter((id):id is string=>Boolean(id)),reglementId);
 const notice=notices[0];
 const fichier=(id:string)=>`/agence/${orgId}/documents/${id}/fichier`;
 return <div id="documents-bail" className={styles.page}>
  <section id="completer-dpe" className={styles.section}>
   <header className={styles.entete}><FileCheck2 size={20} aria-hidden="true"/><h3>Les diagnostics déjà enregistrés <PastilleBail champ="diagnostic.classe_dpe"/></h3><span className={styles.etat}>{lot.error||bien.error?"À vérifier":`${diagnostics.length} rapport${diagnostics.length>1?"s":""}`}</span></header>
   <p>Les rapports du logement et du bâtiment sont repris automatiquement. Un seul dépôt dans la fiche du lot suffit pour tous ses baux.</p>
   {lot.error||bien.error?<p role="alert">Les diagnostics n’ont pas pu être chargés. Rechargez la page avant d’effectuer un dépôt.</p>:<DiagnosticsBail orgId={orgId} bailId={bailId} lotId={lotId} bienId={bienId} diagnostics={diagnostics} aujourdhui={aujourdhuiParis()}/>}
   <p className={styles.aide}><a href="https://www.service-public.gouv.fr/particuliers/vosdroits/F33463" target="_blank" rel="noreferrer" className="underline">Vérifier les diagnostics applicables à votre logement</a>.</p>
  </section>
  {docs.error&&<p role="alert">Les annexes du bail n’ont pas pu être chargées. Leur présence ne peut pas être vérifiée.</p>}
  <div className={styles.annexes}>
   <section className={styles.section}>
    <header className={styles.entete}><BookOpen size={20} aria-hidden="true"/><h3>Notice d’information</h3><span className={styles.etat} data-ton={notice?"ok":"attention"}>{docs.error?"À vérifier":notice?"Disponible":"À générer"}</span></header>
    <p>La notice présente les droits et obligations des parties. Elle est à remettre avec le bail.</p>
    <div className={styles.actions}>{notice&&<a href={fichier(notice.id)} target="_blank" rel="noreferrer">Consulter la notice</a>}<BoutonGenererDocument orgId={orgId} code="notice" cibleId={bailId} cheminRetour={`/agence/${orgId}/baux/${bailId}`} libelle={notice?"Actualiser la notice":"Générer la notice (PDF)"}/></div>
   </section>
   <section id="reglement-copro" className={styles.section}>
    <header className={styles.entete}><Building2 size={20} aria-hidden="true"/><h3>Règlement de copropriété</h3><span className={styles.etat} data-ton={reglementId?"ok":copropriete===true?"attention":undefined}>{reglementId?"Déposé":copropriete===false?"Non applicable":copropriete===true?"À joindre":"À confirmer"}</span></header>
    {reglementId?<div className={styles.actions}><a href={fichier(reglementId)} target="_blank" rel="noreferrer">Consulter le règlement</a></div>:copropriete===true?<><p>Joignez les extraits concernant l’usage des parties privatives et communes.</p><div className={styles.actions}><FormulaireReglementCopropriete orgId={orgId} bailId={bailId}/></div></>:copropriete===false?<p>Le bâtiment est renseigné hors copropriété.</p>:<p>Confirmez la situation du bâtiment à l’étape <a href="#completer-bien" className="underline">Le logement</a>.</p>}
   </section>
  </div>
  {annexes}
  <section className={styles.section}>
   <header className={styles.entete}><Paperclip size={20} aria-hidden="true"/><h3>Autres justificatifs</h3><span className={styles.etat}>Selon votre situation</span></header>
   <p>Par exemple : attestation d’assurance ou autorisation de louer si le logement est concerné.</p>
   {!docs.error&&(autres.length?<ul className={styles.liste}>{autres.map(d=><li key={d.id}><span className={styles.identite}><strong>{d.titre??"Justificatif du bail"}</strong></span><a className="lien-discret" href={fichier(d.id)} target="_blank" rel="noreferrer">Consulter</a></li>)}</ul>:<p className={styles.vide}>Aucun justificatif supplémentaire ajouté.</p>)}
   <FormulaireAnnexeBail orgId={orgId} bailId={bailId}/>
  </section>
 </div>;
}
