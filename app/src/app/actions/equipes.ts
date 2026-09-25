'use server';
import {revalidatePath} from 'next/cache';
import {headers} from 'next/headers';
import {createClient} from '@/lib/supabase/server';
import {bilanMission,estMission} from '@/lib/missions';
import {origineDeRetour} from '@/lib/site';
export type RetourMission={erreur?:string;succes?:string};
// « Lancer maintenant » attend la route au plus ce délai (25/09). Au-delà, la
// passe continue seule dans la route cron (maxDuration 180) et l'écran suit
// son état par agent_passages : l'action ne l'exécute plus dans le processus
// de la page, où la limite de durée est celle de /admin/equipes.
const ATTENTE_LANCEMENT_MS=25_000;
export async function commanderMission(_etat:RetourMission,form:FormData):Promise<RetourMission>{
 const cle=String(form.get('mission')??''),commande=String(form.get('commande')??'');
 if(!estMission(cle)||!['pause','reprendre','lancer'].includes(commande))return {erreur:'Commande inconnue.'};
 const db=await createClient();const {data:ok,error}=await db.rpc('is_permanent_super_admin');
 if(error||ok!==true)return {erreur:'Cette commande demande votre compte de supervision et sa double vérification.'};
 if(commande==='lancer'){
  if(!process.env.CRON_SECRET)return {erreur:'La connexion des traitements doit être configurée dans la santé du service.'};
  const h=await headers();
  const origine=origineDeRetour(h.get('x-forwarded-host')??h.get('host'),h.get('x-forwarded-proto'));
  if(!origine)return {erreur:'L’adresse du service est inconnue : le passage ne peut pas être lancé d’ici.'};
  const entetes:Record<string,string>={authorization:`Bearer ${process.env.CRON_SECRET}`};
  // Une préproduction protégée n'accepte l'appel qu'avec son laissez-passer.
  if(process.env.VERCEL_AUTOMATION_BYPASS_SECRET)entetes['x-vercel-protection-bypass']=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  try{
   const r=await fetch(`${origine}/api/cron/equipes?mission=${cle}`,{headers:entetes,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(ATTENTE_LANCEMENT_MS)});
   const b=await r.json().catch(()=>null);revalidatePath('/admin/equipes');
   if(!bilanMission(b,r.status).ok)return {erreur:'Le passage demande une vérification. Consultez son historique et la santé du service.'};
   return {succes:b?.ignore?'La mission est en pause ou déjà en cours. Aucun second passage n’a été lancé.':'Le passage est terminé. Consultez le résultat ci-dessous.'};
  }catch(e){
   revalidatePath('/admin/equipes');
   if(e instanceof Error&&e.name==='TimeoutError')return {succes:'Le passage est lancé et se poursuit de son côté. Son résultat apparaîtra dans « Derniers passages » : actualisez la page dans quelques minutes.'};
   return {erreur:'Le passage n’a pas pu être lancé. Vérifiez la santé du service, puis réessayez.'};
  }
 }
 const {error:e}=await db.rpc('regler_mission',{p_cle:cle,p_active:commande==='reprendre'});
 if(e)return {erreur:'Le réglage n’a pas pu être enregistré.'};
 revalidatePath('/admin/equipes');return {succes:commande==='pause'?'Les prochains passages sont en pause. Un passage déjà commencé se termine.':'Les passages programmés sont réactivés.'};
}
export async function enregistrerContinuite(_etat:RetourMission,form:FormData):Promise<RetourMission>{
 const db=await createClient();const {data:ok,error}=await db.rpc('is_permanent_super_admin');
 if(error||ok!==true)return {erreur:'Reconnectez-vous avec votre compte de supervision.'};
 const jours=Number(form.get('jours')),email=String(form.get('email')??'').trim(),consignes=String(form.get('consignes')??'').trim();
 if(!Number.isInteger(jours)||jours<1||jours>90||consignes.length>3000)return {erreur:'Indiquez un délai de 1 à 90 jours et des consignes courtes.'};
 const {error:e}=await db.rpc('enregistrer_plan_continuite',{p_email:email,p_jours:jours,p_consignes:consignes});
 if(e)return {erreur:'Vérifiez que le remplaçant est un autre superviseur permanent déjà habilité.'};
 revalidatePath('/admin/equipes');return {succes:'Le plan de continuité est enregistré.'};
}
// Les mêmes connexions que l'écran « Équipe qualité » (25/09) : préparer
// (GitHub), vérifier la démonstration (Vercel) et l'autorisation de l'atelier.
// Sans Vercel, « Vérifier l'avancement » échouait toujours après un lancement
// accepté ici.
function atelierPret(env:Record<string,string|undefined>){
 return Boolean(env.GITHUB_AGENT_TOKEN&&env.VERCEL_TOKEN&&env.VERCEL_PROJECT_ID&&env.GERIMMO_CODEX_ENABLED==='true');
}
export async function demanderCorrection(_etat:RetourMission,form:FormData):Promise<RetourMission>{
 const db=await createClient();const {data:ok,error}=await db.rpc('is_permanent_super_admin');
 if(error||ok!==true)return {erreur:'Accès réservé à la supervision.'};
 const demande=String(form.get('demande')??'').trim();
 if(demande.length<10||demande.length>12000)return {erreur:'Décrivez la correction en 10 à 12 000 caractères.'};
 if(!atelierPret(process.env))return {erreur:'L’atelier doit être connecté (préparation et démonstration) et activé avant de lancer une préparation.'};
 const existante=String(form.get('proposition')??'');
 let p:{id:string}|null=null;let statutPrecedent:string|null=null;
 if(existante){
  if(!/^[0-9a-f-]{36}$/.test(existante))return {erreur:'Proposition inconnue.'};
  // La proposition est prise (en_developpement) AVANT l'appel à l'atelier pour
  // qu'un second clic ne lance pas deux préparations ; si l'atelier ne
  // confirme pas, elle revient à son état précédent (25/09) et l'écran
  // repropose « Autoriser la préparation ».
  const avant=await db.from('development_proposals').select('statut').eq('id',existante).maybeSingle();
  if(avant.error||!avant.data||!['a_etudier','detectee'].includes(avant.data.statut))return {erreur:'Cette proposition est déjà en préparation ou a changé. Actualisez le suivi.'};
  const prise=await db.from('development_proposals').update({statut:'en_developpement',probleme:demande,autorisation_requise:true}).eq('id',existante).eq('statut',avant.data.statut).select('id').maybeSingle();
  if(prise.error||!prise.data)return {erreur:'Cette proposition est déjà en préparation ou a changé. Actualisez le suivi.'};
  p=prise.data;statutPrecedent=avant.data.statut;
 }else{
 const {data:creee,error:creation}=await db.from('development_proposals').insert({source:'supervision',titre:demande.slice(0,100),probleme:demande,statut:'a_etudier',risque:'moyen',autorisation_requise:true}).select('id').single();
 if(creation||!creee)return {erreur:'La demande n’a pas pu être enregistrée.'};
 p=creee;
 }
 const restaurer=async()=>{
  if(!statutPrecedent)return;
  const {error:retour}=await db.from('development_proposals').update({statut:statutPrecedent}).eq('id',p!.id).eq('statut','en_developpement');
  if(retour)console.error('[atelier] La proposition n’a pas pu être remise à l’étude.',p!.id);
  revalidatePath('/admin/autonomie');revalidatePath('/admin/equipes');
 };
 try{
  const r=await fetch('https://api.github.com/repos/GERIMMO/GERIMMO_V4/actions/workflows/atelier-code.yml/dispatches',{method:'POST',headers:{Authorization:`Bearer ${process.env.GITHUB_AGENT_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{proposition:p.id,demande}}),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok){await restaurer();return {erreur:'La demande est conservée mais l’atelier n’a pas confirmé son lancement. Vérifiez sa connexion, puis réessayez.'};}
  await db.from('development_proposals').update({statut:'en_developpement'}).eq('id',p.id);
  revalidatePath('/admin/autonomie');revalidatePath('/admin/equipes');return {succes:'L’atelier a accepté la demande. Retrouvez sa préparation, ses contrôles et sa démonstration dans le pilotage. Votre accord sera demandé avant publication.'};
 }catch{await restaurer();return {erreur:'La demande est conservée. Le lancement n’est pas confirmé : vérifiez l’atelier, puis réessayez.'};}
}
