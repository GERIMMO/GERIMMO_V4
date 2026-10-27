import { StrictMode, useContext, useState } from "react";
import { createRoot } from "react-dom/client";
import { AssistantBail } from "../../../src/app/agence/[orgId]/baux/[bailId]/assistant-bail";
import { EtapeComplementsBail } from "../../../src/lib/etape-complements-bail";
declare global { interface Window { __navigationBail: { invalides: number; envois: number } } }
window.__navigationBail = { invalides: 0, envois: 0 };
function Formulaire() {
  const parcours = useContext(EtapeComplementsBail);
  const [revisionOuverte,setRevisionOuverte]=useState(false);
  return <form id="form-parcours-bail" data-saisie-libre onSubmit={e => { e.preventDefault(); window.__navigationBail.envois++; }}>
    <fieldset hidden={parcours?.etape !== "bail"} disabled={parcours?.etape !== "bail"}>
      <label htmlFor="parcours-date_debut">Date d’entrée d’essai</label><input id="parcours-date_debut" name="date_debut" type="date"/>
    </fieldset>
    <fieldset hidden={parcours?.etape !== "loyer"} disabled={parcours?.etape !== "loyer"}>
      <label>Loyer d’essai<input id="parcours-loyer_hc" name="loyer" required onInvalid={() => { window.__navigationBail.invalides++; }} /></label>
      <details id="complements-paiement" open={revisionOuverte} onToggle={e=>setRevisionOuverte(e.currentTarget.open)}>
        <summary>Révision d’essai</summary>
        <label htmlFor="parcours-irl_valeur">Indice d’essai</label><input id="parcours-irl_valeur" name="irl_valeur"/>
      </details>
      <a href="#parcours-irl_valeur">Revenir à l’indice</a>
    </fieldset>
    <fieldset hidden={parcours?.etape !== "documents"} disabled={parcours?.etape !== "documents"}>
      <label htmlFor="parcours-dpe_depenses_min">Dépenses DPE d’essai</label><input id="parcours-dpe_depenses_min" name="dpe_depenses_min"/>
    </fieldset>
  </form>;
}
function Recapitulatif(){
  const parcours=useContext(EtapeComplementsBail);
  return <div>
    <a href="#parcours-date_debut">Corriger la date</a>
    <a href="#parcours-loyer_hc">Corriger le loyer</a>
    <a href="#etape-bail-4">Modifier le loyer</a>
    <a href="#parcours-irl_valeur">Corriger l’indice</a>
    <a href="#parcours-dpe_depenses_min">Corriger le DPE</a>
    <a href="#titre-proprietaires-bail">Corriger le propriétaire</a>
    <button type="button" onClick={()=>parcours?.signalerEnregistrement?.(true)}>Simuler un enregistrement</button>
    <button type="button" onClick={()=>parcours?.signalerEnregistrement?.(false)}>Terminer l’enregistrement</button>
  </div>;
}
createRoot(document.getElementById("racine")!).render(<StrictMode><AssistantBail
  orgId="org" bailId="bail" controleInitial={{ manquants: [] }} contenus={[null,<section key="personnes"><h3 id="titre-proprietaires-bail">Propriétaire d’essai</h3></section>,null,null,null,null,<Recapitulatif key="recap"/>]} formulaire={<Formulaire />}
/></StrictMode>);
