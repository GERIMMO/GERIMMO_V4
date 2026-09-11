"use client";

import { useRouter } from "next/navigation";

// La quittance vit sur une route RACINE, hors de tout espace : ni menu, ni fil
// d'Ariane. Un locataire qui l'ouvrait depuis son accueil se retrouvait sur un
// document sans aucune sortie — le bouton « précédent » du navigateur, ou rien
// (relevé du 11/09).
//
// `router.back()` ramène là d'où l'on vient, ce qui est la bonne réponse dans
// tous les cas : l'accueil, la liste des loyers, ou le lien reçu par email.
// Quand il n'y a pas d'historique — onglet neuf ouvert sur le lien d'un
// email — on retombe sur le sélecteur d'espaces, d'où tout est accessible.
export function BoutonRetour({ repli = "/espaces", libelle = "Retour" }: { repli?: string; libelle?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="lien-discret"
      onClick={() => {
        // `history.length` vaut 1 sur un onglet neuf ; au-delà, on a une page
        // d'où l'on vient. Ce n'est pas infaillible (le compteur inclut les
        // redirections), mais l'erreur est sans conséquence : on atterrit sur
        // le sélecteur d'espaces au lieu de la page précédente.
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(repli);
      }}
    >
      ← {libelle}
    </button>
  );
}
