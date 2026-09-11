"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  definirMaVisibilite,
  mettreAJourMetiersZones,
  type EtatArtisanAction,
} from "@/app/actions/artisan";
import { LISTE_METIERS, METIERS } from "../libelles";
import {
  Carte,
  CLASSE_BOUTON_SECONDAIRE,
  CLASSE_CHAMP,
  CLASSE_LIBELLE,
  Erreur,
  Succes,
  TitreSection,
} from "../ui";

function BoutonEnregistrer({ libelleBouton }: { libelleBouton: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={CLASSE_BOUTON_SECONDAIRE} disabled={pending}>
      {pending ? "Enregistrement…" : libelleBouton}
    </button>
  );
}

/**
 * RM-8.4.2 : LA VISIBILITÉ APPARTIENT À L'ARTISAN, ET À LUI SEUL.
 *
 * Ce n'est pas un réglage parmi d'autres : c'est la seule décision du module 8
 * qu'aucune agence et aucun super admin ne peuvent prendre à sa place — la
 * RPC `definir_ma_visibilite` n'accepte même pas d'artisan en paramètre. Le
 * défaut est « privée » : tant qu'il ne se publie pas, seules les agences
 * auxquelles il est déjà rattaché peuvent le solliciter.
 *
 * Un SIRET non vérifié interdit la publication (RM-A1.9) : on le dit avant,
 * plutôt que de laisser la base refuser après.
 */
export function ReglageVisibilite({
  visibilite,
  siretVerifie,
}: {
  visibilite: "privee" | "publique";
  siretVerifie: boolean;
}) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    definirMaVisibilite,
    {}
  );
  const publique = visibilite === "publique";

  return (
    <Carte>
      <TitreSection>Qui peut me solliciter</TitreSection>
      <p className="text-[0.9375rem] text-[var(--corps)]">
        {publique
          ? "Votre profil est visible de toutes les agences de la plateforme. N'importe laquelle peut vous demander un devis."
          : "Votre profil est privé : seules les agences auxquelles vous êtes déjà rattaché peuvent vous solliciter."}
      </p>

      {etat.succes && (
        <div className="mt-3">
          <Succes>{etat.succes}</Succes>
        </div>
      )}
      {etat.erreur && (
        <div className="mt-3">
          <Erreur>{etat.erreur}</Erreur>
        </div>
      )}

      {!publique && !siretVerifie ? (
        <p className="mt-3 text-[0.9375rem] text-[var(--texte-secondaire)]">
          La publication s&apos;ouvrira quand votre SIRET aura été vérifié par
          Gerimmo. C&apos;est une vérification, pas une décision d&apos;agence.
        </p>
      ) : (
        <form action={action} className="mt-3">
          <input
            type="hidden"
            name="visibilite"
            value={publique ? "privee" : "publique"}
          />
          <BoutonEnregistrer
            libelleBouton={
              publique ? "Repasser mon profil en privé" : "Rendre mon profil public"
            }
          />
        </form>
      )}
      <p className="mt-2 text-[0.8125rem] text-[var(--texte-secondaire)]">
        Vous seul décidez de ce réglage : ni une agence, ni Gerimmo ne peuvent le
        changer.
      </p>
    </Carte>
  );
}

/** Métiers (liste fermée, RM-8.3) et zone d'intervention par codes postaux. */
export function FormulaireMetiersZones({
  metiers,
  codesPostaux,
}: {
  metiers: string[];
  codesPostaux: string[];
}) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    mettreAJourMetiersZones,
    {}
  );
  const [ouvert, setOuvert] = useState(false);
  const idZones = useId();
  const base = useId();

  if (!ouvert) {
    return (
      <Carte>
        <TitreSection>Mes métiers et ma zone</TitreSection>
        <p className="text-base text-[var(--corps)]">
          {metiers.length > 0
            ? metiers.map((m) => METIERS[m] ?? m).join(" · ")
            : "Aucun métier déclaré"}
        </p>
        <p className="mt-1 text-[0.9375rem] text-[var(--texte-secondaire)]">
          {codesPostaux.length > 0
            ? `Zone : ${codesPostaux.join(", ")}`
            : "Aucune zone d'intervention déclarée — vous ne serez proposé nulle part."}
        </p>
        {etat.succes && (
          <div className="mt-3">
            <Succes>{etat.succes}</Succes>
          </div>
        )}
        <button
          type="button"
          className={`${CLASSE_BOUTON_SECONDAIRE} mt-3`}
          onClick={() => setOuvert(true)}
        >
          Modifier
        </button>
        <p className="mt-2 text-[0.8125rem] text-[var(--texte-secondaire)]">
          Vous n&apos;êtes proposé que dans vos métiers, et pour les communes de
          votre zone.
        </p>
      </Carte>
    );
  }

  return (
    <Carte>
      <TitreSection>Mes métiers et ma zone</TitreSection>
      <form action={action} className="space-y-4">
        <fieldset>
          <legend className={CLASSE_LIBELLE}>Mes métiers</legend>
          <p className="mb-2 text-[0.9375rem] text-[var(--texte-secondaire)]">
            Un artisan n&apos;est proposé que dans son métier.
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
                  defaultChecked={metiers.includes(m)}
                  className="size-6 shrink-0 accent-[var(--encre)]"
                />
                {METIERS[m]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor={idZones} className={CLASSE_LIBELLE}>
            Ma zone d&apos;intervention
          </label>
          <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
            Les codes postaux où vous vous déplacez, séparés par des virgules.
            Ils sont comparés au code postal du logement, à l&apos;identique.
          </p>
          <input
            id={idZones}
            name="codes_postaux"
            type="text"
            inputMode="numeric"
            defaultValue={etat.valeurs?.codes_postaux ?? codesPostaux.join(", ")}
            className={CLASSE_CHAMP}
          />
        </div>

        {etat.erreur && <Erreur>{etat.erreur}</Erreur>}

        <BoutonEnregistrer libelleBouton="Enregistrer" />
        <button
          type="button"
          className={CLASSE_BOUTON_SECONDAIRE}
          onClick={() => setOuvert(false)}
        >
          Annuler
        </button>
      </form>
    </Carte>
  );
}
