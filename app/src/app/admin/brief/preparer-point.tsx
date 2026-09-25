"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { preparerPointDuMatin, type EtatDecision } from "./actions";

export function PreparerPoint({ libelle = "Préparer le point maintenant" }: { libelle?: string }) {
  const [etat, setEtat] = useState<EtatDecision>({});
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn-secondaire" disabled={enCours} onClick={() => demarrer(async () => { setEtat(await preparerPointDuMatin()); routeur.refresh(); })}>{enCours ? "Préparation…" : libelle}</button>
      {etat.erreur && <p role="alert" className="err">{etat.erreur}</p>}
      {etat.succes && <p role="status" className="text-sm text-[var(--success)]">{etat.succes}</p>}
    </div>
  );
}
