"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

// « Sommes-nous dans le navigateur ? », posé comme React veut qu'on le pose :
// une source extérieure qui ne change jamais, un instantané `false` au rendu
// serveur et `true` au client. Un `useState` + `useEffect` dirait la même
// chose, mais en écrivant un état depuis un effet — ce que la règle de pureté
// refuse, et elle a raison : ce n'est pas un changement, c'est un constat.
const RIEN_A_ECOUTER = () => () => {};
const AU_NAVIGATEUR = () => true;
const AU_SERVEUR = () => false;

// Modale unique de la charte (maquette .voile/.modale, recette 22/08) : le
// dépôt portait trois implémentations divergentes — voile encre 35 %, boîte
// crème à angles vifs, en-tête pleine largeur coloré (encre, ou rouge pour le
// critique/danger) avec surtitre mono + h3, corps en dessous. Escape et clic
// sur le voile ferment.
export function Modale({
  titre,
  surtitre,
  entete,
  variante = "encre",
  large = false,
  tresLarge = false,
  haut = false,
  pied,
  fermer,
  children,
}: {
  titre: string;
  surtitre?: string;
  /**
   * Un en-tête à soi, à la place du surtitre + titre.
   *
   * Le bandeau encre, la croix de fermeture et tout le reste ne bougent pas :
   * seule la zone de texte change. Une fenêtre qui doit porter davantage — une
   * vignette, des pastilles d'état — n'a pas à réimplémenter une modale, avec
   * l'échappement, le verrou de défilement et les gabarits qui vont avec.
   * `titre` reste exigé : c'est le nom que lisent les lecteurs d'écran.
   */
  entete?: ReactNode;
  variante?: "encre" | "critique";
  large?: boolean;
  /** Plus large encore : une fenêtre à deux colonnes et à onglets. */
  tresLarge?: boolean;
  // Posée en haut de l'écran (synthèse de la cloche) plutôt que centrée
  haut?: boolean;
  // Rangée de pied séparée d'un filet (bouton Fermer…)
  pied?: ReactNode;
  fermer: () => void;
  children: ReactNode;
}) {
  // LA FENÊTRE VIT DANS <body>, PAS LÀ OÙ ELLE EST ÉCRITE, et c'est le
  // correctif du 19/09. `position: fixed` ne se règle sur la FENÊTRE que si
  // aucun ancêtre ne forme un bloc conteneur — et `backdrop-filter`,
  // `transform`, `filter`, `perspective` ou `will-change` en forment un.
  // Depuis la charte v3, le bandeau collant `.bandeau-appli` porte
  // `backdrop-filter: blur(8px)` ; la synthèse d'alertes, écrite DANS ce
  // bandeau (console, espaces agence, « Mes espaces »), s'y repliait donc :
  // `inset-0` se résolvait sur les soixante pixels du bandeau, et la modale
  // s'ouvrait coupée en deux — on lisait « DONT 6 CRITIQUES » et la moitié du
  // titre, rien d'autre. Capture du porteur du projet, console
  // d'administration.
  //
  // Le portail règle la classe entière de ces pannes : d'où qu'une modale
  // soit écrite, elle se pose au même endroit. Retirer le `backdrop-filter`
  // n'aurait réparé que ce bandeau-ci, jusqu'au prochain ancêtre animé.
  const monte = useSyncExternalStore(RIEN_A_ECOUTER, AU_NAVIGATEUR, AU_SERVEUR);

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

  // Rien avant le montage : le portail exige `document`, et une modale ne
  // s'ouvre jamais au premier rendu du serveur.
  if (!monte) return null;

  return createPortal(
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
        } ${
          // UNE SEULE CLASSE DE LARGEUR, ET C'EST DÉLIBÉRÉ (constat au
          // navigateur, 12/09). Il y en avait deux — la taille voulue, puis le
          // garde-fou `max-w-[calc(100vw-2rem)]` — et elles portent la MÊME
          // spécificité : c'est l'ordre de la feuille compilée qui tranchait,
          // pas l'ordre d'écriture. Le garde-fou gagnait, et la fenêtre prenait
          // tout l'écran moins deux rem au lieu de sa taille. `min()` fait le
          // travail des deux sans que rien n'ait à gagner.
          tresLarge
            ? "max-w-[min(48rem,calc(100vw-2rem))]"
            : large
              ? "max-w-[min(36rem,calc(100vw-2rem))]"
              : "max-w-[min(28rem,calc(100vw-2rem))]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-start justify-between gap-3 px-5 py-3.5 text-[var(--sur-encre)] ${
            variante === "critique" ? "bg-[var(--destructive)]" : "bg-[var(--encre)]"
          }`}
        >
          {entete ?? (
            <div>
              {surtitre && (
                <p className="mono-discret text-[var(--sur-encre)]/75">{surtitre}</p>
              )}
              <h3 className="mt-0.5 text-[var(--sur-encre)]">{titre}</h3>
            </div>
          )}
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
    </div>,
    document.body
  );
}
