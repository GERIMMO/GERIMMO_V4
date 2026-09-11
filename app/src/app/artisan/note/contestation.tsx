"use client";

import { useId, useState } from "react";
import { EDITEUR } from "@/lib/editeur";
import {
  CLASSE_BOUTON_PRINCIPAL,
  CLASSE_BOUTON_SECONDAIRE,
  CLASSE_BOUTON_SOBRE,
  CLASSE_LIBELLE,
  CLASSE_ZONE_TEXTE,
  Succes,
} from "../ui";

/**
 * CONTESTER SA NOTE EST UN DROIT, PAS UNE FAVEUR.
 *
 * RM-A2.11 le qualifie : la note « combine des appréciations humaines et des
 * indicateurs automatiques, et influence le classement » — la contester est
 * l'exercice du DROIT À L'INTERVENTION HUMAINE (RGPD), et Gerimmo a
 * l'obligation d'en informer l'artisan. D'où la formulation de cet écran :
 * on ne demande pas une révision, on l'exerce.
 *
 * ELLE EST ARBITRÉE PAR LA PLATEFORME, JAMAIS PAR L'AGENCE QUI A NOTÉ. Le
 * module 11 le dit sans détour : « l'agence est juge et partie ». Seul le
 * super admin peut retirer une évaluation, avec motif, et la moyenne est
 * recalculée automatiquement.
 *
 * CE QUE CET ÉCRAN NE PEUT PAS ENCORE FAIRE, et pourquoi il ne fait pas
 * semblant : au 2026-09-11, la contestation n'a AUCUNE table en base (le retrait
 * d'une évaluation existe, `retirer_evaluation`, réservé au super admin ; la
 * demande, non), et le portail artisan n'a aucun accès à la messagerie — elle
 * s'adosse à `persons`, une table d'agence, à laquelle l'artisan n'appartient
 * par construction pas. Un formulaire qui n'écrirait nulle part ferait croire
 * à l'artisan qu'il a contesté : c'est le pire résultat possible pour un
 * droit. On l'aide donc à RÉDIGER sa demande, on lui dit où l'adresser, et le
 * rapport de lot signale la table manquante.
 */
export function Contestation({
  raisonSociale,
  siret,
  note,
}: {
  raisonSociale: string;
  siret: string;
  note: number | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [motifs, setMotifs] = useState("");
  const [copie, setCopie] = useState(false);
  const idMotifs = useId();

  const texte = [
    "Demande d'intervention humaine sur ma note Gerimmo",
    "",
    `Entreprise : ${raisonSociale}`,
    `SIRET : ${siret}`,
    note !== null ? `Note affichée : ${note.toFixed(1)} sur 5` : "Note non publiée",
    "",
    "Motifs de ma contestation :",
    motifs || "(à compléter)",
    "",
    "Je demande le réexamen de cette évaluation par un opérateur de la plateforme,",
    "au titre de mon droit à l'intervention humaine.",
  ].join("\n");

  const adresse = EDITEUR.email;

  if (!ouvert) {
    return (
      <button
        type="button"
        className={CLASSE_BOUTON_SECONDAIRE}
        onClick={() => setOuvert(true)}
      >
        Contester ma note
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={idMotifs} className={CLASSE_LIBELLE}>
          Pourquoi contestez-vous ?
        </label>
        <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
          Décrivez les faits : l&apos;intervention concernée, la date, ce qui vous
          paraît inexact. Un opérateur de Gerimmo réexamine — jamais l&apos;agence
          qui vous a noté.
        </p>
        <textarea
          id={idMotifs}
          rows={5}
          value={motifs}
          onChange={(e) => setMotifs(e.target.value)}
          className={CLASSE_ZONE_TEXTE}
        />
      </div>

      {copie && <Succes>Demande copiée. Collez-la dans votre message à Gerimmo.</Succes>}

      <button
        type="button"
        className={CLASSE_BOUTON_PRINCIPAL}
        onClick={() => {
          void navigator.clipboard
            ?.writeText(texte)
            .then(() => setCopie(true))
            .catch(() => setCopie(false));
        }}
      >
        Copier ma demande
      </button>

      {adresse ? (
        <a
          href={`mailto:${adresse}?subject=${encodeURIComponent(
            "Contestation de note — " + raisonSociale
          )}&body=${encodeURIComponent(texte)}`}
          className={CLASSE_BOUTON_SECONDAIRE}
        >
          Envoyer à Gerimmo
        </a>
      ) : (
        <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
          Le dépôt de la contestation dans l&apos;application n&apos;est pas encore
          ouvert, et l&apos;adresse de contact de l&apos;éditeur n&apos;est pas encore
          publiée. Adressez cette demande à Gerimmo par le canal que vous
          utilisez habituellement : elle sera examinée par la plateforme, et par
          elle seule.
        </p>
      )}

      <button
        type="button"
        className={CLASSE_BOUTON_SOBRE}
        onClick={() => setOuvert(false)}
      >
        Revenir
      </button>
    </div>
  );
}
