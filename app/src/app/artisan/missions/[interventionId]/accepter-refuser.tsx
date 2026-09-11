"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  accepterMaMission,
  refuserMaMission,
  type EtatArtisanAction,
} from "@/app/actions/artisan";
import {
  CLASSE_BOUTON_PRINCIPAL,
  CLASSE_BOUTON_REFUS,
  CLASSE_BOUTON_SOBRE,
  CLASSE_LIBELLE,
  CLASSE_ZONE_TEXTE,
  Erreur,
} from "../../ui";

/**
 * Accepter ou refuser (7.4).
 *
 * Deux gestes de poids très différents, et l'écran le dit : accepter tient en
 * un bouton, refuser en demande deux — parce que le REFUS ENTRAÎNE UNE
 * RÉAFFECTATION. L'incident repart dans la file de l'agence, le devis retenu
 * tombe, les créneaux deviennent caducs. Le motif n'est donc pas une
 * politesse : c'est ce qui permet à l'agence de réaffecter sans refaire le
 * même choix. La base le refuse vide ; l'écran l'explique avant.
 */
function BoutonAction({
  className,
  enCours,
  children,
}: {
  className: string;
  enCours: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? enCours : children}
    </button>
  );
}

export function AccepterOuRefuser({ interventionId }: { interventionId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const idMotif = useId();

  const [etatAccepter, actionAccepter] = useActionState<EtatArtisanAction, FormData>(
    accepterMaMission.bind(null, interventionId),
    {}
  );
  const [etatRefuser, actionRefuser] = useActionState<EtatArtisanAction, FormData>(
    refuserMaMission.bind(null, interventionId),
    {}
  );

  return (
    <div className="space-y-3">
      {etatAccepter.erreur && <Erreur>{etatAccepter.erreur}</Erreur>}

      <form action={actionAccepter}>
        <BoutonAction className={CLASSE_BOUTON_PRINCIPAL} enCours="Acceptation…">
          Accepter la mission
        </BoutonAction>
      </form>

      {!ouvert ? (
        <button
          type="button"
          className={CLASSE_BOUTON_SOBRE}
          onClick={() => setOuvert(true)}
        >
          Je ne peux pas la prendre
        </button>
      ) : (
        <form action={actionRefuser} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor={idMotif} className={CLASSE_LIBELLE}>
              Pourquoi refusez-vous ?
            </label>
            <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
              L&apos;agence doit confier la mission à quelqu&apos;un d&apos;autre : dites-lui
              ce qui vous en empêche (délai, hors de votre zone, hors de votre
              métier…).
            </p>
            <textarea
              id={idMotif}
              name="motif"
              rows={3}
              required
              defaultValue={etatRefuser.valeurs?.motif}
              className={CLASSE_ZONE_TEXTE}
            />
          </div>
          {etatRefuser.erreur && <Erreur>{etatRefuser.erreur}</Erreur>}
          <BoutonAction className={CLASSE_BOUTON_REFUS} enCours="Envoi du refus…">
            Refuser la mission
          </BoutonAction>
          <button
            type="button"
            className={CLASSE_BOUTON_SOBRE}
            onClick={() => setOuvert(false)}
          >
            Revenir
          </button>
        </form>
      )}
    </div>
  );
}
