"use client";

import { useEffect, useEffectEvent, useRef, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { cibleDeTabulation } from "@/lib/piege-focus";
import { MESSAGE_FERMER_FENETRE, saisiesModifiees } from "@/lib/protection-saisie";

const CONTROLES = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable="true"]';
const fenetres: HTMLElement[] = [];
let defilement: { valeur: string; priorite: string } | null = null;

function visible(element: HTMLElement) {
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden" && !element.closest("[inert], [hidden]");
}

function controles(racine: HTMLElement) {
  return Array.from(racine.querySelectorAll<HTMLElement>(CONTROLES))
    .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && visible(element));
}

/**
 * Les dialogues natifs sont au-dessus de tous les portails, dans la top layer.
 *
 * Aussi le garde du raccourci ⌘/Ctrl K (audit #264, TRV-V01) : il comptait toute balise `role="dialog"` ou
 * `dialog[open]`, y compris une fenêtre gardée montée mais masquée (`ouverte={false}`) et le lecteur intégré
 * non modal. Le raccourci affiché ne faisait alors plus rien. Seule une fenêtre visible au premier plan compte.
 */
export function premierPlan() {
  const natifs = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog:modal"));
  if (natifs.length) return natifs.at(-1)!;
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
    .filter(visible).at(-1) ?? null;
}

/** Un même verrou et un seul propriétaire du clavier, même avec deux fenêtres ouvertes. */
export function useFenetreModale(racine: RefObject<HTMLDivElement | null>, ouverte: boolean, fermer: () => void) {
  const fermeture = useEffectEvent(fermer);
  useEffect(() => {
    const element = racine.current;
    if (!ouverte || !element) return;
    const precedent = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    fenetres.push(element);
    if (!defilement) {
      defilement = { valeur: document.body.style.getPropertyValue("overflow"), priorite: document.body.style.getPropertyPriority("overflow") };
      document.body.style.setProperty("overflow", "hidden");
    }

    const focaliser = () => (controles(element)[0] ?? element).focus({ preventScroll: true });
    if (premierPlan() === element) focaliser();
    const surFocus = (event: FocusEvent) => {
      if (premierPlan() === element && event.target instanceof Node && !element.contains(event.target)) focaliser();
    };
    const surTouche = (event: KeyboardEvent) => {
      if (event.defaultPrevented || premierPlan() !== element) return;
      if (event.key === "Escape") {
        event.preventDefault();
        // Une fermeture ne doit pas atteindre le gestionnaire de la fenêtre derrière.
        event.stopImmediatePropagation();
        fermeture();
        return;
      }
      if (event.key !== "Tab") return;
      const liste = controles(element);
      const actif = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const cible = cibleDeTabulation(liste, actif, event.shiftKey);
      if (!liste.length || cible) {
        event.preventDefault();
        (cible ?? element).focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", surTouche);
    document.addEventListener("focusin", surFocus);
    return () => {
      window.removeEventListener("keydown", surTouche);
      document.removeEventListener("focusin", surFocus);
      const etaitDerniere = fenetres.at(-1) === element;
      const index = fenetres.indexOf(element);
      if (index !== -1) fenetres.splice(index, 1);
      if (!fenetres.length && defilement) {
        if (defilement.valeur) document.body.style.setProperty("overflow", defilement.valeur, defilement.priorite);
        else document.body.style.removeProperty("overflow");
        defilement = null;
      }
      const restante = premierPlan();
      if (etaitDerniere && precedent?.isConnected && (!restante || restante === element || restante.contains(precedent))) {
        precedent.focus({ preventScroll: true });
      }
    };
  }, [ouverte, racine]);
}

/**
 * Le clic sur le voile, et lui seul (audit #264, TRV-01).
 *
 * Une sélection de texte commencée dans un champ et relâchée sur le voile envoie son « click » à leur
 * ancêtre commun : le voile. La fenêtre se refermait alors au milieu d'une saisie. Elle ne se ferme plus que
 * sur un geste commencé ET fini sur le voile. Et jamais en abandonnant sans le dire un formulaire suivi
 * (lib/protection-saisie) modifié dans la fenêtre : on le demande d'abord, comme pour quitter la page — sauf
 * si la fenêtre garde son contenu une fois refermée (`saisieConservee`).
 */
export function useFermetureParLeVoile(racine: RefObject<HTMLElement | null>, fermer: () => void, saisieConservee = false) {
  const appuiSurLeVoile = useRef(false);
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => { appuiSurLeVoile.current = event.target === event.currentTarget; },
    onPointerUp: (event: PointerEvent<HTMLElement>) => { if (event.target !== event.currentTarget) appuiSurLeVoile.current = false; },
    onClick: (event: MouseEvent<HTMLElement>) => {
      const surLeVoile = appuiSurLeVoile.current && event.target === event.currentTarget;
      appuiSurLeVoile.current = false;
      if (!surLeVoile) return;
      const fenetre = racine.current;
      if (!saisieConservee && fenetre && saisiesModifiees().some(formulaire => fenetre.contains(formulaire))
        && !window.confirm(MESSAGE_FERMER_FENETRE)) return;
      fermer();
    },
  };
}
