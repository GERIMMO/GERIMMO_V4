"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  inscrireMonEntreprise,
  type EtatArtisanAction,
} from "@/app/actions/artisan";
import { LISTE_METIERS, METIERS } from "../libelles";
import {
  CLASSE_BOUTON_PRINCIPAL,
  CLASSE_CHAMP,
  CLASSE_LIBELLE,
  Erreur,
} from "../ui";

/**
 * L'auto-inscription de l'artisan (pivot du 2026-09-04 : le réseau artisan
 * devient un service de la plateforme, l'artisan s'inscrit lui-même et le
 * super admin valide avant toute première affectation).
 *
 * Six champs, pas un de plus. Le SIRET est la clé : s'il correspond à une
 * fiche qu'une agence avait déjà créée, l'inscription la RÉCLAME au lieu d'en
 * créer une seconde — « rattaché, jamais dupliqué » vu du côté de l'artisan.
 * Le mobile est obligatoire : c'est par lui qu'on le joint sur un chantier.
 */
function Envoyer() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={CLASSE_BOUTON_PRINCIPAL} disabled={pending}>
      {pending ? "Inscription…" : "Inscrire mon entreprise"}
    </button>
  );
}

export function FormulaireInscription() {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    inscrireMonEntreprise,
    {}
  );

  // Les métiers cochés vivent dans l'ÉTAT DU COMPOSANT, pas dans `etat.valeurs`.
  // Celui-ci est un Record<string, string> : il ne sait pas reporter une valeur
  // multiple, et la sélection se vidait donc à chaque refus — alors que « au
  // moins un métier » est justement l'une des causes de refus. Le composant,
  // lui, n'est pas démonté par l'aller-retour de l'action : son état survit.
  const [metiers, setMetiers] = useState<string[]>([]);
  const idRaison = useId();
  const idSiret = useId();
  const idTelephone = useId();
  const idEmail = useId();
  const idZones = useId();
  const base = useId();

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor={idRaison} className={CLASSE_LIBELLE}>
          Nom de votre entreprise
        </label>
        <input
          id={idRaison}
          name="raison_sociale"
          type="text"
          required
          autoComplete="organization"
          defaultValue={etat.valeurs?.raison_sociale}
          className={CLASSE_CHAMP}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={idSiret} className={CLASSE_LIBELLE}>
          SIRET
        </label>
        <input
          id={idSiret}
          name="siret"
          type="text"
          inputMode="numeric"
          required
          defaultValue={etat.valeurs?.siret}
          className={CLASSE_CHAMP}
        />
        <p className="text-[0.8125rem] text-[var(--texte-secondaire)]">
          Quatorze chiffres. Il identifie votre entreprise sur toute la
          plateforme : si une agence a déjà créé votre fiche, elle vous sera
          rattachée au lieu d&apos;être dupliquée.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={idTelephone} className={CLASSE_LIBELLE}>
          Mobile
        </label>
        <input
          id={idTelephone}
          name="telephone"
          type="tel"
          required
          autoComplete="tel"
          defaultValue={etat.valeurs?.telephone}
          className={CLASSE_CHAMP}
        />
        <p className="text-[0.8125rem] text-[var(--texte-secondaire)]">
          C&apos;est par lui qu&apos;on vous joint sur le chantier.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={idEmail} className={CLASSE_LIBELLE}>
          Courriel{" "}
          <span className="font-normal text-[var(--texte-secondaire)]">(facultatif)</span>
        </label>
        <input
          id={idEmail}
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={etat.valeurs?.email}
          className={CLASSE_CHAMP}
        />
      </div>

      <fieldset>
        <legend className={CLASSE_LIBELLE}>Vos métiers</legend>
        <p className="mb-2 text-[0.9375rem] text-[var(--texte-secondaire)]">
          Vous ne serez proposé que dans les métiers cochés.
        </p>
        <div className="space-y-1">
          {LISTE_METIERS.map((m) => (
            <label
              key={m}
              htmlFor={`${base}-${m}`}
              className="flex min-h-12 items-center gap-3 text-base text-[var(--corps)]"
            >
              <input
                id={`${base}-${m}`}
                type="checkbox"
                name="metiers"
                value={m}
                checked={metiers.includes(m)}
                onChange={(e) =>
                  setMetiers((liste) =>
                    e.target.checked ? [...liste, m] : liste.filter((x) => x !== m)
                  )
                }
                className="size-6 shrink-0 accent-[var(--encre)]"
              />
              {METIERS[m]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor={idZones} className={CLASSE_LIBELLE}>
          Votre zone d&apos;intervention
        </label>
        <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
          Les codes postaux où vous vous déplacez, séparés par des virgules.
        </p>
        <input
          id={idZones}
          name="codes_postaux"
          type="text"
          inputMode="numeric"
          defaultValue={etat.valeurs?.codes_postaux}
          className={CLASSE_CHAMP}
        />
      </div>

      {etat.erreur && <Erreur>{etat.erreur}</Erreur>}

      <Envoyer />
    </form>
  );
}
