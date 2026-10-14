"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { purgerCopiesLocales, RAISON_DECONNEXION } from "@/lib/copies-locales";

/**
 * À poser sur la page de connexion : arrivé ici par `/connexion?raison=deconnecte`, la session est fermée, et les copies
 * de saisie gardées sur l'appareil (brouillons, pièces jointes, quittance de l'outil public) sont effacées.
 *
 * Audit du 13/10 (PR178-A-01, puis VER-PR178-05) : la purge partait d'abord au clic sur « Se déconnecter », AVANT la
 * réussite de la déconnexion. Hors ligne, la copie disparaissait alors que la session restait ouverte. À l'arrivée sur
 * cette adresse, elle n'a plus lieu si la déconnexion échoue ; un utilisateur encore connecté n'atteint pas cette page
 * (le proxy le renvoie vers ses espaces). Une session EXPIRÉE n'efface rien : la personne se reconnecte et reprend sa saisie.
 */
export function PurgerCopiesALaDeconnexion() {
  const raison = useSearchParams().get("raison");
  useEffect(() => {
    if (raison === RAISON_DECONNEXION) purgerCopiesLocales();
  }, [raison]);
  return null;
}
