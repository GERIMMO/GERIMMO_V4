"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { deposerMaFacture, type EtatArtisanAction } from "@/app/actions/artisan";
import { ChampFichier } from "@/components/champ-fichier";
import { compresserChampFichiers } from "@/lib/compresser-image";
import { montantEnCentimes } from "@/lib/devis-structure";
import {
  CLASSE_AIDE,
  CLASSE_BOUTON_PRINCIPAL,
  CLASSE_CHAMP,
  CLASSE_LIBELLE,
  CLASSE_ZONE_TEXTE,
  Erreur,
} from "../../../ui";

/**
 * Le dépôt de la facture (module 9.7, version simple — wiki : concepts/Devis).
 *
 * Le montant est PRÉ-REMPLI avec le plafond engagé (devis retenu, ou avenant
 * accepté). S'il change, le champ d'explication apparaît et devient
 * obligatoire : « écart alerté sans blocage, justifié par l'artisan, tranché
 * par l'agent ». La base revérifie tout (migration 20260927123000).
 */
function Envoyer() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={CLASSE_BOUTON_PRINCIPAL} disabled={pending}>
      {pending ? "Envoi…" : "Déposer ma facture"}
    </button>
  );
}

function enSaisie(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function FormulaireFacture({
  interventionId,
  plafondCents,
}: {
  interventionId: string;
  plafondCents: number | null;
}) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    deposerMaFacture.bind(null, interventionId),
    {}
  );
  const [montant, setMontant] = useState(etat.valeurs?.montant ?? enSaisie(plafondCents));
  const saisi = montantEnCentimes(montant);
  const ecart = plafondCents !== null && saisi !== null && saisi !== plafondCents;

  const idNumero = useId();
  const idMontant = useId();
  const idJustification = useId();
  const idFichier = useId();

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor={idNumero} className={CLASSE_LIBELLE}>
          Numéro de la facture
        </label>
        <input
          id={idNumero}
          name="numero"
          type="text"
          required
          maxLength={60}
          defaultValue={etat.valeurs?.numero}
          className={CLASSE_CHAMP}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={idMontant} className={CLASSE_LIBELLE}>
          Montant TTC (€)
        </label>
        <input
          id={idMontant}
          name="montant"
          type="text"
          inputMode="decimal"
          required
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          className={CLASSE_CHAMP}
        />
        <p className={CLASSE_AIDE}>
          Pré-rempli avec le montant engagé. Un autre montant reste possible :
          expliquez alors l&apos;écart, l&apos;agence le tranchera.
        </p>
      </div>

      {ecart && (
        <div className="space-y-1.5">
          <label htmlFor={idJustification} className={CLASSE_LIBELLE}>
            Pourquoi le montant diffère-t-il du devis ?
          </label>
          <textarea
            id={idJustification}
            name="justification"
            rows={3}
            required
            maxLength={4000}
            defaultValue={etat.valeurs?.justification}
            className={CLASSE_ZONE_TEXTE}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor={idFichier} className={CLASSE_LIBELLE}>
          Votre facture
        </label>
        <ChampFichier
          id={idFichier}
          name="fichier"
          accept="application/pdf,image/jpeg,image/png"
          required
          onChange={(e) => {
            void compresserChampFichiers(e.currentTarget);
          }}
          className={`${CLASSE_CHAMP} min-h-13 py-2`}
        />
        <p className={CLASSE_AIDE}>PDF ou photo. Elle rejoint le dossier de l&apos;agence.</p>
      </div>

      {etat.erreur && <Erreur>{etat.erreur}</Erreur>}

      <Envoyer />
    </form>
  );
}
