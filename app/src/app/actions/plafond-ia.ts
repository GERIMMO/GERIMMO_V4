'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { lirePlafondIA } from '@/lib/plafond-ia';

export type RetourPlafondIA = { erreur?: string; succes?: string };

/**
 * Décision X19 (SA-10) : le superviseur permanent règle la limite quotidienne des appels payants à l'IA, depuis
 * « Relais en mon absence ». La base refait le contrôle d'accès et les bornes, et journalise le geste
 * (supervision_operations, action « plafond_ia ») dans la même transaction.
 */
export async function reglerPlafondIA(_etat: RetourPlafondIA, f: FormData): Promise<RetourPlafondIA> {
  const lu = lirePlafondIA(f.get('plafond'));
  if ('erreur' in lu) return { erreur: lu.erreur };
  const db = await createClient();
  const auth = await db.rpc('is_permanent_super_admin');
  if (auth.error || auth.data !== true) return { erreur: 'Cette action demande un superviseur permanent et la double vérification.' };
  const { error } = await db.rpc('regler_plafond_ia', { p_plafond: lu.plafond });
  if (error) return { erreur: 'La limite n’a pas pu être enregistrée. Réessayez dans un instant.' };
  revalidatePath('/admin/relais');
  if (lu.plafond === 0) return { succes: 'Enregistré : plus aucun appel payant à l’IA ne partira tant que la limite reste à 0.' };
  return { succes: `Enregistré : au plus ${lu.plafond} ${lu.plafond > 1 ? 'appels payants' : 'appel payant'} à l’IA par jour (jour de Paris).` };
}

/**
 * Interrupteur IA (22/11/2026) : le superviseur permanent active ou désactive tous les appels payants à l'IA, depuis
 * les paramètres généraux. La base refait le contrôle d'accès et journalise le geste (supervision_operations, action
 * « ia_active ») dans la même transaction.
 */
export async function reglerIAActive(_etat: RetourPlafondIA, f: FormData): Promise<RetourPlafondIA> {
  const choix = f.get('ia');
  if (choix !== 'activer' && choix !== 'desactiver') return { erreur: 'Rechargez la page avant de modifier ce réglage.' };
  const db = await createClient();
  const auth = await db.rpc('is_permanent_super_admin');
  if (auth.error || auth.data !== true) return { erreur: 'Cette action demande un superviseur permanent et la double vérification.' };
  const { error } = await db.rpc('regler_ia_active', { p_active: choix === 'activer' });
  if (error) return { erreur: 'Le réglage n’a pas pu être enregistré. Réessayez dans un instant.' };
  // Tous les espaces lisent cet état dans leur mise en page : ils se rafraîchissent à la prochaine navigation.
  revalidatePath('/', 'layout');
  return choix === 'activer'
    ? { succes: 'IA activée : les fonctions assistées sont de nouveau proposées.' }
    : { succes: 'IA désactivée : plus aucun appel à l’IA ne part. Chaque écran propose la saisie manuelle.' };
}
