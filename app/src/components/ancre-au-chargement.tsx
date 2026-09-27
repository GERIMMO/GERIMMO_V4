"use client";

import { useEffect } from "react";

/**
 * Amène à l'ancre de l'adresse une fois la page montée (audit du 27/09).
 *
 * Les liens « formulaire de l'accueil, rubrique Agences » (/connexion, pages
 * légales, bandeau public) mènent à `/#agences`. Venant d'une autre page, la
 * navigation arrivait en HAUT de l'accueil — le formulaire est à 9 000 px
 * plus bas. Ce composant fait le défilement que la navigation n'a pas fait ;
 * la marge haute de la section (scroll-margin-top) la garde hors du bandeau
 * collant.
 */
export function AncreAuChargement() {
  useEffect(() => {
    const cible = decodeURIComponent(window.location.hash.slice(1));
    if (!cible) return;
    // Après le premier rendu : les images de la vitrine ont une hauteur
    // réservée, la position de l'ancre est donc déjà la bonne.
    const minuterie = window.setTimeout(() => {
      document.getElementById(cible)?.scrollIntoView({ block: "start" });
    }, 50);
    return () => window.clearTimeout(minuterie);
  }, []);
  return null;
}
