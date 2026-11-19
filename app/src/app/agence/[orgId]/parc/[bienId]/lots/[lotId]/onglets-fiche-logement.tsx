"use client";

import type { ReactNode } from "react";
import { OngletsDossier } from "@/components/onglets-dossier";
import styles from "./fiche-lot.module.css";

/** Présentation seule : les formulaires restent montés et leurs ancres accessibles. */
export function OngletsFicheLogement({ rubriques, initiale }: {
  rubriques: { id: string; titre: string; contenu: ReactNode }[];
  initiale: string;
}) {
  return <div className={`${styles.ficheProprietaire} ${styles.sixCartes} ${styles.ongletsLogement}`}
    onInvalidCapture={event => {
      // Préserver la révélation des formulaires repliés de l'ancienne fiche continue.
      for (let parent = event.target instanceof HTMLElement ? event.target : null;
        parent && parent !== event.currentTarget; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
    }}>
    <OngletsDossier libelle="Fiche du logement" rubriques={rubriques} initiale={initiale} />
  </div>;
}
