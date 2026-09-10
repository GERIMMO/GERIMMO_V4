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
    // Sur tactile, le défilement dans la modale se propage sinon à la page
    // en arrière-plan (scroll chaining)
    const debordement = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", surTouche);
      document.body.style.overflow = debordement;
    };
  }, [fermer]);

  return (
    <div
      // max-w-[100vw] n'est pas une ceinture de sécurité décorative (constat de
      // rendu du 11/09, à 390 px) : quand le document est plus large que la
      // fenêtre, le bloc conteneur d'un `fixed inset-0` s'étire à la largeur du
      // DOCUMENT, pas à celle de la fenêtre. La modale mesurait alors 470 px de
      // large sur un écran de 390, et ses DEUX boutons « Fermer » tombaient
      // hors champ — clipés par `body{overflow-x:hidden}`, donc impossibles à
      // toucher. Comme la synthèse d'alertes s'ouvre d'elle-même à chaque
      // connexion, un utilisateur sur téléphone se retrouvait enfermé dedans.
      className={`fixed inset-0 z-50 flex max-w-[100vw] justify-center overflow-x-hidden overflow-y-auto bg-[var(--encre)]/35 p-4 ${
        haut ? "items-start pt-[10vh]" : "items-center"
      }`}
      onClick={fermer}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        className={`flex max-h-[calc(100dvh-2rem)] w-full flex-col border border-border bg-background text-foreground ${
          haut ? "" : "my-auto"
        } ${large ? "max-w-xl" : "max-w-md"} max-w-[calc(100vw-2rem)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-start justify-between gap-3 px-5 py-3.5 text-[var(--sur-encre)] ${
            variante === "critique" ? "bg-[var(--destructive)]" : "bg-[var(--encre)]"
          }`}
        >
          <div>
            {surtitre && (
              <p className="mono-discret text-[var(--sur-encre)]/75">{surtitre}</p>
            )}
            <h3 className="mt-0.5 text-[var(--sur-encre)]">{titre}</h3>
          </div>
          {/* Fermeture au doigt : Escape n'existe pas sur mobile et le tap
              sur le voile n'est pas découvrable (audit mobile 10/09) */}
          <button
            type="button"
            onClick={fermer}
            aria-label="Fermer"
            className="-mr-2 -mt-1 flex size-10 shrink-0 items-center justify-center text-[var(--sur-encre)]/80 transition-colors hover:text-[var(--sur-encre)]"
          >
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
        {pied && <div className="border-t border-border px-5 py-2.5 text-right">{pied}</div>}
      </div>
    </div>
  );
}
