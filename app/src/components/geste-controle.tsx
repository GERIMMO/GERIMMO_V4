"use client";

// Un geste de contrôle de la console (audit console du 27/09) : un formulaire
// replié, un motif quand le geste retire un droit, une case de confirmation
// obligatoire, et le retour de l'action en clair. Le même gabarit pour
// l'organisation, le compte et l'invitation.
import { useActionState } from "react";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import type { EtatControle } from "@/app/actions/controle-supervision";

type Action = (etat: EtatControle, form: FormData) => Promise<EtatControle>;

export function GesteControle({
  action,
  geste,
  titre,
  bouton,
  confirmation,
  motif = false,
  jours = false,
  champs,
  destructif = false,
}: {
  action: Action;
  geste?: string;
  titre: string;
  bouton: string;
  /** La phrase que le superviseur coche : ce que le geste fait réellement. */
  confirmation: string;
  motif?: boolean;
  jours?: boolean;
  /** Champs cachés supplémentaires. */
  champs?: Record<string, string>;
  destructif?: boolean;
}) {
  const [etat, envoyer] = useActionState<EtatControle, FormData>(action, {});
  const champ = "mt-1 w-full rounded-lg border border-[var(--filet)] bg-[var(--ivoire)] p-2 text-sm";
  return (
    <details className="border-t border-[var(--filet)] pt-3 first:border-t-0 first:pt-0">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-[var(--encre)]">{titre}</summary>
      <form action={envoyer} className="mt-2 space-y-3">
        {geste && <input type="hidden" name="geste" value={geste} />}
        {Object.entries(champs ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {jours && (
          <label className="block text-sm">Nombre de jours (1 à 90)
            <input name="jours" type="number" min={1} max={90} required defaultValue={14} className={champ} />
          </label>
        )}
        {motif && (
          <label className="block text-sm">Motif conservé au journal
            <textarea name="motif" required minLength={5} maxLength={500} rows={2} className={champ} />
          </label>
        )}
        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input type="checkbox" name="confirmation" value="oui" required className="mt-1 size-5 shrink-0 accent-[var(--encre)]" />
          <span>{confirmation}</span>
        </label>
        <BoutonEnvoi variant={destructif ? "destructive" : "outline"} enCoursTexte="Application…">{bouton}</BoutonEnvoi>
        {etat.erreur && <p role="alert" className="text-sm text-[var(--destructive)]">{etat.erreur}</p>}
        {etat.succes && <p role="status" className="text-sm text-[var(--success)]">{etat.succes}</p>}
      </form>
    </details>
  );
}
