"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

// Section pliable de la fiche lot : un résumé (replié) + le détail éditable
// (déplié via « Modifier »). Ouverte par défaut si la section est incomplète.
// Si l'URL cible son ancre (#id, depuis un bouton « Corriger »), la section
// s'ouvre et défile à l'écran — y compris lors d'un changement de hash sur place.
export function SectionLot({
  id,
  titre,
  resume,
  children,
  ouvertParDefaut = false,
}: {
  id?: string;
  titre: string;
  resume: ReactNode;
  children: ReactNode;
  ouvertParDefaut?: boolean;
}) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut);

  useEffect(() => {
    if (!id) return;
    const ouvrirSiCible = () => {
      if (window.location.hash !== `#${id}`) return;
      setOuvert(true);
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    ouvrirSiCible();
    window.addEventListener("hashchange", ouvrirSiCible);
    return () => window.removeEventListener("hashchange", ouvrirSiCible);
  }, [id]);

  return (
    <div id={id} className="scroll-mt-20 border-t border-border pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{titre}</p>
          {!ouvert && <div className="mt-1 text-sm text-muted-foreground">{resume}</div>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOuvert((o) => !o)}>
          {ouvert ? "Fermer" : "Modifier"}
        </Button>
      </div>
      {ouvert && <div className="mt-3">{children}</div>}
    </div>
  );
}
