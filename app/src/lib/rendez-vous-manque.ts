// RENDEZ-VOUS MANQUÉ, CÔTÉ LOCATAIRE (audit palier 1 du 22/11/2026, P2-04 ; référentiel RM-10.5.3).
//
// Un rendez-vous confirmé n'a pas eu lieu ; l'artisan ou le gestionnaire a consigné QUI était absent. Le locataire
// le lit dans « Mes demandes » : la date, qui est dit absent, et quoi faire s'il n'est pas d'accord. Il ne lit jamais
// la précision libre de celui qui a consigné (`mes_rdv_manques_locataire` ne la rend pas).

export type RendezVousManqueLocataire = {
  incident_id: string;
  intervention_id: string;
  rdv_debut: string;
  absent: "locataire" | "artisan";
  consigne_role: "artisan" | "gestionnaire";
  consigne_le: string;
};

/** Ce qu'il faut du suivi pour savoir si l'avis a encore lieu d'être. */
type SuiviMinimal = { incident_id: string; intervention_id: string | null; rdv_debut: string | null; terminee_le: string | null };

/**
 * Les avis à afficher : le DERNIER rendez-vous manqué de chaque intervention, tant qu'aucun nouveau rendez-vous n'est
 * fixé et que l'intervention n'est pas terminée. Ensuite l'avis disparaît de l'écran ; l'absence, elle, reste
 * consignée au dossier.
 */
export function rendezVousManquesAffiches(lignes: RendezVousManqueLocataire[], suivis: SuiviMinimal[]): RendezVousManqueLocataire[] {
  const dernier = new Map<string, RendezVousManqueLocataire>();
  for (const l of lignes) {
    const connu = dernier.get(l.intervention_id);
    if (!connu || new Date(l.rdv_debut).getTime() > new Date(connu.rdv_debut).getTime()) dernier.set(l.intervention_id, l);
  }
  return [...dernier.values()].filter((l) => {
    const suivi = suivis.find((s) => s.intervention_id === l.intervention_id);
    return Boolean(suivi) && !suivi!.rdv_debut && !suivi!.terminee_le;
  });
}

/** La phrase lue par le locataire : qui est dit absent, par qui, et la suite. */
export function phraseRendezVousManque(m: Pick<RendezVousManqueLocataire, "absent" | "consigne_role">): string {
  if (m.absent === "artisan") {
    return "Votre propriétaire a consigné que l’artisan ne s’est pas présenté. Un nouveau rendez-vous va être convenu.";
  }
  const qui = m.consigne_role === "artisan" ? "L’artisan a indiqué" : "Votre propriétaire a consigné";
  return `${qui} que vous étiez absent. Un nouveau rendez-vous va être convenu. Si vous étiez présent, écrivez-le dans la discussion de l’intervention, plus bas dans cette page.`;
}
