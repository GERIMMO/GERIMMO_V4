"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { NavigationParcours, type EtapeParcours } from "./navigation-parcours";
import { RubriquesDirectes } from "./rubrique-dossier";
import { SuiviEnregistrement } from "@/lib/suivi-enregistrement";
import styles from "./presentation-parcours.module.css";
import { ArrowLeft, ArrowRight, Building2, KeyRound, Sofa, FolderOpen, UsersRound, ClipboardCheck } from "lucide-react";

import { ETAPES_LOT, indexEtapeLot } from "@/lib/parcours-lot";

const icones = [Building2, KeyRound, UsersRound, Sofa, FolderOpen, ClipboardCheck];

/** Même cadre que le bail, sans résumé latéral ni formulaire replié. */
export function CadreParcours({ etape, changer, accessibles = ETAPES_LOT.length, resume, children, etapes = ETAPES_LOT, pied, correction = false }: {
  etape: number; changer: (etape: number) => void; accessibles?: number;
  resume: ReactNode; children: ReactNode; etapes?: readonly EtapeParcours[]; pied?: ReactNode; correction?: boolean;
}) {
  const Icone = icones[etape];
  return <RubriquesDirectes.Provider value={true}><div className={`assistant-location ${styles.presentation} ${styles.parcoursLot}`} id="assistant-lot-navigation">
    {!correction && <NavigationParcours etapes={etapes} etape={etape} changer={changer} accessibles={accessibles} titre="Création du lot" label="Étapes de la création du lot" />}
    <section className={`assistant-carte ${styles.cadre}`}>
      <header className={styles.entete}>
        <span className={styles.icone}><Icone size={23} aria-hidden="true" /></span>
        <div>{!correction && <span className={styles.surtitre}>Étape {String(etape+1).padStart(2,"0")} / {etapes.length}</span>}
          <h2 id="assistant-titre" tabIndex={-1}>{etapes[etape].titre}</h2>
          <p>{etapes[etape].detail}.</p>
        </div>
        <div className={styles.resumeLot}>{resume}</div>
      </header>
      <div className={styles.corps}>{children}</div>
      {pied}
    </section>
  </div></RubriquesDirectes.Provider>;
}

export function ParcoursLot({ initiale, contenus, resume, retourBail, completes = [] }: { initiale: string; contenus: ReactNode[]; resume: ReactNode; retourBail?: string | null; completes?: boolean[] }) {
  const router = useRouter();
  const attente = useRef<(() => void) | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [etape, setEtape] = useState(() => indexEtapeLot(initiale));
  useEffect(() => {
    const correspondances: Record<string, number> = { detention: 2, caracteristiques: 1, pieces: 3, equipements: 3, chambres: 3, diagnostics: 4, "diagnostics-immeuble": 4 };
    function clic(e: MouseEvent) {
      const lien = (e.target as Element).closest('a[href^="#"]');
      if (!lien) return;
      const i = correspondances[lien.getAttribute("href")!.slice(1)];
      if (i !== undefined) { setEtape(i); const url = new URL(window.location.href); url.searchParams.set("etape", ETAPES_LOT[i].cle); window.history.replaceState(null, "", url); }
    }
    document.addEventListener("click", clic);
    return () => document.removeEventListener("click", clic);
  }, []);
  function changer(i: number) {
    if (attente.current) return;
    setEtape(i);
    const url = new URL(window.location.href);
    url.searchParams.set("etape", ETAPES_LOT[i].cle);
    url.hash = "";
    window.history.replaceState(null, "", url);
    document.getElementById("assistant-titre")?.focus({ preventScroll: true });
    document.getElementById("assistant-titre")?.scrollIntoView({ block: "start" });
  }
  function poursuivre() {
    const suite = () => retourBail ? router.push(retourBail) : changer(etape + 1);
    const formulaire = document.querySelector<HTMLFormElement>(".assistant-panneau:not([hidden]) form");
    if (etape <= 1 && formulaire) {
      if (!formulaire.reportValidity()) return;
      attente.current = suite;
      setEnCours(true);
      formulaire.requestSubmit();
    } else suite();
  }
  return <SuiviEnregistrement.Provider value={(succes = true) => {
    const suite = attente.current;
    attente.current = null;
    setEnCours(false);
    if (succes) { router.refresh(); suite?.(); }
  }}><CadreParcours etape={etape} changer={changer} resume={resume} correction={Boolean(retourBail)} etapes={ETAPES_LOT.map((e,i) => ({...e, statut: completes[i] ? "complet" as const : undefined}))}
    pied={<div className={`assistant-pied ${styles.pied}`}>
      {!retourBail && etape > 0 ? <button type="button" className="btn-secondaire" onClick={() => changer(etape - 1)}><ArrowLeft size={16} aria-hidden="true" /> Précédent</button> : <span />}
      {(retourBail || etape < ETAPES_LOT.length - 1) && <button type="button" disabled={enCours} className="btn-or" onClick={poursuivre}>{enCours ? "Enregistrement…" : retourBail ? (etape <= 1 ? "Enregistrer et revenir au bail" : "Revenir au bail") : etape <= 1 ? "Enregistrer et continuer" : "Suivant"} <ArrowRight size={16} aria-hidden="true" /></button>}
    </div>}>
      <p className={styles.aide}>{etape <= 1 ? "Vos modifications sont enregistrées avant de continuer." : "Enregistrez les rubriques modifiées avant de poursuivre."}</p>
      {/* Les panneaux restent montés : un retour conserve la saisie en cours. */}
      {contenus.map((contenu, i) => <div key={ETAPES_LOT[i].cle} hidden={i !== etape} className="assistant-panneau" role="region" aria-label={`Étape ${ETAPES_LOT[i].titre}`}>{contenu}</div>)}
  </CadreParcours></SuiviEnregistrement.Provider>;
}
