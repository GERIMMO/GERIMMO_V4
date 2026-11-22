"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import styles from "./information-envois-proprietaire.module.css";

/** Ce que l'information dit, selon ce que le superviseur a ouvert (audit palier 1, P1-08). Fermé : la phrase d'avant. */
export function texteInformationEnvois(avisProposes: boolean, relancesProposees: boolean): string {
  const pdf = "Vous pouvez préparer vos relances de loyer en PDF.";
  if (avisProposes && relancesProposees) return `${pdf} Les avis d’échéance et les relances automatiques par courriel peuvent maintenant être activés dans vos réglages d’envoi : rien ne part tant que vous ne l’avez pas choisi.`;
  if (avisProposes) return `${pdf} Les avis d’échéance par courriel peuvent maintenant être activés dans vos réglages d’envoi. Les relances locatives par courriel restent suspendues.`;
  if (relancesProposees) return `${pdf} Les relances automatiques par courriel peuvent maintenant être activées dans vos réglages d’envoi. Les avis d’échéance par courriel restent suspendus.`;
  return `${pdf} Les relances locatives et les avis d’échéance par courriel restent suspendus : ils ne sont pas envoyés automatiquement.`;
}

/** Une information par accueil, reconsultable même après acquittement. Aucun réglage d’envoi n’est modifié. */
export function InformationEnvoisProprietaire({ base, compte, avisProposes = false, relancesProposees = false }: { base: string; compte: string; avisProposes?: boolean; relancesProposees?: boolean }) {
  const details = useRef<HTMLDetailsElement>(null);
  // L'acquittement vaut pour ce qui a été lu : quand un envoi s'ouvre, l'information se représente une fois.
  const etat = `${avisProposes ? "a" : ""}${relancesProposees ? "r" : ""}`;
  const cle = `gerimmo-information-envois-v1${etat ? `-${etat}` : ""}:${compte}:${base}`;
  useEffect(() => {
    try { if (localStorage.getItem(cle) === "lu" && details.current) details.current.open = false; }
    catch { /* Le message reste visible si le navigateur refuse le stockage. */ }
  }, [cle]);
  function acquitter() {
    if (details.current) details.current.open = false;
    try { localStorage.setItem(cle, "lu"); } catch { /* Aucun effet sur les envois. */ }
    details.current?.querySelector("summary")?.focus();
  }
  return <details ref={details} open className={styles.information}>
    <summary>À savoir sur vos envois</summary>
    <div>
      <p>{texteInformationEnvois(avisProposes, relancesProposees)}</p>
      <div className={styles.actions}>
        <Link href={`${base}/profil#envois`}>Consulter les réglages d’envoi</Link>
        <button type="button" onClick={acquitter}>J’ai compris</button>
      </div>
    </div>
  </details>;
}
