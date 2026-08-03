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
// Charte 04 — badges de statut : texte coloré, sans pastille ni fond.
export const COULEURS_CRITICITE: Record<string, string> = {
  informative: "text-muted-foreground",
  normale: "text-warning-soft-foreground",
  critique: "text-destructive",
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

// Un montant en euros, à la française : espace insécable avant le symbole,
// virgule décimale, deux décimales toujours. Douze fichiers en avaient chacun
// leur copie ; une seule suffit.
export function eur(montant: number | string | null | undefined): string {
  if (montant === null || montant === undefined || montant === "") return "—";
  return `${Number(montant).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

// Un mois comptable arrive en « 2026-06 » ou « 2026-06-01 » selon la table.
// Affiché tel quel, c'est une référence technique ; dit en français, c'est une
// date que l'agent lit sans réfléchir.
export function moisEnFrancais(mois: string | null | undefined): string {
  if (!mois) return "—";
  const [a, m] = mois.slice(0, 7).split("-").map(Number);
  if (!a || !m) return mois;
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
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
