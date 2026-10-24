import { jourValide, jourAParis } from "./presentation-document";

type Diagnostic = { type: string; document_id: string | null; date_expiration: string | null };
export const diagnosticConditionnel = (type: string) => ["gaz", "electricite", "termites"].includes(type);

/** Présentation seulement : ne remplace pas les contrôles de mise en location. */
export function presentationDiagnostic(type: string, diagnostic: Diagnostic | undefined, attendu = true) {
  if (!diagnostic) return diagnosticConditionnel(type)
    ? { etat: "a_confirmer", libelle: "Obligation à confirmer", ton: "neutre" } as const
    : attendu ? { etat: "a_ajouter", libelle: "À ajouter", ton: "attente" } as const
    : { etat: "facultatif", libelle: "Facultatif", ton: "neutre" } as const;
  if (!diagnostic.document_id) return { etat: "a_joindre", libelle: "Fichier à joindre", ton: "attente" } as const;
  if (!jourValide(diagnostic.date_expiration)) return { etat: "disponible", libelle: "Validité à vérifier", ton: "neutre" } as const;
  const jours = (Date.parse(diagnostic.date_expiration) - Date.parse(jourAParis())) / 86_400_000;
  if (jours < 0) return { etat: "expire", libelle: "Expiré · à renouveler", ton: "attente" } as const;
  if (jours <= 90) return { etat: "expire_bientot", libelle: "Valide · expire bientôt", ton: "attente" } as const;
  return { etat: "valide", libelle: "Valide", ton: "ok" } as const;
}

export function bilanDiagnostics(attendus: string[], diagnostics: Diagnostic[]) {
  const types = [...new Set([...attendus, ...diagnostics.map(d => d.type)])];
  const parType = new Map(diagnostics.map(d => [d.type, d]));
  const lignes = types.map(type => ({ type, diagnostic: parType.get(type), ...presentationDiagnostic(type, parType.get(type), attendus.includes(type)) }));
  return {
    lignes,
    disponibles: lignes.filter(l => l.diagnostic?.document_id).length,
    aJour: lignes.filter(l => ["valide", "expire_bientot"].includes(l.etat)).length,
    aVerifier: lignes.filter(l => ["a_confirmer", "disponible"].includes(l.etat)).length,
    aAjouter: lignes.filter(l => ["a_ajouter", "a_joindre"].includes(l.etat)).length,
    aRenouveler: lignes.filter(l => l.etat === "expire").length,
    aConfirmer: lignes.filter(l => l.etat === "a_confirmer").length,
  };
}
