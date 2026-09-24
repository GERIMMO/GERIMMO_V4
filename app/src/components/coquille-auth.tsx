import type { ReactNode } from "react";
import Link from "next/link";
import { MarqueGerimmo } from "@/components/marque-gerimmo";

/**
 * Gabarit commun des quatre PORTES D'ENTRÉE : connexion, inscription, mot de
 * passe oublié, nouveau mot de passe.
 *
 * Elles se répartissaient en deux castes (constat de l'état des lieux du
 * 2026-09-11) : connexion et inscription avaient le panneau encre, la promesse
 * et la mention mono ; les deux pages de mot de passe étaient des cartes nues
 * centrées, d'un autre gabarit, avec un autre niveau de titre. Or ce sont les
 * mêmes écrans pour l'utilisateur — et celui qui a perdu son mot de passe est
 * précisément celui qu'il ne faut pas laisser douter du site où il se trouve.
 *
 * Le panneau encre ne s'affiche qu'à partir de `md` : sur téléphone, la marque
 * passe au-dessus du formulaire, comme avant.
 */
export function CoquilleAuth({
  promesse,
  sousPromesse,
  mention,
  titre,
  chapo,
  largeur = "340px",
  children,
}: {
  /** La phrase du panneau encre — ce que le produit fait, pas ce que la page demande. */
  promesse: string;
  sousPromesse: string;
  /** Mention mono en bas de panneau. */
  mention: string;
  /** Titre du formulaire (le h1 de la page). */
  titre: string;
  chapo?: ReactNode;
  largeur?: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-full flex-1 md:grid-cols-[1.05fr_1fr]">
      <div className="panneau-marque hidden flex-col justify-between p-13 text-[var(--sur-marque)] md:flex">
        {/* La marque ramène à la vitrine (24/09), comme sur la vitrine, le
            journal et les pages légales : c'était ici le seul logo inerte. */}
        <Link href="/" aria-label="Gerimmo — accueil" className="inline-flex min-h-11 items-center self-start">
          <MarqueGerimmo surEncre />
        </Link>
        <div>
          {/* Le panneau porte la promesse, pas le titre de la page : deux h1
              dans un même document se disputeraient la structure. */}
          <p className="max-w-[14ch] font-heading text-[2.25rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-[var(--sur-marque)] sm:max-w-[16ch]">
            {promesse}
          </p>
          <p className="mt-3.5 max-w-[26em] text-[15px] leading-relaxed text-[var(--sur-marque)]/80">
            {sousPromesse}
          </p>
        </div>
        {/* Pleine opacité (24/09) : à 70 %, sur la zone claire de la photo,
            c'était le texte le moins lisible de la page. */}
        <p className="mono-discret text-[var(--sur-marque)]">{mention}</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-8">
        <div className="w-full" style={{ maxWidth: largeur }}>
          <div className="mb-6 md:hidden">
            <Link href="/" aria-label="Gerimmo — accueil" className="inline-flex min-h-11 items-center">
              <MarqueGerimmo />
            </Link>
          </div>
          <h1 className="!text-[length:var(--pas-section)]">{titre}</h1>
          {chapo && (
            <p className="mt-1.5 mb-5 text-sm leading-relaxed text-muted-foreground">{chapo}</p>
          )}
          {children}
        </div>
      </div>
    </main>
  );
}
