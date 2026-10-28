"use client";

import { useState } from "react";
import { aujourdhuiParis, formaterDate } from "@/lib/ged";
import { anneeTrimestreIrlPlausible, anneesTrimestreIrl, lireTrimestreIrl, publicationTrimestreIrl } from "@/lib/trimestre-irl";

const ORDINAUX = ["", "1er", "2e", "3e", "4e"];

/** Trimestre IRL de référence en deux listes, trimestre puis année (de 1990 à l'année en cours), envoyées ensemble
 * sous la forme « T3 2026 » dans le champ `name` (relecture BAIL-02). L'année est présélectionnée sur le dernier
 * trimestre de ce numéro publié à la date de référence (conclusion prévue, à défaut entrée) ; un trimestre pas encore
 * publié à cette date est signalé, jamais refusé. Contrôlé (`value`/`modifier`) ou non (`defaut`). */
export function ChampTrimestreIrl({ id, name, value, defaut, modifier, reference, disabled, className, describedBy }: {
  id: string; name: string; value?: string; defaut?: string | null; modifier?: (valeur: string) => void;
  reference?: string | null; disabled?: boolean; className?: string; describedBy?: string;
}) {
  const [interne, setInterne] = useState(defaut ?? "");
  const courant = value ?? interne;
  const lu = lireTrimestreIrl(courant);
  const numero = lu?.numero ? `T${lu.numero}` : "";
  const annee = lu?.annee ? String(lu.annee) : "";
  const aujourdhui = aujourdhuiParis();
  const dateReference = reference && /^\d{4}-\d{2}-\d{2}$/.test(reference) ? reference : aujourdhui;
  const changer = (n: string, a: string) => {
    const suivant = n ? `${n}${a ? ` ${a}` : ""}` : "";
    setInterne(suivant); modifier?.(suivant);
  };
  const nonPublie = lu?.annee && publicationTrimestreIrl(lu.numero, lu.annee) > dateReference;
  return <div className="space-y-1.5">
    <input type="hidden" name={name} value={courant} disabled={disabled} />
    <div className="grid grid-cols-2 gap-2">
      <select id={id} value={numero} disabled={disabled} aria-describedby={describedBy} className={className}
        onChange={e => changer(e.target.value, annee || (e.target.value ? String(anneeTrimestreIrlPlausible(lireTrimestreIrl(e.target.value)!.numero, dateReference)) : ""))}>
        <option value="">À confirmer</option>
        {[1, 2, 3, 4].map(n => <option key={n} value={`T${n}`}>{ORDINAUX[n]} trimestre</option>)}
      </select>
      <select id={`${id}-annee`} aria-label="Année de l’indice IRL de référence" value={annee} disabled={disabled || !numero} className={className}
        onChange={e => changer(numero, e.target.value)}>
        <option value="">Année à choisir</option>
        {anneesTrimestreIrl(aujourdhui).map(a => <option key={a} value={String(a)}>{a}</option>)}
      </select>
    </div>
    {nonPublie && <p role="status" className="text-xs text-warning-soft-foreground">
      L’indice du {ORDINAUX[lu!.numero]} trimestre {lu!.annee} est publié vers le {formaterDate(publicationTrimestreIrl(lu!.numero, lu!.annee!))}, après le {formaterDate(dateReference)} : vérifiez qu’il était connu à la signature.
    </p>}
  </div>;
}
