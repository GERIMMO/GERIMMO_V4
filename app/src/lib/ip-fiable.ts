import {isIP} from 'node:net';
/** Vercel écrase cet en-tête à sa frontière. Hors de cette infrastructure,
 * une valeur fournie par le navigateur ne doit pas contourner les quotas. */
export function adresseIpFiable(h:Pick<Headers,'get'>,env:Record<string,string|undefined>=process.env):string {
 if(env.VERCEL==='1'){
  const valeur=h.get('x-vercel-forwarded-for')?.trim();
  if(valeur&&isIP(valeur))return isIP(valeur)===6?new URL(`http://[${valeur}]`).hostname.slice(1,-1):valeur;
 }
 // Quota partagé conservateur, jamais une autorisation ; pas de secret ni d'IP brute journalisés.
 return '0.0.0.0';
}
