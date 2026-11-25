/**
 * Décision du dirigeant du 24/11/2026 (Q13) : un article du Journal rédigé avec l'aide de l'IA porte la mention visible
 * « Rédigé avec l’aide de l’IA ». La parution automatique est gardée. Le texte est écrit une seule fois ici, pour la
 * page publique (/journal/<article>), la page de l'espace (<espace>/journal/<article>) et le post Facebook.
 *
 * Reprise du 24/11 (M4) : une mention fausse est pire que pas de mention. Elle ne s'affiche que pour un article
 * d'origine « ia » (colonne `publications.origine`, migration 20261124110000) ; un article écrit à la main par la
 * supervision (origine « manuel ») n'en porte pas. Les listes d'articles n'en portent pas non plus (M2) : chaque carte
 * mène à l'article, qui la porte.
 */
export const MENTION_IA_ARTICLE = "Rédigé avec l’aide de l’IA";

export type OrigineArticle = "ia" | "manuel";

export function MentionIaArticle({ origine, className }: { origine: OrigineArticle; className?: string }) {
  return origine === "ia" ? <p data-mention-ia className={className}>{MENTION_IA_ARTICLE}</p> : null;
}
