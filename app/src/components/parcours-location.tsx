"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { NavigationParcours, type EtapeParcours } from "./navigation-parcours";
import { RubriquesDirectes } from "./rubrique-dossier";
import { SuiviEnregistrement } from "@/lib/suivi-enregistrement";
import styles from "./presentation-parcours.module.css";
import { ArrowLeft, ArrowRight, Building2, KeyRound, Sofa, FolderOpen, UsersRound, ClipboardCheck } from "lucide-react";

import { ETAPES_LOT, indexEtapeLot } from "@/lib/parcours-lot";

const icones = [Building2, KeyRound, UsersRound, Sofa, FolderOpen, ClipboardCheck];

/** Même cadre que le bail, sans résumé latéral ni formulaire replié. */
export function CadreParcours({ etape, changer, accessibles = ETAPES_LOT.length, resume, children, etapes = ETAPES_LOT, pied }: {
  etape: number; changer: (etape: number) => void; accessibles?: number;
  resume: ReactNode; children: ReactNode; etapes?: readonly EtapeParcours[]; pied?: ReactNode;
}) {
  const Icone = icones[etape];
  return <RubriquesDirectes.Provider value={true}><div className={`assistant-location ${styles.presentation} ${styles.parcoursLot}`} id="assistant-lot-navigation">
    <NavigationParcours etapes={etapes} etape={etape} changer={changer} accessibles={accessibles} titre="Création du lot" label="Étapes de la création du lot" />
    <section className={`assistant-carte ${styles.cadre}`}>
      <header className={styles.entete}>
        <span className={styles.icone}><Icone size={23} aria-hidden="true" /></span>
        <div><span className={styles.surtitre}>Étape {String(etape+1).padStart(2,"0")} / {etapes.length}</span>
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

export function ParcoursLot({ initiale, contenus, resume }: { initiale: string; contenus: ReactNode[]; resume: ReactNode }) {
  const router = useRouter();
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
    setEtape(i);
    const url = new URL(window.location.href);
    url.searchParams.set("etape", ETAPES_LOT[i].cle);
    url.hash = "";
    window.history.replaceState(null, "", url);
    document.getElementById("assistant-titre")?.focus({ preventScroll: true });
    document.getElementById("assistant-titre")?.scrollIntoView({ block: "start" });
  }
  return <SuiviEnregistrement.Provider value={() => router.refresh()}><CadreParcours etape={etape} changer={changer} resume={resume}
    pied={<div className={`assistant-pied ${styles.pied}`}>
      {etape > 0 ? <button type="button" className="btn-secondaire" onClick={() => changer(etape - 1)}><ArrowLeft size={16} aria-hidden="true" /> Précédent</button> : <span />}
      {etape < ETAPES_LOT.length - 1 && <button type="button" className="btn-or" onClick={() => changer(etape + 1)}>Suivant <ArrowRight size={16} aria-hidden="true" /></button>}
    </div>}>
      <p className={styles.aide}>Enregistrez les rubriques modifiées avant de poursuivre. Ces informations seront reprises automatiquement dans vos futurs baux.</p>
      {/* Les panneaux restent montés : un retour conserve la saisie en cours. */}
      {contenus.map((contenu, i) => <div key={ETAPES_LOT[i].cle} hidden={i !== etape} className="assistant-panneau" role="region" aria-label={`Étape ${ETAPES_LOT[i].titre}`}>{contenu}</div>)}
  </CadreParcours></SuiviEnregistrement.Provider>;
}
