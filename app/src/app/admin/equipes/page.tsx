import Link from 'next/link';
import {createClient} from '@/lib/supabase/server';
import {EQUIPES,MISSIONS,type Mission} from '@/lib/missions';
import {resumerBilan} from '@/lib/sante-service';
import {formaterDateHeureParis,NOTE_FUSEAU} from '@/lib/heure-paris';
import {AtelierQualite} from './qualite';
import {Commandes} from './commandes';
// Le nom de l'entrée de menu (audit 25/09, C8).
export const metadata={title:'Travail et commandes — Gerimmo'};
const noms:Record<string,string>={reussi:'Passage terminé',a_reprendre:'À vérifier',interrompu:'Passage interrompu',en_cours:'En cours'};
// 25/09 (audit C3) : chaque carte montre son dernier passage OUVERT — date à
// l'heure de Paris, état, bilan en clair — et les trois précédents dessous,
// sans accordéon. Le plan d'absence a UNE page : « Relais en mon absence ».
export default async function Page(){
 const db=await createClient();const [regles,historique]=await Promise.all([db.from('agent_missions').select('cle,active'),db.from('agent_passages').select('id,mission,debut,fin,expiration,etat,resume,compte,bilan').order('debut',{ascending:false}).limit(200)]);
 const disponible=!regles.error&&!historique.error;
 const bilanDe=(p:{etat:string;bilan:unknown;compte:number},cle:string)=>{if(p.etat==='en_cours')return 'Le résultat sera enregistré à la fin du passage.';const b=resumerBilan(p.bilan,cle);return b!=='—'?b:`${p.compte} résultat(s) comptabilisé(s), sans détail conservé`;};
 return <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 p-4 sm:p-7"><div className="entete-page"><div className="min-w-0 flex-[1_1_20rem]"><h1>Travail et commandes</h1><p className="mesure-lecture mt-2 text-sm text-muted-foreground">Le dernier passage de chaque mission, son résultat, et ses commandes. Les réglages de chaque agence, les validations et les plafonds restent applicables.</p></div><div className="flex flex-wrap gap-3"><Link href="/admin/brief" className="btn-secondaire">Aujourd’hui : le point du matin</Link><Link href="/admin/autonomie#continuite" className="btn-secondaire">Relais en mon absence</Link></div></div>
 {!disponible&&<p role="alert" className="err">Le suivi est indisponible. Aucun état « à jour » ne peut être confirmé.</p>}
 {/* La carte commune de la console (nuit du 25/09), avec plus d'air entre les cartes. */}
 <div className="grid gap-6 lg:grid-cols-2">{Object.entries(MISSIONS).map(([cle,m])=>{const regle=regles.data?.find(r=>r.cle===cle);const passages=historique.data?.filter(p=>p.mission===cle)??[];const dernier=passages[0];const retard=dernier&&new Date().getTime()-new Date(dernier.debut).getTime()>36*3600000;const expire=dernier?.etat==='en_cours'&&new Date(dernier.expiration)<new Date();const etat=!disponible||!regle?'État indisponible':!regle.active?'En pause':expire?'Passage à vérifier':retard?'Aucun passage depuis plus de 36 heures':dernier?noms[dernier.etat]:'Premier passage attendu';const alerte=expire||retard||dernier?.etat==='a_reprendre'||dernier?.etat==='interrompu';return <section key={cle} className="loc-carte"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="libelle-champ">Équipe {EQUIPES[m.equipe].nom}</p><h2 className="mt-1 text-xl font-semibold">{m.nom}</h2></div><span className={`puce ${!disponible||!regle?'puce-grise':!regle.active?'puce-grise':alerte?'puce-rouge':dernier?'puce-loue':'puce-prep'}`}>{etat}</span></div>
  <dl className="mt-4 space-y-1.5 text-sm"><div><dt className="inline font-semibold">Dernier passage : </dt><dd className="inline text-muted-foreground">{dernier?<><time dateTime={dernier.debut}>{formaterDateHeureParis(dernier.debut)}</time>{dernier.fin?` → ${formaterDateHeureParis(dernier.fin)}`:''}</>:'aucun depuis la mise en place de ce suivi'}</dd></div>{dernier&&<div><dt className="inline font-semibold">Bilan : </dt><dd className="inline text-muted-foreground">{bilanDe(dernier,cle)}</dd></div>}<div><dt className="inline font-semibold">Prochain passage : </dt><dd className="inline text-muted-foreground">{regle&&!regle.active?'en pause':`vers ${m.heure}`}</dd></div></dl>
  {disponible&&regle&&<Commandes mission={cle as Mission} active={regle.active}/>}<Link className="lien-discret mt-4 inline-block text-sm" href={m.lien}>Ouvrir les dossiers concernés →</Link>
  {passages.length>1&&<div className="mt-5 border-t border-[var(--filet)] pt-4"><p className="libelle-champ">Passages précédents</p><ol className="mt-3 space-y-2">{passages.slice(1,4).map(p=><li key={p.id} className="rounded-xl bg-[var(--filet-leger)] p-3.5 text-sm"><b>{formaterDateHeureParis(p.debut)}</b><p>{noms[p.etat]} · {bilanDe(p,cle)}</p></li>)}</ol></div>}</section>})}</div>
 <p className="text-sm text-muted-foreground">{NOTE_FUSEAU}</p>
 <AtelierQualite preparation={Boolean(process.env.GITHUB_AGENT_TOKEN)} demonstration={Boolean(process.env.VERCEL_TOKEN&&process.env.VERCEL_PROJECT_ID)} active={process.env.GERIMMO_CODEX_ENABLED==='true'}/>
 <p className="text-sm text-muted-foreground">L’équipe qualité suit les propositions et leurs contrôles dans <Link href="/admin/autonomie#ameliorations" className="underline">Dossiers et évolutions</Link>. Une proposition n’est pas une correction déjà publiée.</p></main>;
}
