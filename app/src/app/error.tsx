"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { signalerErreurEcran } from "@/app/actions/erreurs";

// La frontière d'erreur de toute l'application (hors gabarit racine, que
// global-error.tsx couvre). Avant le 19/09 il n'y en avait aucune : une page
// qui plantait montrait l'écran blanc de Next, et personne n'en savait rien.
//
// Deux devoirs : dire à la personne ce qui se passe et lui rendre un geste
// (réessayer) ; noter l'incident — sans ses données — pour que la ronde du
// matin le voie. Le condensé (`digest`) est la seule référence qu'on affiche :
// il permet de retrouver l'erreur dans les journaux, il ne dit rien du contenu.
export default function Erreur({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chemin = usePathname();
  useEffect(() => {
    void signalerErreurEcran({ digest: error.digest, chemin });
  }, [error.digest, chemin]);

  return (
    <main className="mx-auto w-full max-w-xl p-6 sm:p-10">
      <div className="vide-guide">
        {/* Audit final du 27/10 (PUB-15) : un vrai titre de page, et une sortie pour le visiteur sans compte — cette
            frontière couvre aussi la vitrine, les outils et la connexion, où « Aide et retours » n'existe pas. */}
        <h1 className="titre">Cette page n&apos;a pas pu s&apos;afficher</h1>
        <p className="explication">
          L&apos;incident est noté — la page, pas vos données. Vous pouvez
          réessayer&nbsp;; si cela se reproduit, écrivez-nous en indiquant la
          référence ci-dessous&nbsp;: depuis «&nbsp;Aide et retours&nbsp;» si
          vous êtes connecté, sinon par le{" "}
          <Link href="/#contact" className="lien-texte">
            formulaire de contact
          </Link>
          .
        </p>
        <div className="geste">
          <button type="button" onClick={reset} className="btn-or">
            Réessayer
          </button>
        </div>
        {error.digest && (
          <p className="mono-discret sans-majuscules mt-3">réf. {error.digest}</p>
        )}
      </div>
    </main>
  );
}
