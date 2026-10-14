import type { SupabaseClient } from "@supabase/supabase-js";

export const SOURCES_DIRECTION = {
  incidents: "Incidents urgents",
  interventions: "Retards d’intervention",
  loyers: "Échéances de loyers",
  echeances: "Alertes et échéances",
  service: "Passages du service",
} as const;
export type SourceDirection = keyof typeof SOURCES_DIRECTION;
// D13 (SUP-05, 14/10) : un fait ne copie jamais un titre d'alerte, qui contient parfois un nom de locataire. Une alerte se désigne
// par son identifiant (`id`), un libellé générique tiré de son type (`titre`) et un lien (`href`).
export type FaitDirection = { id?: string; titre: string; date: string | null; href: string };
export type SourceFactuelle = {
  statut: "disponible" | "indisponible";
  observe_le: string | null;
  donnees: { mesures: Record<string, number>; faits: FaitDirection[] } | null;
};
export type FaitsDirection = {
  id: string; jour: string; genere_le: string; version_regles: number;
  sources: Record<SourceDirection, SourceFactuelle>; indisponibles: string[];
};

/** Un résultat inconnu ou incomplet n'est jamais converti en compteurs nuls. */
export function lireSnapshotDirection(value: unknown): FaitsDirection | null {
  if (!value || typeof value !== "object") return null;
  const v = value as FaitsDirection;
  if (typeof v.id !== "string" || typeof v.jour !== "string" || typeof v.genere_le !== "string" || !v.sources || !Array.isArray(v.indisponibles)) return null;
  for (const cle of Object.keys(SOURCES_DIRECTION) as SourceDirection[]) {
    const s = v.sources[cle];
    if (!s || !["disponible", "indisponible"].includes(s.statut)) return null;
    if (s.statut === "disponible" && (!s.donnees || !s.observe_le)) return null;
    if (s.donnees && (!s.donnees.mesures || !Array.isArray(s.donnees.faits) || Object.values(s.donnees.mesures).some(n => typeof n !== "number" || !Number.isFinite(n)))) return null;
  }
  return v;
}

export async function chargerFaitsDirection(db: Pick<SupabaseClient, "rpc">, jour: string) {
  try {
    const { data, error } = await db.rpc("lire_faits_direction", { p_jour: jour });
    const snapshot = lireSnapshotDirection(data);
    return { snapshot, erreur: Boolean(error || (data && !snapshot)) };
  } catch { return { snapshot: null, erreur: true }; }
}

/** La préparation est manuelle. Un échec conserve les anciens points/décisions. */
export async function preparerFaitsDirection(db: Pick<SupabaseClient, "rpc">) {
  try {
    const { data, error } = await db.rpc("preparer_faits_direction");
    const snapshot = lireSnapshotDirection(data);
    if (error || !snapshot) return { erreur: "Les faits de direction n’ont pas pu être préparés. Le dernier point connu et ses décisions sont conservés." };
    if (snapshot.indisponibles.length) return { snapshot, erreur: "Certaines sources sont indisponibles : leurs derniers faits datés restent affichés. Le point des équipes et ses décisions n’ont pas été remplacés." };
    return { snapshot };
  } catch { return { erreur: "Les faits de direction sont indisponibles. Le dernier point connu et ses décisions sont conservés." }; }
}

export const LIBELLES_MESURES: Record<string, string> = {
  urgents_ouverts: "Incidents urgents ouverts",
  rendez_vous_depasses: "Rendez-vous dépassés, mission non terminée",
  missions_sans_date: "Missions acceptées sans date de fin prévue",
  echeances_en_retard: "Échéances en retard",
  reste_en_retard_eur: "Reste à recevoir sur ces retards",
  echeances_prochains_7_jours: "Échéances appelées dans les sept prochains jours",
  reste_prochains_7_jours_eur: "Reste attendu sur ces échéances",
  alertes_en_retard: "Alertes ouvertes échues",
  alertes_prochains_7_jours: "Alertes à échéance dans les sept jours",
  alertes_critiques: "Alertes critiques ouvertes",
  passages_24h: "Passages dans les dernières 24 heures",
  passages_en_echec_24h: "Passages interrompus ou à vérifier",
};
