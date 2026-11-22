"use client";

import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { relancerMaFacture, type EtatArtisanAction } from "@/app/actions/artisan";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { CLASSE_AIDE, CLASSE_BOUTON_SECONDAIRE, Erreur, Succes } from "../../ui";

/**
 * P2-04 (audit palier 1, 22/11/2026) : relancer son client pour une facture déposée et pas réglée. La relance
 * s'affiche chez le client, sur le dossier de l'intervention ; aucun e-mail ne part. Les délais (30 jours après le
 * dépôt, 15 jours entre deux relances) sont tenus par la base.
 */
export function RelanceFacture({ factureId, interventionId, numero }: { factureId: string; interventionId: string; numero: string }) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    relancerMaFacture.bind(null, factureId, interventionId),
    {}
  );
  if (etat.succes) return <Succes>{etat.succes}</Succes>;
  return (
    <form data-saisie-confirmee action={action} className="space-y-2" data-relance-facture>
      {etat.erreur && <Erreur>{etat.erreur}</Erreur>}
      <BoutonEnvoi className={CLASSE_BOUTON_SECONDAIRE} enCoursTexte="Envoi de la relance…">
        Relancer mon client pour la facture n° {numero}
      </BoutonEnvoi>
      <p className={CLASSE_AIDE}>
        Votre client voit la relance dans son espace, sur le dossier de l’intervention. Aucun e-mail n’est envoyé.
      </p>
    </form>
  );
}
