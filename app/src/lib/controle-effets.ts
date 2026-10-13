import type { SupabaseClient } from '@supabase/supabase-js';
import type { Mission } from './missions';
export class ArretSupervision extends Error {
 constructor(message = 'Un arrêt a été demandé. Aucun nouvel effet ne sera lancé.', public readonly raison: 'arret' | 'indisponible' = 'arret', public readonly bilanPartiel?: Record<string, number | boolean>) { super(message); this.name = 'ArretSupervision'; }
}
/** Appeler immédiatement avant chaque effet. Un effet déjà envoyé reste à rapprocher. */
export async function verifierAvantEffet(db: SupabaseClient, mission: Mission | 'orchestrateur' | 'sauvegarde', plan?: string): Promise<void> {
 let resultat;
 try { resultat = await db.rpc('verifier_arret_supervision', { p_mission: mission, p_plan: plan ?? null }); }
 catch { throw new ArretSupervision('Le contrôle des arrêts est indisponible. Aucun nouvel effet ne sera lancé.', 'indisponible'); }
 if (resultat.error || typeof resultat.data !== 'boolean') throw new ArretSupervision('Le contrôle des arrêts est indisponible. Aucun nouvel effet ne sera lancé.', 'indisponible');
 if (!resultat.data) throw new ArretSupervision();
}
