import {chargerActivitePrivee} from "@/lib/artisan-prive";
// L'export de l'artisan (R49, plan de conformité du 23/10/2026) : son registre privé déclaratif ET ses données de
// plateforme (fiche, métiers, zones, pièces, relations, sollicitations, devis, interventions, factures, évaluations,
// acceptations des conditions), lues pour lui seul par `export_artisan_plateforme`, qui inscrit l'export au journal
// d'audit. Un module privé fermé ne prive pas l'artisan de ses données de plateforme.
export async function GET(){
 const {supabase,data,erreur}=await chargerActivitePrivee();
 const plateforme=await supabase.rpc("export_artisan_plateforme");
 if(plateforme.error?.code==="42501")return new Response("Accès refusé",{status:403,headers:{"Cache-Control":"private, no-store"}});
 // Une activité vide ou désactivée reste un objet avec des listes vides. Une absence de réponse n'est pas un registre vide.
 if(erreur||!data||plateforme.error||!plateforme.data)return new Response("Votre export complet n’a pas pu être préparé. Réessayez dans quelques instants.",{status:503,headers:{"Cache-Control":"private, no-store","Retry-After":"30"}});
 return Response.json({exporte_le:new Date().toISOString(),nature:"Registre privé déclaratif de l’artisan ; aucun rapprochement bancaire ni confirmation client",...data,plateforme:plateforme.data},{headers:{"Content-Disposition":"attachment; filename=activite-artisan-privee.json","Cache-Control":"private, no-store"}});
}
