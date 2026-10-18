import 'server-only';
import Stripe from 'stripe';
import { type MouvementStripe } from './tresorerie-supervision';
// Lecture seule. Ni client Stripe ni secret ne quittent le serveur.
export async function lireTresorerieStripe(periode: { gte:number; lt:number }) {
 const cle=process.env.STRIPE_SECRET_KEY?.trim();
 if(!cle) return { lignes:null, erreur:'Stripe n’est pas connecté à cet environnement.', test:false, complet:false };
 try {
  const stripe=new Stripe(cle,{timeout:15000,maxNetworkRetries:1});
  const lignes:MouvementStripe[]=[];
  let cursor:string|undefined;
  for(let n=0;n<100;n++) {
   const r=await stripe.balanceTransactions.list({created:periode,limit:100,...(cursor?{starting_after:cursor}:{})});
   lignes.push(...r.data.map(t=>({id:t.id,created:t.created,type:t.type,currency:t.currency,amount:t.amount,fee:t.fee,net:t.net,status:t.status})));
   if(!r.has_more) return {lignes,erreur:null,test:cle.startsWith('sk_test_')||cle.startsWith('rk_test_'),complet:true};
   cursor=r.data.at(-1)?.id;
   if(!cursor) break;
  }
  return {lignes,erreur:'Période trop volumineuse : relevé partiel, totaux désactivés.',test:cle.includes('_test_'),complet:false};
 }catch {return {lignes:null,erreur:'Les mouvements Stripe ne peuvent pas être lus. Vérifiez la connexion et son droit de lecture du solde.',test:cle.includes('_test_'),complet:false};}
}
