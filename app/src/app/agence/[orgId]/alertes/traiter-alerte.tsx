"use client";

import { useState, type ReactNode } from "react";
import { ModaleAlerte, type AlerteRang, type Membre } from "./modale-alerte";

// « Traiter » ouvre la pop-up SUR L'ÉCRAN COURANT (recette 24/08) — tableau
// de bord et cloche ne redirigent plus vers l'onglet Alertes. Le bouton est
// rendu par l'appelant (enfant), la modale vit ici.
export function TraiterAlerte({
  orgId,
  alerte,
  membres,
  estResponsable,
  className,
  children,
  avantOuverture,
}: {
  orgId: string;
  alerte: AlerteRang;
  membres: Membre[];
  estResponsable: boolean;
  className?: string;
  children: ReactNode;
  // La cloche se referme avant d'ouvrir la pop-up de traitement
  avantOuverture?: () => void;
}) {
  const [ouverte, setOuverte] = useState(false);
  const emailParCompte = new Map(membres.map((m) => [m.account_id, m.email]));
  const nomAssignation = alerte.assigned_all
    ? "tout le monde"
    : (emailParCompte.get(alerte.assignee_account_id ?? "") ?? "—");

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          avantOuverture?.();
          setOuverte(true);
        }}
      >
        {children}
      </button>
      {ouverte && (
        <ModaleAlerte
          orgId={orgId}
          alerte={alerte}
          membres={membres}
          estResponsable={estResponsable}
          nomAssignation={nomAssignation}
          fermer={() => setOuverte(false)}
        />
      )}
    </>
  );
}
