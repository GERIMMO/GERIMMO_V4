'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { FLUX_ENVOIS_AUTOMATIQUES, LIBELLES_ENVOIS_AUTOMATIQUES, type FluxEnvoiAutomatique } from '@/lib/envois-suspendus';

export type RetourEnvoiAutomatique = { erreur?: string; succes?: string; flux?: FluxEnvoiAutomatique };

/**
 * Audit palier 1 (P1-08) : le superviseur permanent ouvre ou ferme, un par un, les envois automatiques prévus
 * et suspendus (avis d'échéance, relance amiable, rappel de rendez-vous, relance d'invitation ; depuis la décision Q37
 * du 24/11/2026, la relance d'une demande de report de rendez-vous). Tout est fermé à la
 * livraison. La base refait le contrôle d'accès et journalise le geste (supervision_operations, action
 * « envoi_automatique ») dans la même transaction.
 *
 * Ouvrir fait partir de VRAIS e-mails à des locataires et à des artisans dès la passe suivante : l'ouverture demande
 * une confirmation explicite ; la fermeture, jamais.
 */
export async function reglerEnvoiAutomatique(_etat: RetourEnvoiAutomatique, f: FormData): Promise<RetourEnvoiAutomatique> {
  const flux = f.get('flux');
  const choix = f.get('choix');
  if (typeof flux !== 'string' || !(FLUX_ENVOIS_AUTOMATIQUES as readonly string[]).includes(flux) || (choix !== 'ouvrir' && choix !== 'fermer')) {
    return { erreur: 'Rechargez la page avant de modifier ce réglage.' };
  }
  const envoi = flux as FluxEnvoiAutomatique;
  if (choix === 'ouvrir' && f.get('confirmation') !== 'oui') {
    return { flux: envoi, erreur: 'Cochez la confirmation avant d’ouvrir cet envoi : de vrais e-mails partiront.' };
  }
  const db = await createClient();
  const auth = await db.rpc('is_permanent_super_admin');
  if (auth.error || auth.data !== true) return { flux: envoi, erreur: 'Cette action demande un superviseur permanent et la double vérification.' };
  const { error } = await db.rpc('regler_envoi_automatique', { p_flux: envoi, p_ouvert: choix === 'ouvrir' });
  if (error) return { flux: envoi, erreur: 'Le réglage n’a pas pu être enregistré. Réessayez dans un instant.' };
  revalidatePath('/admin/parametres');
  const titre = LIBELLES_ENVOIS_AUTOMATIQUES[envoi].titre;
  return choix === 'ouvrir'
    ? { flux: envoi, succes: `Ouvert : « ${titre} » partira à la prochaine passe, pour chaque envoi que la base confirme dû.` }
    : { flux: envoi, succes: `Fermé : « ${titre} » ne part plus. Les e-mails déjà en attente ne repartiront pas.` };
}
