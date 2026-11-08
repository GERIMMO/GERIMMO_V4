import type { SupabaseClient } from "@supabase/supabase-js";
import { sansJargon } from "@/lib/erreurs";
import { documentPartFacture } from "@/lib/decompte-facture";
import type { RepartitionFourniture } from "@/lib/proposition-repartition";
import { rendrePdf } from "@/lib/documents/rendu";
import { preparerFichierGed, abandonnerPieceGed } from "@/lib/ged-depot";

import type { EtatPartFacture } from "@/app/actions/decompte-facture";
export async function preparerPdfFactureExistant(supabase:SupabaseClient,org:string,repartition:string,bailId:string):Promise<EtatPartFacture> {
  try {
    const [rep,bail,precedent]=await Promise.all([
      supabase.from("repartitions_fourniture").select("*").eq("organization_id",org).eq("id",repartition).single(),
      supabase.from("baux").select("lot_id,locataire_principal").eq("organization_id",org).eq("id",bailId).single(),
      supabase.from("documents_repartition_fourniture").select("document_id,envoye_le").eq("organization_id",org).eq("repartition_id",repartition).eq("bail_id",bailId).maybeSingle()
    ]);
    if(rep.error||bail.error||precedent.error||!rep.data||!bail.data) return {erreur:"Le suivi de cette facture est indisponible."};
    const r=rep.data as RepartitionFourniture;
    const parts=r.lignes.filter(l=>l.bail_id===bailId && l.recuperable);
    if(r.statut!=="validee"||!parts.length) return {erreur:"Validez la répartition pour ce bail avant de préparer son PDF."};
    const montant=parts.reduce((s,l)=>s+Number(l.montant_cents),0)/100;
    if(precedent.data) return {documentId:precedent.data.document_id,envoyeLe:precedent.data.envoye_le,montant};
    const [locataire,lot,detentions,facture]=await Promise.all([
      supabase.from("persons").select("nom,prenom").eq("organization_id",org).eq("id",bail.data.locataire_principal).single(),
      supabase.from("lots").select("nom,bien_id").eq("organization_id",org).eq("id",bail.data.lot_id).single(),
      supabase.from("detentions").select("person:persons!detentions_person_id_fkey(nom,prenom)").eq("organization_id",org).eq("lot_id",bail.data.lot_id).is("date_fin",null),
      supabase.from("factures_fourniture").select("reference,periode_debut,periode_fin,contrat_id").eq("organization_id",org).eq("id",r.facture_id).single()
    ]);
    if(locataire.error||lot.error||detentions.error||facture.error||!locataire.data||!lot.data||!facture.data) return {erreur:"Complétez les identités du bail et du logement."};
    const [bien,contrat]=await Promise.all([
      supabase.from("biens").select("address_line1,postal_code,city").eq("organization_id",org).eq("id",lot.data.bien_id).single(),
      supabase.from("contrats_fourniture").select("fournisseur").eq("organization_id",org).eq("id",facture.data.contrat_id).single()
    ]);
    if(bien.error||contrat.error||!bien.data||!contrat.data) return {erreur:"L’adresse ou le fournisseur est indisponible."};
    const noms=detentions.data.map(d=>{const p=Array.isArray(d.person)?d.person[0]:d.person;return p?[p.prenom,p.nom].filter(Boolean).join(" "):"";}).filter(Boolean);
    const pdf=await rendrePdf(documentPartFacture(r,bailId,{
      bailleur:[...new Set(noms)].join(", "),locataire:[locataire.data.prenom,locataire.data.nom].filter(Boolean).join(" "),
      logement:lot.data.nom,adresse:[bien.data.address_line1,bien.data.postal_code,bien.data.city].filter(Boolean).join(" "),
      reference:facture.data.reference,fournisseur:contrat.data.fournisseur,debut:facture.data.periode_debut,fin:facture.data.periode_fin
    }));
    const prep=await preparerFichierGed(supabase,org,new File([new Uint8Array(pdf)],"repartition-facture.pdf",{type:"application/pdf"}),false,true);
    if(!prep.fichier) return {erreur:prep.erreur ?? "Le PDF n’a pas pu être préparé."};
    const piece=prep.fichier;
    const enregistre=await supabase.rpc("enregistrer_pdf_repartition",{p_org:org,p_repartition:repartition,p_bail:bailId,p_empreinte:r.empreinte,p_storage_path:piece.chemin,p_taille:piece.taille,p_fichier_empreinte:piece.empreinte});
    if(enregistre.error||!enregistre.data){await abandonnerPieceGed(supabase,piece);return {erreur:sansJargon(enregistre.error?.message ?? "PDF non enregistré.")};}
    const fichier=await supabase.from("documents").select("storage_path").eq("organization_id",org).eq("id",enregistre.data).single();
    if(fichier.data?.storage_path && fichier.data.storage_path!==piece.chemin) await abandonnerPieceGed(supabase,piece);

    return {documentId:enregistre.data,montant};
  } catch(e){return {erreur:sansJargon(e instanceof Error?e.message:"Préparation interrompue.")};}
}