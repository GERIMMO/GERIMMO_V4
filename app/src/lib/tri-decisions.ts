import type { DecisionDeFile, Signal } from "./decisions-attendues";

export const CATEGORIES_DECISIONS = [
  { id: "incidents", nom: "Problèmes à examiner", description: "Service, alertes et signalements clients." },
  { id: "accords", nom: "Accords à donner", description: "Inscriptions, demandes et évolutions." },
  { id: "contenus", nom: "Articles et veille", description: "Propositions à relire avant diffusion." },
] as const;
export type CategorieDecision = typeof CATEGORIES_DECISIONS[number]["id"];
export type FiltreDecision = CategorieDecision | "tout";
export type EntreeDecision =
  | { type: "decision"; cle: string; titre: string; categorie: CategorieDecision; decision: DecisionDeFile }
  | { type: "signal"; cle: string; titre: string; categorie: CategorieDecision; signal: Signal };

export function filtreDecision(valeur?: string): FiltreDecision {
  return CATEGORIES_DECISIONS.some(c => c.id === valeur) ? valeur as CategorieDecision : "tout";
}

/** Vue de la file courante : aucun rejet, accord, ni changement de compteur métier. */
export function trierDecisions(decisions: DecisionDeFile[], signaux: Signal[]): EntreeDecision[] {
  const entrees: EntreeDecision[] = [
    ...signaux.map((signal): EntreeDecision => ({ type: "signal", cle: `signal:${signal.cle}`, titre: signal.titre,
      categorie: ["sante", "bugs", "alertes"].includes(signal.cle) ? "incidents" : "accords", signal })),
    ...decisions.map((decision): EntreeDecision => ({ type: "decision", cle: decision.cle, titre: decision.titre,
      categorie: decision.source === "veille" || decision.source === "publication" ? "contenus"
        : decision.source === "retour" && decision.lien.includes("nature=bug") ? "incidents" : "accords", decision })),
  ];
  // Le tri stable conserve notamment l'ordre N1 avant N2 de la file source.
  const ordre = { incidents: 0, accords: 1, contenus: 2 };
  return entrees.sort((a, b) => ordre[a.categorie] - ordre[b.categorie]);
}

export function rechercherDecisions(entrees: EntreeDecision[], filtre: FiltreDecision, recherche: string) {
  const normaliser = (texte: string) => texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
  const mots = normaliser(recherche).trim().split(/\s+/).filter(Boolean);
  return entrees.filter(e => (filtre === "tout" || e.categorie === filtre) && mots.every(m => normaliser(`${e.titre} ${e.type === "signal" ? e.signal.detail : e.decision.pourquoi}`).includes(m)));
}
