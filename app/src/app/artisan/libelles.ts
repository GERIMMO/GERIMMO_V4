// Référentiel d'affichage du portail artisan (sprint 7, modules 8/9/10/11/19).
//
// Interface en français, identifiants en anglais : les clés sont les valeurs
// des énumérations de la base (artisan_metier, nature_travaux, …), les valeurs
// sont ce que l'artisan lit. Une seule source pour tous les écrans du portail —
// aucun écran n'affiche jamais « remplacement_equipement » brut.

export const METIERS: Record<string, string> = {
  plomberie: "Plomberie",
  chauffage: "Chauffage",
  electricite: "Électricité",
  menuiserie: "Menuiserie",
  serrurerie: "Serrurerie",
  nuisibles: "Nuisibles",
  autre: "Autre",
};

// L'ordre de l'énumération artisan_metier — l'écran d'inscription le suit.
export const LISTE_METIERS = [
  "plomberie",
  "chauffage",
  "electricite",
  "menuiserie",
  "serrurerie",
  "nuisibles",
  "autre",
] as const;

// Les cinq natures de RM-8.2.9. La décennale est exigée pour les quatre
// dernières ; la base le calcule (colonne decennale_requise), l'écran ne fait
// que le dire.
export const NATURES_TRAVAUX: Record<string, string> = {
  entretien_courant: "Entretien courant",
  remplacement_equipement: "Remplacement d'équipement",
  clos_et_couvert: "Clos et couvert",
  reseaux_encastres: "Réseaux encastrés",
  gros_oeuvre: "Gros œuvre",
};

export const PIECES_ARTISAN: Record<string, string> = {
  decennale: "Assurance décennale",
  rc_pro: "Responsabilité civile professionnelle",
  urssaf: "Attestation de vigilance URSSAF",
  kbis: "Extrait Kbis",
  certification: "Certification (Qualibat, RGE…)",
};

// Ce que chaque pièce engage — dit à l'artisan pourquoi on la lui demande.
// Seule la décennale bloque, et selon la NATURE des travaux (RM-8.2.9) : les
// autres pièces alertent sans jamais retirer des listes (module 8).
export const PORTEE_PIECES: Record<string, string> = {
  decennale:
    "Sans elle à jour, vous n'êtes plus proposé pour les travaux qui l'exigent : remplacement d'équipement, clos et couvert, réseaux encastrés, gros œuvre. L'entretien courant reste ouvert, et une intervention en cours n'est jamais interrompue.",
  rc_pro: "Demandée à l'inscription. Son expiration ne vous retire d'aucune liste.",
  urssaf: "Renouvelée tous les 6 mois. Son expiration ne vous retire d'aucune liste.",
  kbis: "Renouvelé tous les 3 mois. Son expiration ne vous retire d'aucune liste.",
  certification: "Facultative, et sans date de fin obligatoire.",
};

// L'ordre d'affichage : la décennale d'abord, c'est la seule qui bloque.
export const LISTE_PIECES = ["decennale", "rc_pro", "urssaf", "kbis", "certification"] as const;

export const STATUTS_MISSION: Record<string, string> = {
  proposee: "À accepter",
  acceptee: "Acceptée — à planifier",
  planifiee: "Rendez-vous fixé",
  en_cours: "En cours",
  terminee: "Terminée",
  refusee: "Refusée",
  annulee: "Annulée",
};

export const STATUTS_SOLLICITATION: Record<string, string> = {
  envoyee: "À chiffrer",
  declinee: "Déclinée",
  devis_depose: "Devis envoyé",
  retenue: "Devis retenu",
  non_retenue: "Devis non retenu",
  expiree: "Expirée",
  annulee: "Annulée",
};

export const IMPUTATIONS: Record<string, string> = {
  locataire: "Le locataire",
  proprietaire: "Le propriétaire",
  degradation_fautive: "Une dégradation fautive",
};

export const MOMENTS_PHOTO: Record<string, string> = {
  avant: "Avant",
  pendant: "Pendant",
  apres: "Après",
};

export function libelle(table: Record<string, string>, cle: string | null | undefined): string {
  if (!cle) return "—";
  return table[cle] ?? cle;
}

// ── Formats ────────────────────────────────────────────────────────────────
// Plein soleil, gants, coup d'œil : les dates s'écrivent en toutes lettres
// courtes (« lun. 15 sept. »), jamais en 15/09 — deux chiffres se confondent.

export function jourCourt(iso: string | null | undefined): string {
  if (!iso) return "Date à fixer";
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function jourLong(iso: string | null | undefined): string {
  if (!iso) return "Date à fixer";
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function heure(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function creneauTexte(debut: string | null, fin: string | null): string {
  if (!debut) return "Rendez-vous à fixer";
  return fin ? `${jourCourt(debut)} · ${heure(debut)} – ${heure(fin)}` : `${jourCourt(debut)} · ${heure(debut)}`;
}

export function dateSimple(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function euros(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });
}

/**
 * Les initiales d'une agence — le repère visuel qui tient lieu de logo.
 *
 * RM-19.3.3 / RM-17.3.2 veulent LE LOGO DE L'AGENCE sur chaque intervention.
 * Constat du 2026-09-11 : les modules 17/18 ne sont pas construits, il
 * n'existe aucune table de charte et `organizations` n'a pas de colonne logo —
 * `mon_agenda_artisan` rend `organization_id` et `agence_nom`, rien de plus.
 * On pose donc le monogramme, comme /espaces le fait déjà pour les
 * organisations, et le vrai logo se branchera ici sans toucher au reste :
 * l'identifiant de l'agence est déjà là.
 */
export function initialesAgence(nom: string | null | undefined): string {
  if (!nom) return "··";
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => m[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Seuils d'échéance de RM-8.2.5 (J-60 / J-30 / J-7 / J+0), traduits en un
 * degré d'urgence pour l'écran. `jours` vient de la base
 * (mes_pieces_artisan.jours_avant_echeance) : on ne recalcule pas une date
 * d'expiration côté client, on lit celle qui fait foi.
 */
export type DegreEcheance = "expiree" | "critique" | "proche" | "a_venir" | "ok" | "sans_date";

export function degreEcheance(jours: number | null, expiree: boolean): DegreEcheance {
  if (expiree) return "expiree";
  if (jours === null || jours === undefined) return "sans_date";
  if (jours <= 7) return "critique";
  if (jours <= 30) return "proche";
  if (jours <= 60) return "a_venir";
  return "ok";
}

export function texteEcheance(jours: number | null, expiree: boolean): string {
  if (expiree) return "Expirée";
  if (jours === null || jours === undefined) return "Sans date de fin";
  if (jours === 0) return "Expire aujourd'hui";
  if (jours === 1) return "Expire demain";
  return `Expire dans ${jours} jours`;
}
