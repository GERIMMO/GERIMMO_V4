import {domaineValide,emailValide} from './marque-organisation';
type Objet=Record<string,unknown>;
function objet(v:unknown):Objet{return v&&typeof v==='object'&&!Array.isArray(v)?v as Objet:{};}
export function domaineVercelValide(v:unknown,domaine:string,projet:string){const x=objet(v);return x.name===domaine&&x.projectId===projet&&x.verified===true&&!x.redirect&&!x.gitBranch&&!x.customEnvironmentId;}
export function domaineResendValide(v:unknown,domaine:string){const x=objet(v),c=objet(x.capabilities);return x.name===domaine&&x.status==='verified'&&c.sending==='enabled';}
async function lire(url:string,secret:string){const r=await fetch(url,{headers:{Authorization:`Bearer ${secret}`},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('La vérification auprès du fournisseur n’est pas disponible.');return objet(await r.json());}
export async function verifierSiteMarque(domaine:string,env:Record<string,string|undefined>=process.env){
 if(!domaineValide(domaine))throw new Error('Le nom du site est invalide.');
 const projet=env.VERCEL_PROJECT_ID,cle=env.VERCEL_TOKEN;
 if(!projet||!cle)throw new Error('La connexion de vérification des sites doit être configurée.');
 const equipe=env.VERCEL_TEAM_ID?`?teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}`:'';
 const preuve=await lire(`https://api.vercel.com/v9/projects/${encodeURIComponent(projet)}/domains/${encodeURIComponent(domaine)}${equipe}`,cle);
 const config=await lire(`https://api.vercel.com/v6/domains/${encodeURIComponent(domaine)}/config${equipe}`,cle);
 return domaineVercelValide(preuve,domaine,projet)&&config.misconfigured===false;
}
export async function verifierExpediteurMarque(email:string,env:Record<string,string|undefined>=process.env){
 if(!emailValide(email))throw new Error('L’adresse d’envoi est invalide.');
 const cle=env.RESEND_DOMAIN_READ_KEY??env.RESEND_API_KEY;
 if(!cle)throw new Error('La connexion de vérification des e-mails doit être configurée.');
 const domaine=email.split('@')[1].toLowerCase();
 const liste=await lire('https://api.resend.com/domains',cle);
 if(!Array.isArray(liste.data))throw new Error('La liste des domaines d’envoi est indisponible.');
 const d=liste.data.map(objet).find(x=>x.name===domaine);
 if(!d){if(liste.has_more)throw new Error('La liste des domaines est incomplète. Vérifiez ce domaine auprès du service d’envoi.');return false;}
 if(typeof d.id!=='string'||!/^[0-9a-f-]{36}$/i.test(d.id))throw new Error('La référence du domaine d’envoi est invalide.');
 return domaineResendValide(await lire(`https://api.resend.com/domains/${d.id}`,cle),domaine);
}
