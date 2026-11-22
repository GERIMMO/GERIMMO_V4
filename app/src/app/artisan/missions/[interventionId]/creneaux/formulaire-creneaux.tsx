"use client";

import { useId, useState } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
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
import Link from "next/link";
import { prochainsCreneaux, type AbsenceArtisan, type PlageJour } from "@/lib/semaine-type-artisan";

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

export function FormulaireCreneaux({ interventionId, semaineType = null, absences = [] }: {
  interventionId: string;
  /** Audit palier 1, P2-03 : la semaine type de l'artisan (vide s'il n'en a pas réglé, `null` si elle est illisible). */
  semaineType?: PlageJour[] | null;
  absences?: Pick<AbsenceArtisan, "du" | "au">[];
}) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    proposerMesCreneaux.bind(null, interventionId),
    {}
  );
  const [creneaux, setCreneaux] = useState<Creneau[]>([VIDE, VIDE, VIDE]);
  // Nombre de créneaux que la semaine type a pu poser au dernier préremplissage (null : pas encore demandé).
  const [preremplis, setPreremplis] = useState<number | null>(null);
  const base = useId();

  // Demain : on ne propose pas un rendez-vous pour le jour même, et surtout
  // pas pour hier — le champ refuse les dates passées.
  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  const minimum = `${demain.getFullYear()}-${String(demain.getMonth()+1).padStart(2,"0")}-${String(demain.getDate()).padStart(2,"0")}`;

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

  // Préremplir à partir de la semaine type, en sautant les absences. Rien n'est envoyé : l'artisan relit, corrige, envoie.
  function preremplir() {
    const proposes = prochainsCreneaux({ semaine: semaineType ?? [], absences, aPartirDe: minimum });
    setPreremplis(proposes.length);
    setCreneaux([...proposes, VIDE, VIDE, VIDE].slice(0, 3));
  }

  const prets = creneaux.filter(c => c.jour >= minimum && c.fin > c.debut)
    .map((c) => ({ debut: enInstant(c.jour, c.debut), fin: enInstant(c.jour, c.fin) }))
    .filter((c): c is { debut: string; fin: string } => Boolean(c.debut && c.fin))
    .filter((c,i,liste) => liste.findIndex(x=>x.debut===c.debut && x.fin===c.fin)===i);

  return (
    <form data-saisie-confirmee action={action} className="space-y-5">
      <input type="hidden" name="creneaux" value={JSON.stringify(prets)} />

      <div className="rounded-[var(--rayon-carte)] border border-[var(--filet)] bg-[var(--carte)] p-4 shadow-[var(--ombre-1)]" role="status">
        <p className="font-semibold">{Math.min(prets.length,3)} / 3 propositions prêtes</p>
        <p className="mt-1 text-[0.9375rem] text-[var(--texte-secondaire)]">Choisissez trois dates et horaires possibles. Rien n’est confirmé avant l’accord du locataire.</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--filet-leger)]" aria-hidden="true"><div className="h-full rounded-full bg-[var(--prestige-champagne)] transition-[width] duration-[var(--duree-lente)] ease-[var(--courbe)] motion-reduce:transition-none" style={{width:`${Math.min(prets.length/3,1)*100}%`}} /></div>
      </div>
      {semaineType && (semaineType.length > 0 ? (
        <div className="space-y-2" data-preremplissage>
          <button type="button" className={CLASSE_BOUTON_SOBRE} onClick={preremplir}>Préremplir avec ma semaine type</button>
          {preremplis !== null && (
            <p role="status" className="text-[0.9375rem] text-[var(--texte-secondaire)]">
              {preremplis >= 3
                ? "Trois créneaux préremplis d’après votre semaine type. Relisez-les : ils ne tiennent pas compte de vos autres rendez-vous."
                : preremplis === 0
                  ? "Votre semaine type et vos absences ne laissent aucun créneau dans les deux mois qui viennent : remplissez-les à la main."
                  : `Votre semaine type et vos absences ne laissent que ${preremplis} créneau${preremplis > 1 ? "x" : ""} dans les deux mois qui viennent : complétez à la main.`}
            </p>
          )}
        </div>
      ) : (
        <p className="text-[0.9375rem] text-[var(--texte-secondaire)]" data-preremplissage="a-regler">
          Pour préremplir ces créneaux, <Link href="/artisan/entreprise#entreprise-disponibilites" className="underline underline-offset-4">réglez votre semaine type</Link>.
        </p>
      ))}
      <div className="grid gap-3 lg:grid-cols-3">
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
                Date
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
            <div className="grid grid-cols-2 gap-2">
              {[{nom:"Matin",debut:"09:00",fin:"11:00"},{nom:"Après-midi",debut:"14:00",fin:"16:00"}].map(plage => <button key={plage.nom} type="button" aria-pressed={c.debut===plage.debut && c.fin===plage.fin} className="min-h-14 rounded-[var(--rayon-bouton)] border border-[var(--filet-champ)] bg-[var(--carte)] px-2 py-2 text-sm font-semibold text-[var(--encre)] hover:border-[var(--marque)] hover:bg-[var(--survol)] aria-pressed:border-[var(--marque)] aria-pressed:bg-[var(--marque)] aria-pressed:text-[var(--sur-marque)]" onClick={() => setCreneaux(l => l.map((v,j)=>j===i?{...v,debut:plage.debut,fin:plage.fin}:v))}>{plage.nom}<span className="block text-xs">{plage.debut} – {plage.fin}</span></button>)}
              {i>0 && creneaux[i-1].debut && <button type="button" className="col-span-2 min-h-11 text-sm font-medium text-[var(--encre)] underline underline-offset-4" onClick={() => setCreneaux(l => l.map((v,j)=>j===i?{...v,debut:l[i-1].debut,fin:l[i-1].fin}:v))}>Même horaire que le précédent</button>}
            </div>
            <details className="rounded-[var(--rayon-champ)] border border-[var(--filet)] px-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Préciser les heures{c.debut && c.fin ? ` · ${c.debut}–${c.fin}` : ""}</summary>
            <div className="flex gap-3 pb-3">
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
            </details>
          </div>
          {c.debut && c.fin && c.fin <= c.debut && <p className="mt-2 text-sm text-destructive">L’heure de fin doit être après l’heure de début.</p>}
          {(c.jour || c.debut || c.fin) && <button type="button" className="mt-2 min-h-11 text-sm underline underline-offset-4" onClick={() => setCreneaux(l => l.map((v,j) => j===i ? {...VIDE} : v))}>Effacer ce créneau</button>}
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

      <section aria-label="Récapitulatif des propositions" className="rounded-[var(--rayon-carte)] border border-[var(--filet)] bg-[var(--carte)] p-4 shadow-[var(--ombre-1)]">
        <h2 className="font-semibold">Vos propositions avant envoi</h2>
        <ol className="mt-2 space-y-2">{creneaux.map((c,i) => <li key={i}>
          <span className="font-medium">{i+1}. </span>{c.jour && c.debut && c.fin ? `${new Date(`${c.jour}T12:00:00`).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})} · ${c.debut} – ${c.fin}` : "À compléter"}
        </li>)}</ol>
        {creneaux.some((c,i)=>c.jour && c.debut && c.fin && creneaux.findIndex(x=>x.jour===c.jour && x.debut===c.debut && x.fin===c.fin)!==i) && <p className="mt-2 text-sm text-destructive">Deux propositions sont identiques. Choisissez un autre créneau.</p>}
      </section>

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
