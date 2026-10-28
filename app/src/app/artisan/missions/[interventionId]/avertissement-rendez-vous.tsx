import { avantRendezVous, phraseAvantLeGeste, type GesteAnticipe } from "@/lib/rendez-vous-anticipe";
import { creneauTexte } from "../../libelles";
import { Avertissement } from "../../ui";

/**
 * L'avertissement NON BLOQUANT de l'artisan qui s'apprête à démarrer, à rendre compte ou à facturer plus de deux
 * heures avant le rendez-vous confirmé avec le locataire (audit du 13/10/2026, ART-21, décision D20, option B).
 *
 * Il ne change rien au geste : le bouton reste là, l'arrivée anticipée et l'urgence sont légitimes. Il dit le
 * rendez-vous, et que l'écart sera inscrit au dossier de l'incident (la base l'écrit : voir la migration
 * 20261014301000). Sans rendez-vous confirmé, ou à moins de deux heures, il ne s'affiche pas.
 */
export function AvertissementRendezVousAnticipe({
  debutPrevu,
  finPrevue,
  geste,
}: {
  debutPrevu: string | null;
  finPrevue: string | null;
  geste: GesteAnticipe;
}) {
  if (!avantRendezVous(debutPrevu)) return null;
  return (
    <Avertissement>
      Rendez-vous confirmé avec le locataire&nbsp;: {creneauTexte(debutPrevu, finPrevue)}. {phraseAvantLeGeste(geste)}
    </Avertissement>
  );
}
