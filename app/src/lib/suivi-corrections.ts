// Only fixed provider endpoints are queried. Model output and stored URLs are
// never used as request destinations or as evidence of successful checks.
const REPO='GERIMMO/GERIMMO_V4';
type Objet=Record<string,unknown>;
const objet=(v:unknown):Objet=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Objet:{};
const liste=(v:unknown):Objet[]=>Array.isArray(v)?v.map(objet):[];
const sha=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{40}$/.test(v);
export type RapportCorrection={revision:string;resultat:'reussi'|'en_cours'|'echec';message:string;proposition:number;preparation:number;tests:number|null;demonstration:string|null};
export type SuiviCorrection={branche:string;revision:string;statut:'en_test'|'autorisation';rapport:RapportCorrection};
type Lire=(chemin:string)=>Promise<unknown>;
export function lienDemonstration(v:unknown):string|null{
 if(typeof v!=='string')return null;
 try{const u=new URL(v);return u.protocol==='https:'&&u.hostname.endsWith('.vercel.app')&&!u.username&&!u.password&&!u.port&&u.pathname==='/'&&!u.search&&!u.hash?u.origin:null;}catch{return null;}
}
export function lireRapportCorrection(v:unknown):RapportCorrection|null{
 const r=objet(v);
 if(!sha(r.revision)||!['reussi','en_cours','echec'].includes(String(r.resultat))||typeof r.message!=='string'||!Number.isSafeInteger(r.proposition)||!Number.isSafeInteger(r.preparation))return null;
 return {...r,demonstration:lienDemonstration(r.demonstration)} as RapportCorrection;
}
export async function recueillirCorrection(id:string,gh:Lire,vercel:Lire,projet:string):Promise<SuiviCorrection>{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)||!projet)throw new Error('La demande ou la connexion de démonstration doit être vérifiée.');
 const prefixe=`gerimmo/proposition-${id}-`;
 const branches=liste(await gh(`git/matching-refs/heads/${prefixe}`)).filter(b=>typeof b.ref==='string'&&b.ref.startsWith(`refs/heads/${prefixe}`));
 if(branches.length!==1)throw new Error(branches.length?'Plusieurs préparations existent. Un responsable doit choisir la version à examiner.':'La préparation n’a pas encore produit de version. Consultez son avancement dans l’atelier.');
 const branche=String(branches[0].ref).slice('refs/heads/'.length),runId=branche.slice(prefixe.length),revision=objet(branches[0].object).sha;
 if(!/^\d+$/.test(runId)||!sha(revision))throw new Error('La version préparée n’a pas pu être vérifiée.');
 const run=objet(await gh(`actions/runs/${runId}`));
 if(run.event!=='workflow_dispatch'||run.head_branch!=='main'||run.path!=='.github/workflows/atelier-code.yml'||run.display_title!==`Amélioration ${id}`||objet(run.repository).full_name!==REPO||run.status!=='completed'||run.conclusion!=='success')throw new Error('La préparation n’est pas terminée ou son origine ne peut pas être confirmée.');
 const prs=liste(await gh(`pulls?state=all&base=main&head=GERIMMO:${encodeURIComponent(branche)}&per_page=100`));
 if(prs.length!==1)throw new Error('La proposition à examiner ne peut pas être identifiée.');
 const pr=prs[0],head=objet(pr.head),base=objet(pr.base);
 if(head.ref!==branche||head.sha!==revision||objet(head.repo).full_name!==REPO||base.ref!=='main'||objet(base.repo).full_name!==REPO||!Number.isSafeInteger(pr.number))throw new Error('La proposition ne correspond plus à la version préparée.');
 if(pr.state!=='open')throw new Error('Cette proposition est fermée. Vérifiez le résultat de sa publication dans la santé du service.');
 const ci=objet(await gh(`actions/workflows/ci.yml/runs?head_sha=${revision}&event=pull_request&per_page=100`));
 // Most recent run wins, including an unsuccessful rerun. A previous success
 // must never hide a pending or failed check on the same candidate.
 const controles=liste(ci.workflow_runs).filter(r=>r.head_sha===revision&&r.path==='.github/workflows/ci.yml'&&r.event==='pull_request'&&r.head_branch===branche&&objet(r.repository).full_name===REPO&&objet(r.head_repository).full_name===REPO&&liste(r.pull_requests).some(p=>p.number===pr.number));
 controles.sort((a,b)=>Number(b.id)-Number(a.id));
 const c=controles[0];
 const reussi=c?.status==='completed'&&c?.conclusion==='success';
 const echec=!!c&&c.status==='completed'&&!reussi;
 const deployments=objet(await vercel(`v7/deployments?projectId=${encodeURIComponent(projet)}&sha=${revision}&limit=100&target=preview`));
 const candidats=liste(deployments.deployments).filter(d=>d.projectId===projet&&objet(d.meta).githubCommitSha===revision&&objet(d.meta).githubCommitRef===branche&&d.target!=='production');
 candidats.sort((a,b)=>Number(b.created)-Number(a.created));
 const d=candidats[0];
 const demonstration=d?.state==='READY'?lienDemonstration(`https://${d.url}`):null;
 const resultat=reussi&&demonstration?'reussi':echec?'echec':'en_cours';
 const message=echec?'Les contrôles ont trouvé un problème. Cette version ne peut pas être autorisée.':!reussi?'Les contrôles doivent se terminer avec succès.':!demonstration?'Les contrôles sont réussis. La démonstration de cette version reste à préparer.':'Les contrôles sont réussis. Ouvrez la démonstration avant de donner votre accord.';
 return {branche,revision,statut:resultat==='reussi'?'autorisation':'en_test',rapport:{revision,resultat,message,proposition:Number(pr.number),preparation:Number(runId),tests:c?Number(c.id):null,demonstration}};
}
export async function verifierCorrection(id:string){
 const e=process.env;
 if(!e.GITHUB_AGENT_TOKEN||!e.VERCEL_TOKEN||!e.VERCEL_PROJECT_ID)throw new Error('Le suivi doit être connecté à l’atelier et au service de démonstration.');
 async function lire(url:string,token:string){
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error('Le service de préparation est momentanément indisponible. Aucun accord n’a été modifié.');
  return r.json();
 }
 return recueillirCorrection(id,p=>lire(`https://api.github.com/repos/${REPO}/${p}`,e.GITHUB_AGENT_TOKEN!),p=>lire(`https://api.vercel.com/${p}${e.VERCEL_TEAM_ID?`&teamId=${encodeURIComponent(e.VERCEL_TEAM_ID)}`:''}`,e.VERCEL_TOKEN!),e.VERCEL_PROJECT_ID);
}
