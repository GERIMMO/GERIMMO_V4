import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { detecterMimeReel } from './file-type';
import { sansJargon } from './erreurs';

/** Dépôt réservé, puis rattachement atomique. Un résultat réseau inconnu ne déclenche jamais de suppression. */
export async function joindrePhotosAvecReprise(db: SupabaseClient, org: string, incident: string, fichiers: File[]) {
  const echecs: string[] = [];
  // Un retrait précédemment indisponible reste suivi en base et est retenté.
  const { data: anciens, error: lecture } = await db.from('depots_photos_incident').select('storage_path').eq('organization_id', org).eq('incident_id', incident).eq('etat', 'abandonne');
  if (lecture) echecs.push('le nettoyage des anciens dépôts reste à reprendre');
  for (const ancien of anciens ?? []) {
    const { error } = await db.storage.from('documents').remove([ancien.storage_path]);
    if (error) echecs.push('un ancien dépôt non joint reste à nettoyer');
  }
  for (const fichier of fichiers) {
    try {
      const octets = new Uint8Array(await fichier.arrayBuffer());
      const mime = detecterMimeReel(octets);
      const empreinte = createHash('sha256').update(octets).digest('hex');
      const { data: depot, error: reservation } = await db.rpc('preparer_photo_incident', { p_org: org, p_incident: incident, p_empreinte: empreinte, p_mime: mime, p_taille: fichier.size });
      if (reservation || !depot) { echecs.push(`« ${fichier.name} » : ${sansJargon(reservation?.message ?? 'Dépôt indisponible')}`); continue; }
      if (depot.etat === 'rattache') continue;
      // upsert reste désactivé : un rejeu ne remplace jamais un objet existant.
      // Une réponse d'upload perdue ou un conflit se résout par la base, qui
      // vérifie existence/propriétaire et rattache au plus une fois.
      try { await db.storage.from('documents').upload(depot.storage_path, octets, { contentType: mime!, upsert: false }); } catch { /* résultat inconnu : vérifier par la RPC */ }
      const { data: fin, error: finalisation } = await db.rpc('finaliser_photo_incident', { p_depot: depot.id });
      if (finalisation || !fin) { echecs.push(`« ${fichier.name} » : rattachement à confirmer ; réessayez les photos`); continue; }
      if (fin.document_id) continue;
      echecs.push(`« ${fichier.name} » : ${sansJargon(fin.erreur ?? 'Photo non jointe')}`);
      // Seulement après refus confirmé et enregistré. La RLS interdit de
      // retirer une photo rattachée, étrangère ou simplement en attente.
      if (fin.nettoyage === true) {
        const { error } = await db.storage.from('documents').remove([depot.storage_path]);
        if (error) echecs.push('le dépôt non joint reste à nettoyer ; réessayez');
      }
    } catch {
      echecs.push(`« ${fichier.name} » : résultat indisponible ; réessayez les photos`);
    }
  }
  return echecs.length ? `Photos à reprendre : ${echecs.join(' ; ')}.` : undefined;
}
