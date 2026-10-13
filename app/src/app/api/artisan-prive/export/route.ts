import {chargerActivitePrivee} from "@/lib/artisan-prive";
export async function GET(){
 const {data}=await chargerActivitePrivee();if(!data)return new Response("Accès refusé",{status:403});
 return Response.json({exporte_le:new Date().toISOString(),nature:"Registre privé déclaratif de l’artisan ; aucun rapprochement bancaire ni confirmation client",...data},{headers:{"Content-Disposition":"attachment; filename=activite-artisan-privee.json","Cache-Control":"private, no-store"}});
}
