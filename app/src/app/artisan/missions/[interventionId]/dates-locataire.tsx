"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  accepterDateLocataire,
  refuserDatesLocataire,
  type EtatArtisanAction,
} from "@/app/actions/artisan";
import { creneauTexte } from "../../libelles";
import {
  CLASSE_BOUTON_PRINCIPAL,
  CLASSE_BOUTON_REFUS,
  CLASSE_BOUTON_SOBRE,
  CLASSE_LIBELLE,
  CLASSE_ZONE_TEXTE,
  Erreur,
  Succes,
} from "../../ui";

/**
 * Les dates que le locataire propose en retour (audit du 27/09).
 *
 * Wiki, Planification d'intervention (A5) : « contre-proposé → confirmé ou
 * arbitrage (refus artisan) ». Chaque date se confirme d'un bouton ; le refus
 * de toutes demande un motif, parce qu'il part chez le gérant qui réglera le
 * rendez-vous au téléphone (RM-10.4.1).
 */
function Bouton({
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

function RetenirDate({
  interventionId,
  creneau,
}: {
  interventionId: string;
  creneau: { creneau_id: string; debut: string; fin: string };
}) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    accepterDateLocataire.bind(null, interventionId, creneau.creneau_id),
    {}
  );
  return (
    <li className="rounded-lg border-2 border-[var(--filet)] bg-[var(--ivoire)] p-3">
      <p className="text-base font-medium text-[var(--corps)]">
        {creneauTexte(creneau.debut, creneau.fin)}
      </p>
      <form action={action} className="mt-2">
        <Bouton className={CLASSE_BOUTON_PRINCIPAL} enCours="Confirmation…">
          Je retiens cette date
        </Bouton>
      </form>
      {etat.erreur && <div className="mt-2"><Erreur>{etat.erreur}</Erreur></div>}
      {etat.succes && <div className="mt-2"><Succes>{etat.succes}</Succes></div>}
    </li>
  );
}

export function DatesLocataire({
  interventionId,
  dates,
}: {
  interventionId: string;
  dates: { creneau_id: string; debut: string; fin: string }[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const idMotif = useId();
  const [etatRefus, actionRefus] = useActionState<EtatArtisanAction, FormData>(
    refuserDatesLocataire.bind(null, interventionId),
    {}
  );

  if (etatRefus.succes) return <Succes>{etatRefus.succes}</Succes>;

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {dates.map((d) => (
          <RetenirDate key={d.creneau_id} interventionId={interventionId} creneau={d} />
        ))}
      </ul>

      {!ouvert ? (
        <button type="button" className={CLASSE_BOUTON_SOBRE} onClick={() => setOuvert(true)}>
          Aucune de ces dates ne me convient
        </button>
      ) : (
        <form action={actionRefus} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor={idMotif} className={CLASSE_LIBELLE}>
              Pourquoi ?
            </label>
            <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
              Le gérant fixera le rendez-vous avec vous et le locataire, par
              téléphone : dites-lui vos disponibilités.
            </p>
            <textarea
              id={idMotif}
              name="motif"
              rows={3}
              required
              defaultValue={etatRefus.valeurs?.motif}
              className={CLASSE_ZONE_TEXTE}
            />
          </div>
          {etatRefus.erreur && <Erreur>{etatRefus.erreur}</Erreur>}
          <Bouton className={CLASSE_BOUTON_REFUS} enCours="Envoi…">
            Refuser ces dates
          </Bouton>
          <button type="button" className={CLASSE_BOUTON_SOBRE} onClick={() => setOuvert(false)}>
            Revenir
          </button>
        </form>
      )}
    </div>
  );
}
