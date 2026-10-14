import { MISSIONS, estMission } from "@/lib/missions";

/** Le nom, en français, de ce qu'un arrêt d'urgence suspend. */
export function nomArret(cle: string): string {
  // D06 : la clé « purge » arrête aussi la rétention quotidienne de la base (suppressions de lignes), pas seulement les fichiers.
  if (cle === "purge") return "Purge des données échues et suppression des fichiers";
  if (estMission(cle)) return MISSIONS[cle].nom;
  return ({ global: "Tous les traitements contrôlés", consignes: "Lectures de consignes", orchestrateur: "Suivi des dossiers", sauvegarde: "Sauvegarde" } as Record<string, string>)[cle] ?? "Traitement contrôlé";
}

/**
 * Les clés d'arrêt qu'aucun traitement ne lit (D46, IA-06 / SUP-07). La clé « sauvegarde » est acceptée par la base,
 * mais ni le chantier de sauvegarde ni ses programmes ne la consultent : l'enregistrer ne suspendrait rien.
 * Elle n'est plus proposée à l'écran ; une ligne déjà enregistrée reste visible, marquée, pour pouvoir être levée.
 */
export const ARRETS_SANS_EFFET: ReadonlySet<string> = new Set(["sauvegarde"]);
export function arretSansEffet(cle: string): boolean {
  return ARRETS_SANS_EFFET.has(cle);
}

/**
 * Les tâches de la base de données (pg_cron) qu'arrête chaque clé, en plus de l'arrêt « global » qui les arrête toutes
 * (D06). Miroir de la table `supervision_taches_arret` (migration 20261014200000) : un test compare les deux.
 */
export const TACHES_SQL: Record<string, { libelle: string; cles: readonly string[] }> = {
  "retention-quotidienne": { libelle: "Purge quotidienne des données dont la durée de conservation est échue", cles: ["purge"] },
  "cycle-mensuel": { libelle: "Cycle mensuel : appels de loyer et quittances du mois", cles: ["appels", "quittances"] },
  "alertes-impayes-quotidiennes": { libelle: "Alertes d’impayés", cles: ["relances"] },
  "alertes-diagnostics-quotidiennes": { libelle: "Alertes d’expiration des diagnostics", cles: ["rappels"] },
  "alertes-assurance-quotidiennes": { libelle: "Alertes d’expiration des assurances", cles: ["rappels"] },
  "alertes-restitutions-quotidiennes": { libelle: "Alertes de restitution du dépôt de garantie", cles: ["rappels"] },
  "propositions-publication-hebdo": { libelle: "Propositions hebdomadaires de publication", cles: ["marketing"] },
  "marketing-declencheur": { libelle: "Déclenchement des publications programmées", cles: ["marketing"] },
};

/** Les libellés des tâches de la base de données qu'arrête cette clé (« global » : toutes). */
export function tachesSqlArretees(cle: string): string[] {
  return Object.values(TACHES_SQL)
    .filter((t) => cle === "global" || t.cles.includes(cle))
    .map((t) => t.libelle);
}
