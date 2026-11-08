"use server";
import { calculerFactureExistante } from "@/lib/calcul-facture-existant";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { estUuid } from "@/lib/identifiants";
import { sansJargon } from "@/lib/erreurs";
import type { RepartitionFourniture } from "@/lib/proposition-repartition";
export type EtatRepartition = { erreur?: string; succes?: string; repartition?: RepartitionFourniture };
export async function preparerRepartitionFourniture(orgId: string, factureId: string, _etat: EtatRepartition, f: FormData): Promise<EtatRepartition> {
  const { supabase, user } = await verifierGerant(orgId, { geste: "suivi_consommations", cible: factureId });
  if (!user || !estUuid(factureId)) return { erreur: "Accès refusé." };
  return calculerFactureExistante(supabase,orgId,factureId,f);
}

export async function validerRepartitionFourniture(orgId: string, id: string, _etat: EtatRepartition, f: FormData): Promise<EtatRepartition> {
  const { supabase, user } = await verifierGerant(orgId, { geste: "suivi_consommations", cible: id });
  if (!user || !estUuid(id)) return { erreur: "Accès refusé." };
  if (f.get("confirme") !== "on") return { erreur: "Vérifiez le décompte puis confirmez la répartition." };
  const empreinte = String(f.get("empreinte") ?? "");
  if (!/^[a-f0-9]{64}$/.test(empreinte)) return { erreur: "Rechargez le décompte avant de le confirmer." };
  const { error } = await supabase.rpc("valider_repartition_fourniture", { p_repartition: id, p_empreinte_attendue: empreinte });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}`, "layout"); revalidatePath(`/espace/${orgId}`, "layout");
  return { succes: "Répartition validée et conservée avec la facture." };
}

export async function demanderIndexFacture(orgId:string,facture:string,compteur:string,jour:string):Promise<EtatRepartition> {
  const {supabase,user}=await verifierGerant(orgId,{geste:"suivi_consommations",cible:facture});
  if(!user || ![facture,compteur].every(estUuid)) return {erreur:"Accès refusé."};
  const r=await supabase.rpc("demander_index_facture",{p_org:orgId,p_facture:facture,p_compteur:compteur,p_jour:jour});
  if(r.error) return {erreur:sansJargon(r.error.message)};
  revalidatePath(`/locataire/${orgId}`,"layout");
  revalidatePath(`/espace/${orgId}`,"layout");
  return {succes:"Demande déposée dans l’espace du locataire. Les index seront repris dès réception ; des rappels sont prévus à J+3, J+7 et J+14."};
}

export async function rouvrirRepartitionFourniture(orgId:string,id:string):Promise<EtatRepartition> {
 const {supabase,user}=await verifierGerant(orgId,{geste:"suivi_consommations",cible:id});
 if(!user||!estUuid(id)) return {erreur:"Accès refusé."};
 const r=await supabase.rpc("rouvrir_repartition_fourniture",{p_org:orgId,p_repartition:id});
 if(r.error) return {erreur:sansJargon(r.error.message)};
 revalidatePath(`/espace/${orgId}`,"layout");
 return {succes:"Répartition rouverte. Corrigez puis recalculez avant validation."};
}
