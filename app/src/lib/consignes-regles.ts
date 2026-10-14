/**
 * « Approbation » ou « activation » d'une consigne (audit du 13/10, SUP-04, décision D10, option C).
 *
 * Le constat : le même superviseur pouvait rédiger une consigne, se désigner responsable et l'approuver.
 * L'« approbation » n'était donc pas une double vérification humaine. La décision du dirigeant :
 *
 * - TANT QU'une consigne ne peut que LIRE deux compteurs (l'état d'une mission, le nombre de passages),
 *   on dit la vérité à l'écran : ce n'est pas une approbation, c'est une ACTIVATION, et son rédacteur
 *   peut la faire (un seul superviseur permanent rendrait l'approbateur distinct impraticable) ;
 * - DÈS QU'une consigne peut envoyer quelque chose ou toucher un droit, un approbateur DISTINCT du
 *   rédacteur est exigé, par la base (decider_consigne, migration 20261014222000) et par l'écran.
 *
 * Ce que peut faire une consigne aujourd'hui (code lu le 14/10) : `supervision_consignes_taches.type` est
 * limité par contrainte à `lecture_passages` et `lecture_missions`, `enregistrer_consigne` refuse tout autre
 * type, et `executer_tache_consigne` ne fait que compter des passages ou lire l'état d'une mission, puis
 * conserver le résultat. Le texte de la consigne n'est jamais exécuté. Aucun envoi, aucun droit.
 *
 * Cette liste est le miroir de `public.tache_consigne_lecture_seule()`. Un type de tâche NON listé est
 * traité comme pouvant agir : l'approbateur distinct s'applique alors tout seul, sans rien d'autre à faire.
 */
export const TACHES_LECTURE_SEULE: readonly string[] = ["lecture_passages", "lecture_missions"];

/** Vrai si cette tâche ne fait que lire un compteur interne. Tout type inconnu est supposé pouvoir agir. */
export function estTacheLectureSeule(type: string): boolean {
  return TACHES_LECTURE_SEULE.includes(type);
}

/** Vrai dès qu'une des tâches peut envoyer ou toucher un droit : l'approbation doit venir d'un autre que le rédacteur. */
export function exigeApprobateurDistinct(types: readonly string[]): boolean {
  return types.some((type) => !estTacheLectureSeule(type));
}

export type DecisionConsigne = {
  /** Un approbateur distinct du rédacteur est exigé. */
  distincte: boolean;
  /** Le bouton : « Activer » (lecture seule) ou « Approuver ». */
  verbe: "Activer" | "Approuver";
  /** L'état d'une version décidée : « activée » ou « approuvée ». */
  participe: "activée" | "approuvée";
  /** L'état d'une version qui attend sa décision. */
  attente: string;
};

/** Les mots de l'écran pour une version, selon ce que ses tâches peuvent faire. */
export function decisionConsigne(types: readonly string[]): DecisionConsigne {
  if (exigeApprobateurDistinct(types)) {
    return {
      distincte: true,
      verbe: "Approuver",
      participe: "approuvée",
      attente: "Une autre personne que le rédacteur doit approuver cette version",
    };
  }
  return { distincte: false, verbe: "Activer", participe: "activée", attente: "Cette version attend son activation" };
}
