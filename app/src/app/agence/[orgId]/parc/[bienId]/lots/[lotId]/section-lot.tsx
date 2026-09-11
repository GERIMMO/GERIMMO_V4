"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { BadgeStatut } from "@/components/badge-statut";

// Section pliable de la fiche : un résumé (replié) + le détail éditable.
// Toutes les sections restent repliées — une section incomplète le signale par
// une pastille d'alerte plutôt qu'en s'ouvrant de force, ce qui rendait la page
// illisible dès qu'il manquait quelque chose. Si l'URL cible son ancre (#id,
// depuis un bouton « Corriger »), la section s'ouvre et défile à l'écran —
// y compris lors d'un changement de hash sur place.
//
// TOUTE LA RANGÉE EST LE BOUTON, et c'est le correctif du 11/09. Le geste était
// un bouton « Modifier » calé à droite : sur un écran de 1280 px, il se
// retrouvait à neuf cents pixels du libellé qu'il concernait, et sept rangées
// répétaient le même mot dans une colonne où l'œil n'a rien d'autre à lire. La
// rangée entière devient la cible — la distance ne compte plus, le mot
// disparaît, et il reste un chevron qui dit seulement dans quel sens ça va.
//
// `ouvertParDefaut` est l'exception, à n'employer que là où l'écran n'a plus
// qu'une seule suite possible (un lot disponible et sans aucun bail affichait
// « Aucun bail » au-dessus du seul formulaire de création de bail de
// l'application, replié). Une section qui s'ouvre « parce qu'il manque quelque
// chose » reste proscrite.
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
  const idContenu = useId();

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
    <div id={id} className="scroll-mt-20 border-t border-border">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        aria-controls={idContenu}
        // -mx-2 px-2 : la surbrillance déborde jusqu'au bord de la carte, de
        // sorte que la rangée se lit comme une rangée et non comme un bloc de
        // texte posé à côté d'un bouton.
        className="-mx-2 flex w-[calc(100%+1rem)] min-h-11 items-center gap-3 rounded-md px-2 py-3 text-left transition-colors hover:bg-[var(--filet-leger)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--or)]"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-2.5 text-sm font-medium">
            {titre}
            {alerte && <BadgeStatut ton="attente">{alerte}</BadgeStatut>}
          </span>
          {!ouvert && (
            <span
              className={`mt-1 block text-sm ${alerte ? "text-warning-soft-foreground" : "text-muted-foreground"}`}
            >
              {resume}
            </span>
          )}
        </span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={`size-4 shrink-0 fill-none stroke-current stroke-2 text-muted-foreground transition-transform ${ouvert ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {ouvert && (
        <div id={idContenu} className="pb-4">
          {children}
        </div>
      )}
    </div>
  );
}
