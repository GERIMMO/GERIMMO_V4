"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, FileText, History, Settings2, ShieldCheck, UsersRound, Activity, CalendarDays } from "lucide-react";
import styles from "./console-section.module.css";

const ICONES = { reglages: Settings2, personnes: UsersRound, securite: ShieldCheck, historique: History, documents: FileText, sante: Activity, calendrier: CalendarDays };
type Icone = keyof typeof ICONES;

/** Les enfants restent montés : replier une rubrique ne perd aucune saisie.
 * Les liens profonds et les erreurs natives ouvrent les détails qui les contiennent. */
export function ConsoleSection({ titre, description, children, id, ouverte = false, statut, ton = "bleu", icone = "reglages" }: {
  titre: string; description?: string; children: ReactNode; id?: string; ouverte?: boolean;
  statut?: ReactNode; ton?: "bleu" | "vert" | "ambre" | "violet"; icone?: Icone;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const ouvrirCible = () => {
      let cible: HTMLElement | null;
      try { cible = document.getElementById(decodeURIComponent(window.location.hash.slice(1))); } catch { return; }
      if (cible && ref.current?.contains(cible)) {
        let parent: HTMLElement | null = cible;
        while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
        requestAnimationFrame(() => cible?.scrollIntoView({ block: "start" }));
      }
    };
    ouvrirCible();
    window.addEventListener("hashchange", ouvrirCible);
    return () => window.removeEventListener("hashchange", ouvrirCible);
  }, []);
  const Icone = ICONES[icone];
  return <details ref={ref} id={id} open={ouverte} className={styles.section} data-tone={ton} onInvalidCapture={event => {
    let element: HTMLElement | null = event.target as HTMLElement;
    while (element) { if (element instanceof HTMLDetailsElement) element.open = true; element = element.parentElement; }
  }}>
    <summary className={styles.summary}>
      <span className={styles.icon}><Icone size={20} aria-hidden="true" /></span>
      <span className={styles.heading}><h2 className={styles.title}>{titre}</h2>{description && <span className={styles.description}>{description}</span>}</span>
      {statut !== undefined && <span className={styles.status}>{statut}</span>}
      <ChevronDown className={styles.chevron} size={18} aria-hidden="true" />
    </summary>
    <div className={styles.body}>{children}</div>
  </details>;
}
