/** Messages fermés : aucune réponse brute ni secret du prestataire n’arrive à l’écran. */
export class ErreurIA extends Error {}
export async function expliquerRefusIA(r: Response): Promise<ErreurIA> {
 const body = await r.json().catch(() => null);
 const code = body?.error?.code;
 if (code === 'insufficient_quota' || code === 'billing_hard_limit_reached') return new ErreurIA('Le crédit ou le plafond de dépenses du compte IA est atteint. Vérifiez sa facturation avant de relancer.');
 if (r.status === 401) return new ErreurIA('La connexion de Gerimmo au service IA est refusée. Vérifiez la clé enregistrée dans les connexions du service.');
 if (r.status === 403) return new ErreurIA('Le compte IA n’a pas l’autorisation nécessaire. Vérifiez ses accès et sa validation auprès du prestataire.');
 if (r.status === 404 || code === 'model_not_found') return new ErreurIA('Le modèle IA configuré n’est pas accessible à ce compte. Vérifiez le modèle et ses autorisations.');
 if (r.status === 429) return new ErreurIA('Le service IA reçoit trop de demandes. Attendez avant de relancer.');
 if (r.status >= 500) return new ErreurIA('Le service IA est momentanément indisponible. Une nouvelle tentative pourra être faite plus tard.');
 return new ErreurIA('Le service IA a refusé la demande. La préparation doit être vérifiée avant une nouvelle tentative.');
}
export function messageEtudeIA(e: unknown) {
 if (e instanceof ErreurIA) return e.message;
 if (e instanceof Error && ['TimeoutError','AbortError'].includes(e.name)) return 'L’étude a dépassé le délai prévu. Aucun résultat incomplet n’a été publié.';
 return 'L’étude n’a pas satisfait les contrôles de contenu ou de source. Aucune conclusion n’est publiée ; une vérification est nécessaire.';
}
