"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { CLE_ESPACE, accueilEspaceDuChemin, type EspaceMemorise } from "@/lib/continuite-espace";

/**
 * L'accueil de l'espace où se trouve l'adresse demandée, ou null hors d'un espace. Une adresse introuvable ne doit
 * pas rester « la page d'où l'on vient » : le bandeau « Revenir à mon espace » ramènerait sur l'erreur. On retient
 * donc l'accueil de l'espace à sa place.
 */
const sansAbonnement = () => () => {};

function useAccueilEspace(): EspaceMemorise | null {
  // L'adresse est lue dans le navigateur, après l'hydratation : la page 404 de la racine est rendue sans elle.
  const chemin = useSyncExternalStore(sansAbonnement, () => window.location.pathname, () => "/");
  const accueil = accueilEspaceDuChemin(chemin);
  const href = accueil?.href;
  const libelle = accueil?.libelle;
  useEffect(() => {
    if (!href || !libelle) return;
    try {
      window.sessionStorage.setItem(CLE_ESPACE, JSON.stringify({ href, libelle }));
    } catch {
      // Stockage indisponible : le lien de la page suffit.
    }
  }, [href, libelle]);
  return accueil;
}

/** Le geste de sortie d'une page introuvable : l'accueil de l'espace si l'adresse en désigne un, sinon « Mes espaces ». */
export function LienRetourIntrouvable() {
  const accueil = useAccueilEspace();
  return (
    <Link href={accueil?.href ?? "/espaces"} className="btn-or inline-flex min-h-11 items-center">
      {accueil ? "Revenir à l’accueil" : "Retour à mon espace"}
    </Link>
  );
}

/**
 * « Page introuvable » DANS un espace (Design System « Maison », 20/11/2026).
 *
 * Une page d'un espace qui répond « introuvable » (un bien supprimé, un lien ancien, un écran réservé à un autre
 * rôle) affichait la page 404 de la racine : plus de menu, plus de marque de l'agence, et un bouton vers « Mes
 * espaces ». Elle s'affiche maintenant dans la coquille de l'espace, et ramène à son accueil. Le code « Erreur 404 »
 * reste lisible : c'est ce que l'on dicte à l'assistance. Rien n'est dit de ce que la page aurait montré.
 */
export function EcranIntrouvable({ enveloppe = "div" }: { enveloppe?: "main" | "div" }) {
  const Enveloppe = enveloppe;
  return (
    <Enveloppe className="mx-auto w-full max-w-xl p-6 sm:p-10">
      <div className="vide-guide">
        <p className="text-xs text-[var(--texte-secondaire)]">Erreur 404</p>
        <h1 className="titre">Cette page est introuvable</h1>
        <p className="explication">
          Le lien est peut-être ancien ou incomplet, ou cette page ne fait pas partie de votre espace. Vos données ne
          sont pas en cause.
        </p>
        <div className="geste">
          <LienRetourIntrouvable />
        </div>
      </div>
    </Enveloppe>
  );
}
