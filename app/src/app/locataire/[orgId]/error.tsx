"use client";

import { EcranErreur } from "@/components/ecran-erreur";

// Frontière d'erreur de l'espace locataire : l'écran s'affiche DANS la coquille (menu, en-tête, marque),
// au lieu de remplacer toute la page par l'écran d'erreur de la racine.
export default function ErreurLocataire(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <EcranErreur {...props} enveloppe="div" />;
}
