"use client";

import { useSyncExternalStore } from "react";

const sAbonner = () => () => {};

/**
 * La page est-elle « vivante » ? Faux dans le HTML envoyé par le serveur et pendant l'hydratation, vrai dès que React a
 * pris la main sur ce composant (et tout de suite pour un composant monté après coup, sans passage par le serveur).
 *
 * Décision D30 B (audit du 13/10/2026, PR178-B-04) : sur les formulaires protégés (useActionStateProtegee,
 * useActionFormulaire, useActionRetour), l'envoi passe par une fonction du navigateur. Un clic sur « Envoyer » avant la
 * fin du chargement du script ne faisait RIEN, sans un mot (téléphone modeste, réseau lent). Le bouton d'envoi reste
 * donc désactivé jusqu'à ce que la page soit prête : le geste est visiblement refusé au lieu d'être avalé en silence.
 * `BoutonEnvoi` s'en sert pour tous ses formulaires ; un bouton écrit à la main dans un formulaire protégé s'appuie
 * sur le même crochet (`disabled={enCours || !pret}`).
 */
export function useHydrate(): boolean {
  // Instantané serveur = faux, instantané navigateur = vrai : React rend d'abord le premier, puis bascule.
  return useSyncExternalStore(sAbonner, () => true, () => false);
}

/** Infobulle d'un bouton d'envoi qui attend la fin du chargement de la page. */
export const AIDE_BOUTON_EN_ATTENTE = "La page finit de se charger.";
