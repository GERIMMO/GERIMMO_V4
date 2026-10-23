/**
 * Le banc navigateur du premier mot de passe, choisi juste après la confirmation de l'adresse (relevé du 23/10, PRO-4).
 *
 * Il HYDRATE, dans un vrai Chromium et sous <StrictMode>, le HTML que le serveur a rendu pour le VRAI formulaire
 * `FormulaireNouveauMotDePasse`, câblé à la VRAIE action `definirNouveauMotDePasse` (ses refus et la saisie qu'elle rend).
 * Seuls Supabase et les modules propres au serveur de Next sont remplacés (`supabase-serveur-neutre.ts`,
 * `next-serveur-neutre.ts`) : le compte vient de confirmer son adresse, sa session est née du lien, et Supabase Auth
 * refuse chaque mot de passe avec la réponse que le test a préparée. Rien n'est donc jamais enregistré.
 *
 * Le banc note ce que le navigateur envoie réellement (événement `formdata`, sans les deux mots de passe) dans
 * `window.__bancMotDePasse.envois`, et ce que l'action aurait enregistré (le `data` remis à `updateUser`) dans
 * `window.__bancMotDePasse.enregistrements`.
 *
 * Il est assemblé par `tests/premier-mot-de-passe-navigateur.test.ts` ; il ne fait pas partie de l'application.
 */
import { StrictMode, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";
import { FormulaireNouveauMotDePasse } from "@/app/nouveau-mot-de-passe/formulaire-nouveau-mot-de-passe";

/** Un envoi tel que le navigateur l'a construit, sans les mots de passe. */
export type EnvoiRecu = Record<string, string>;

/** Une réponse préparée de Supabase Auth à `updateUser` : toujours un refus. */
export type RefusAuth = { code: string; message: string };

export type BancMotDePasse = {
  /** Le profil saisi à l'inscription, qui attend sa vérification (`profil_a_confirmer`). */
  profil: Record<string, string>;
  envois: EnvoiRecu[];
  enregistrements: Record<string, unknown>[];
  refusAuth: RefusAuth[];
  /** Erreurs que React a rattrapées (une hydratation qui ne correspond pas au HTML du serveur, par exemple). */
  erreurs: string[];
  /** Vrai une fois l'hydratation faite. */
  pret: boolean;
};

declare global {
  interface Window {
    __bancMotDePasse: BancMotDePasse;
  }
}

const banc = window.__bancMotDePasse;
document.addEventListener(
  "formdata",
  (evenement) => {
    const envoi: EnvoiRecu = {};
    for (const [cle, valeur] of evenement.formData.entries()) {
      if (cle !== "mot_de_passe" && cle !== "confirmation" && typeof valeur === "string") envoi[cle] = valeur;
    }
    banc.envois.push(envoi);
  },
  true,
);

function Pret() {
  useEffect(() => {
    banc.pret = true;
  }, []);
  return null;
}

hydrateRoot(
  document.getElementById("racine")!,
  <StrictMode>
    <FormulaireNouveauMotDePasse suite="/espaces" profilAConfirmer={banc.profil} />
    <Pret />
  </StrictMode>,
  { onRecoverableError: (erreur) => banc.erreurs.push(erreur instanceof Error ? erreur.message : String(erreur)) },
);
