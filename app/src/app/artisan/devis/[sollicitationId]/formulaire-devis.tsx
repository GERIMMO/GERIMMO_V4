"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  declinerMaSollicitation,
  deposerMonDevis,
  type EtatArtisanAction,
} from "@/app/actions/artisan";
import { compresserChampFichiers } from "@/lib/compresser-image";
import {
  CLASSE_BOUTON_PRINCIPAL,
  CLASSE_BOUTON_REFUS,
  CLASSE_BOUTON_SOBRE,
  CLASSE_CHAMP,
  CLASSE_LIBELLE,
  CLASSE_ZONE_TEXTE,
  Erreur,
} from "../../ui";

/**
 * Répondre à une demande de devis (9.2).
 *
 * Le fichier est FACULTATIF, et c'est un choix : sur un chantier, le montant
 * et deux lignes de description partent en trente secondes, le PDF se prépare
 * le soir au bureau. Exiger le PDF, c'est n'avoir aucun devis avant le soir —
 * et la base ne l'exige pas non plus (`p_storage_path` y est nul par défaut).
 * Quand il est joint, il entre dans la GED de l'agence : c'est une pièce
 * d'agence, elle ne franchit aucune frontière.
 *
 * Une photo est acceptée autant qu'un PDF, et compressée à la prise : un devis
 * manuscrit photographié vaut mieux qu'un devis qui n'arrive pas.
 */

function Envoyer() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={CLASSE_BOUTON_PRINCIPAL} disabled={pending}>
      {pending ? "Envoi du devis…" : "Envoyer mon devis"}
    </button>
  );
}

function Decliner() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={CLASSE_BOUTON_REFUS} disabled={pending}>
      {pending ? "Envoi…" : "Confirmer : je ne chiffre pas"}
    </button>
  );
}

export function FormulaireDevis({
  sollicitationId,
  echeanceParDefaut,
}: {
  sollicitationId: string;
  /** Date de validité pré-remplie : trente jours, la valeur par défaut du module 9. */
  echeanceParDefaut: string;
}) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    deposerMonDevis.bind(null, sollicitationId),
    {}
  );
  const [etatRefus, actionRefus] = useActionState<EtatArtisanAction, FormData>(
    declinerMaSollicitation.bind(null, sollicitationId),
    {}
  );
  const [refusOuvert, setRefusOuvert] = useState(false);

  const idMontant = useId();
  const idDescription = useId();
  const idEcheance = useId();
  const idFichier = useId();
  const idMotif = useId();

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor={idMontant} className={CLASSE_LIBELLE}>
            Montant TTC
          </label>
          <input
            id={idMontant}
            name="montant"
            type="text"
            inputMode="decimal"
            required
            defaultValue={etat.valeurs?.montant}
            className={CLASSE_CHAMP}
          />
          <p className="text-[0.8125rem] text-[var(--texte-secondaire)]">
            En euros, toutes taxes comprises. La virgule comme le point sont acceptés.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={idDescription} className={CLASSE_LIBELLE}>
            Ce que couvre le devis
          </label>
          <textarea
            id={idDescription}
            name="description"
            rows={4}
            required
            defaultValue={etat.valeurs?.description}
            className={CLASSE_ZONE_TEXTE}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={idEcheance} className={CLASSE_LIBELLE}>
            Valable jusqu&apos;au
          </label>
          <input
            id={idEcheance}
            name="valide_jusqu_au"
            type="date"
            defaultValue={etat.valeurs?.valide_jusqu_au ?? echeanceParDefaut}
            className={CLASSE_CHAMP}
          />
          <p className="text-[0.8125rem] text-[var(--texte-secondaire)]">
            Passée cette date, le devis est caduc et ne peut plus être retenu.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={idFichier} className={CLASSE_LIBELLE}>
            Le devis en pièce jointe{" "}
            <span className="font-normal text-[var(--texte-secondaire)]">(facultatif)</span>
          </label>
          <input
            id={idFichier}
            name="fichier"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => {
              // Photo d'un devis manuscrit : compressée comme les autres.
              void compresserChampFichiers(e.currentTarget);
            }}
            className={`${CLASSE_CHAMP} py-3 file:mr-3 file:rounded file:border-0 file:bg-[var(--ardoise)] file:px-3 file:py-2 file:text-[var(--encre)]`}
          />
          <p className="text-[0.8125rem] text-[var(--texte-secondaire)]">
            PDF ou photo. Un seul devis par demande, et il ne se remplace pas
            une fois envoyé : joignez le document si vous l&apos;avez déjà.
          </p>
        </div>

        {etat.erreur && <Erreur>{etat.erreur}</Erreur>}

        <Envoyer />
      </form>

      {!refusOuvert ? (
        <button
          type="button"
          className={CLASSE_BOUTON_SOBRE}
          onClick={() => setRefusOuvert(true)}
        >
          Je ne peux pas chiffrer cette demande
        </button>
      ) : (
        <form action={actionRefus} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor={idMotif} className={CLASSE_LIBELLE}>
              Pourquoi{" "}
              <span className="font-normal text-[var(--texte-secondaire)]">(facultatif)</span>
            </label>
            <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
              L&apos;agence sollicitera quelqu&apos;un d&apos;autre. Un mot l&apos;aide à mieux
              vous solliciter la prochaine fois.
            </p>
            <textarea
              id={idMotif}
              name="motif"
              rows={3}
              defaultValue={etatRefus.valeurs?.motif}
              className={CLASSE_ZONE_TEXTE}
            />
          </div>
          {etatRefus.erreur && <Erreur>{etatRefus.erreur}</Erreur>}
          <Decliner />
          <button
            type="button"
            className={CLASSE_BOUTON_SOBRE}
            onClick={() => setRefusOuvert(false)}
          >
            Revenir
          </button>
        </form>
      )}
    </div>
  );
}
