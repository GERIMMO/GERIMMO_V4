/** Autorisation commerciale indépendante de la liste fermée des courriels V1. */
export function paiementsInterdits(env:Record<string,string|undefined>=process.env):boolean {
 if(env.GERIMMO_PILOTE_LIMITE==='true'||env.GERIMMO_PAIEMENTS_DESACTIVES==='1'||env.GERIMMO_PREPRODUCTION_VALIDEE==='1')return true;
 if(env.GERIMMO_MODE==='simulation')return env.NODE_ENV!=='test'||env.VERCEL==='1'||Object.entries(env).some(([k,v])=>!!v&&k.startsWith('STRIPE_')&&/^(sk|rk|pk)_live_/.test(v));
 return !(env.GERIMMO_MODE==='commercial'&&env.VERCEL==='1'&&env.VERCEL_ENV==='production'&&env.NEXT_PUBLIC_SITE_URL==='https://www.gerimmo.app');
}
export const MESSAGE_PAIEMENT_PILOTE='Opération payante suspendue dans cet environnement pilote. Aucun paiement ni service externe déclenché.';
export function exigerOperationsPayantesAutorisees():void {
 if(paiementsInterdits())throw new Error(MESSAGE_PAIEMENT_PILOTE);
}

/** Le pilote gratuit ne crée aucune nouvelle souscription. Seul le banc de
 * simulation isolé peut parcourir Checkout, sans clé LIVE. Les webhooks et
 * abonnements existants continuent à utiliser leur propre garde. */
export function nouvellesSouscriptionsFermees(env:Record<string,string|undefined>=process.env):boolean {
 return env.GERIMMO_MODE!=='simulation' || !!env.VERCEL_ENV || paiementsInterdits(env);
}
export const MESSAGE_SOUSCRIPTIONS_FERMEES="Les nouvelles souscriptions payantes sont fermées pendant le pilote gratuit.";
