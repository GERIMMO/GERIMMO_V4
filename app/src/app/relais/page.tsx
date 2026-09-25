import Link from 'next/link';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {TYPES_DOSSIER} from '@/lib/pilotage';
export const metadata={title:'Relais de supervision — Gerimmo'};
export default async function PageRelais(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect('/connexion?suite=%2Frelais');
 const {data:autorise}=await db.rpc('has_supervision_power',{p_pouvoir:'lecture'});
 if(autorise!==true){
 const {data:niveau}=await db.auth.mfa.getAuthenticatorAssuranceLevel();
 if(niveau?.currentLevel!=="aal2")redirect('/securite?suite=%2Frelais');
 return <main className="mx-auto w-full max-w-2xl p-4 sm:p-7"><div className="entete-page"><h1>Relais de supervision</h1></div><div className="vide-guide"><p className="titre">Aucun relais actif</p><p className="explication">Votre délégation a pris fin ou ne vous a pas été attribuée. Demandez au superviseur permanent d’ouvrir un relais.</p><div className="geste"><Link href="/espaces" className="btn-secondaire">Retrouver mes espaces</Link></div></div></main>;
 }
 const {data,error}=await db.rpc('resume_relais_supervision');
 const familles=(data??[]) as {famille:string;a_traiter:number;urgents:number;en_attente:number}[];const total=familles.reduce((n,r)=>n+Number(r.a_traiter),0);
 // En-tête commun et état vide qui guide (audit 25/09, C25, C9) : le remplaçant
 // arrivait sur un bandeau marine et une phrase.
 return <main className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-7"><Link href="/espaces" className="lien-discret text-sm">← Mes espaces</Link><div className="entete-page"><div className="min-w-0 flex-[1_1_20rem]"><h1>Relais de supervision</h1><p className="mt-2 max-w-3xl text-sm text-[var(--texte-secondaire)]">Votre délégation temporaire vous permet de suivre les priorités. Les droits de vos espaces habituels continuent de s’appliquer pour intervenir sur les dossiers.</p></div>{!error&&<span className="mono-discret">{total} dossier{total>1?'s':''} à traiter</span>}</div>{error?<p role="alert" className="err">Le suivi est indisponible ou votre délégation a pris fin. Reconnectez-vous pour vérifier votre accès.</p>:familles.length===0||total===0?<div className="vide-guide"><p className="titre">Aucun dossier n’attend d’étape</p><p className="explication">Les traitements autorisés continuent seuls. Ce qui demande une décision apparaîtra ici, par famille de dossiers, avec son urgence.</p></div>:<div className="grid gap-3 sm:grid-cols-2">{familles.map(r=><section key={r.famille} className="loc-carte"><h2 className="font-semibold">{TYPES_DOSSIER[r.famille]??'Dossiers'}</h2><p className="mt-2 text-sm">{r.a_traiter} à traiter · {r.urgents} urgent{Number(r.urgents)>1?'s':''} · {r.en_attente} en attente</p></section>)}</div>}<p className="text-sm text-muted-foreground">L’accès est retiré automatiquement à l’expiration ou dès sa révocation par le superviseur permanent.</p></main>;
}
