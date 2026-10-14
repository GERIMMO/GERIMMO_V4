"use client";

import { useEffect } from "react";
import { purgerCopiesFichiersObsoletes } from "@/lib/brouillon-fichiers";
import { purgerCopiesAutresComptes, purgerCopiesPerimees } from "@/lib/copies-locales";
import { purgerBrouillonsEdl } from "@/lib/edl-brouillon";

/**
 * À poser sur toute page connectée, avec l'identifiant du compte courant : efface, dès l'arrivée, les copies de saisie
 * d'un AUTRE compte et les copies périmées (localStorage et IndexedDB).
 *
 * Audit du 13/10 (VER-PR178-02) : après une session expirée puis la connexion d'un autre compte dans le même navigateur
 * (aucun clic sur « Se déconnecter »), les copies du premier — identité, brouillon de lot, devis — restaient jusqu'à
 * l'ouverture de la fiche personne ou du formulaire d'incident, seuls appelants de la purge.
 */
export function PurgerCopiesAutresComptes({ compteId }: { compteId: string }) {
  useEffect(() => {
    purgerCopiesAutresComptes(compteId);
    purgerCopiesPerimees();
    // D15 (14/10) : ni l'ancienne clé sans compte ni un brouillon d'état des lieux sans ligne non envoyée ne subsistent ;
    // ceux qui gardent des relevés non envoyés restent, rattachés à leur compte (le compte courant ne relit que les siens).
    purgerBrouillonsEdl();
    void purgerCopiesFichiersObsoletes(compteId);
  }, [compteId]);
  return null;
}
