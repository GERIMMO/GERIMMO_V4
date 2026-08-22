"use client";

import { useEffect, type ReactNode } from "react";

// Modale unique de la charte (maquette .voile/.modale, recette 22/08) : le
// dépôt portait trois implémentations divergentes — voile encre 35 %, boîte
// crème à angles vifs, en-tête pleine largeur coloré (encre, ou rouge pour le
// critique/danger) avec surtitre mono + h3, corps en dessous. Escape et clic
// sur le voile ferment.
export function Modale({
  titre,
  surtitre,
  variante = "encre",
  large = false,
  haut = false,
  pied,
  fermer,
  children,
}: {
  titre: string;
  surtitre?: string;
  variante?: "encre" | "critique";
  large?: boolean;
  // Posée en haut de l'écran (synthèse de la cloche) plutôt que centrée
  haut?: boolean;
  // Rangée de pied séparée d'un filet (bouton Fermer…)
  pied?: ReactNode;
  fermer: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [fermer]);

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center overflow-y-auto bg-[var(--encre)]/35 p-4 ${
        haut ? "items-start pt-[10vh]" : "items-center"
      }`}
      onClick={fermer}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        className={`w-full border border-border bg-background text-foreground ${
          haut ? "" : "my-auto"
        } ${large ? "max-w-xl" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`px-5 py-3.5 text-[var(--sur-encre)] ${
            variante === "critique" ? "bg-[var(--destructive)]" : "bg-[var(--encre)]"
          }`}
        >
          {surtitre && (
            <p className="mono-discret text-[var(--sur-encre)]/75">{surtitre}</p>
          )}
          <h3 className="mt-0.5 text-[var(--sur-encre)]">{titre}</h3>
        </div>
        <div className="space-y-4 p-5">{children}</div>
        {pied && <div className="border-t border-border px-5 py-2.5 text-right">{pied}</div>}
      </div>
    </div>
  );
}
