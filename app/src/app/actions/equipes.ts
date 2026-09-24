'use server';
import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {bilanMission,estMission} from '@/lib/missions';
import {GET as executer} from '@/app/api/cron/equipes/route';
export type RetourMission={erreur?:string;succes?:string};
export async function commanderMission(_etat:RetourMission,form:FormData):Promise<RetourMission>{
 const cle=String(form.get('mission')??''),commande=String(form.get('commande')??'');
 if(!estMission(cle)||!['pause','reprendre','lancer'].includes(commande))return {erreur:'Commande inconnue.'};
 const db=await createClient();const {data:ok,error}=await db.rpc('is_permanent_super_admin');
 if(error||ok!==true)return {erreur:'Cette commande demande votre compte de supervision et sa double vérification.'};
 if(commande==='lancer'){
  if(!process.env.CRON_SECRET)return {erreur:'La connexion des traitements doit être configurée dans la santé du service.'};
  const r=await executer(new Request(`https://www.gerimmo.app/api/cron/equipes?mission=${cle}`,{headers:{authorization:`Bearer ${process.env.CRON_SECRET}`}}));
  const b=await r.json().catch(()=>null);revalidatePath('/admin/equipes');
  if(!bilanMission(b,r.status).ok)return {erreur:'Le passage demande une vérification. Consultez son historique et la santé du service.'};
  return {succes:b?.ignore?'La mission est en pause ou déjà en cours. Aucun second passage n’a été lancé.':'Le passage est terminé. Consultez le résultat ci-dessous.'};
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
export async function demanderCorrection(_etat:RetourMission,form:FormData):Promise<RetourMission>{
 const db=await createClient();const {data:ok,error}=await db.rpc('is_permanent_super_admin');
 if(error||ok!==true)return {erreur:'Accès réservé à la supervision.'};
 const demande=String(form.get('demande')??'').trim();
 if(demande.length<10||demande.length>12000)return {erreur:'Décrivez la correction en 10 à 12 000 caractères.'};
 if(!process.env.GITHUB_AGENT_TOKEN||process.env.GERIMMO_CODEX_ENABLED!=='true')return {erreur:'L’atelier doit être connecté et activé avant de lancer une préparation.'};
 const existante=String(form.get('proposition')??'');
 let p:{id:string}|null=null;
 if(existante){
  if(!/^[0-9a-f-]{36}$/.test(existante))return {erreur:'Proposition inconnue.'};
  const prise=await db.from('development_proposals').update({statut:'en_developpement',probleme:demande,autorisation_requise:true}).eq('id',existante).in('statut',['a_etudier','detectee']).select('id').maybeSingle();
  if(prise.error||!prise.data)return {erreur:'Cette proposition est déjà en préparation ou a changé. Actualisez le suivi.'};
  p=prise.data;
 }else{
 const {data:creee,error:creation}=await db.from('development_proposals').insert({source:'supervision',titre:demande.slice(0,100),probleme:demande,statut:'a_etudier',risque:'moyen',autorisation_requise:true}).select('id').single();
 if(creation||!creee)return {erreur:'La demande n’a pas pu être enregistrée.'};
 p=creee;
 }
 try{
  const r=await fetch('https://api.github.com/repos/GERIMMO/GERIMMO_V4/actions/workflows/atelier-code.yml/dispatches',{method:'POST',headers:{Authorization:`Bearer ${process.env.GITHUB_AGENT_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{proposition:p.id,demande}}),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok)return {erreur:'La demande est conservée mais l’atelier n’a pas confirmé son lancement. Vérifiez sa connexion.'};
  await db.from('development_proposals').update({statut:'en_developpement'}).eq('id',p.id);
  revalidatePath('/admin/autonomie');revalidatePath('/admin/equipes');return {succes:'L’atelier a accepté la demande. Retrouvez sa préparation, ses contrôles et sa démonstration dans le pilotage. Votre accord sera demandé avant publication.'};
 }catch{return {erreur:'La demande est conservée. Le lancement n’est pas confirmé : vérifiez l’atelier avant de réessayer.'};}
}
