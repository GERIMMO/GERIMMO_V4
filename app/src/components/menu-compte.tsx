"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { seDeconnecter } from "@/app/actions/auth";

// LE MENU DU COMPTE — demande de l'humain, 12/09.
//
// « En bas à gauche j'ai les paramètres et la déconnexion… j'aimerais que ça
// soit un menu lorsque je clique sur l'avatar en haut à droite. »
//
// CE QUE ÇA RÉPARE, AU-DELÀ DU GOÛT. Ces liens vivaient au PIED de la barre
// latérale, là où la convention de tous les produits les cherche en haut à
// droite. Pire : sous 860 px, la barre se réduit à un rail d'icônes et son pied
// DISPARAÎT — il avait donc fallu un second mécanisme, `SortieMobile`, pour
// remettre trois icônes dans l'en-tête, et se déconnecter empruntait un chemin
// différent selon la largeur de l'écran. Un seul menu, dans l'en-tête, à toutes
// les largeurs : les deux mécanismes n'en font plus qu'un.
//
// L'AVATAR DEVIENT UN BOUTON. Il n'était qu'une pastille décorative
// (`aria-hidden`) ; il porte désormais un nom accessible et annonce qu'il ouvre
// un menu.

export function MenuCompte({
  initiales,
  titre,
  sousTitre,
  liens,
}: {
  initiales: string;
  /** Le nom affiché à côté de l'avatar, et en tête du menu. */
  titre: string;
  /** Le rôle, ou l'espace : « Admin d'agence », « Locataire »… */
  sousTitre?: string;
  liens: { href: string; libelle: string }[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const idMenu = useId();

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOuvert(false);
      // Le focus revient d'où il vient : sans cela, Échap laisse le clavier
      // au début du document.
      bouton.current?.focus();
    };
    // `pointerdown` plutôt que `click` : le menu doit se fermer dès qu'on
    // appuie ailleurs, sans attendre le relâchement.
    const surClicAilleurs = (e: PointerEvent) => {
      if (!conteneur.current?.contains(e.target as Node)) setOuvert(false);
    };
    window.addEventListener("keydown", surTouche);
    window.addEventListener("pointerdown", surClicAilleurs);
    return () => {
      window.removeEventListener("keydown", surTouche);
      window.removeEventListener("pointerdown", surClicAilleurs);
    };
  }, [ouvert]);

  return (
    <div className="menu-compte" ref={conteneur}>
      <button
        ref={bouton}
        type="button"
        className="menu-compte-bouton"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-controls={ouvert ? idMenu : undefined}
        onClick={() => setOuvert((o) => !o)}
      >
        {/* Le nom se lit sans ouvrir le menu, tant que l'écran le permet.
            Sous 700 px il cède la place : l'avatar suffit à viser. */}
        <span className="menu-compte-nom">
          {titre}
          {sousTitre && <span className="menu-compte-role"> · {sousTitre}</span>}
        </span>
        <span className="loc-avat" aria-hidden>
          {initiales || "◇"}
        </span>
        <span className="sr-only">Mon compte — ouvrir le menu</span>
      </button>

      {ouvert && (
        <div className="menu-compte-volet" id={idMenu} role="menu">
          <div className="menu-compte-tete">
            <span className="block truncate font-medium">{titre}</span>
            {sousTitre && (
              <span className="mono-discret block normal-case">{sousTitre}</span>
            )}
          </div>
          {liens.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              role="menuitem"
              onClick={() => setOuvert(false)}
            >
              {l.libelle}
            </Link>
          ))}
          {/* La déconnexion reste une ACTION serveur, pas un lien : elle révoque
              la session côté Supabase avant de renvoyer à l'accueil. */}
          <form action={seDeconnecter}>
            <button type="submit" role="menuitem" className="menu-compte-sortir">
              Se déconnecter
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
