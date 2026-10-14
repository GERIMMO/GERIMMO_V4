"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { purgerCopiesLocales, RAISON_DECONNEXION } from "@/lib/copies-locales";
import { messageBrouillonsConserves } from "@/lib/edl-brouillon";

/**
 * Le message qui suit une déconnexion laissant des relevés d'état des lieux non envoyés sur l'appareil (D15, 14/10/2026).
 * Pure présentation : rien n'est lu ici, le nombre vient de la purge.
 */
export function AvertissementBrouillonsEdl({ nombre }: { nombre: number }) {
  return (
    <p role="status" className="mb-4 rounded-md border-l-4 border-warning bg-warning-soft p-3 text-sm text-warning-soft-foreground">
      {messageBrouillonsConserves(nombre)}
    </p>
  );
}

/**
 * À poser sur la page de connexion : arrivé ici par `/connexion?raison=deconnecte`, la session est fermée, et les copies
 * de saisie gardées sur l'appareil (brouillons, pièces jointes, quittance de l'outil public) sont effacées.
 *
 * Audit du 13/10 (PR178-A-01, puis VER-PR178-05) : la purge partait d'abord au clic sur « Se déconnecter », AVANT la
 * réussite de la déconnexion. Hors ligne, la copie disparaissait alors que la session restait ouverte. À l'arrivée sur
 * cette adresse, elle n'a plus lieu si la déconnexion échoue ; un utilisateur encore connecté n'atteint pas cette page
 * (le proxy le renvoie vers ses espaces). Une session EXPIRÉE n'efface rien : la personne se reconnecte et reprend sa saisie.
 *
 * D15 (14/10) : les brouillons d'état des lieux sans ligne non synchronisée partent aussi ; ceux qui en gardent restent
 * (les relevés jamais envoyés ne se détruisent pas) et la personne en est avertie ici.
 */
export function PurgerCopiesALaDeconnexion() {
  const raison = useSearchParams().get("raison");
  const [brouillonsConserves, setBrouillonsConserves] = useState(0);
  useEffect(() => {
    if (raison !== RAISON_DECONNEXION) return;
    const { conserves } = purgerCopiesLocales();
    // L'avertissement dépend du stockage de l'appareil, que le rendu serveur ne connaît pas : il vient après l'hydratation.
    queueMicrotask(() => setBrouillonsConserves(conserves));
  }, [raison]);
  return brouillonsConserves > 0 ? <AvertissementBrouillonsEdl nombre={brouillonsConserves} /> : null;
}
