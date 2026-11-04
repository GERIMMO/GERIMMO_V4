import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EchangesIntervention } from "./echanges-intervention";
export async function DiscussionsInterventions({org,base}:{org:string;base:string}){
 const db=await createClient();
 const r=await db.from("incident_interventions").select("id,statut,incident:incidents!incident_interventions_incident_meme_org_fk!inner(numero,categorie),artisan:artisans!incident_interventions_artisan_id_fkey(raison_sociale)",{count:"exact"}).eq("organization_id",org).order("created_at",{ascending:false}).order("id").limit(50);
 if(r.error)return <p role="alert" className="err">Les discussions d’intervention n’ont pas pu être chargées.</p>;
 if(!r.data?.length)return <div className="rounded-lg border border-border bg-card p-4 space-y-2"><p className="text-sm">Les discussions à trois apparaissent dès qu’un artisan accepte une intervention.</p><Link className="inline-flex min-h-11 items-center text-sm font-medium underline" href={`${base}/incidents`}>Ouvrir les incidents</Link></div>;
 return <div className="space-y-3">{(r.count??0)>50&&<p className="text-sm text-muted-foreground">Les 50 interventions les plus récentes.</p>}{r.data.map(m=>{const i=Array.isArray(m.incident)?m.incident[0]:m.incident;const a=Array.isArray(m.artisan)?m.artisan[0]:m.artisan;return <details key={m.id} className="rounded-lg border border-border bg-card p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold">{i?.numero??"Intervention"} · {a?.raison_sociale??"Artisan"}{!["acceptee","planifiee","en_cours"].includes(m.statut)?" · terminée":""}</summary><EchangesIntervention intervention={m.id}/></details>})}</div>;
}
