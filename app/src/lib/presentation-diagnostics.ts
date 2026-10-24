import { statutDiagnostic } from "./parc";

type Diagnostic = { type: string; document_id: string | null; date_expiration: string | null };
export const diagnosticConditionnel = (type: string) => ["gaz", "electricite", "termites"].includes(type);

/** Présentation seulement : ne remplace pas les contrôles de mise en location. */
export function presentationDiagnostic(type: string, diagnostic: Diagnostic | undefined, attendu = true) {
  if (!diagnostic) return diagnosticConditionnel(type)
    ? { etat: "a_confirmer", libelle: "Obligation à confirmer", ton: "neutre" } as const
    : attendu ? { etat: "a_ajouter", libelle: "À ajouter", ton: "attente" } as const
    : { etat: "facultatif", libelle: "Facultatif", ton: "neutre" } as const;
  if (!diagnostic.document_id) return { etat: "a_joindre", libelle: "Fichier à joindre", ton: "attente" } as const;
  if (!diagnostic.date_expiration) return { etat: "disponible", libelle: "Fichier disponible", ton: "neutre" } as const;
  const statut = statutDiagnostic(diagnostic.date_expiration);
  if (statut === "expire") return { etat: "expire", libelle: "À renouveler", ton: "attente" } as const;
  if (statut === "expire_bientot") return { etat: "expire_bientot", libelle: "Expire bientôt", ton: "attente" } as const;
  return { etat: "valide", libelle: "À jour", ton: "ok" } as const;
}

export function bilanDiagnostics(attendus: string[], diagnostics: Diagnostic[]) {
  const types = [...new Set([...attendus, ...diagnostics.map(d => d.type)])];
  const parType = new Map(diagnostics.map(d => [d.type, d]));
  const lignes = types.map(type => ({ type, diagnostic: parType.get(type), ...presentationDiagnostic(type, parType.get(type), attendus.includes(type)) }));
  return {
    lignes,
    disponibles: lignes.filter(l => l.diagnostic?.document_id).length,
    aJour: lignes.filter(l => l.etat === "valide").length,
    aVerifier: lignes.filter(l => ["a_confirmer", "disponible"].includes(l.etat)).length,
    aAjouter: lignes.filter(l => ["a_ajouter", "a_joindre"].includes(l.etat)).length,
    aRenouveler: lignes.filter(l => ["expire", "expire_bientot"].includes(l.etat)).length,
    aConfirmer: lignes.filter(l => l.etat === "a_confirmer").length,
  };
}
