"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cibleDeTabulation } from "@/lib/piege-focus";

const RIEN_A_ECOUTER = () => () => {};
const AU_NAVIGATEUR = () => true;
const AU_SERVEUR = () => false;

// Ce que Tab peut atteindre dans le tiroir.
const FOCALISABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * Le tiroir — une feuille qui monte du bas de l'écran (design system v4).
 *
 * Il manquait au produit (aucune occurrence avant le 19/09) ; c'est la forme
 * que prend un menu, un filtre ou un choix sur téléphone, là où une modale
 * centrée serait trop petite et une page entière trop lourde.
 *
 * Même leçon que la modale : il se monte dans <body>. Un ancêtre qui porte
 * `backdrop-filter` ou `transform` capturerait sinon son `position: fixed`.
 *
 * Il est `aria-modal` : il doit donc tenir le focus (audit du 13/10, DES-A-09).
 * Sans cela le clavier restait sur le bouton « Menu », derrière le voile, et Tab
 * partait dans la page cachée — douze arrêts sur vingt-cinq au relevé. À l'ouverture
 * le focus entre dans le tiroir (premier contrôle : « Fermer ») ; Tab et Maj+Tab
 * y bouclent ; à la fermeture il revient là où il était. Échap ferme comme avant.
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
  const dialogue = useRef<HTMLDivElement>(null);

  // Le focus entre à l'ouverture et revient au bouton qui l'a ouvert à la fermeture.
  // Un effet à part, sans `fermer` dans ses dépendances : `fermer` est une flèche neuve à
  // chaque rendu du parent, et le focus ne doit pas être repris à chaque rendu.
  useEffect(() => {
    if (!monte) return;
    const precedent = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const racine = dialogue.current;
    (racine?.querySelector<HTMLElement>(FOCALISABLES) ?? racine)?.focus({ preventScroll: true });
    return () => {
      if (precedent?.isConnected) precedent.focus({ preventScroll: true });
    };
  }, [monte]);

  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        fermer();
        return;
      }
      if (e.key !== "Tab") return;
      const racine = dialogue.current;
      if (!racine) return;
      const actif = document.activeElement;
      // Une autre fenêtre modale ouverte par-dessus (la recherche, au raccourci Ctrl+K)
      // garde son propre focus : on ne le lui reprend pas.
      const autre = actif?.closest('[aria-modal="true"]');
      if (autre && autre !== racine) return;
      const focalisables = Array.from(racine.querySelectorAll<HTMLElement>(FOCALISABLES)).filter(
        (el) => el.getClientRects().length > 0
      );
      const cible = cibleDeTabulation(focalisables, actif instanceof HTMLElement ? actif : null, e.shiftKey);
      // Rien à viser : le focus reste sur le tiroir lui-même plutôt que de sortir.
      if (focalisables.length === 0) {
        e.preventDefault();
        racine.focus({ preventScroll: true });
      } else if (cible) {
        e.preventDefault();
        cible.focus({ preventScroll: true });
      }
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
        ref={dialogue}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        // Focalisable par programme seulement (jamais dans l'ordre de Tab) : le repli du
        // piège quand le tiroir n'a aucun contrôle, sans cadre de focus à l'écran.
        tabIndex={-1}
        className="tiroir outline-none"
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
