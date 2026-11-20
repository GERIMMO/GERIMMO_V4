import Link from "next/link";
import type { ReactNode } from "react";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { OUTILS } from "@/lib/outils/catalogue";
import { badgeEssai, dureeEssai } from "@/lib/tarifs";
import { IconeTrait, PucesGratuit, TuileOutil, outilsPresentes } from "./icones-outils";
import { DemandeRappel } from "@/components/demande-rappel";

// LA COQUILLE DES OUTILS GRATUITS (29/09, habillée le 30/09) : en-tête et
// pied publics, fil d'Ariane, en-tête de l'outil (tuile d'icône, « Outil
// gratuit », titre, promesse), puis l'outil, « Comment c'est calculé »
// (repliable), « Bon à savoir », les autres outils et l'invitation à l'essai.
// Tout ce qui l'entoure est masqué à l'impression : seul le document produit
// par l'outil (lettre, quittance) part sur papier.
//
// Design System « Maison » (20/11) : l'en-tête d'un outil est le gabarit commun des pages secondaires de la vitrine
// (`public-page-intro` : lien de retour, sur-titre, h1 à la taille commune, chapo), dans le conteneur de 1 200 px
// de l'en-tête. L'invitation à créer un compte porte `data-appel-inscription` : elle s'efface pour une personne
// venue de son espace (systeme.css).
//
// Les enveloppes `contents` ne créent pas de boîte : l'en-tête reste collé en
// haut de page, et `print:hidden` les retire du papier.

export function CoquilleOutil({
  chemin,
  titre,
  promesse,
  calcul,
  bonASavoir,
  children,
}: {
  /** Le chemin de l'outil : son icône et les « autres outils » en dépendent. */
  chemin: string;
  titre: string;
  /** Une phrase : ce que l'outil donne. */
  promesse: ReactNode;
  /** « Comment c'est calculé » : la formule et ses sources. */
  calcul: ReactNode;
  /** « Bon à savoir » : limites, pièges, réglementation. */
  bonASavoir: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="site-public flex min-h-full flex-1 flex-col">
      <div className="contents print:hidden">
        <EnTetePublic />
      </div>
      <main className="flex-1 print:p-0">
        <header className="public-page-intro print:hidden">
          <div className="public-conteneur">
            <nav aria-label="Fil d'Ariane">
              <Link href="/outils" className="public-retour">
                ← Tous les outils
              </Link>
            </nav>
            <div className="public-page-titre">
              <TuileOutil chemin={chemin} taille="lg" />
              <div>
                <p className="eyebrow">Outil gratuit</p>
                <h1>{titre}</h1>
                <p>{promesse}</p>
                <div className="public-page-reperes">
                  <PucesGratuit />
                  <p>
                    <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0 fill-none stroke-current" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="10.5" width="14" height="10" rx="2" />
                      <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
                    </svg>
                    Rien de ce que vous saisissez n&apos;est envoyé à nos serveurs
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="public-conteneur space-y-10 py-7 sm:py-10 print:space-y-0 print:p-0">
          {children}

          <div className="grid gap-5 lg:grid-cols-2 lg:items-start print:hidden">
            <details className="outil-repli group">
              <summary>
                <span className="flex items-center gap-3">
                  <span className="outil-tuile size-9 rounded-[var(--rayon-bouton)]">
                    <IconeTrait nom="outils" className="size-[18px]" />
                  </span>
                  <span className="text-[length:var(--titre-3)] font-semibold text-[var(--encre)]">Comment c&apos;est calculé</span>
                </span>
                <svg viewBox="0 0 24 24" aria-hidden className="outil-repli-chevron size-5 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <div className="outil-repli-corps">{calcul}</div>
            </details>
            <aside className="outil-bon-a-savoir" aria-labelledby="bon-a-savoir">
              <h2 id="bon-a-savoir" className="titre-carte flex items-center gap-2.5 font-semibold">
                <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-none stroke-[var(--prestige-champagne-texte)]" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3Z" />
                </svg>
                Bon à savoir
              </h2>
              <div className="outil-prose mt-3">{bonASavoir}</div>
            </aside>
          </div>

          <AutresOutils sauf={chemin} />
          <AppelEssai chemin={chemin} />
          {/* « Être rappelé » (20/11) : pour qui préfère un appel à une inscription. */}
          <DemandeRappel origine={chemin} />
        </div>
      </main>
      <div className="contents print:hidden">
        <PiedPublic courant="/outils" />
      </div>
    </div>
  );
}

/** La bande des autres outils, sous chaque outil. */
export function AutresOutils({ sauf }: { sauf?: string }) {
  return (
    <section aria-labelledby="autres-outils" className="print:hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="autres-outils">Les autres outils gratuits</h2>
        <Link href="/outils" className="public-lien">
          Tous les outils <span aria-hidden>→</span>
        </Link>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {outilsPresentes(sauf).map((o) => (
          <li key={o.chemin} className="min-w-0">
            <Link href={o.chemin} className="outil-lien-carte group">
              <TuileOutil chemin={o.chemin} taille="sm" />
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold leading-snug text-[var(--encre)]">
                  {o.court}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--texte-secondaire)]">{o.accroche}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CocheClaire() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="mt-0.5 size-4 shrink-0 fill-none stroke-[var(--sur-marque)] stroke-[2.2]">
      <path d="m4.5 10.5 3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** L'invitation à créer un compte, sous chaque outil. */
export function AppelEssai({ chemin }: { chemin?: string }) {
  const outil = OUTILS.find((o) => o.chemin === chemin);
  const duree = dureeEssai();
  return (
    <section data-appel-inscription className="vitrine-bandeau outil-appel print:hidden" aria-labelledby="appel-essai">
      <div className="relative grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:items-center">
        <div>
          <p className="eyebrow">Votre espace propriétaire</p>
          <p
            className="mt-3 inline-flex rounded-full px-3 py-1 text-[12.5px] font-semibold bg-[var(--ivoire)] text-[var(--encre)]"
          >
            {badgeEssai()}
          </p>
          <h2 id="appel-essai" className="mt-3 max-w-[26ch]">
            Retrouvez vos locations et vos justificatifs
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--sur-marque)]/85">
            {outil?.suite ?? "Réunissez vos baux, vos loyers et les pièces de votre patrimoine dans votre espace propriétaire."} Essai gratuit de {duree}, sans carte bancaire.
          </p>
          <Link
            href="/inscription"
            className="public-appel-bouton mt-6"
          >
            Créer mon compte — {duree} d&apos;essai
            <span aria-hidden>→</span>
          </Link>
        </div>
        <ul className="public-appel-liste space-y-3 p-5 text-[14px] leading-snug text-[var(--sur-marque)] sm:p-6">
          {[
            "Quittances et reçus selon les montants encaissés",
            "Échéances visibles dans le tableau de bord",
            "Relances de loyer à préparer en PDF",
            "Aide à la 2044 pour la location nue au réel",
          ].map((l) => (
            <li key={l} className="flex gap-2.5">
              <CocheClaire />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
