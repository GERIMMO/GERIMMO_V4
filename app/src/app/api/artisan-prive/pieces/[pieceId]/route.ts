import {createHash} from "node:crypto";
import {chargerActivitePrivee} from "@/lib/artisan-prive";
export async function GET(_request:Request,{params}:{params:Promise<{pieceId:string}>}){
 const {pieceId}=await params;const {data,supabase}=await chargerActivitePrivee();const piece=data?.pieces.find(x=>x.id===pieceId);
 if(!piece)return new Response("Accès refusé",{status:403,headers:{"Cache-Control":"private, no-store"}});
 const {data:blob,error}=await supabase.storage.from("artisan-prive").download(piece.storage_path);
 if(error||!blob)return new Response("Pièce indisponible. Réessayez plus tard.",{status:503});
 const bytes=new Uint8Array(await blob.arrayBuffer());if(createHash("sha256").update(bytes).digest("hex")!==piece.sha256)return new Response("La pièce ne peut pas être vérifiée.",{status:409});
 return new Response(bytes,{headers:{"Content-Type":piece.mime,"Content-Disposition":`inline; filename*=UTF-8''${encodeURIComponent(piece.nom)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
