"use server";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";
import { sansJargon } from "@/lib/erreurs";
import { deposerDiagnostic, type EtatParc } from "./parc";
import { erreurDiagnosticBail } from "@/lib/documents-bail";
import { aujourdhuiParis } from "@/lib/ged";
import { premier } from "@/lib/postgrest";
import type { EtatBail } from "./baux";
export async function deposerAnnexeBail(orgId:string,bailId:string,_etat:EtatBail,form:FormData):Promise<EtatBail>{
 const {supabase,user}=await verifierGerant(orgId);
 if(!user)return {erreur:"Accès refusé."};
 const {data:bail,error}=await supabase.from("baux").select("id,etat").eq("id",bailId).eq("organization_id",orgId).maybeSingle();
 if(error||bail?.etat!=="brouillon")return {erreur:"Le bail doit être un brouillon accessible."};
 const fichier=form.get("fichier"),titre=String(form.get("titre")??"").trim();
 if(!(fichier instanceof File)||!fichier.size)return {erreur:"Choisissez le justificatif à joindre."};
 if(!titre||titre.length>200)return {erreur:"Indiquez un titre de 200 caractères maximum."};
 const depot=await deposerFichierGed(supabase,user,orgId,fichier,"autre",titre);
 if(depot.erreur||!depot.documentId)return {erreur:depot.erreur??"Le document n’a pas pu être déposé."};
 const {error:lien}=await supabase.from("document_liens").insert({organization_id:orgId,document_id:depot.documentId,entite:"bail",entite_id:bailId});
 revalidatePath(`/agence/${orgId}/documents`);
 revalidatePath(`/agence/${orgId}/baux/${bailId}`);
 if(lien)return {erreur:`Document enregistré dans Documents, mais non rattaché au bail : ${sansJargon(lien.message)}. Rattachez cette pièce depuis Documents.`};
 return {succes:depot.avertissement??"Justificatif ajouté au bail."};
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
 return {succes:"Classe du DPE enregistrée."};
}

/** Le bail détermine le lot et le bâtiment ; le navigateur ne choisit pas le rattachement. */
export async function deposerDiagnosticBail(orgId:string,bailId:string,etat:EtatParc,form:FormData):Promise<EtatParc>{
 const {supabase,user}=await verifierGerant(orgId);
 if(!user)return {erreur:"Accès refusé."};
 const {data:bail,error}=await supabase.from("baux").select("etat,lot_id,lot:lots!baux_lot_id_fkey(bien_id)").eq("id",bailId).eq("organization_id",orgId).maybeSingle();
 const bienId=premier(bail?.lot??null)?.bien_id;
 if(error||bail?.etat!=="brouillon"||!bienId)return {erreur:"Le bail doit être un brouillon accessible avec son logement."};
 const erreur=erreurDiagnosticBail(form,aujourdhuiParis());
 if(erreur)return {erreur};
 const resultat=await deposerDiagnostic(orgId,bienId,bail.lot_id,etat,form);
 if(resultat.succes)revalidatePath(`/agence/${orgId}/baux/${bailId}`);
 return resultat;
}
