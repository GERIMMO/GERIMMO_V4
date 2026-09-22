import type { PasseConsignee } from "@/lib/tache";

const CLES_PAR_TACHE: Record<string, string[]> = {
  quittances: ["envoyees"],
  appels: ["envoyes"],
  relances: ["envoyees"],
  rappels: ["rappeles"],
  signatures: ["traites"],
  abonnements: ["relances", "alignees", "resiliees", "avoirs_portes"],
};

export type MesureAutomatisation = {
  actionsAutomatiques: number;
  interventionsHumaines: number;
  taux: number | null;
  clicsEvites: number;
  messagesEnvoyes: number;
  dossiersSansAppel: number;
};

/**
 * Mesure les résultats réellement consignés par les tâches. Un résultat
 * automatique équivaut à trois gestes manuels évités : ouvrir le dossier,
 * lancer l'action, puis vérifier son résultat. Cette convention est affichée
 * dans l'interface et pourra être affinée par parcours.
 */
export function mesurerAutomatisation(
  passages: PasseConsignee[],
  interventionsHumaines: number,
  messagesHumains: number,
  dossiersSansAppel: number
): MesureAutomatisation {
  let actionsAutomatiques = 0;
  let messagesAutomatiques = 0;

  for (const passage of passages) {
    const nom = passage.evenement.replace(/^tache_/, "");
    const bilan = passage.details && typeof passage.details === "object"
      ? passage.details as Record<string, unknown>
      : {};
    for (const cle of CLES_PAR_TACHE[nom] ?? []) {
      const valeur = bilan[cle];
      if (typeof valeur === "number" && valeur > 0) actionsAutomatiques += valeur;
    }
    if (nom === "marketing" && bilan.agi === true) actionsAutomatiques += 1;
    if (["quittances", "appels", "relances", "rappels"].includes(nom)) {
      messagesAutomatiques += (CLES_PAR_TACHE[nom] ?? []).reduce((total, cle) => {
        const valeur = bilan[cle];
        return total + (typeof valeur === "number" && valeur > 0 ? valeur : 0);
      }, 0);
    }
    if (nom === "marketing" && bilan.facebook === true) messagesAutomatiques += 1;
  }

  const total = actionsAutomatiques + interventionsHumaines;
  return {
    actionsAutomatiques,
    interventionsHumaines,
    taux: total === 0 ? null : Math.round((actionsAutomatiques / total) * 100),
    clicsEvites: actionsAutomatiques * 3,
    messagesEnvoyes: messagesAutomatiques + messagesHumains,
    dossiersSansAppel,
  };
}

