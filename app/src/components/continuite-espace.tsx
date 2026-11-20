"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CLE_ESPACE, cheminEntreeSession, espaceAMemoriser, lireEspaceMemorise, type EspaceMemorise } from "@/lib/continuite-espace";

/**
 * Posé une fois, dans le layout racine. Dans un espace, il retient la page courante (par onglet). Hors d'un espace,
 * il affiche un bandeau « Revenir à … » vers cette page et signale à la feuille de style de masquer les appels
 * « Se connecter » et « Créer mon compte » de la vitrine. Aucune lecture de session côté serveur : les pages
 * publiques restent statiques. Sans JavaScript, ou sans espace retenu, rien ne change.
 */
export function ContinuiteEspace() {
  const chemin = usePathname() ?? "/";
  const [espace, setEspace] = useState<EspaceMemorise | null>(null);

  useEffect(() => {
    const racine = document.documentElement;
    let retenu: EspaceMemorise | null = null;
    try {
      const aRetenir = espaceAMemoriser(chemin, window.location.search);
      if (aRetenir) {
        window.sessionStorage.setItem(CLE_ESPACE, JSON.stringify(aRetenir));
      } else if (cheminEntreeSession(chemin)) {
        window.sessionStorage.removeItem(CLE_ESPACE);
      } else {
        retenu = lireEspaceMemorise(window.sessionStorage.getItem(CLE_ESPACE));
      }
    } catch {
      // Stockage indisponible (navigation privée stricte) : pas de bandeau, la page reste utilisable.
    }
    if (retenu) racine.setAttribute("data-depuis-espace", "1");
    else racine.removeAttribute("data-depuis-espace");
    // Lecture d'un stockage du navigateur après l'hydratation : le rendu serveur ne peut pas la connaître.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEspace(retenu);
    return () => racine.removeAttribute("data-depuis-espace");
  }, [chemin]);

  if (!espace) return null;
  return (
    <nav aria-label="Retour à votre espace" className="retour-espace print:hidden">
      <a href={espace.href}>
        <ArrowLeft size={16} aria-hidden />
        Revenir à {espace.libelle}
      </a>
      {/* Pas de nom de marque ici : le locataire d'une agence en marque blanche ne doit jamais lire « Gerimmo ». */}
      <span>Page ouverte depuis votre espace</span>
    </nav>
  );
}
