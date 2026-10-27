import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { LignesDiagnostics } from "../../../src/app/agence/[orgId]/parc/[bienId]/lignes-diagnostics";
import { FournisseurRacineEspace } from "../../../src/components/racine-espace-contexte";
import { installerProtectionSaisie } from "../../../src/lib/protection-saisie";
import { controleDiagnostics } from "./actions-diagnostics-controle";

function choisirRapportFictif() {
  const champ = [...document.querySelectorAll<HTMLInputElement>('input[type="file"][name="fichier"]')].find(champ => !champ.closest("[hidden]"));
  if (!champ) return;
  champ.focus();
  const transfert = new DataTransfer();
  transfert.items.add(new File(["%PDF-1.4 Rapport fictif"], "rapport-fictif.pdf", { type: "application/pdf" }));
  champ.files = transfert.files;
  champ.dispatchEvent(new Event("change", { bubbles: true }));
}

function BancQualification() {
  const [lecture, setLecture] = useState(0);
  const [diagnostics, setDiagnostics] = useState(controleDiagnostics.diagnostics);
  const [qualifications, setQualifications] = useState(controleDiagnostics.qualifications);
  const [, actualiserJournal] = useState(0);
  useEffect(() => installerProtectionSaisie(), []);
  useEffect(() => {
    const actualiser = () => { setDiagnostics([...controleDiagnostics.diagnostics]); actualiserJournal(n => n + 1); };
    window.addEventListener("diagnostics-controle", actualiser);
    return () => window.removeEventListener("diagnostics-controle", actualiser);
  }, []);
  return <FournisseurRacineEspace racine="/espace">
    <fieldset className="controle" aria-label="Contrôles du banc">
      <legend>Contrôles locaux — données fictives uniquement</legend>
      <button type="button" onClick={() => { setQualifications([...controleDiagnostics.qualifications]); setLecture(n => n + 1); }}>Relire les réponses enregistrées</button>
      <button type="button" onClick={choisirRapportFictif}>Préparer un rapport fictif</button>
      <label>Réponse simulée <select defaultValue="succes" onChange={e => { controleDiagnostics.reponse = e.target.value as "succes" | "erreur"; }}><option value="succes">Succès</option><option value="erreur">Erreur</option></select></label>
      <label><input type="checkbox" onChange={e => { controleDiagnostics.retarder = e.target.checked; }} />Retarder la réponse</label>
      <button type="button" onClick={() => { controleDiagnostics.liberer?.(); controleDiagnostics.liberer = undefined; }}>Recevoir la réponse</button>
    </fieldset>
    <h2>Diagnostics du logement</h2>
    <LignesDiagnostics key={lecture} orgId="fictif" bienId="immeuble" lotId="logement" niveau="lot" attendus={["dpe", "gaz", "electricite"]} diagnostics={diagnostics} qualifications={qualifications} />
    <h2>Documents du bâtiment</h2>
    <LignesDiagnostics orgId="fictif" bienId="immeuble" lotId={null} niveau="bien" attendus={[]} diagnostics={[]} />
    <details className="journal"><summary>État enregistré dans le banc</summary><pre>{JSON.stringify({ qualifications: controleDiagnostics.qualifications, envois: controleDiagnostics.envois }, null, 2)}</pre></details>
  </FournisseurRacineEspace>;
}

createRoot(document.getElementById("racine")!).render(<StrictMode><BancQualification /></StrictMode>);
