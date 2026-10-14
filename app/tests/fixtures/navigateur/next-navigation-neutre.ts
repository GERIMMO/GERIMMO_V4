// `next/navigation` n'existe pas hors de Next. Le seul appel des composants testés dans le navigateur est
// `unstable_rethrow`, qui relance les redirections et les « introuvable » de Next ; une erreur ordinaire (réponse
// perdue) n'est jamais relancée par lui. Cette version neutre ne relance rien : la réponse perdue du banc suit le même
// chemin que celle du navigateur.
export function unstable_rethrow(): void {}
