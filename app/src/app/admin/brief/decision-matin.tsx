"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { deciderDecisionDuMatin, type EtatDecision } from "./actions";

export type DecisionAffichee = {
  id: string; titre: string; pourquoi: string; options: string[]; recommandation: string | null; lien: string | null;
  statut: string; motif: string | null; decide_le: string | null; validation: boolean; refus: boolean; attestation: string | null;
};

const LIBELLES_STATUT: Record<string, string> = { en_attente: "En attente", validee: "Validée", refusee: "Refusée", sans_objet: "Réglée ailleurs" };

// 25/09 : Valider agit en un clic ; Refuser demande un second clic avec un
// motif (le refus est conservé et souvent communiqué à l'auteur).
export function DecisionMatin({ decision }: { decision: DecisionAffichee }) {
  const [etat, setEtat] = useState<EtatDecision>({});
  const [refusOuvert, setRefusOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  const [atteste, setAtteste] = useState(false);
  const [enCours, demarrer] = useTransition();
  const tranchee = decision.statut !== "en_attente" || Boolean(etat.succes);
  const decider = (validee: boolean) => demarrer(async () => setEtat(await deciderDecisionDuMatin(decision.id, validee, motif, atteste)));

  return (
    <li className="loc-carte">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-semibold text-[var(--encre)]">{decision.titre}</h4>
        <span className={`puce ${decision.statut === "validee" || etat.succes ? "puce-loue" : decision.statut === "refusee" ? "puce-rouge" : decision.statut === "sans_objet" ? "puce-grise" : "puce-prep"}`}>{etat.succes && decision.statut === "en_attente" ? "Décidée" : LIBELLES_STATUT[decision.statut] ?? decision.statut}</span>
      </div>
      <p className="mt-2 text-sm text-[var(--texte-secondaire)]">{decision.pourquoi}</p>
      {decision.options.length > 0 && <p className="mt-2 text-sm"><b>Options :</b> {decision.options.join(" · ")}</p>}
      {decision.recommandation && <p className="mt-1 text-sm"><b>Recommandation :</b> {decision.recommandation}</p>}
      {decision.motif && <p className="mt-1 text-sm"><b>Motif :</b> {decision.motif}</p>}
      {!tranchee && (
        <div className="mt-4 space-y-3">
          {decision.attestation && decision.validation && (
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={atteste} onChange={(e) => setAtteste(e.target.checked)} className="mt-1 size-4 accent-[var(--encre)]" />{decision.attestation}</label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {decision.validation
              ? <button type="button" className="btn-or" disabled={enCours || (Boolean(decision.attestation) && !atteste)} onClick={() => decider(true)}>{enCours ? "En cours…" : "Valider"}</button>
              : decision.lien && <Link href={decision.lien} className="btn-or">Décider sur l’écran</Link>}
            {decision.refus && (refusOuvert
              ? <button type="button" className="btn-secondaire" disabled={enCours || motif.trim().length < 3} onClick={() => decider(false)}>Confirmer le refus</button>
              : <button type="button" className="btn-secondaire" onClick={() => setRefusOuvert(true)}>Refuser</button>)}
            {decision.lien && decision.validation && <Link href={decision.lien} className="lien-discret text-sm">Ouvrir l’écran concerné →</Link>}
          </div>
          {refusOuvert && (
            <label className="block text-sm">Motif du refus (conservé, et communiqué à l’auteur quand l’écran d’origine le prévoit)
              <textarea value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border border-[var(--filet)] bg-[var(--ivoire)] p-2" />
            </label>
          )}
        </div>
      )}
      {etat.erreur && <p role="alert" className="err mt-2">{etat.erreur}</p>}
      {etat.succes && <p role="status" className="mt-2 text-sm text-[var(--success)]">{etat.succes}</p>}
    </li>
  );
}
