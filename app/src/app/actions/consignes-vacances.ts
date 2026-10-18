'use server';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { instantParis } from '@/lib/dates-supervision';
import { envoyerUrgencesRelais } from '@/lib/relais-urgences-envoi';
export type RetourSupervision = { erreur?: string; succes?: string };
const texte = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
type Base = Awaited<ReturnType<typeof createClient>>;
async function appel(nom: string, args: Record<string, unknown>, verifier?: (db: Base) => Promise<string | null>): Promise<RetourSupervision> {
 const db = await createClient();
 const auth = await db.rpc('is_permanent_super_admin');
 if (auth.error || auth.data !== true) return { erreur: 'Cette action demande un superviseur permanent et la double vérification.' };
 const refus = await verifier?.(db);
 if (refus) return { erreur: refus };
 const { error } = await db.rpc(nom, args);
 if (error) return { erreur: error.message };
 revalidatePath('/admin/consignes'); revalidatePath('/admin/relais'); revalidatePath('/admin/brief');
 return { succes: 'Enregistré. Le suivi ci-dessous est à jour.' };
}
export async function enregistrerConsigne(_etat: RetourSupervision, f: FormData): Promise<RetourSupervision> {
 const debut = instantParis(texte(f,'debut')), fin = instantParis(texte(f,'fin'));
 if (!debut || !fin) return { erreur: 'Indiquez des dates valides à l’heure de Paris. Une heure répétée ou inexistante au changement d’heure doit être précisée autrement.' };
 return appel('enregistrer_consigne', { p_id: texte(f,'id') || null, p_version_attendue: Number(texte(f,'version') || 0), p_titre: texte(f,'titre'), p_texte: texte(f,'texte'), p_mission: texte(f,'mission'), p_debut: debut, p_fin: fin, p_responsable: texte(f,'responsable'), p_budget_total: Number(f.get('budget_total')), p_budget_mensuel: Number(f.get('budget_mensuel')), p_types: f.getAll('types').map(String) });
}
// SA-03 : sans tâche, l'écran dit « Aucune tâche proposée » ; la base, elle,
// enregistrait quand même l'accord, et la version apparaissait ensuite parmi les
// consignes « déjà autorisées » d'un plan de vacances. Le refus est inoffensif.
async function exigerUneTache(db: Base, version: string): Promise<string | null> {
 const { data, error } = await db.from('supervision_consignes_taches').select('id').eq('version_id', version).limit(1);
 if (error) return 'Les tâches de cette version ne peuvent pas être vérifiées. Réessayez dans un instant.';
 return data && data.length > 0 ? null : 'Cette version ne propose aucune tâche : il n’y a rien à activer. Précisez les lectures dans une nouvelle version.';
}
export async function commanderConsigne(_etat: RetourSupervision, f: FormData): Promise<RetourSupervision> {
 const commande = texte(f,'commande'), id = texte(f,'id');
 if (commande === 'approuver' || commande === 'refuser') return appel('decider_consigne', { p_version: id, p_accepter: commande === 'approuver' }, commande === 'approuver' ? (db) => exigerUneTache(db, id) : undefined);
 if (commande === 'suspendre' || commande === 'reprendre') return appel('suspendre_consigne', { p_id: id, p_suspendre: commande === 'suspendre' });
 if (commande === 'executer') return appel('executer_tache_consigne', { p_tache: id, p_plan: null });
 return { erreur: 'Commande inconnue.' };
}
export async function enregistrerVacances(_etat: RetourSupervision, f: FormData): Promise<RetourSupervision> {
 if(texte(f,'verification')!=='oui') return {erreur:'Relisez le récapitulatif et confirmez la vérification avant de programmer cette absence.'};
 const debut = instantParis(texte(f,'debut')), fin = instantParis(texte(f,'fin'));
 if (!debut || !fin) return { erreur: 'Vérifiez les dates à l’heure de Paris. Les heures ambiguës du changement d’heure sont refusées.' };
 return appel('enregistrer_vacances', { p_precedent: texte(f,'precedent') || null, p_titre: texte(f,'titre'), p_debut: debut, p_fin: fin, p_fuseau: 'Europe/Paris', p_responsable: texte(f,'responsable'), p_consigne_version: texte(f,'consigne') || null, p_delai_minutes: Number(f.get('delai')) });
}
// D46-B (15/10/2026) : « Actualiser » et « Signaler une urgence interne » peuvent poser une urgence du relais. Son e-mail
// immédiat part APRÈS la réponse (`after`) : le geste n'attend pas le service d'e-mail, et un échec d'envoi ne change
// rien à ce qui vient d'être enregistré. La file se vide avec la session du superviseur (droit accordé par la base au
// superviseur permanent en double vérification), jamais avec la clé de service.
async function puisEnvoyerLesUrgences(retour: RetourSupervision): Promise<RetourSupervision> {
 if (retour.erreur) return retour;
 const db = await createClient();
 after(() => envoyerUrgencesRelais({ db }));
 return retour;
}
export async function commanderRelais(_etat: RetourSupervision, f: FormData): Promise<RetourSupervision> {
 const commande = texte(f,'commande');
 if (commande === 'actualiser') return puisEnvoyerLesUrgences(await appel('traiter_vacances', {}));
 if (commande === 'accuser') return appel('accuser_alerte_vacances', { p_id: texte(f,'id') });
 if (commande === 'urgence') return puisEnvoyerLesUrgences(await appel('signaler_urgence_vacances', { p_plan: texte(f,'plan'), p_cle: texte(f,'cle'), p_titre: texte(f,'titre') }));
 // D46 (IA-06) : la sauvegarde ne lit aucun arrêt ; en enregistrer un donnerait l'illusion d'une protection. La lever reste possible.
 if (commande === 'arreter' && texte(f,'portee') === 'sauvegarde') return { erreur: 'Cet arrêt n’aurait aucun effet : la sauvegarde nocturne ne lit pas l’arrêt d’urgence et continue. Il n’est plus proposé.' };
 if (commande === 'arreter' || commande === 'reprendre') return appel('commander_arret_supervision', { p_cle: texte(f,'portee'), p_plan: texte(f,'plan') || null, p_arreter: commande === 'arreter', p_motif: texte(f,'motif') });
 return { erreur: 'Commande inconnue.' };
}
