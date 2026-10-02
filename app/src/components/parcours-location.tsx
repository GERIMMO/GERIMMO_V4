"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, House } from "lucide-react";

export const ETAPES_LOCATION = [
  { cle: "bien", titre: "Bien", detail: "Adresse et caractéristiques" },
  { cle: "lot", titre: "Lot", detail: "Détails et propriétaires" },
  { cle: "logement", titre: "Logement", detail: "Pièces et équipements" },
  { cle: "diagnostics", titre: "Diagnostics", detail: "Documents du logement" },
  { cle: "locataires", titre: "Locataires", detail: "Identités et garants" },
  { cle: "bail", titre: "Bail", detail: "Conditions de location" },
  { cle: "finalisation", titre: "Finalisation", detail: "Vérifications et signature" },
] as const;

export function CadreParcours({ etape, changer, accessibles = 7, resume, children }: {
  etape: number; changer: (etape: number) => void; accessibles?: number; resume: ReactNode; children: ReactNode;
}) {
  return <div className="assistant-location">
    <nav className="assistant-etapes" aria-label="Étapes de la location">
      {ETAPES_LOCATION.map((e, i) => <button key={e.cle} type="button" disabled={i >= accessibles} onClick={() => changer(i)} aria-current={i === etape ? "step" : undefined}>
        <span className="assistant-rond">{i + 1}</span><span><strong>{e.titre}</strong><small>{e.detail}</small></span>
      </button>)}
    </nav>
    <div className="assistant-grille"><div className="assistant-contenu">{children}</div>
      <aside className="assistant-resume" aria-label="Votre location en préparation">
        <section className="assistant-carte"><h2>Votre progression</h2><p>Étape {etape + 1} sur 7</p><progress value={etape + 1} max={7} aria-label="Étape du parcours" />
          <p className="assistant-note">Ce repère indique votre position dans le parcours. Les vérifications du dossier restent nécessaires.</p>
          <ol>{ETAPES_LOCATION.map((e, i) => <li key={e.cle}><button type="button" disabled={i >= accessibles} onClick={() => changer(i)} aria-current={i === etape ? "step" : undefined}><span>{i + 1}</span>{e.titre}{i === etape && <small>En cours</small>}</button></li>)}</ol>
        </section>
        <section className="assistant-carte"><h2><House size={18} aria-hidden="true" /> Votre logement</h2>{resume}</section>
        <section className="assistant-conseil"><h2>Chaque étape à votre rythme</h2><p>Enregistrez les rubriques que vous modifiez. Vous pourrez reprendre votre dossier depuis la fiche du logement.</p></section>
      </aside>
    </div>
  </div>;
}

export function ParcoursLocation({ initiale, contenus, resume }: { initiale: string; contenus: ReactNode[]; resume: ReactNode }) {
  const index = ETAPES_LOCATION.findIndex(e => e.cle === initiale);
  const [etape, setEtape] = useState(index < 0 ? 2 : index);
  useEffect(() => {
    const correspondances: Record<string, number> = { detention: 1, caracteristiques: 1, pieces: 2, equipements: 2, diagnostics: 3, "diagnostics-immeuble": 3, baux: 5, "location-apercu": 6 };
    function clic(e: MouseEvent) {
      const lien = (e.target as Element).closest('a[href^="#"]');
      if (!lien) return;
      const i = correspondances[lien.getAttribute("href")!.slice(1)];
      if (i !== undefined) { setEtape(i); const url = new URL(window.location.href); url.searchParams.set("etape", ETAPES_LOCATION[i].cle); window.history.replaceState(null, "", url); }
    }
    document.addEventListener("click", clic);
    return () => document.removeEventListener("click", clic);
  }, []);
  function changer(i: number) {
    setEtape(i);
    const url = new URL(window.location.href);
    url.searchParams.set("etape", ETAPES_LOCATION[i].cle);
    url.hash = "";
    window.history.replaceState(null, "", url);
    document.getElementById("assistant-titre")?.focus({ preventScroll: true });
    document.getElementById("assistant-titre")?.scrollIntoView({ block: "start" });
  }
  return <CadreParcours etape={etape} changer={changer} resume={resume}>
    <div className="assistant-carte">
      <h2 id="assistant-titre" tabIndex={-1} className="assistant-titre"><span>{etape + 1}</span>{ETAPES_LOCATION[etape].titre}</h2>
      <p className="assistant-introduction">{ETAPES_LOCATION[etape].detail}. Enregistrez vos modifications avant de quitter le dossier.</p>
      {/* Les panneaux restent montés : un retour conserve la saisie en cours. */}
      {contenus.map((contenu, i) => <div key={ETAPES_LOCATION[i].cle} hidden={i !== etape} className="assistant-panneau" role="region" aria-label={`Étape ${ETAPES_LOCATION[i].titre}`}>{contenu}</div>)}
      <div className="assistant-pied">
        {etape > 0 ? <button type="button" className="btn-secondaire" onClick={() => changer(etape - 1)}><ArrowLeft size={16} aria-hidden="true" /> Étape précédente</button> : <span />}
        {etape < 6 && <button type="button" className="btn-or" onClick={() => changer(etape + 1)}>Étape suivante <ArrowRight size={16} aria-hidden="true" /></button>}
      </div>
    </div>
  </CadreParcours>;
}
