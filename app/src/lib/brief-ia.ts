// Contrat de sortie du brief IA : une recommandation consultative, jamais une
// instruction exécutable. Les données d'entrée sont exclusivement des comptes.
export type AnalyseBrief = {
  constat: string;
  prochaine_action: string;
  justification: string;
  inconnues: string;
};

const CHAMPS = ["constat", "prochaine_action", "justification", "inconnues"] as const;

export const FORMAT_BRIEF_IA = {
  type: "json_schema",
  name: "brief_gerimmo",
  strict: true,
  schema: {
    type: "object",
    properties: Object.fromEntries(CHAMPS.map((champ) => [champ, { type: "string" }])),
    required: [...CHAMPS],
    additionalProperties: false,
  },
} as const;

export function extraireAnalyseBrief(reponse: unknown): AnalyseBrief | null {
  if (!reponse || typeof reponse !== "object") return null;
  const sortie = (reponse as { output?: unknown }).output;
  if (!Array.isArray(sortie)) return null;
  const texte = sortie
    .flatMap((item) => item && typeof item === "object" && Array.isArray(item.content) ? item.content : [])
    .find((item) => item && typeof item === "object" && item.type === "output_text" && typeof item.text === "string")?.text;
  if (typeof texte !== "string") return null;
  try {
    const donnees: unknown = JSON.parse(texte);
    if (!donnees || typeof donnees !== "object") return null;
    const objet = donnees as Record<string, unknown>;
    if (CHAMPS.some((champ) => typeof objet[champ] !== "string" || !(objet[champ] as string).trim() || (objet[champ] as string).length > 1200)) return null;
    return Object.fromEntries(CHAMPS.map((champ) => [champ, (objet[champ] as string).trim()])) as AnalyseBrief;
  } catch {
    return null;
  }
}
