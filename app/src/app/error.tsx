"use client";

import { EcranErreur } from "@/components/ecran-erreur";

// La frontière d'erreur de toute l'application (hors gabarit racine, que
// global-error.tsx couvre). Avant le 19/09 il n'y en avait aucune : une page
// qui plantait montrait l'écran blanc de Next, et personne n'en savait rien.
// Depuis le 20/11, chaque espace a aussi la sienne, rendue dans sa coquille :
// celle-ci ne sert plus qu'aux pages hors espace (vitrine, compte, connexion).
export default function Erreur(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <EcranErreur {...props} enveloppe="main" />;
}
