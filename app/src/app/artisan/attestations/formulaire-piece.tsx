"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { deposerMaPiece, type EtatArtisanAction } from "@/app/actions/artisan";
import { compresserChampFichiers } from "@/lib/compresser-image";
import { LISTE_PIECES, PIECES_ARTISAN, PORTEE_PIECES } from "../libelles";
import {
  Carte,
  CLASSE_BOUTON_PRINCIPAL,
  CLASSE_CHAMP,
  CLASSE_LIBELLE,
  Erreur,
  Succes,
  TitreSection,
} from "../ui";

/**
 * Le dépôt d'une attestation — RM-8.2.1 : c'est l'ARTISAN qui dépose, pas
 * l'agence, et ses pièces valent pour TOUTES les agences (RM-8.2.8). Elles ne
 * vivent donc pas dans la GED d'une agence mais dans son propre dossier.
 *
 * La date de fin de validité est le champ qui compte : c'est elle qui fait foi
 * pour le filtre décennale, et la base la refuse absente (sauf certification).
 * Elle est donc exigée ici AVANT que le fichier ne parte — un fichier monté
 * qu'une RPC refuse ensuite reste au Storage, seul le super admin pouvant l'en
 * retirer.
 *
 * Une nouvelle attestation RETIRE la précédente du même type : on le dit, pour
 * qu'on ne cherche pas l'ancienne ensuite.
 */
function Envoyer() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={CLASSE_BOUTON_PRINCIPAL} disabled={pending}>
      {pending ? "Envoi…" : "Déposer l'attestation"}
    </button>
  );
}

export function FormulairePiece({ typeSuggere }: { typeSuggere?: string }) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    deposerMaPiece,
    {}
  );
  const [type, setType] = useState(typeSuggere ?? "decennale");
  const idType = useId();
  const idEmise = useId();
  const idExpire = useId();
  const idFichier = useId();

  const dateExigee = type !== "certification";

  return (
    <Carte>
      <TitreSection>Déposer une attestation</TitreSection>
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor={idType} className={CLASSE_LIBELLE}>
            Quelle attestation
          </label>
          <select
            id={idType}
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={CLASSE_CHAMP}
          >
            {LISTE_PIECES.map((p) => (
              <option key={p} value={p}>
                {PIECES_ARTISAN[p]}
              </option>
            ))}
          </select>
          <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
            {PORTEE_PIECES[type]}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="min-w-[9rem] flex-1 space-y-1.5">
            <label htmlFor={idEmise} className={CLASSE_LIBELLE}>
              Émise le{" "}
              <span className="font-normal text-[var(--texte-secondaire)]">(facultatif)</span>
            </label>
            <input
              id={idEmise}
              name="emise_le"
              type="date"
              defaultValue={etat.valeurs?.emise_le}
              className={CLASSE_CHAMP}
            />
          </div>
          <div className="min-w-[9rem] flex-1 space-y-1.5">
            <label htmlFor={idExpire} className={CLASSE_LIBELLE}>
              Valable jusqu&apos;au{dateExigee ? "" : " (facultatif)"}
            </label>
            <input
              id={idExpire}
              name="expire_le"
              type="date"
              required={dateExigee}
              defaultValue={etat.valeurs?.expire_le}
              className={CLASSE_CHAMP}
            />
          </div>
        </div>
        {dateExigee && (
          <p className="-mt-2 text-[0.8125rem] text-[var(--texte-secondaire)]">
            C&apos;est cette date qui fait foi : elle est lue à l&apos;instant où une
            agence cherche un artisan.
          </p>
        )}

        <div className="space-y-1.5">
          <label htmlFor={idFichier} className={CLASSE_LIBELLE}>
            L&apos;attestation
          </label>
          <input
            id={idFichier}
            name="fichier"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            required
            onChange={(e) => {
              // Une attestation photographiée passe de 8 Mo à quelques centaines
              // de ko : sur le réseau d'un chantier, c'est la différence entre
              // un envoi qui aboutit et un envoi qu'on abandonne.
              void compresserChampFichiers(e.currentTarget);
            }}
            className={`${CLASSE_CHAMP} py-3 file:mr-3 file:rounded file:border-0 file:bg-[var(--ardoise)] file:px-3 file:py-2 file:text-[var(--encre)]`}
          />
          <p className="text-[0.8125rem] text-[var(--texte-secondaire)]">
            PDF ou photo du document. Elle remplacera la précédente du même type.
          </p>
        </div>

        {etat.succes && <Succes>{etat.succes}</Succes>}
        {etat.erreur && <Erreur>{etat.erreur}</Erreur>}

        <Envoyer />
      </form>
    </Carte>
  );
}
