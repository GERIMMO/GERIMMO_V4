'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { BORNES_REPERES_FISCAUX, eurosEntiers, lireEntierSaisi, lireSourceSaisie } from '@/lib/reperes-fiscaux';

export type RetourReperesFiscaux = { erreur?: string; succes?: string };

/**
 * Audit palier 1 (P2-09) : le superviseur permanent enregistre le plafond et l'abattement du micro-foncier qu'il
 * vient de contrôler. Ces deux valeurs ne servent qu'à la phrase d'aide du récapitulatif fiscal ; aucun calcul ne
 * les lit. La base refait le contrôle d'accès et les bornes, date la vérification du jour (Paris) et journalise le
 * geste (supervision_operations, action « reperes_fiscaux ») dans la même transaction.
 *
 * Décision du 24/11/2026 (Q38) : la source du contrôle (où les deux valeurs ont été lues) est exigée et enregistrée avec
 * la date ; les propriétaires la lisent à côté de la date.
 *
 * La case de confirmation est exigée : enregistrer, c'est faire afficher aux propriétaires « vérifiés le <jour> ».
 */
export async function reglerReperesFiscaux(_etat: RetourReperesFiscaux, f: FormData): Promise<RetourReperesFiscaux> {
  const plafond = lireEntierSaisi(f.get('plafond'), BORNES_REPERES_FISCAUX.plafondEuros);
  if (plafond === null) return { erreur: 'Plafond : indiquez un nombre entier d’euros, entre 1 000 et 1 000 000, sans virgule.' };
  const abattement = lireEntierSaisi(f.get('abattement'), BORNES_REPERES_FISCAUX.abattementPourcent);
  if (abattement === null) return { erreur: 'Abattement : indiquez un pourcentage entier, entre 1 et 99, sans virgule.' };
  const source = lireSourceSaisie(f.get('source'));
  if (source === null) return { erreur: 'Source : indiquez sur une ligne où vous avez lu ces deux valeurs (site officiel, page, date de mise à jour), en 10 à 300 caractères.' };
  if (f.get('confirmation') !== 'oui') {
    return { erreur: 'Cochez la confirmation : ces deux valeurs seront affichées aux propriétaires comme vérifiées aujourd’hui.' };
  }
  const db = await createClient();
  const auth = await db.rpc('is_permanent_super_admin');
  if (auth.error || auth.data !== true) return { erreur: 'Cette action demande un superviseur permanent et la double vérification.' };
  const { error } = await db.rpc('regler_reperes_fiscaux_avec_source', { p_plafond_euros: plafond, p_abattement_pourcent: abattement, p_source: source });
  if (error) return { erreur: 'Le réglage n’a pas pu être enregistré. Réessayez dans un instant.' };
  revalidatePath('/admin/parametres');
  return { succes: `Enregistré : plafond de ${eurosEntiers(plafond)}, abattement de ${abattement} %, vérifiés aujourd’hui, source enregistrée. L’aide du récapitulatif fiscal les affiche dès maintenant.` };
}
