"use client";

import { useId } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { consignerMonRendezVousManque, type EtatArtisanAction } from "@/app/actions/artisan";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { CLASSE_AIDE, CLASSE_BOUTON_SECONDAIRE, CLASSE_CHAMP, CLASSE_LIBELLE, Erreur, Succes } from "../../ui";

/**
 * P2-04 (audit palier 1, 22/11/2026 ; référentiel RM-10.5.3) : le rendez-vous confirmé est passé et le locataire
 * n'était pas là. L'artisan le consigne ; le rendez-vous tombe, le client est prévenu, de nouvelles dates sont à
 * proposer. L'artisan ne peut consigner QUE l'absence du locataire, et seulement après l'heure du rendez-vous : la
 * base tient les deux règles.
 */
export function FormulaireRendezVousManque({ interventionId }: { interventionId: string }) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    consignerMonRendezVousManque.bind(null, interventionId),
    {}
  );
  const idNote = useId();
  if (etat.succes) return <Succes>{etat.succes}</Succes>;
  return (
    <form data-saisie-confirmee action={action} className="space-y-3" data-rdv-manque-artisan>
      <label className="flex min-h-11 items-start gap-3 text-base text-[var(--corps)]">
        <input type="checkbox" name="confirmation" value="oui" required className="mt-1 size-5 shrink-0" />
        <span>J’étais sur place à l’heure du rendez-vous et le locataire était absent.</span>
      </label>
      <label htmlFor={idNote} className="block space-y-1.5">
        <span className={CLASSE_LIBELLE}>Précision pour votre client (facultative)</span>
        <input id={idNote} name="note" maxLength={500} className={CLASSE_CHAMP} placeholder="Ex. : personne à l’interphone, attendu 20 minutes." />
      </label>
      {etat.erreur && <Erreur>{etat.erreur}</Erreur>}
      <BoutonEnvoi className={CLASSE_BOUTON_SECONDAIRE} enCoursTexte="Enregistrement…">
        Consigner l’absence du locataire
      </BoutonEnvoi>
      <p className={CLASSE_AIDE}>
        Le rendez-vous tombe et votre client est prévenu. L’absence reste au dossier de l’intervention ; le locataire
        la lit dans sa demande. Vous proposerez ensuite de nouvelles dates.
      </p>
    </form>
  );
}
