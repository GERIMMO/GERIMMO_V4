// LA RÉDACTION D'UN ARTICLE DE VEILLE, ANCRÉE DANS LA SOURCE (06/10/2026).
//
// Jusqu'ici `sujetDeVeille()` produisait un gabarit fixe sans information
// (« X propose une information sur ce sujet… »). L'article est désormais
// rédigé par l'IA, STRICTEMENT à partir du texte de la page officielle lue au
// moment de la rédaction : ce qui change, qui est concerné, à partir de quand,
// trois à cinq points concrets, puis le lien vers la source.
//
// La garantie « aucun fait absent de la source » est mécanique : chaque point
// porte une citation-preuve, et l'article est rejeté si une seule citation ne
// se retrouve pas dans le texte officiel (même contrôle que l'étude de veille,
// `citationPresente`). Source inaccessible ou rédaction rejetée : pas d'article
// de veille ce jour-là, le créneau bascule sur un sujet éditorial.
//
// Le ton (wiki « Guide de ton du journal ») : un gestionnaire qui explique à un
// bailleur, phrases courtes, voix active, une seule phrase de réserve à la fin.

import type { SujetMarketing } from "./contenu-marketing";
import { ErreurIA, expliquerRefusIA } from "./erreur-ia";
import { citationPresente } from "./analyse-veille";
import { nomDeSource, sourceVeille } from "./veille-reglementaire";

export type InfoVeille = { id: string; titre: string; source_url: string; source_nom: string; publie_source_le: string | null };

export type ArticleVeilleRedige = {
  titre: string;
  chapo: string;
  ce_qui_change: string;
  concernes: string;
  a_partir_de: string;
  points: { texte: string; preuve: string }[];
  reserve: string;
  facebook: string;
};

export const FORMAT_ARTICLE_VEILLE = {
  type: "json_schema",
  name: "article_veille_gerimmo",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["titre", "chapo", "ce_qui_change", "concernes", "a_partir_de", "points", "reserve", "facebook"],
    properties: {
      titre: { type: "string" },
      chapo: { type: "string" },
      ce_qui_change: { type: "string" },
      concernes: { type: "string" },
      a_partir_de: { type: "string" },
      points: {
        type: "array",
        items: { type: "object", additionalProperties: false, required: ["texte", "preuve"], properties: { texte: { type: "string" }, preuve: { type: "string" } } },
      },
      reserve: { type: "string" },
      facebook: { type: "string" },
    },
  },
} as const;

export const CONSIGNE_REDACTION_VEILLE = [
  "Tu rédiges un article court du journal de Gerimmo, une application française de gestion locative, à partir du TEXTE OFFICIEL fourni et de lui seul.",
  "Interdit : tout fait, chiffre, date, nom ou condition qui ne figure pas dans le texte fourni. Si le texte ne dit pas quelque chose, écris que le texte ne le précise pas, ou n'en parle pas.",
  "Ton : un gestionnaire locatif qui explique à un propriétaire bailleur. Phrases courtes, voix active, mots simples. Pas de jargon administratif, pas de « il convient de », pas de formules de précaution en chaîne.",
  "Structure : « titre » (une phrase, sans deux-points décoratif, 90 caractères maximum) ; « chapo » (deux phrases, 220 caractères maximum) ; « ce_qui_change » (3 à 5 phrases) ; « concernes » (qui est concerné, 1 à 3 phrases) ; « a_partir_de » (quand cela s'applique, selon le texte ; sinon « Le texte ne donne pas de date. ») ; « points » (3 à 5 points concrets, une phrase chacun) ; « reserve » (UNE phrase de réserve, par exemple sur les cas particuliers ou la vérification du texte complet) ; « facebook » (deux phrases pour Facebook, 280 caractères maximum, sans lien).",
  "Pour CHAQUE point, « preuve » cite mot pour mot un passage du texte officiel (15 à 300 caractères) qui justifie le point. La citation doit être copiée telle quelle.",
  "Écris en français, sans emoji, sans majuscules d'insistance, sans promesse ni conseil juridique individualisé.",
].join("\n");

function texteValide(t: unknown, min: number, max: number): t is string {
  return typeof t === "string" && t.trim().length >= min && t.trim().length <= max;
}

/** Vérifie forme et ancrage ; lève avec un motif précis sinon. */
export function validerArticleVeille(reponse: unknown, texteSource: string): ArticleVeilleRedige {
  if (!reponse || typeof reponse !== "object") throw new Error("Réponse IA illisible.");
  const statut = (reponse as { status?: string }).status;
  if (statut !== "completed") throw new Error(`Réponse IA non terminée (${statut ?? "sans statut"}).`);
  const output = (reponse as { output?: { content?: { type?: string; text?: string }[] }[] }).output;
  const texte = output?.flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text;
  let a: Partial<ArticleVeilleRedige>;
  try { a = JSON.parse(texte ?? "{}"); } catch { throw new Error("Réponse IA illisible."); }
  if (!texteValide(a.titre, 10, 90)) throw new Error("Titre hors gabarit.");
  if (!texteValide(a.chapo, 40, 220)) throw new Error("Chapo hors gabarit.");
  if (!texteValide(a.ce_qui_change, 60, 1200)) throw new Error("« Ce qui change » hors gabarit.");
  if (!texteValide(a.concernes, 15, 500)) throw new Error("« Qui est concerné » hors gabarit.");
  if (!texteValide(a.a_partir_de, 10, 300)) throw new Error("« À partir de quand » hors gabarit.");
  if (!texteValide(a.reserve, 15, 300)) throw new Error("Réserve hors gabarit.");
  if (!texteValide(a.facebook, 40, 280)) throw new Error("Texte Facebook hors gabarit.");
  if (!Array.isArray(a.points) || a.points.length < 3 || a.points.length > 5) throw new Error("Il faut 3 à 5 points.");
  for (const p of a.points) {
    if (!p || !texteValide(p.texte, 15, 300) || !texteValide(p.preuve, 15, 300)) throw new Error("Point ou citation hors gabarit.");
    if (!citationPresente(texteSource, p.preuve)) throw new Error("Citation-preuve introuvable dans la source : article rejeté.");
  }
  if (/\[\[|https?:\/\//i.test(`${a.titre} ${a.chapo} ${a.ce_qui_change} ${a.facebook}`)) throw new Error("Texte avec lien ou balise interdite.");
  return a as ArticleVeilleRedige;
}

/** Le corps markdown de l'article, lien officiel en fin. */
export function corpsArticleVeille(a: ArticleVeilleRedige, info: InfoVeille): string {
  const url = sourceVeille(info.source_url);
  if (!url) throw new Error("Source officielle requise.");
  const source = nomDeSource(url, info.source_nom);
  const date = info.publie_source_le ? new Date(info.publie_source_le).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : null;
  return [
    "## Ce qui change", "", a.ce_qui_change, "",
    "## Qui est concerné", "", a.concernes, "",
    "## À partir de quand", "", a.a_partir_de, "",
    "## En pratique", "", ...a.points.map((p) => `- ${p.texte}`), "",
    `Source : [${source}](${url})${date ? `, publié le ${date}` : ""}.`, "",
    `*${a.reserve}*`,
  ].join("\n");
}

export async function redigerArticleVeille(info: InfoVeille, texteSource: string, env: NodeJS.ProcessEnv = process.env): Promise<SujetMarketing> {
  const cle = env.OPENAI_API_KEY?.trim() || env.OPEN_AI_KEY?.trim();
  if (!cle) throw new ErreurIA("La rédaction attend la connexion de l’IA.");
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: env.OPENAI_PUBLICATION_MODEL?.trim() || env.OPENAI_VEILLE_MODEL?.trim() || "gpt-5.6-luna",
      store: false,
      max_output_tokens: 3000,
      instructions: CONSIGNE_REDACTION_VEILLE,
      input: `Titre officiel : ${info.titre}\nSource : ${info.source_nom}\n\nTEXTE OFFICIEL :\n${texteSource.slice(0, 40_000)}`,
      text: { format: FORMAT_ARTICLE_VEILLE },
    }),
  });
  if (!r.ok) throw await expliquerRefusIA(r);
  const article = validerArticleVeille(await r.json(), texteSource);
  return {
    cle: `veille-${info.id}`,
    audience: "particuliers",
    titre: article.titre.trim(),
    chapo: article.chapo.trim(),
    corps: corpsArticleVeille(article, info),
    facebook: article.facebook.trim(),
  };
}
