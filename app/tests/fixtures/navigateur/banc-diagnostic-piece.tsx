/**
 * Le banc navigateur du dépôt d'un diagnostic et de la proposition « Utiliser cette pièce » (X07, PROP-11).
 *
 * Il monte, dans un vrai Chromium et sous <StrictMode>, le VRAI formulaire `FormulaireDiagnostic` avec le VRAI crochet
 * `useActionFormulaire` (celui qui lit le bouton qui a envoyé le formulaire : `submitter`). Seule l'action du serveur est
 * simulée : elle note ce qu'elle reçoit (`window.__bancDiagnostic.envois`) et rend les réponses que le test a préparées
 * (`window.__bancDiagnostic.reponses`).
 *
 * Il est assemblé par `tests/formulaire-diagnostic-navigateur.test.ts` ; il ne fait pas partie de l'application.
 */
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { EtatParc } from "@/app/actions/parc";
import { FormulaireDiagnostic } from "../../../src/app/agence/[orgId]/parc/[bienId]/formulaire-diagnostic";
import { installerProtectionSaisie } from "../../../src/lib/protection-saisie";

/** Un envoi tel que l'action l'a reçu. */
export type EnvoiRecu = {
  pieceExistante: string | null;
  fichier: string | null;
  type: string | null;
  diagnostiqueur: string | null;
  dateRealisation: string | null;
};

export type Banc = {
  envois: EnvoiRecu[];
  reponses: EtatParc[];
  confirmations: string[];
  retarder: boolean;
  liberer?: () => void;
  reponseParDefaut?: EtatParc;
};

declare global {
  interface Window {
    __bancDiagnostic: Banc;
  }
}

const texte = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : null);

async function actionSimulee(_etat: EtatParc, donnees: FormData): Promise<EtatParc> {
  const banc = window.__bancDiagnostic;
  const fichier = donnees.get("fichier");
  banc.envois.push({
    pieceExistante: texte(donnees.get("piece_existante")),
    fichier: fichier instanceof File ? fichier.name : null,
    type: texte(donnees.get("type")),
    diagnostiqueur: texte(donnees.get("diagnostiqueur")),
    dateRealisation: texte(donnees.get("date_realisation")),
  });
  const reponse = banc.reponses.shift() ?? banc.reponseParDefaut ?? {};
  if (banc.retarder) await new Promise<void>((resolve) => { banc.liberer = resolve; });
  return reponse;
}

const REPONSES: Record<string, EtatParc> = {
  succes: { succes: "Diagnostic enregistré." },
  erreur: { erreur: "Le dépôt de test a été refusé. Votre saisie est conservée." },
  doublon: { erreur: "Ce rapport existe déjà.", pieceExistante: { id: "00000000-0000-4000-8000-00000000d0c1", titre: "Rapport fictif déjà déposé" } },
};

/** Sélection locale explicite pour le contrôle manuel : aucun octet n'est envoyé. */
function choisirRapportFictif() {
  const champ = document.querySelector<HTMLInputElement>('input[type="file"][name="fichier"]');
  if (!champ) return;
  champ.focus();
  const fichiers = new DataTransfer();
  fichiers.items.add(new File(["%PDF-1.4 Rapport de test local"], "rapport-fictif.pdf", { type: "application/pdf" }));
  champ.files = fichiers.files;
  champ.dispatchEvent(new Event("change", { bubbles: true }));
}

function BancDiagnostic() {
  const [rendu, setRendu] = useState(0);
  const [messages, setMessages] = useState<string[]>([]);
  const controle = new URLSearchParams(location.search).has("controle");
  useEffect(() => installerProtectionSaisie(), []);
  return <>
    {controle && <fieldset aria-label="Contrôles du banc local">
      <legend>Essai local — aucun document enregistré</legend>
      <button type="button" onClick={choisirRapportFictif}>Préparer un rapport fictif</button>
      <label>Réponse simulée <select defaultValue="succes" onChange={e => { window.__bancDiagnostic.reponseParDefaut = REPONSES[e.target.value]; }}>
        <option value="succes">Succès</option><option value="erreur">Erreur</option><option value="doublon">Doublon</option>
      </select></label>
      <label><input type="checkbox" onChange={e => { window.__bancDiagnostic.retarder = e.target.checked; }} />Retarder la réponse</label>
      <button type="button" onClick={() => { window.__bancDiagnostic.liberer?.(); window.__bancDiagnostic.liberer = undefined; }}>Recevoir la réponse</button>
    </fieldset>}
    <button type="button" onClick={() => setRendu(r => r + 1)}>Rejouer le rendu</button>
    <output aria-label="Rendus du parent">{rendu}</output>
    <output aria-label="Confirmations du dépôt">{messages.length}</output>
    <ul aria-label="Messages de confirmation">{messages.map((message, i) => <li key={i}>{message}</li>)}</ul>
    <FormulaireDiagnostic orgId="org" bienId="bien" lotId="lot" niveau="lot" actionDepot={actionSimulee}
      onDepotConfirmeAction={message => {
        window.__bancDiagnostic.confirmations.push(message);
        setMessages(messages => [...messages, message]);
      }} />
  </>;
}

window.__bancDiagnostic = { envois: [], reponses: [], confirmations: [], retarder: false,
  ...(new URLSearchParams(location.search).has("controle") ? { reponseParDefaut: REPONSES.succes } : {}) };
createRoot(document.getElementById("racine")!).render(
  <StrictMode>
    <BancDiagnostic />
  </StrictMode>,
);
