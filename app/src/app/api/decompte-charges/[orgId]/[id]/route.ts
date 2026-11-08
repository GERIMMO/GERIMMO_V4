import { verifierGerant } from "@/lib/ged-acces";
import { estUuid } from "@/lib/identifiants";
import { documentRegularisationFournitures } from "@/lib/regularisation-fournitures";
import { rendrePdf } from "@/lib/documents/rendu";

export async function GET(request: Request, context: { params: Promise<{orgId:string;id:string}> }) {
  const { orgId, id } = await context.params;
  if (!estUuid(orgId) || !estUuid(id)) return new Response(null, { status:404 });
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return new Response(null, { status:403 });
  const { data, error } = await supabase.from("brouillons_regularisation_fourniture").select("*")
    .eq("organization_id",orgId).eq("id",id).is("regularisation_id",null).maybeSingle();
  if (error || !data) return new Response(null, { status:404 });
  const url = new URL(request.url);
  if (url.searchParams.get("version") !== data.empreinte) return new Response("Recalculez le brouillon.",{ status:409 });
  const doc = documentRegularisationFournitures(data, url.searchParams.get("etaler")==="1");
  if (doc.manquants.length) return new Response(doc.manquants.join(" · "),{ status:422 });
  const pdf = await rendrePdf(doc);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type":"application/pdf", "Cache-Control":"private, no-store" } });
}
