"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import styles from "./information-envois-proprietaire.module.css";

/** Une information par accueil, reconsultable même après acquittement. Aucun réglage d’envoi n’est modifié. */
export function InformationEnvoisProprietaire({ base, compte }: { base: string; compte: string }) {
  const details = useRef<HTMLDetailsElement>(null);
  const cle = `gerimmo-information-envois-v1:${compte}:${base}`;
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
      <p>Vous pouvez préparer vos relances de loyer en PDF. Les relances locatives et les avis d’échéance par courriel restent suspendus : ils ne sont pas envoyés automatiquement.</p>
      <div className={styles.actions}>
        <Link href={`${base}/profil#envois`}>Consulter les réglages d’envoi</Link>
        <button type="button" onClick={acquitter}>J’ai compris</button>
      </div>
    </div>
  </details>;
}
