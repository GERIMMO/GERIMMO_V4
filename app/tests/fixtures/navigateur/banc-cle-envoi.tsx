/**
 * Le banc navigateur des clés d'envoi et de la confirmation d'un encaissement (D05, D04 (2)).
 *
 * Il monte, dans un vrai Chromium et sous <StrictMode> (le tirage de la clé s'y joue deux fois, comme en développement),
 * les VRAIS composants du produit — `CleEnvoi`, `ConfirmationEncaissement`, `BoutonEnvoi` — et le VRAI crochet
 * `useActionStateProtegee` (la réponse perdue y revient en « état précédent + erreur »), câblés comme dans le formulaire
 * « Saisir un encaissement » de la fiche du bail. Seule l'action du serveur est simulée : elle note ce qu'elle reçoit
 * (`window.__banc.envois`) et rend les réponses que le test a préparées (`window.__banc.reponses`).
 *
 * Il est assemblé par `tests/cle-envoi-navigateur.test.ts` ; il ne fait pas partie de l'application.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CleEnvoi } from "@/components/cle-envoi";
import { ConfirmationEncaissement } from "@/components/confirmation-encaissement";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import type { ConfirmationEncaissement as Confirmation } from "@/lib/garde-encaissement";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";

/** Ce que l'action rend au formulaire (le sous-ensemble de `EtatLoyers` que les composants lisent). */
export type EtatBanc = {
  succes?: string;
  erreur?: string;
  dejaEnregistre?: boolean;
  confirmation?: Confirmation;
  valeurs?: { montant?: string };
};

/** Un envoi tel que l'action l'a reçu. */
export type EnvoiRecu = { cle: string | null; montant: string | null; confirmation: string | null };

/** Une réponse préparée : un état, ou « perdue » (l'action lève une exception, comme un réseau coupé). */
export type ReponseBanc = EtatBanc | "perdue";

export type Banc = {
  envois: EnvoiRecu[];
  reponses: ReponseBanc[];
  /** Tant qu'elle n'est pas résolue, l'action attend : l'envoi est « en cours ». */
  porte: Promise<void> | null;
  /** Résout `porte` : l'action reprend. */
  liberer: (() => void) | null;
};

declare global {
  interface Window {
    __banc: Banc;
  }
}

const texte = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : null);

async function actionSimulee(_etat: EtatBanc, donnees: FormData): Promise<EtatBanc> {
  const banc = window.__banc;
  banc.envois.push({ cle: texte(donnees.get("cle_envoi")), montant: texte(donnees.get("montant")), confirmation: texte(donnees.get("confirmation_montant")) });
  if (banc.porte) await banc.porte;
  const reponse = banc.reponses.shift() ?? {};
  if (reponse === "perdue") throw new Error("réseau coupé");
  return reponse;
}

function FormulaireEncaissement() {
  const [etat, action] = useActionState<EtatBanc, FormData>(actionSimulee, {});
  return (
    <form action={action}>
      <CleEnvoi etat={etat} />
      <label htmlFor="enc-montant">Montant (€)</label>
      <input id="enc-montant" name="montant" type="text" inputMode="decimal" defaultValue={etat.valeurs?.montant} />
      <BoutonEnvoi size="sm">Encaisser</BoutonEnvoi>
      <ConfirmationEncaissement confirmation={etat.confirmation} idChampMontant="enc-montant" />
      {etat.erreur && <p data-erreur>{etat.erreur}</p>}
      {etat.succes && <p data-succes>{etat.succes}</p>}
    </form>
  );
}

window.__banc = { envois: [], reponses: [], porte: null, liberer: null };
createRoot(document.getElementById("racine")!).render(
  <StrictMode>
    <FormulaireEncaissement />
  </StrictMode>,
);
