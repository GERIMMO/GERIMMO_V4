import { lireDecimal } from "@/lib/saisie-montant";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { clientDeService } from "@/lib/supabase/service";

export async function GET(request:Request,{params}:{params:Promise<{sollicitationId:string}>}) {
  const {sollicitationId}=await params;
  const url=new URL(request.url);
  const version=url.searchParams.get("version");
  const lu=version===null ? null : lireDecimal(version);
  if (lu && ("erreur" in lu || !Number.isSafeInteger(lu.valeur) || lu.valeur<1 || lu.valeur>2147483647)) return new Response("Version incorrecte",{status:400});
  const db=await createClient();
  const {data,error}=await db.rpc("lire_signature_devis_archive",{p_sollicitation:sollicitationId,p_version:lu && "valeur" in lu ? lu.valeur : null});
  if(error||!data) return new Response("Document inaccessible",{status:403});
  const preuve=url.searchParams.get("preuve")==="1";
  const path=preuve?data.preuve_path:data.document_path;
  const hash=preuve?data.preuve_hash:data.document_hash;
  if(data.etat!=="termine"||!path||!hash) return new Response("La signature est encore en cours",{status:409});
  const service=clientDeService();
  if(!service) return new Response("Archive momentanément indisponible",{status:503});
  const fichier=await service.storage.from("documents").download(path);
  if(fichier.error||!fichier.data) return new Response("Archive momentanément indisponible",{status:503});
  const bytes=Buffer.from(await fichier.data.arrayBuffer());
  if(createHash("sha256").update(bytes).digest("hex")!==hash) return new Response("L’intégrité de l’archive doit être vérifiée",{status:503});
  return new Response(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition":`inline; filename="${preuve?"preuve-signature":"devis-accepte"}.pdf"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
