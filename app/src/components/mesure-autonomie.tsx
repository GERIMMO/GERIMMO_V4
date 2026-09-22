import { createClient } from '@/lib/supabase/server';
import { resumerMesures, type StatAutomatisation } from '@/lib/pilotage';
export async function MesureAutonomie({orgId,detail=false}:{orgId?:string;detail?:boolean}) {
  const db=await createClient();
  let query=db.from('automation_stats_30d').select('*');
  if(orgId) query=query.eq('organization_id',orgId);
  const [stats,contacts,orgs]=await Promise.all([
    query,
    orgId?db.from('dossier_contacts').select('incident_id',{count:'exact',head:true}).eq('appel_necessaire',false).eq('organization_id',orgId):db.from('dossier_contacts').select('incident_id',{count:'exact',head:true}).eq('appel_necessaire',false),
    detail?db.from('organizations').select('id,name').order('name'):Promise.resolve({data:[],error:null}),
  ]);
  const mesure=resumerMesures(stats.error?null:stats.data as StatAutomatisation[]);
  const noms=new Map((orgs.data??[]).map(o=>[o.id,o.name]));
  return <section className="section-ecran space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Objectif : 90 % de gestion automatisée</p><h2 className="text-xl font-semibold text-[var(--encre)]">Ce que Gerimmo fait pour vous</h2></div><span className="puce puce-prep">{mesure?.taux==null?'Mesure en démarrage':`${mesure.taux} % des actions suivies`}</span></div>
    {stats.error&&<p role="alert" className="err">Les mesures sont momentanément indisponibles. Les chiffres manquants ne sont pas des zéros.</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Actions automatiques',mesure?.automatiques],['Actions humaines',mesure?.humaines],['Messages transmis',mesure?.messages],['Dossiers confirmés sans appel',contacts.error?null:contacts.count]].map(([nom,valeur])=><div key={String(nom)} className="kpi bleu"><span className="libelle-champ">{nom}</span><strong className="chiffre block">{valeur??'—'}</strong></div>)}</div>
    <p className="text-xs leading-relaxed text-muted-foreground">30 derniers jours pour les actions. La mesure suit les changements d’étape des baux et incidents, les paiements enregistrés, les avis de loyer, les quittances et les rappels transmis. Les autres parcours ne sont pas encore inclus dans le taux. Les clics évités restent à mesurer. Le bilan sans appel est confirmé séparément à la clôture ; une déclaration en ligne ne suffit pas.</p>
    {detail&&!stats.error&&<div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Automatisation par organisation"><table className="tableau w-full text-sm"><thead><tr><th className="text-left">Organisation</th><th>Automatiques</th><th>Humaines</th><th>Taux suivi</th></tr></thead><tbody>{(stats.data??[]).map((s:StatAutomatisation)=>{const m=resumerMesures([s]);return <tr key={s.organization_id??'plateforme'}><td>{noms.get(s.organization_id??'')??'Plateforme Gerimmo'}</td><td className="text-center">{m?.automatiques}</td><td className="text-center">{m?.humaines}</td><td className="text-center">{m?.taux==null?'En attente':`${m.taux} %`}</td></tr>;})}</tbody></table>{stats.data?.length===0&&<p className="py-3 text-muted-foreground">Les premières actions seront comptées après la mise en service de ces capteurs.</p>}</div>}
  </section>;
}
