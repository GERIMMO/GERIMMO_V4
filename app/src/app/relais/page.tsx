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
 return <main className="mx-auto max-w-2xl space-y-4 p-6"><h1>Ce relais n’est pas actif</h1><p>Votre délégation a pris fin ou ne vous a pas été attribuée.</p><Link href="/espaces" className="underline">Retrouver mes espaces</Link></main>;
 }
 const {data,error}=await db.rpc('resume_relais_supervision');
 return <main className="mx-auto max-w-4xl space-y-5 p-5"><Link href="/espaces" className="text-sm underline">Mes espaces</Link><header className="rounded-2xl bg-[var(--encre)] p-6 text-[var(--sur-encre)]"><h1 className="text-2xl font-semibold text-[var(--sur-encre)]">Relais de supervision</h1><p className="mt-2 text-sm">Votre délégation temporaire vous permet de suivre les priorités. Les droits de vos espaces habituels continuent de s’appliquer pour intervenir sur les dossiers.</p></header>{error?<p role="alert" className="err">Le suivi est indisponible ou votre délégation a pris fin. Reconnectez-vous pour vérifier votre accès.</p>:<div className="grid gap-3 sm:grid-cols-2">{(data??[]).map((r:{famille:string;a_traiter:number;urgents:number;en_attente:number})=><section key={r.famille} className="loc-carte"><h2 className="font-semibold">{TYPES_DOSSIER[r.famille]??'Dossiers'}</h2><p className="mt-2 text-sm">{r.a_traiter} à traiter · {r.urgents} urgents · {r.en_attente} en attente</p></section>)}</div>}<p className="text-sm text-muted-foreground">L’accès est retiré automatiquement à l’expiration ou dès sa révocation par le superviseur permanent.</p></main>;
}
