"use client";

import { useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { signalerErreurEcran } from "@/app/actions/erreurs";
import { accueilEspaceDuChemin } from "@/lib/continuite-espace";

/**
 * L'écran d'erreur, le même partout (Design System « Maison », 20/11/2026).
 *
 * Avant, une seule frontière existait, à la racine : une page d'un espace qui plantait emportait le menu, l'en-tête
 * et la marque avec elle, et la personne se retrouvait sur un écran nu. Chaque espace a maintenant sa frontière
 * (`error.tsx`), rendue DANS sa coquille : le menu reste, et un geste ramène à l'accueil de l'espace.
 *
 * Deux devoirs inchangés : dire ce qui se passe et rendre un geste (réessayer) ; noter l'incident, sans ses données,
 * pour la ronde du matin. Le condensé (`digest`) est la seule référence affichée : il permet de retrouver l'erreur
 * dans les journaux, il ne dit rien du contenu.
 */
export function EcranErreur({
  error,
  reset,
  enveloppe = "div",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** `main` quand la coquille laisse sa balise <main> à la page (racine, agence, supervision) ; `div` sinon. */
  enveloppe?: "main" | "div";
}) {
  const chemin = usePathname() ?? "/";
  useEffect(() => {
    void signalerErreurEcran({ digest: error.digest, chemin });
  }, [error.digest, chemin]);

  const accueil = accueilEspaceDuChemin(chemin);
  const dejaALAccueil = accueil?.href === chemin;
  const Enveloppe = enveloppe;

  return (
    <Enveloppe className="mx-auto w-full max-w-xl p-6 sm:p-10">
      <div className="vide-guide">
        <h1 className="titre">Cette page n&apos;a pas pu s&apos;afficher</h1>
        <p className="explication">
          Réessayez dans un instant. Si le problème persiste, contactez
          l&apos;assistance.
        </p>
        <div className="geste flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="btn-or inline-flex min-h-11 items-center">
            Réessayer
          </button>
          {accueil && !dejaALAccueil && (
            <a href={accueil.href} className="btn-secondaire inline-flex min-h-11 items-center">
              Revenir à l’accueil
            </a>
          )}
          <a href="/assistance" className="btn-secondaire inline-flex min-h-11 items-center">Contacter l’assistance</a>
        </div>
        {error.digest && (
          <details className="group mt-4 text-left text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3">Référence pour l’assistance<ChevronDown size={16} aria-hidden="true" className="shrink-0 group-open:rotate-180" /></summary>
            <p className="mono-discret sans-majuscules break-all py-2">{error.digest}</p>
          </details>
        )}
      </div>
    </Enveloppe>
  );
}
