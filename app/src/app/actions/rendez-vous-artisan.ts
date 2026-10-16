'use server';
import { revalidatePath } from 'next/cache';
import { verifierArtisanMutation } from '@/app/artisan/acces';

type EtatAccuse = {erreur?:string;succes?:string};
export async function accuserAnnulationRdv(demandeId:string,interventionId:string,_etat:EtatAccuse): Promise<EtatAccuse> {
  const {supabase,fiche,erreur}=await verifierArtisanMutation();
  if (!fiche) return {erreur:erreur ?? 'Accès artisan indisponible.'};
  const r=await supabase.rpc('accuser_annulation_rdv',{p_demande:demandeId});
  if (r.error) return {erreur:'La prise de connaissance n’a pas pu être enregistrée. Vous pouvez quand même proposer de nouveaux créneaux.'};
  revalidatePath('/artisan/agenda');
  revalidatePath(`/artisan/missions/${interventionId}`);
  return {succes:'Vous avez pris acte de l’annulation.'};
}
