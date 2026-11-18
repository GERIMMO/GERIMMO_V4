"use client";

import { useEffect } from "react";
import { ChevronDown } from "lucide-react";
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
        <h1 className="titre">Cette page n&apos;a pas pu s&apos;afficher</h1>
        <p className="explication">
          Réessayez dans un instant. Si le problème persiste, contactez
          l&apos;assistance.
        </p>
        <div className="geste flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="btn-secondaire" style={{ background: "var(--marque)", color: "var(--sur-marque)", minHeight: 44 }}>
            Réessayer
          </button>
          <a href="/assistance" className="btn-secondaire inline-flex min-h-11 items-center">Contacter l’assistance</a>
        </div>
        {error.digest && (
          <details className="group mt-4 text-left text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3">Référence pour l’assistance<ChevronDown size={16} aria-hidden="true" className="shrink-0 group-open:rotate-180" /></summary>
            <p className="mono-discret sans-majuscules break-all py-2">{error.digest}</p>
          </details>
        )}
      </div>
    </main>
  );
}
