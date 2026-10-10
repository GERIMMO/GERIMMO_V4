"use client";

import { useId } from "react";
import { Check, ChevronDown } from "lucide-react";
import styles from "./presentation-parcours.module.css";

export type EtapeParcours = {
  titre: string;
  detail: string;
  statut?: "complet" | "incomplet";
  restant?: number;
  statutLibelle?: string;
};

function libelleStatut(etape: EtapeParcours) {
  if (etape.statutLibelle) return etape.statutLibelle;
  if (etape.statut === "complet") return "Renseigné";
  if (etape.statut === "incomplet") return `${etape.restant} à compléter`;
  return etape.titre === "Récapitulatif" ? "À relire" : "À vérifier";
}

/** Le contrôle du dossier reste la seule source de l’état de chaque étape. */
export function NavigationParcours({ etapes, etape, changer, titre = "Préparation du bail", label = "Étapes du bail", accessibles = etapes.length }: {
  etapes: readonly EtapeParcours[];
  titre?: string; label?: string; accessibles?: number;
  etape: number;
  changer: (index: number) => void;
}) {
  const idChoix = useId();
  return <nav className={styles.navigation} aria-label={label}>
    <div className={styles.navigationEntete}>
      <span className={styles.surtitre}>{titre}</span>
      <span className={styles.position}>Étape <strong>{etape + 1}</strong> sur {etapes.length}</span>
    </div>
    <ol className={styles.etapes} style={{gridTemplateColumns:`repeat(${etapes.length}, minmax(0,1fr))`}}>
      {etapes.map((e, i) => <li key={e.titre}>
        <button type="button" className={styles.etape} disabled={i >= accessibles} onClick={() => changer(i)}
          aria-current={i === etape ? "step" : undefined}
          aria-label={`Étape ${i + 1} : ${e.titre} — ${libelleStatut(e)}`}
          title={`${e.titre} · ${e.detail}`} data-statut={e.statut}>
          <span className={styles.numero} aria-hidden="true">
            {e.statut === "complet" && i !== etape ? <Check size={18} strokeWidth={2.5} /> : String(i + 1).padStart(2, "0")}
          </span>
          <strong className={styles.nomEtape}>{e.titre}</strong>
          <span className={styles.statut}>{libelleStatut(e)}</span>
        </button>
      </li>)}
    </ol>
    <div className={styles.navigationMobile}>
      <label htmlFor={idChoix} className="sr-only">Aller à une étape</label>
      <select id={idChoix} value={etape} onChange={e => changer(Number(e.target.value))}>
        {etapes.map((e, i) => <option key={e.titre} value={i} disabled={i >= accessibles}>{i + 1}. {e.titre} — {libelleStatut(e)}</option>)}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </div>
  </nav>;
}
