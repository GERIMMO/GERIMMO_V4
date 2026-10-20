import {createHash} from "node:crypto";
import {chargerActivitePrivee} from "@/lib/artisan-prive";
import {servirFichierSigne, TAILLE_MAX_REPONSE_FICHIER} from "@/lib/fichier-signe";
export async function GET(_request:Request,{params}:{params:Promise<{pieceId:string}>}){
 const {pieceId}=await params;const {data,supabase}=await chargerActivitePrivee();const piece=data?.pieces.find(x=>x.id===pieceId);
 if(!piece)return new Response("Accès refusé",{status:403,headers:{"Cache-Control":"private, no-store"}});
 const {data:blob,error}=await supabase.storage.from("artisan-prive").download(piece.storage_path);
 if(error||!blob)return new Response("Pièce indisponible. Réessayez plus tard.",{status:503});
 const bytes=new Uint8Array(await blob.arrayBuffer());if(createHash("sha256").update(bytes).digest("hex")!==piece.sha256)return new Response("La pièce ne peut pas être vérifiée.",{status:409});
 if(bytes.byteLength>TAILLE_MAX_REPONSE_FICHIER)return servirFichierSigne(supabase,{compartiment:"artisan-prive",path:piece.storage_path,mime:piece.mime,titre:piece.nom,sha256:piece.sha256,retour:"depuis votre activité artisan"});
 return new Response(bytes,{headers:{"Content-Type":piece.mime,"Content-Disposition":`inline; filename*=UTF-8''${encodeURIComponent(piece.nom)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
