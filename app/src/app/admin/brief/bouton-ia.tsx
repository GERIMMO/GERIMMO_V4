"use client";

import { useState, useTransition } from "react";
import { analyserBriefIA, type EtatBriefIA } from "./actions";

export function BoutonBriefIA({ disponible }: { disponible: boolean }) {
  const [etat, setEtat] = useState<EtatBriefIA>({});
  const [enCours, demarrer] = useTransition();
  return (
    <div>
      <button
        type="button"
        className="btn-secondaire"
        disabled={!disponible || enCours}
        onClick={() => demarrer(async () => setEtat(await analyserBriefIA()))}
      >
        {enCours ? "Analyse en cours…" : "Analyser les signaux avec l’IA"}
      </button>
      {!disponible && <p className="mt-2 text-sm text-[var(--texte-secondaire)]">L&apos;analyse sera disponible après configuration de la clé OpenAI côté serveur.</p>}
      {etat.erreur && <p role="alert" className="mt-3 text-sm text-[var(--destructive)]">{etat.erreur}</p>}
      {etat.analyse && (
        <div className="mt-4 rounded-lg border border-[var(--filet)] bg-[var(--ivoire)] p-4 text-sm leading-relaxed">
          <p className="eyebrow text-[var(--marque-sombre)]">Suggestion IA · à vérifier</p>
          <p className="mt-2"><b>Constat :</b> {etat.analyse.constat}</p>
          <p className="mt-2"><b>Prochaine action :</b> {etat.analyse.prochaine_action}</p>
          <p className="mt-2"><b>Pourquoi :</b> {etat.analyse.justification}</p>
          <p className="mt-2"><b>Ce qu&apos;on ignore :</b> {etat.analyse.inconnues}</p>
          <p className="mt-3 text-xs text-[var(--texte-secondaire)]">Généré le {etat.genereLe ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(etat.genereLe)) : "—"}. Aucune action automatique n&apos;a été effectuée.</p>
        </div>
      )}
    </div>
  );
}
