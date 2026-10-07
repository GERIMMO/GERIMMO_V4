/**
 * Rédaction d'un article de veille ancrée dans la source (06/10/2026).
 *
 * La garantie « aucun fait absent de la source » est mécanique : chaque point
 * porte une citation qui doit se retrouver dans le texte officiel. Un seul
 * point sans preuve rejette l'article ; la mission bascule alors sur un sujet
 * éditorial.
 */
import { describe, expect, it } from "vitest";
import { corpsArticleVeille, validerArticleVeille } from "@/lib/redaction-veille";

const SOURCE = "La trêve hivernale est fixée du 1er novembre 2026 au 31 mars 2027. Toutefois, la trêve hivernale ne s’applique pas dans certaines situations. Les dettes de loyer continuent d’exister pendant cette période.";

function reponse(article: Record<string, unknown>) {
  return { status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(article) }] }] };
}
const ARTICLE = {
  titre: "Trêve hivernale : pas d’expulsion du 1er novembre au 31 mars",
  chapo: "Du 1er novembre 2026 au 31 mars 2027, les expulsions sont suspendues. Les loyers restent dus.",
  ce_qui_change: "Pendant cinq mois, aucune expulsion ne peut être exécutée, même avec un jugement. La dette de loyer, elle, ne disparaît pas. La procédure reprend au printemps.",
  concernes: "Les bailleurs qui ont un impayé en cours et leurs locataires.",
  a_partir_de: "Du 1er novembre 2026 au 31 mars 2027.",
  points: [
    { texte: "La trêve va du 1er novembre 2026 au 31 mars 2027.", preuve: "fixée du 1er novembre 2026 au 31 mars 2027" },
    { texte: "Certaines situations échappent à la trêve.", preuve: "la trêve hivernale ne s’applique pas dans certaines situations" },
    { texte: "Les loyers impayés restent dus pendant la trêve.", preuve: "Les dettes de loyer continuent d’exister" },
  ],
  reserve: "Vérifiez votre situation précise dans le texte officiel avant toute démarche.",
  facebook: "Trêve hivernale du 1er novembre au 31 mars : pas d’expulsion, mais les loyers restent dus. Ce qu’un bailleur doit savoir.",
};

describe("validerArticleVeille", () => {
  it("accepte un article dont chaque point est prouvé par la source", () => {
    const a = validerArticleVeille(reponse(ARTICLE), SOURCE);
    expect(a.points).toHaveLength(3);
    const corps = corpsArticleVeille(a, { id: "x", titre: "Trêve hivernale", source_url: "https://www.service-public.gouv.fr/particuliers/actualites/A14632", source_nom: "Service Public", publie_source_le: "2026-10-02" });
    expect(corps).toContain("## Ce qui change");
    expect(corps).toContain("[Service Public](https://www.service-public.gouv.fr/particuliers/actualites/A14632)");
    expect(corps.trim().endsWith("*Vérifiez votre situation précise dans le texte officiel avant toute démarche.*")).toBe(true);
  });
  it("rejette un article dont un point n'a pas sa preuve dans la source", () => {
    const faux = { ...ARTICLE, points: [...ARTICLE.points.slice(0, 2), { texte: "Une aide de 500 € est prévue.", preuve: "une aide de 500 euros est versée aux bailleurs" }] };
    expect(() => validerArticleVeille(reponse(faux), SOURCE)).toThrow(/Citation-preuve introuvable/);
  });
  it("rejette les gabarits non tenus : moins de trois points, lien dans le texte, réponse tronquée", () => {
    expect(() => validerArticleVeille(reponse({ ...ARTICLE, points: ARTICLE.points.slice(0, 2) }), SOURCE)).toThrow(/3 à 5 points/);
    expect(() => validerArticleVeille(reponse({ ...ARTICLE, chapo: "Voir https://exemple.fr pour le détail, c’est expliqué là-bas." }), SOURCE)).toThrow(/lien/);
    expect(() => validerArticleVeille({ status: "incomplete" }, SOURCE)).toThrow(/non terminée/);
  });
});
