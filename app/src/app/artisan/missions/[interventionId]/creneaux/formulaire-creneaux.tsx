"use client";

import { useId, useState } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { useFormStatus } from "react-dom";
import { decalerJour, jourParis } from "@/lib/agenda-gestion";
import { instantParis } from "@/lib/heure-paris-calcul";
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
 * construits ici. Un « 08:00 » envoyé nu serait lu dans le fuseau du serveur :
 * il proposerait 10 h en croyant proposer 8 h. Les heures saisies sont celles
 * de Paris, comme partout ailleurs dans le produit (le locataire les lit et
 * les choisit à l'heure de Paris) : un téléphone réglé sur un autre fuseau ne
 * les décale plus (audit final, DOC-06).
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || !/^\d{2}:\d{2}$/.test(heure)) return null;
  const [h, m] = heure.split(":").map(Number);
  const d = instantParis(jour, h, m);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Le libellé du bouton ne change plus : le compte de ce qui manque s'écrivait
// en blanc sur le bouton désactivé, délavé à 60 %, illisible au soleil. Il
// se lit maintenant au-dessus, en texte courant (tour du 24/09).
function Envoyer({ nombre }: { nombre: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={CLASSE_BOUTON_PRINCIPAL}
      disabled={pending || nombre < 3}
    >
      {pending ? "Envoi…" : "Envoyer les créneaux"}
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
  // pas pour hier — le champ refuse les dates passées. Demain à Paris, pas
  // selon le calendrier de l'appareil.
  const minimum = decalerJour(jourParis(new Date()), 1);

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

  const prets = creneaux.filter(c => c.jour >= minimum && c.fin > c.debut)
    .map((c) => ({ debut: enInstant(c.jour, c.debut), fin: enInstant(c.jour, c.fin) }))
    .filter((c): c is { debut: string; fin: string } => Boolean(c.debut && c.fin))
    .filter((c,i,liste) => liste.findIndex(x=>x.debut===c.debut && x.fin===c.fin)===i);

  return (
    <form data-saisie-confirmee action={action} className="space-y-5">
      <input type="hidden" name="creneaux" value={JSON.stringify(prets)} />

      <div className="rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4" role="status">
        <p className="font-semibold">{Math.min(prets.length,3)} / 3 propositions prêtes</p>
        <p className="mt-1 text-sm text-muted-foreground">Choisissez trois horaires différents. Le locataire retiendra celui qui lui convient.</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full bg-[var(--or)]" style={{width:`${Math.min(prets.length/3,1)*100}%`}} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
      {creneaux.map((c, i) => (
        // Le même habillage que les autres cartes de l'espace (24/09). La
        // légende reste, pour l'accessibilité, mais flotte dans la carte comme
        // un titre de section au lieu de couper le filet.
        <fieldset key={i} className="artisan-carte min-w-0">
          <legend className="float-left mb-3 w-full p-0 font-[family-name:var(--font-titres)] text-[1.0625rem] font-medium text-[var(--encre)]">
            Créneau {i + 1}
          </legend>
          <div className="clear-both space-y-3">
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
                onInput={(e) => modifier(i, "jour", e.currentTarget.value)}
                onChange={(e) => modifier(i, "jour", e.target.value)}
                className={CLASSE_CHAMP}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[{nom:"Matin",debut:"09:00",fin:"11:00"},{nom:"Après-midi",debut:"14:00",fin:"16:00"}].map(plage => <button key={plage.nom} type="button" className="rounded-lg border border-[var(--filet)] px-3 py-2 text-xs hover:bg-[var(--ivoire)]" onClick={() => setCreneaux(l => l.map((v,j)=>j===i?{...v,debut:plage.debut,fin:plage.fin}:v))}>{plage.nom}</button>)}
              {i>0 && creneaux[i-1].debut && <button type="button" className="text-xs underline" onClick={() => setCreneaux(l => l.map((v,j)=>j===i?{...v,debut:l[i-1].debut,fin:l[i-1].fin}:v))}>Même horaire que le précédent</button>}
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
                  onInput={(e) => modifier(i, "debut", e.currentTarget.value)}
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
                  onInput={(e) => modifier(i, "fin", e.currentTarget.value)}
                onChange={(e) => modifier(i, "fin", e.target.value)}
                  className={CLASSE_CHAMP}
                />
              </div>
            </div>
          </div>
          {c.debut && c.fin && c.fin <= c.debut && <p className="mt-2 text-sm text-destructive">L’heure de fin doit être après l’heure de début.</p>}
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
      </div>

      <button
        type="button"
        className={CLASSE_BOUTON_SOBRE}
        onClick={() => setCreneaux((l) => [...l, VIDE])}
      >
        Ajouter un créneau
      </button>

      {etat.succes && <Succes>{etat.succes}</Succes>}
      {etat.erreur && <Erreur>{etat.erreur}</Erreur>}

      {/* Le compte de ce qui manque, avant le bouton (24/09). L'effet d'une
          nouvelle proposition (elle remplace celle en attente) ne se dit plus
          ici : le bandeau ambre de la page le dit déjà quand c'est le cas
          (25/09, A14). */}
      {prets.length < 3 && (
        <p className="text-base text-[var(--corps)]">
          Encore {3 - prets.length} créneau{3 - prets.length > 1 ? "x" : ""} à remplir
        </p>
      )}

      <Envoyer nombre={prets.length} />
    </form>
  );
}
