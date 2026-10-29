export const SUJETS_ASSISTANT = {
  general: "Ma question", loyers: "Loyers et bail", charges: "Charges et relevés", incident: "Un problème dans le logement",
} as const;
export type SujetAssistant = keyof typeof SUJETS_ASSISTANT;
export type MessageAssistant = { role: "user" | "assistant"; content: string };
export type DemandeAssistant = { sujet: SujetAssistant; question: string; historique: MessageAssistant[] };

/** Tout le contexte est apporté volontairement. Aucun identifiant de dossier ou message système accepté. */
export function lireDemandeAssistant(brut: unknown): DemandeAssistant | null {
  if (!brut || typeof brut !== "object") return null;
  const d = brut as Record<string, unknown>;
  if (typeof d.sujet !== "string" || !Object.hasOwn(SUJETS_ASSISTANT, d.sujet) || typeof d.question !== "string" || !d.question.trim() || d.question.length > 2000 || !Array.isArray(d.historique) || d.historique.length > 12) return null;
  const historique: MessageAssistant[] = [];
  for (const [i, brutMessage] of d.historique.entries()) {
    if (!brutMessage || typeof brutMessage !== "object") return null;
    const m = brutMessage as Record<string, unknown>;
    if (m.role !== (i % 2 === 0 ? "user" : "assistant") || typeof m.content !== "string" || !m.content.trim() || m.content.length > (m.role === "user" ? 2000 : 8000)) return null;
    historique.push({ role: m.role as MessageAssistant["role"], content: m.content.trim() });
  }
  if (historique.length % 2 || historique.reduce((n, m) => n + m.content.length, d.question.length) > 24000) return null;
  return { sujet: d.sujet as SujetAssistant, question: d.question.trim(), historique };
}
