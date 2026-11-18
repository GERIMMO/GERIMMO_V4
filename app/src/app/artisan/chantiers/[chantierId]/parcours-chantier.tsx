"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import styles from "./parcours-chantier.module.css";

type Action = { id: string; titre: string; contenu: ReactNode };
export function ParcoursChantier({ etape, actions }: {
  etape: { action: string | null; titre: string; detail: string };
  actions: Action[];
}) {
  const principale = actions.find(a => a.id === etape.action)?.id ?? null;
  const [selection, setSelection] = useState<string | null>(principale);
  const active = actions.some(a => a.id === selection) ? selection : principale;
  const secondaires = actions.filter(a => a.id !== principale);
  const titre = useRef<HTMLHeadingElement>(null);
  function choisir(id: string | null) {
    setSelection(id);
    requestAnimationFrame(() => titre.current?.focus({ preventScroll: false }));
  }
  return <div className={styles.parcours}>
    <section className={styles.etape} aria-labelledby="etape-suivante-chantier">
      <p className={styles.repere}>{active !== principale ? "Autre action" : "Étape suivante"}</p>
      <h2 id="etape-suivante-chantier" ref={titre} tabIndex={-1} className="font-heading">
        {active && active !== principale ? actions.find(a => a.id === active)?.titre : etape.titre}
      </h2>
      {active === principale && <p>{etape.detail}</p>}
      {active !== principale && <button type="button" className={styles.retour} onClick={() => choisir(principale)}><ArrowLeft size={16} aria-hidden="true" />Revenir à l’étape suivante</button>}
    </section>
    {/* Masquer, sans démonter : texte, fichier et écran de relecture sont conservés. */}
    {actions.map(action => <section key={action.id} data-action-chantier={action.id}
      hidden={active !== action.id} aria-label={action.titre} className={styles.action}>
      {action.contenu}
    </section>)}
    {secondaires.length > 0 && <details className={styles.secondaires}>
      <summary>Autres actions <ChevronDown size={18} aria-hidden="true" /></summary>
      <div className={styles.choix}>{secondaires.map(action => <button key={action.id} type="button"
        aria-pressed={active === action.id} onClick={() => choisir(action.id)}>{action.titre}</button>)}</div>
    </details>}
  </div>;
}
