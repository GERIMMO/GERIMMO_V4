import { createClient } from "@/lib/supabase/server";
import { pageErreurFichier } from "@/lib/page-erreur-fichier";
import { assemblerDevisArtisan, type DevisArtisanDocument } from "@/lib/documents/devis-artisan";
import { rendrePdf } from "@/lib/documents/rendu";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{sollicitationId:string}> }) {
  const { sollicitationId } = await context.params;
  const supabase = await createClient();
  const { data: {user} }=await supabase.auth.getUser();
  if(!user) return pageErreurFichier(403,"Connexion nécessaire","Connectez-vous pour consulter ce devis.","depuis vos devis");
  const {data,error}=await supabase.rpc("lire_devis_structure",{p_sollicitation:sollicitationId});
  if(error || !data) return pageErreurFichier(403,"Devis indisponible","Ce devis n’existe pas ou votre compte n’a pas accès à ce dossier.","depuis vos devis");
  const doc=assemblerDevisArtisan(data as DevisArtisanDocument);
  if(doc.manquants.length) return pageErreurFichier(422,"Informations à compléter",`Complétez ces informations avant de générer le document : ${doc.manquants.join(", ")}.`,"depuis vos devis");
  try {
    const pdf=await rendrePdf(doc);
    return new Response(Buffer.from(pdf),{headers:{"Content-Type":"application/pdf","Content-Disposition":`inline; filename="${doc.reference}.pdf"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  } catch { return pageErreurFichier(503,"Document momentanément indisponible","La préparation du devis n’a pas abouti. Réessayez dans un instant.","depuis vos devis"); }
}
