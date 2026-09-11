"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  proposerMesCreneaux,
  type EtatArtisanAction,
} from "@/app/actions/artisan";
import {
  CLASSE_BOUTON_PRINCIPAL,
  CLASSE_BOUTON_SOBRE,
  CLASSE_CHAMP,
  Erreur,
  Succes,
} from "../../../ui";

/**
 * Proposer des créneaux (10.1) — RM-10.1.1 : l'artisan propose EN PREMIER,
 * TROIS AU MINIMUM.
 *
 * Trois lignes sont donc posées d'emblée, pas une avec un « ajouter » : le
 * minimum de trois n'est pas une validation qu'on découvre en bas de page,
 * c'est la forme du formulaire. La base tient la même ligne — `proposer_creneaux`
 * prend un TABLEAU, précisément pour que les trois arrivent ensemble et qu'on
 * ne puisse pas s'arrêter après le premier.
 *
 * LES HEURES PARTENT EN ABSOLU. Le champ caché porte des instants ISO
 * construits ici, sur l'appareil de l'artisan — le seul qui connaisse son
 * fuseau. Un « 08:00 » envoyé nu serait lu dans le fuseau du serveur : il
 * proposerait 10 h en croyant proposer 8 h.
 */

type Creneau = { jour: string; debut: string; fin: string };

const VIDE: Creneau = { jour: "", debut: "", fin: "" };

/** « 08:00 » + 2 h → « 10:00 ». Deux heures : la durée d'un dépannage courant. */
function deuxHeuresApres(heure: string): string {
  const [h, m] = heure.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const total = (h + 2) * 60 + m;
  if (total >= 24 * 60) return "23:59";
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function enInstant(jour: string, heure: string): string | null {
  if (!jour || !heure) return null;
  const d = new Date(`${jour}T${heure}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function Envoyer({ nombre }: { nombre: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={CLASSE_BOUTON_PRINCIPAL}
      disabled={pending || nombre < 3}
    >
      {pending
        ? "Envoi…"
        : nombre < 3
          ? `Encore ${3 - nombre} créneau${3 - nombre > 1 ? "x" : ""} à remplir`
          : `Envoyer ${nombre} créneaux`}
    </button>
  );
}

export function FormulaireCreneaux({ interventionId }: { interventionId: string }) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    proposerMesCreneaux.bind(null, interventionId),
    {}
  );
  const [creneaux, setCreneaux] = useState<Creneau[]>([VIDE, VIDE, VIDE]);
  const base = useId();

  // Demain : on ne propose pas un rendez-vous pour le jour même, et surtout
  // pas pour hier — le champ refuse les dates passées.
  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  const minimum = demain.toISOString().slice(0, 10);

  function modifier(index: number, champ: keyof Creneau, valeur: string) {
    setCreneaux((liste) =>
      liste.map((c, i) => {
        if (i !== index) return c;
        const suivant = { ...c, [champ]: valeur };
        // La fin suit le début tant qu'on n'y a pas touché : trois créneaux à
        // saisir font neuf champs, on en épargne trois.
        if (champ === "debut" && !c.fin) suivant.fin = deuxHeuresApres(valeur);
        return suivant;
      })
    );
  }

  const prets = creneaux
    .map((c) => ({ debut: enInstant(c.jour, c.debut), fin: enInstant(c.jour, c.fin) }))
    .filter((c): c is { debut: string; fin: string } => Boolean(c.debut && c.fin));

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="creneaux" value={JSON.stringify(prets)} />

      {etat.succes && <Succes>{etat.succes}</Succes>}
      {etat.erreur && <Erreur>{etat.erreur}</Erreur>}

      {creneaux.map((c, i) => (
        <fieldset
          key={i}
          className="rounded-lg border-2 border-[var(--filet)] bg-[var(--ivoire)] p-3.5"
        >
          <legend className="px-1.5 text-[0.9375rem] font-medium text-[var(--encre)]">
            Créneau {i + 1}
          </legend>
          <div className="space-y-3">
            <div className="space-y-1">
              <label
                htmlFor={`${base}-jour-${i}`}
                className="block text-[0.8125rem] font-medium text-[var(--texte-secondaire)]"
              >
                Jour
              </label>
              <input
                id={`${base}-jour-${i}`}
                type="date"
                min={minimum}
                value={c.jour}
                onChange={(e) => modifier(i, "jour", e.target.value)}
                className={CLASSE_CHAMP}
              />
            </div>
            <div className="flex gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <label
                  htmlFor={`${base}-debut-${i}`}
                  className="block text-[0.8125rem] font-medium text-[var(--texte-secondaire)]"
                >
                  De
                </label>
                <input
                  id={`${base}-debut-${i}`}
                  type="time"
                  value={c.debut}
                  onChange={(e) => modifier(i, "debut", e.target.value)}
                  className={CLASSE_CHAMP}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <label
                  htmlFor={`${base}-fin-${i}`}
                  className="block text-[0.8125rem] font-medium text-[var(--texte-secondaire)]"
                >
                  À
                </label>
                <input
                  id={`${base}-fin-${i}`}
                  type="time"
                  value={c.fin}
                  onChange={(e) => modifier(i, "fin", e.target.value)}
                  className={CLASSE_CHAMP}
                />
              </div>
            </div>
          </div>
          {creneaux.length > 3 && (
            <button
              type="button"
              onClick={() => setCreneaux((l) => l.filter((_, j) => j !== i))}
              className="mt-3 inline-flex min-h-11 items-center text-[0.9375rem] text-[var(--destructive)] underline underline-offset-4"
            >
              Retirer ce créneau
            </button>
          )}
        </fieldset>
      ))}

      <button
        type="button"
        className={CLASSE_BOUTON_SOBRE}
        onClick={() => setCreneaux((l) => [...l, VIDE])}
      >
        Ajouter un créneau
      </button>

      <Envoyer nombre={prets.length} />
    </form>
  );
}
