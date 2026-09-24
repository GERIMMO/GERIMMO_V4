"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";
import { verifierCorrection } from '@/lib/suivi-corrections';
export type EtatAutonomie = { erreur?: string; succes?: string };
async function verifier() {
  const supabase = await createClient();
  const { data: ok, error } = await supabase.rpc("is_permanent_super_admin");
  return { supabase, ok: !error && ok === true };
}
export async function actualiserDossiers(): Promise<EtatAutonomie> {
  const { supabase, ok } = await verifier();
  if (!ok) return { erreur: "Reconnectez-vous avec votre compte de supervision." };
  const { error } = await supabase.rpc("actualiser_orchestration");
  if (error) return { erreur: "L’actualisation a échoué. Les dossiers restent conservés ; réessayez." };
  revalidatePath("/admin/autonomie");
  return { succes: "Les prochaines étapes sont à jour." };
}
export async function creerDelegation(_etat: EtatAutonomie, formData: FormData): Promise<EtatAutonomie> {
  const { supabase, ok } = await verifier();
  if (!ok) return { erreur: "Cette décision demande votre compte de supervision et sa double vérification." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const jours = Number(formData.get("jours"));
  const motif = String(formData.get("motif") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isInteger(jours) || jours < 1 || jours > 90 || motif.length < 5) {
    return { erreur: "Indiquez l’adresse d’un compte existant, une durée de 1 à 90 jours et un motif." };
  }
  const { error } = await supabase.rpc("creer_relais_supervision", { p_email: email, p_jours: jours, p_motif: motif });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath("/admin/autonomie");
  return { succes: "Le relais de suivi est ouvert. Il expire automatiquement à la date affichée." };
}
export async function revoquerDelegation(id: string): Promise<EtatAutonomie> {
  const { supabase, ok } = await verifier();
  if (!ok) return { erreur: "Accès réservé à la supervision." };
  const { error } = await supabase.rpc("revoquer_relais_supervision", { p_id: id });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath("/admin/autonomie");
  return { succes: "L’accès du relais est révoqué." };
}
export async function deciderAmelioration(id: string, revision: string, accepter: boolean): Promise<EtatAutonomie> {
  const { supabase, ok } = await verifier();
  if (!ok) return { erreur: "Accès réservé à la supervision." };
  if(accepter){
    const {data:p,error}=await supabase.from('development_proposals').select('rapport_controles').eq('id',id).single();
    if(error||!p)return {erreur:'La proposition ne peut pas être vérifiée.'};
    // Old proposals without workshop evidence continue to use the database
    // decision guard. Workshop proposals must be checked again at decision time.
    if(p.rapport_controles?.preparation){
      try{
        const suivi=await verifierCorrection(id);
        const cles=Object.keys(suivi.rapport) as (keyof typeof suivi.rapport)[];
        if(suivi.revision!==revision||suivi.rapport.resultat!=='reussi'||cles.some(k=>suivi.rapport[k]!==p.rapport_controles[k]))return {erreur:'Les contrôles ou la démonstration ont changé. Actualisez le suivi avant de décider.'};
      }catch(e){return {erreur:e instanceof Error?e.message:'La version ne peut pas être vérifiée.'};}
    }
  }
  const { error } = await supabase.rpc("decider_developpement", { p_id: id, p_revision: revision, p_accepter: accepter });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath("/admin/autonomie");
  return { succes: accepter ? "Cette version contrôlée est autorisée à la publication." : "La publication est refusée." };
}
export async function actualiserCorrection(id:string):Promise<EtatAutonomie>{
 const {supabase,ok}=await verifier();
 if(!ok)return {erreur:'Accès réservé à la supervision.'};
 const {data:p,error}=await supabase.from('development_proposals').select('statut,revision,rapport_controles,updated_at,autorisee_le').eq('id',id).single();
 if(error||!p)return {erreur:'Cette proposition est introuvable.'};
 if(['annulee','publiee','retour_arriere'].includes(p.statut))return {erreur:'Cette proposition est terminée. Son historique est conservé.'};
 try{
  const s=await verifierCorrection(id);
  const identique=p.revision===s.revision&&(Object.keys(s.rapport) as (keyof typeof s.rapport)[]).every(k=>p.rapport_controles?.[k]===s.rapport[k]);
  if(!identique){
   const {data:modifie,error:e}=await supabase.from('development_proposals').update({branche:s.branche,revision:s.revision,rapport_controles:s.rapport,statut:s.statut,autorisation_requise:true}).eq('id',id).eq('updated_at',p.updated_at).select('id').maybeSingle();
   if(e||!modifie)return {erreur:'La demande a changé pendant la vérification. Actualisez la page.'};
  }
  revalidatePath('/admin/autonomie');
  return {succes:identique&&p.autorisee_le?'Votre accord reste enregistré pour cette version. La publication est une étape distincte.':s.rapport.message};
 }catch(e){return {erreur:e instanceof Error?e.message:'Le suivi est momentanément indisponible.'};}
}
export async function signalerPresence(): Promise<void> {
  const {supabase,ok}=await verifier();
  if(ok) await supabase.rpc('signaler_presence_supervision');
}
export async function enregistrerBilanContact(orgId:string,incidentId:string,_etat:EtatAutonomie,form:FormData):Promise<EtatAutonomie>{
  const db=await createClient();
  const choix=form.get('appel');
  if(choix!=='oui'&&choix!=='non') return {erreur:'Précisez si un appel a été nécessaire.'};
  const note=String(form.get('note')??'').trim();
  if(note.length<5||note.length>1000)return {erreur:'Résumez le déroulement en quelques mots.'};
  const {error}=await db.rpc('confirmer_bilan_contact',{p_incident:incidentId,p_appel:choix==='oui',p_note:note});
  if(error)return {erreur:sansJargon(error.message)};
  revalidatePath(`/agence/${orgId}/incidents`);revalidatePath('/admin/autonomie');revalidatePath('/admin');
  return {succes:'Le bilan est enregistré et les indicateurs sont mis à jour.'};
}
