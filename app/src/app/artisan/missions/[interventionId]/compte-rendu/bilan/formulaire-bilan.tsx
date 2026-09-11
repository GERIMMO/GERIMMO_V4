"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  deposerMonCompteRendu,
  type EtatArtisanAction,
} from "@/app/actions/artisan";
import { IMPUTATIONS } from "../../../../libelles";
import {
  Carte,
  CLASSE_BOUTON_PRINCIPAL,
  CLASSE_CHAMP,
  CLASSE_LIBELLE,
  CLASSE_ZONE_TEXTE,
  Erreur,
  TitreSection,
} from "../../../../ui";

/**
 * COMPTE RENDU — ÉCRAN 2 SUR 2 : le bilan.
 *
 * Quatre champs, dont un seul obligatoire. C'est délibéré : le compte rendu
 * conditionne la facturation, et un formulaire pénible est un compte rendu
 * qu'on remet à demain — « la condition pour qu'il joue le jeu » (module 19).
 *
 * RM-7.5.3 — L'ARTISAN SIGNALE, L'AGENT RÉVISE. Il est le seul à voir la cause
 * réelle en ouvrant le mur ; mais il ne requalifie pas l'incident, et l'écran
 * ne lui laisse pas croire le contraire : on lui demande CE QU'IL A CONSTATÉ,
 * et le choix de cause s'annonce comme une suggestion. Une suggestion qui
 * diffère de l'imputation posée ouvre, côté agence, une alerte de révision
 * avant facturation. C'est l'agent qui tranche, avec justification.
 */

function Envoyer() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={CLASSE_BOUTON_PRINCIPAL} disabled={pending}>
      {pending ? "Envoi du compte rendu…" : "Terminer l'intervention"}
    </button>
  );
}

export function FormulaireBilan({
  interventionId,
  montantDevisCents,
}: {
  interventionId: string;
  montantDevisCents: number | null;
}) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    deposerMonCompteRendu.bind(null, interventionId),
    {}
  );
  const [autreCause, setAutreCause] = useState(false);
  const idTravaux = useId();
  const idMontant = useId();
  const idCause = useId();
  const idImputation = useId();
  const idNouvelle = useId();

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor={idTravaux} className={CLASSE_LIBELLE}>
          Ce que vous avez fait
        </label>
        <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
          Une ou deux phrases suffisent. C&apos;est ce que lira l&apos;agence avant de
          facturer.
        </p>
        <textarea
          id={idTravaux}
          name="travaux"
          rows={4}
          required
          defaultValue={etat.valeurs?.travaux}
          className={CLASSE_ZONE_TEXTE}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={idMontant} className={CLASSE_LIBELLE}>
          Montant final TTC{" "}
          <span className="font-normal text-[var(--texte-secondaire)]">(facultatif)</span>
        </label>
        <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
          {montantDevisCents !== null
            ? "À renseigner seulement s'il diffère du devis retenu. Un écart n'empêche rien : l'agence l'arbitre."
            : "Si vous connaissez déjà le montant de votre facture."}
        </p>
        <input
          id={idMontant}
          name="montant_final"
          type="text"
          inputMode="decimal"
          defaultValue={etat.valeurs?.montant_final}
          className={CLASSE_CHAMP}
        />
      </div>

      <Carte className="border-l-4 border-l-[var(--or)]">
        <TitreSection>Avez-vous trouvé autre chose que prévu ?</TitreSection>
        <p className="text-[0.9375rem] text-[var(--corps)]">
          Vous êtes le seul à avoir vu la cause réelle. Si elle ne correspond pas
          à ce qu&apos;on vous avait décrit, dites-le : l&apos;agence révisera qui paie
          avant de facturer. Vous signalez — c&apos;est elle qui tranche.
        </p>

        <label className="mt-3 flex min-h-12 items-center gap-3 text-base text-[var(--corps)]">
          <input
            type="checkbox"
            checked={autreCause}
            onChange={(e) => setAutreCause(e.target.checked)}
            className="size-6 shrink-0 accent-[var(--encre)]"
          />
          Oui, j&apos;ai constaté autre chose
        </label>

        {autreCause && (
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor={idCause} className={CLASSE_LIBELLE}>
                Ce que vous avez constaté
              </label>
              <textarea
                id={idCause}
                name="cause_reelle"
                rows={3}
                defaultValue={etat.valeurs?.cause_reelle}
                className={CLASSE_ZONE_TEXTE}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={idImputation} className={CLASSE_LIBELLE}>
                Selon vous, qui devrait payer ?
              </label>
              <select
                id={idImputation}
                name="imputation_suggeree"
                defaultValue={etat.valeurs?.imputation_suggeree ?? ""}
                className={CLASSE_CHAMP}
              >
                <option value="">Je ne me prononce pas</option>
                {Object.entries(IMPUTATIONS).map(([cle, texte]) => (
                  <option key={cle} value={cle}>
                    {texte}
                  </option>
                ))}
              </select>
              <p className="text-[0.8125rem] text-[var(--texte-secondaire)]">
                Une suggestion, jamais une décision.
              </p>
            </div>
          </div>
        )}
      </Carte>

      <label
        htmlFor={idNouvelle}
        className="flex min-h-12 items-center gap-3 text-base text-[var(--corps)]"
      >
        <input
          id={idNouvelle}
          type="checkbox"
          name="nouvelle_intervention"
          value="oui"
          defaultChecked={etat.valeurs?.nouvelle_intervention === "oui"}
          className="size-6 shrink-0 accent-[var(--encre)]"
        />
        Une autre intervention sera nécessaire
      </label>

      {etat.erreur && <Erreur>{etat.erreur}</Erreur>}

      <Envoyer />
    </form>
  );
}
