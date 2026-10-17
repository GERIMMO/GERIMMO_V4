'use client';
import { useActionStateProtegee as useActionState } from '@/lib/use-action-state-protegee';
import { accuserAnnulationRdv } from '@/app/actions/rendez-vous-artisan';
import { BoutonEnvoi } from '@/components/ui/bouton-envoi';
import { CLASSE_BOUTON_SOBRE } from '../../ui';

/** Information seulement : les créneaux peuvent être proposés sans cliquer ici. */
export function AccuseAnnulation({demandeId,interventionId,vueLe}:{demandeId:string;interventionId:string;vueLe:string|null}) {
  const [etat,action]=useActionState(accuserAnnulationRdv.bind(null,demandeId,interventionId),{});
  if (vueLe || etat.succes) return <p className="mt-3">Vous avez pris acte de l’annulation.</p>;
  return <form data-saisie-confirmee action={action} className="mt-3 space-y-2">
    <BoutonEnvoi className={CLASSE_BOUTON_SOBRE} enCoursTexte="Enregistrement…">J’en prends acte</BoutonEnvoi>
    {etat.erreur && <p role="alert">{etat.erreur}</p>}
  </form>;
}
