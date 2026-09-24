"use client";

import { useEffect, useRef } from "react";

// « Télécharger » depuis l'espace locataire ouvre la quittance avec
// ?imprimer=1 : le document n'a pas de fichier, la feuille d'impression du
// navigateur (« Enregistrer en PDF ») en tient lieu. Elle s'ouvre une seule
// fois au chargement — le garde-fou évite le double appel du mode strict de
// React en développement (24/09).
export function ImpressionAutomatique() {
  const dejaLance = useRef(false);
  useEffect(() => {
    if (dejaLance.current) return;
    dejaLance.current = true;
    window.print();
  }, []);
  return null;
}
