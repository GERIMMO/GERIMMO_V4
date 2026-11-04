import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { lireToutesLesPages } from "@/lib/lecture-complete";
import { aujourdhuiParis,formaterDate } from "@/lib/ged";
import { ETATS_INCIDENT } from "@/lib/incidents";
import { DeclarationIncidentBien } from "./declaration-incident-bien";
export async function IncidentsBien({org,bien,base,lots,lectureSeule}:{org:string;bien:string;base:string;lots:{id:string;nom:string;etat:string}[];lectureSeule:boolean}){
 const db=await createClient();
 const incidents=await lireToutesLesPages<{id:string;titre:string|null;date_signalement:string|null;description:string;created_at:string;etat:string;lot_id:string|null;bien_id:string|null}>((debut,fin)=>db.from('incidents').select('id,titre,date_signalement,description,created_at,etat,lot_id,bien_id',{count:'exact'}).eq('organization_id',org).or(lots.length?`bien_id.eq.${bien},lot_id.in.(${lots.map(l=>l.id).join(',')})`:`bien_id.eq.${bien}`).order('created_at',{ascending:false}).order('id').range(debut,fin),i=>i.id);
 const noms=new Map(lots.map(l=>[l.id,l.nom]));
 const lignes=incidents.lignes?.toSorted((a,b)=>(b.date_signalement??b.created_at.slice(0,10)).localeCompare(a.date_signalement??a.created_at.slice(0,10))||b.created_at.localeCompare(a.created_at));
 return <section className="carte-rubrique space-y-3 p-4 sm:p-5" data-ton="bleu" aria-labelledby={`incidents-${bien}`}>
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 id={`incidents-${bien}`} className="text-lg font-semibold">Incidents</h2>{!lectureSeule&&<DeclarationIncidentBien org={org} bien={bien} lots={lots.filter(l=>l.etat!=="archive")} jour={aujourdhuiParis()}/>}</div>
  {incidents.echec?<p role="alert" className="err">L’historique des incidents est indisponible.</p>:lignes?.length?<ul className="divide-y divide-border">{lignes.map(i=><li key={i.id}><Link href={`${base}/incidents?sel=${i.id}`} className="flex items-start justify-between gap-3 py-3 text-sm"><span className="min-w-0"><strong className="block break-words">{i.titre||i.description.split('\n')[0]}</strong><span className="text-muted-foreground">{formaterDate(i.date_signalement??i.created_at)}{lots.length>1?` · ${i.lot_id?(noms.get(i.lot_id)??"Logement"):"Parties communes"}`:""}</span></span><span className="shrink-0 text-xs">{ETATS_INCIDENT[i.etat]??i.etat} →</span></Link></li>)}</ul>:<p className="text-sm text-muted-foreground">Aucun incident pour ce bien.</p>}
 </section>;
}
