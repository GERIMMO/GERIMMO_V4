"use server";
import { resoudreDepotsFormulaire } from "@/lib/depot-direct";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";
import { sansJargon } from "@/lib/erreurs";
import { deposerDiagnostic, type EtatParc } from "./parc";
import { erreurDiagnosticBail, TITRE_GED_NOTICE_DEPOSEE, TYPE_GED_NOTICE_DEPOSEE } from "@/lib/documents-bail";
import { limiteFichierDepose } from "@/lib/depot-direct";
import { detecterMimeReel } from "@/lib/file-type";
import { aujourdhuiParis } from "@/lib/ged";
import { premier } from "@/lib/postgrest";
import type { EtatBail } from "./baux";
export async function deposerAnnexeBail(orgId:string,bailId:string,_etat:EtatBail,form:FormData):Promise<EtatBail>{
 const {supabase,user}=await verifierGerant(orgId);
 if(!user)return {erreur:"Accès refusé."};
 const {data:bail,error}=await supabase.from("baux").select("id,etat").eq("id",bailId).eq("organization_id",orgId).maybeSingle();
 if(error||bail?.etat!=="brouillon")return {erreur:"Le bail doit être un brouillon accessible."};
 const erreurDepotDirect = await resoudreDepotsFormulaire(supabase, form);
 if (erreurDepotDirect) return { erreur: erreurDepotDirect };
 const fichier=form.get("fichier"),titre=String(form.get("titre")??"").trim();
 if(!(fichier instanceof File)||!fichier.size)return {erreur:"Choisissez le justificatif à joindre."};
 if(!titre||titre.length>200)return {erreur:"Indiquez un titre de 200 caractères maximum."};
 const depot=await deposerFichierGed(supabase,user,orgId,fichier,"autre",titre);
 if(depot.erreur||!depot.documentId)return {erreur:depot.erreur??"Le document n’a pas pu être déposé."};
 const {error:lien}=await supabase.from("document_liens").insert({organization_id:orgId,document_id:depot.documentId,entite:"bail",entite_id:bailId});
 revalidatePath(`/agence/${orgId}/documents`);
 revalidatePath(`/agence/${orgId}/baux/${bailId}`);
 revalidatePath(`/espace/${orgId}/documents`);
 revalidatePath(`/espace/${orgId}/baux/${bailId}`);
 if(lien)return {erreur:`Document enregistré dans Documents, mais non rattaché au bail : ${sansJargon(lien.message)}. Rattachez cette pièce depuis Documents.`};
 return {succes:depot.avertissement??"Justificatif ajouté au bail."};
}

/**
 * Décision du 24/11/2026 (Q46) : le bailleur dépose lui-même la notice d'information officielle de ce bail (un PDF qu'il
 * s'est procuré). Elle est rangée sous un type à elle, liée au bail ; la signature électronique la joint comme annexe et
 * reste bloquée sans elle (annexesSignatureBail). Gerimmo ne fournit pas ce texte et ne vérifie pas son contenu.
 * Le même fichier, déjà déposé comme notice pour un autre bail de l'espace, est rattaché à celui-ci sans copie (l'anti-doublon
 * de Documents le refuserait sinon).
 */
export async function deposerNoticeBail(orgId:string,bailId:string,_etat:EtatBail,form:FormData):Promise<EtatBail>{
 const {supabase,user}=await verifierGerant(orgId);
 if(!user)return {erreur:"Accès refusé."};
 const {data:bail,error}=await supabase.from("baux").select("id,etat").eq("id",bailId).eq("organization_id",orgId).maybeSingle();
 if(error||bail?.etat!=="brouillon")return {erreur:"Le bail doit être un brouillon accessible."};
 const erreurDepotDirect = await resoudreDepotsFormulaire(supabase, form);
 if (erreurDepotDirect) return { erreur: erreurDepotDirect };
 const fichier=form.get("fichier");
 if(!(fichier instanceof File)||!fichier.size)return {erreur:"Choisissez le PDF de la notice d’information."};
 if(fichier.size>limiteFichierDepose(fichier))return {erreur:`Fichier trop volumineux (${limiteFichierDepose(fichier)/1024/1024} Mo max).`};
 // Un PDF complet : la signature électronique ne joint que des PDF, et une photo d'une page ne vaut pas la notice.
 if(detecterMimeReel(new Uint8Array(await fichier.arrayBuffer()))!=="application/pdf")return {erreur:"La notice d’information se dépose en PDF complet."};
 const depot=await deposerFichierGed(supabase,user,orgId,fichier,TYPE_GED_NOTICE_DEPOSEE,TITRE_GED_NOTICE_DEPOSEE);
 let documentId=depot.documentId, succes=depot.avertissement?`Notice d’information déposée. ${depot.avertissement}`:"Notice d’information déposée.";
 if(!documentId&&depot.doublonId){
  const {data:existant}=await supabase.from("documents").select("id,type,purged_at").eq("id",depot.doublonId).eq("organization_id",orgId).maybeSingle();
  if(existant&&existant.type===TYPE_GED_NOTICE_DEPOSEE&&!existant.purged_at){documentId=existant.id;succes="Cette notice est déjà dans vos documents : elle a été rattachée à ce bail, sans copie supplémentaire.";}
 }
 if(!documentId)return {erreur:depot.erreur??"La notice n’a pas pu être déposée."};
 const {error:lien}=await supabase.from("document_liens").upsert({organization_id:orgId,document_id:documentId,entite:"bail",entite_id:bailId},{onConflict:"document_id,entite,entite_id",ignoreDuplicates:true});
 revalidatePath(`/agence/${orgId}/documents`);
 revalidatePath(`/agence/${orgId}/baux/${bailId}`);
 revalidatePath(`/espace/${orgId}/documents`);
 revalidatePath(`/espace/${orgId}/baux/${bailId}`);
 if(lien)return {erreur:`Notice enregistrée dans Documents, mais non rattachée au bail : ${sansJargon(lien.message)}. Déposez-la de nouveau ici.`};
 return {succes};
}

export async function corrigerClasseDpeBail(orgId:string,bailId:string,diagnosticId:string,_etat:EtatBail,form:FormData):Promise<EtatBail>{
 const {supabase,user}=await verifierGerant(orgId);
 if(!user)return {erreur:"Accès refusé."};
 const classe=String(form.get("classe_dpe")??"");
 if(!/^[A-G]$/.test(classe))return {erreur:"Recopiez la classe A à G figurant sur ce diagnostic."};
 const {data:bail,error:lecture}=await supabase.from("baux").select("lot_id,etat").eq("id",bailId).eq("organization_id",orgId).maybeSingle();
 if(lecture||bail?.etat!=="brouillon")return {erreur:"Le bail doit être un brouillon accessible."};
 const {data,error}=await supabase.from("diagnostics").update({classe_dpe:classe}).eq("id",diagnosticId).eq("organization_id",orgId).eq("lot_id",bail.lot_id).eq("type","dpe").is("archived_at",null).select("id");
 if(error)return {erreur:sansJargon(error.message)};
 if(!data?.length)return {erreur:"Ce DPE n’est plus disponible pour ce logement. Rechargez le dossier."};
 revalidatePath(`/agence/${orgId}/baux/${bailId}`);revalidatePath(`/agence/${orgId}/parc`,"layout");
 revalidatePath(`/espace/${orgId}/baux/${bailId}`);revalidatePath(`/espace/${orgId}/parc`,"layout");
 return {succes:"Classe du DPE enregistrée."};
}

/** Le bail détermine le lot et le bâtiment ; le navigateur ne choisit pas le rattachement. */
export async function deposerDiagnosticBail(orgId:string,bailId:string,etat:EtatParc,form:FormData):Promise<EtatParc>{
 const {supabase,user}=await verifierGerant(orgId);
 if(!user)return {erreur:"Accès refusé."};
 const {data:bail,error}=await supabase.from("baux").select("etat,lot_id,lot:lots!baux_lot_meme_org_fk(bien_id)").eq("id",bailId).eq("organization_id",orgId).maybeSingle();
 const bienId=premier(bail?.lot??null)?.bien_id;
 if(error||bail?.etat!=="brouillon"||!bienId)return {erreur:"Le bail doit être un brouillon accessible avec son logement."};
 const erreur=erreurDiagnosticBail(form,aujourdhuiParis());
 if(erreur)return {erreur};
 const resultat=await deposerDiagnostic(orgId,bienId,bail.lot_id,etat,form);
 if(resultat.succes){revalidatePath(`/agence/${orgId}/baux/${bailId}`);revalidatePath(`/espace/${orgId}/baux/${bailId}`);}
 return resultat;
}
