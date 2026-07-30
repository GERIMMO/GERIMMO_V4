// Référentiel partagé de la GED et des alertes (Sprint 1).
// Le type du document pilote droits, affichage et conservation (module 12).

export const TYPES_DOCUMENT: Record<string, string> = {
  piece_identite: "Pièce d'identité",
  justificatif: "Justificatif",
  attestation_assurance: "Attestation d'assurance",
  quittance: "Quittance",
  bail: "Bail",
  etat_des_lieux: "État des lieux",
  mandat: "Mandat de gestion",
  diagnostic: "Diagnostic",
  courrier: "Courrier",
  photo_incident: "Photo d'incident",
  rapport_gestion: "Rapport de gestion",
  autre: "Autre",
  document_test: "Document de test (purge immédiate)",
};

// Types proposés au dépôt en S1 — les autres arrivent avec leurs modules
// (le bail se dépose au S4, la quittance se génère au S5…)
export const TYPES_DEPOSABLES = [
  "piece_identite",
  "justificatif",
  "attestation_assurance",
  "courrier",
  "autre",
  "document_test",
] as const;

export const CRITICITES: Record<string, string> = {
  informative: "Informative",
  normale: "Normale",
  critique: "Critique",
};

// Tri d'affichage : critique → normale → informative (spécification pop-up S2)
export const ORDRE_CRITICITE: Record<string, number> = {
  critique: 0,
  normale: 1,
  informative: 2,
};

// Badges de criticité — uniquement des tokens du design system (marque blanche S14)
export const COULEURS_CRITICITE: Record<string, string> = {
  informative: "bg-muted text-muted-foreground",
  normale: "bg-warning-soft text-warning-soft-foreground",
  critique: "bg-destructive-soft text-destructive-soft-foreground",
};

export const ROLES_GERANTS = ["admin_agence", "agent", "proprietaire_direct"];

export function formaterDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formaterDateHeure(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
