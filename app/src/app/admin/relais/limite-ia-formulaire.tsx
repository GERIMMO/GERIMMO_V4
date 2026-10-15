'use client';
import { useActionStateProtegee as useActionState } from '@/lib/use-action-state-protegee';
import { BoutonEnvoi } from '@/components/ui/bouton-envoi';
import { reglerPlafondIA } from '@/app/actions/plafond-ia';
import { MessageSupervision } from '../consignes/formulaires';

/** X19 (SA-10) : la limite quotidienne des appels payants à l'IA, réglée par le superviseur permanent. */
export function FormulaireLimiteIA({ plafond }: { plafond: number | null }) {
  const [etat, action] = useActionState(reglerPlafondIA, {});
  return (
    <form data-saisie-confirmee action={action} className="space-y-3">
      <label className="block">
        Limite quotidienne, en nombre d’appels
        <input name="plafond" type="text" inputMode="numeric" required pattern="[0-9]{1,4}" maxLength={4} defaultValue={plafond ?? ''} className="champ mt-1 block w-full sm:w-40" />
      </label>
      <BoutonEnvoi variant="outline" enCoursTexte="Enregistrement…">Enregistrer la limite</BoutonEnvoi>
      <MessageSupervision etat={etat} />
    </form>
  );
}
