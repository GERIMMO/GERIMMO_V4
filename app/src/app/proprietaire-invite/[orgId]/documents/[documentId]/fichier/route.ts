import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pageErreurFichier } from "@/lib/page-erreur-fichier";

export async function GET(request:NextRequest,ctx:{params:Promise<{orgId:string;documentId:string}>}){
 const {orgId,documentId}=await ctx.params;
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!uuid.test(orgId)||!uuid.test(documentId))return pageErreurFichier(404,'Document introuvable','Cette adresse ne désigne pas un compte rendu.','depuis vos comptes rendus');
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return pageErreurFichier(403,'Connexion nécessaire','Reconnectez-vous avec le compte propriétaire invité.','depuis vos comptes rendus');
 const mode=request.nextUrl.searchParams.get('mode')==='telechargement'?'telechargement':'consultation';
 const {data,error}=await db.rpc('proprietaire_invite_fichier',{p_org:orgId,p_document:documentId,p_mode:mode});
 const doc=(data as {storage_path:string;titre:string|null;mime_type:string}[]|null)?.[0];
 if(error||!doc)return pageErreurFichier(403,'Document inaccessible','Ce compte ne peut pas consulter ce document, ou son accès n’a pas pu être vérifié.','depuis vos comptes rendus');
 if(doc.mime_type!=='application/pdf'||!doc.storage_path.startsWith(`${orgId}/`)||doc.storage_path.includes('..'))return pageErreurFichier(403,'Document inaccessible','Le fichier doit être vérifié par votre agence.','depuis vos comptes rendus');
 const {data:fichier,error:erreurFichier}=await db.storage.from('documents').download(doc.storage_path);
 if(erreurFichier||!fichier)return pageErreurFichier(502,'Fichier indisponible','Le compte rendu n’a pas pu être relu. Réessayez dans un instant.','depuis vos comptes rendus');
 return new Response(fichier,{headers:{'Content-Type':'application/pdf','Content-Disposition':`${mode==='telechargement'?'attachment':'inline'}; filename="compte-rendu.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
