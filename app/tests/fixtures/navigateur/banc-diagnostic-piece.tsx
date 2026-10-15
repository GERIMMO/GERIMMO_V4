/**
 * Le banc navigateur du dépôt d'un diagnostic et de la proposition « Utiliser cette pièce » (X07, PROP-11).
 *
 * Il monte, dans un vrai Chromium et sous <StrictMode>, le VRAI formulaire `FormulaireDiagnostic` avec le VRAI crochet
 * `useActionFormulaire` (celui qui lit le bouton qui a envoyé le formulaire : `submitter`). Seule l'action du serveur est
 * simulée : elle note ce qu'elle reçoit (`window.__banc.envois`) et rend les réponses que le test a préparées
 * (`window.__banc.reponses`).
 *
 * Il est assemblé par `tests/formulaire-diagnostic-navigateur.test.ts` ; il ne fait pas partie de l'application.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { EtatParc } from "@/app/actions/parc";
import { FormulaireDiagnostic } from "../../../src/app/agence/[orgId]/parc/[bienId]/formulaire-diagnostic";

/** Un envoi tel que l'action l'a reçu. */
export type EnvoiRecu = {
  pieceExistante: string | null;
  fichier: string | null;
  type: string | null;
  diagnostiqueur: string | null;
  dateRealisation: string | null;
};

export type Banc = { envois: EnvoiRecu[]; reponses: EtatParc[] };

declare global {
  interface Window {
    __banc: Banc;
  }
}

const texte = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : null);

async function actionSimulee(_etat: EtatParc, donnees: FormData): Promise<EtatParc> {
  const banc = window.__banc;
  const fichier = donnees.get("fichier");
  banc.envois.push({
    pieceExistante: texte(donnees.get("piece_existante")),
    fichier: fichier instanceof File ? fichier.name : null,
    type: texte(donnees.get("type")),
    diagnostiqueur: texte(donnees.get("diagnostiqueur")),
    dateRealisation: texte(donnees.get("date_realisation")),
  });
  return banc.reponses.shift() ?? {};
}

window.__banc = { envois: [], reponses: [] };
createRoot(document.getElementById("racine")!).render(
  <StrictMode>
    <FormulaireDiagnostic orgId="org" bienId="bien" lotId="lot" niveau="lot" actionDepot={actionSimulee} />
  </StrictMode>,
);
