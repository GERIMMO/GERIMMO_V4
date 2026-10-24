"use client";

import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { gelerConservationBail, type EtatGelConservation } from "@/app/actions/conservation-bail";

/** Poser, renouveler ou lever le gel de la suppression des pièces d'un bail (litige en cours). */
export function FormulaireGelConservation({ orgId, bailId, base, minimum, maximum, gelEnCours }: {
  orgId: string;
  bailId: string;
  base: string;
  /** Le lendemain, au jour de Paris (AAAA-MM-JJ). */
  minimum: string;
  /** Douze mois plus tard, au jour de Paris (AAAA-MM-JJ). */
  maximum: string;
  gelEnCours: boolean;
}) {
  const [etat, action, enCours] = useActionState<EtatGelConservation, FormData>(gelerConservationBail, {});
  const [etatLevee, lever, leveeEnCours] = useActionState<EtatGelConservation, FormData>(gelerConservationBail, {});
  return (
    <div className="space-y-4">
      <form data-saisie-confirmee action={action} className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="bailId" value={bailId} />
        <input type="hidden" name="base" value={base} />
        <input type="hidden" name="geste" value="geler" />
        <label className="text-sm">
          Suspendre jusqu&apos;au
          <input className="champ w-full" type="date" name="jusqu_au" required min={minimum} max={maximum} defaultValue={maximum} />
        </label>
        <label className="text-sm">
          Litige en cours
          <input className="champ w-full" name="motif" required minLength={5} maxLength={500} placeholder="Par exemple : contestation du dépôt de garantie" />
        </label>
        <div className="sm:col-span-2">
          <BoutonEnvoi enCours={enCours} enCoursTexte="Enregistrement…">
            {gelEnCours ? "Renouveler le gel" : "Suspendre la suppression"}
          </BoutonEnvoi>
        </div>
        {etat.erreur && <p role="alert" className="err sm:col-span-2">{etat.erreur}</p>}
        {etat.succes && <p role="status" className="text-sm sm:col-span-2">{etat.succes}</p>}
      </form>
      {gelEnCours && (
        <form data-saisie-confirmee action={lever}>
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="bailId" value={bailId} />
          <input type="hidden" name="base" value={base} />
          <input type="hidden" name="geste" value="lever" />
          <BoutonEnvoi variant="outline" enCours={leveeEnCours} enCoursTexte="Levée…">Lever le gel</BoutonEnvoi>
          {etatLevee.erreur && <p role="alert" className="err mt-2">{etatLevee.erreur}</p>}
          {etatLevee.succes && <p role="status" className="mt-2 text-sm">{etatLevee.succes}</p>}
        </form>
      )}
    </div>
  );
}
