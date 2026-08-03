"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { BadgeStatut } from "@/components/badge-statut";

// Section pliable de la fiche : un résumé (replié) + le détail éditable (déplié
// via « Modifier »). Toutes les sections restent repliées — une section
// incomplète le signale par une pastille d'alerte plutôt qu'en s'ouvrant de
// force, ce qui rendait la page illisible dès qu'il manquait quelque chose.
// Si l'URL cible son ancre (#id, depuis un bouton « Corriger »), la section
// s'ouvre et défile à l'écran — y compris lors d'un changement de hash sur place.
export function SectionLot({
  id,
  titre,
  resume,
  children,
  alerte,
  ouvertParDefaut = false,
}: {
  id?: string;
  titre: string;
  resume: ReactNode;
  children: ReactNode;
  // Texte court de la pastille (« 2 manquants », « À valider »…) : absent = RAS
  alerte?: string;
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
          <p className="flex flex-wrap items-baseline gap-2.5 text-sm font-medium">
            {titre}
            {alerte && <BadgeStatut ton="attente">{alerte}</BadgeStatut>}
          </p>
          {!ouvert && (
            <div
              className={`mt-1 text-sm ${alerte ? "text-warning-soft-foreground" : "text-muted-foreground"}`}
            >
              {resume}
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOuvert((o) => !o)}>
          {ouvert ? "Fermer" : "Modifier"}
        </Button>
      </div>
      {ouvert && <div className="mt-3">{children}</div>}
    </div>
  );
}
