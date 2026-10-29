import { createClient } from "@/lib/supabase/server";
import { RecommandeElectronique } from "./recommande-electronique";
import { ETATS_RECOMMANDE, type RecommandePrepare } from "@/lib/recommandes";
import { formaterDate } from "@/lib/ged";

export async function HistoriqueRecommandes({orgId,bailId}:{orgId:string;bailId:string}) {
 const supabase=await createClient();
 const {data,error}=await supabase.from("recommandes_ar24").select("id,statut,cree_le,delai,destinataire").eq("organization_id",orgId).eq("bail_id",bailId).order("cree_le",{ascending:false}).limit(50);
 if(error) return <p role="status">Le suivi des recommandés électroniques n’a pas pu être chargé.</p>;
 if(!data?.length) return null;
 return <section className="mt-4 space-y-3" aria-label="Recommandés électroniques"><h3 className="font-semibold">Recommandés électroniques</h3>{data.map(r=><details key={r.id} className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-sm">{formaterDate(r.cree_le)} · {ETATS_RECOMMANDE[r.statut as RecommandePrepare["statut"]]} · {r.destinataire.prenom} {r.destinataire.nom}</summary><div className="mt-3"><RecommandeElectronique orgId={orgId} bailId={bailId} delai={r.delai} idExistant={r.id} libelle="Voir le courrier et son suivi"/></div></details>)}{data.length===50&&<p className="text-sm">Les 50 derniers courriers sont affichés.</p>}</section>;
}
