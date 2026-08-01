"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

// Section pliable de la fiche lot : un résumé (replié) + le détail éditable
// (déplié via « Modifier »). Ouverte par défaut si la section est incomplète.
export function SectionLot({
  titre,
  resume,
  children,
  ouvertParDefaut = false,
}: {
  titre: string;
  resume: ReactNode;
  children: ReactNode;
  ouvertParDefaut?: boolean;
}) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  return (
    <div className="border-t border-border pt-4">
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
