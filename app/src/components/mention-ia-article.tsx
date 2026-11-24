/**
 * Décision du dirigeant du 24/11/2026 (Q13) : chaque article du Journal porte la mention visible « Rédigé avec l’aide
 * de l’IA ». La parution automatique est gardée. Le texte est écrit une seule fois ici, pour la page publique
 * (/journal/<article>) et pour la page de l'espace (<espace>/journal/<article>) : elles ne peuvent pas diverger.
 */
export const MENTION_IA_ARTICLE = "Rédigé avec l’aide de l’IA";

export function MentionIaArticle({ className }: { className?: string }) {
  return <p data-mention-ia className={className}>{MENTION_IA_ARTICLE}</p>;
}
