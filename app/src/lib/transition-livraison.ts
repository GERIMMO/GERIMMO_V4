/** Maintenance courte de bascule ; aucune règle de paiement n'est modifiée. */
export function maintenanceLivraison(env:Record<string,string|undefined>=process.env):boolean{return env.GERIMMO_TRANSITION_LOTS==='maintenance';}
export const MESSAGE_TRANSITION='Mise à jour en cours. Votre demande n’a pas été envoyée ; veuillez réessayer dans quelques minutes.';
export function bloquerPendantTransition(path:string,method:string,mission:string|null,env:Record<string,string|undefined>=process.env):boolean{
 if(!maintenanceLivraison(env))return false;
 if(['/api/stripe/webhook','/api/zoho-sign/webhook','/api/resend/suivi','/api/sante'].includes(path))return false;
 if(path==='/api/cron/equipes')return mission!=='abonnements';
 if(path.startsWith('/api/cron/'))return true;
 if(['GET','HEAD','OPTIONS'].includes(method))return false;
 // Les actions d'abonnement conservent leurs permissions métier habituelles.
 if(/^\/(?:espace|agence)\/[^/]+\/abonnement(?:\/|$)/.test(path))return false;
 return true;
}
