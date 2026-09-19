"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const RIEN_A_ECOUTER = () => () => {};
const AU_NAVIGATEUR = () => true;
const AU_SERVEUR = () => false;

/**
 * Le tiroir — une feuille qui monte du bas de l'écran (design system v4).
 *
 * Il manquait au produit (aucune occurrence avant le 19/09) ; c'est la forme
 * que prend un menu, un filtre ou un choix sur téléphone, là où une modale
 * centrée serait trop petite et une page entière trop lourde.
 *
 * Même leçon que la modale : il se monte dans <body>. Un ancêtre qui porte
 * `backdrop-filter` ou `transform` capturerait sinon son `position: fixed`.
 */
export function Tiroir({
  titre,
  fermer,
  children,
}: {
  titre: string;
  fermer: () => void;
  children: ReactNode;
}) {
  const monte = useSyncExternalStore(RIEN_A_ECOUTER, AU_NAVIGATEUR, AU_SERVEUR);

  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    window.addEventListener("keydown", surTouche);
    const debordement = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", surTouche);
      document.body.style.overflow = debordement;
    };
  }, [fermer]);

  if (!monte) return null;

  return createPortal(
    <div className="tiroir-voile" onClick={fermer}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        className="tiroir"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tiroir-tete">
          <h2>{titre}</h2>
          <button
            type="button"
            onClick={fermer}
            aria-label="Fermer"
            className="flex size-10 items-center justify-center rounded-lg text-[var(--texte-2)] hover:bg-[var(--survol)]"
          >
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="tiroir-corps">{children}</div>
      </div>
    </div>,
    document.body
  );
}
