import Link from "next/link";
import type { ReactNode } from "react";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { DUREE_ESSAI } from "@/lib/tarifs";
import { IconeTrait, PucesGratuit, TuileOutil, outilsPresentes } from "./icones-outils";

// LA COQUILLE DES OUTILS GRATUITS (29/09, habillée le 30/09) : en-tête et
// pied publics, fil d'Ariane, en-tête de l'outil (tuile d'icône, « Outil
// gratuit », titre, promesse), puis l'outil, « Comment c'est calculé »
// (repliable), « Bon à savoir », les autres outils et l'invitation à l'essai.
// Tout ce qui l'entoure est masqué à l'impression : seul le document produit
// par l'outil (lettre, quittance) part sur papier.
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
    <div className="flex min-h-full flex-1 flex-col bg-[var(--creme)] print:bg-white">
      <div className="contents print:hidden">
        <EnTetePublic />
      </div>
      <main className="flex-1 print:p-0">
        <header className="outil-entete print:hidden">
          <div className="mx-auto w-full max-w-6xl px-4 pt-5 pb-8 sm:px-7 sm:pt-7 sm:pb-10">
            <nav aria-label="Fil d'Ariane" className="text-[13px] text-[var(--texte-secondaire)]">
              <Link href="/outils" className="lien-discret">
                ← Outils gratuits
              </Link>
            </nav>
            <div className="mt-3 flex items-start gap-4 sm:gap-5">
              <TuileOutil chemin={chemin} taille="lg" />
              <div className="min-w-0 flex-1">
                <p className="eyebrow !text-[var(--marque-sombre)]">Outil gratuit</p>
                <h1 className="outil-titre mt-1.5 text-balance font-heading font-extrabold leading-[1.12] tracking-[-0.02em] text-[var(--encre)]">
                  {titre}
                </h1>
                <p className="mt-2.5 max-w-2xl text-[15.5px] leading-relaxed text-[var(--texte-secondaire)] sm:text-[16.5px]">
                  {promesse}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <PucesGratuit />
                  <p className="flex items-center gap-1.5 text-[12.5px] text-[var(--texte-secondaire)]">
                    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
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

        <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-7 sm:px-7 sm:py-10 print:max-w-none print:space-y-0 print:p-0">
          {children}

          <div className="grid gap-5 lg:grid-cols-2 lg:items-start print:hidden">
            <details className="outil-repli group">
              <summary>
                <span className="flex items-center gap-3">
                  <span className="outil-tuile size-9 rounded-[10px]">
                    <IconeTrait nom="outils" className="size-[18px]" />
                  </span>
                  <span className="font-heading text-[16px] font-bold text-[var(--encre)]">Comment c&apos;est calculé</span>
                </span>
                <svg viewBox="0 0 24 24" aria-hidden className="outil-repli-chevron size-5 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <div className="outil-repli-corps">{calcul}</div>
            </details>
            <aside className="outil-bon-a-savoir" aria-labelledby="bon-a-savoir">
              <h2 id="bon-a-savoir" className="outil-h3 flex items-center gap-2.5 font-heading font-bold text-[var(--encre)]">
                <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-none stroke-[var(--turquoise-texte)]" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3Z" />
                </svg>
                Bon à savoir
              </h2>
              <div className="outil-prose mt-3">{bonASavoir}</div>
            </aside>
          </div>

          <AutresOutils sauf={chemin} />
          <AppelEssai />
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
        <h2 id="autres-outils" className="outil-h2 font-heading font-bold text-[var(--encre)]">
          Les autres outils gratuits
        </h2>
        <Link href="/outils" className="lien-discret text-[13.5px]">
          Tous les outils →
        </Link>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {outilsPresentes(sauf).map((o) => (
          <li key={o.chemin} className="min-w-0">
            <Link href={o.chemin} className="outil-lien-carte group">
              <TuileOutil chemin={o.chemin} taille="sm" />
              <span className="min-w-0">
                <span className="block font-heading text-[14.5px] font-bold leading-snug text-[var(--encre)] group-hover:text-[var(--marque-sombre)]">
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
export function AppelEssai() {
  return (
    <section className="vitrine-bandeau outil-appel print:hidden" aria-labelledby="appel-essai">
      <div className="relative grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:items-center">
        <div>
          <p className="eyebrow !text-[var(--sur-marque)]">Et chaque mois, sans y penser</p>
          <h2 id="appel-essai" className="mt-2 max-w-[26ch] text-balance font-heading font-bold leading-[1.18] text-[var(--sur-marque)]">
            Ce calcul, Gerimmo le fait chaque mois pour vous
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--sur-marque)]/85">
            Quittances envoyées d&apos;elles-mêmes, révisions de loyer préparées à la date anniversaire, relances
            d&apos;impayés, aide à la déclaration : la gestion locative tenue au carré. Essai gratuit de {DUREE_ESSAI},
            sans carte bancaire.
          </p>
          <Link
            href="/inscription"
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[11px] bg-[var(--ivoire)] px-5 py-2.5 text-[14.5px] font-semibold text-[var(--encre)] shadow-[0_6px_20px_rgb(0_0_0/0.14)] transition-colors hover:bg-[var(--marque-clair)]"
          >
            Créer mon compte — {DUREE_ESSAI} d&apos;essai
            <span aria-hidden>→</span>
          </Link>
        </div>
        <ul className="space-y-3 rounded-2xl border border-white/20 bg-white/10 p-5 text-[14px] leading-snug text-[var(--sur-marque)] sm:p-6">
          {[
            "Quittance émise à chaque encaissement",
            "Révision IRL proposée à la date anniversaire",
            "Relances et échéances qui vous trouvent",
            "Récapitulatif fiscal prêt à recopier",
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
