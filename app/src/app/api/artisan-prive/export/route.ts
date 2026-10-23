import {chargerActivitePrivee} from "@/lib/artisan-prive";
// L'export de l'artisan (R49, plan de conformité du 23/10/2026) : son registre privé déclaratif ET ses données de
// plateforme (fiche, métiers, zones, pièces, relations, sollicitations, devis, interventions, factures, évaluations,
// acceptations des conditions), lues pour lui seul par `export_artisan_plateforme`, qui inscrit l'export au journal
// d'audit. Un module privé fermé ne prive pas l'artisan de ses données de plateforme.
export async function GET(){
 const {supabase,data}=await chargerActivitePrivee();
 const plateforme=await supabase.rpc("export_artisan_plateforme");
 if(!data&&(plateforme.error||!plateforme.data))return new Response("Accès refusé",{status:403});
 return Response.json({exporte_le:new Date().toISOString(),nature:"Registre privé déclaratif de l’artisan ; aucun rapprochement bancaire ni confirmation client",...(data??{}),plateforme:plateforme.error?null:plateforme.data},{headers:{"Content-Disposition":"attachment; filename=activite-artisan-privee.json","Cache-Control":"private, no-store"}});
}
