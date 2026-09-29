import Link from "next/link";
import type { ReactNode } from "react";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { JOURS_ESSAI } from "@/lib/tarifs";

// LA COQUILLE DES OUTILS GRATUITS (29/09) : en-tête et pied publics, fil
// d'Ariane, titre, et l'invitation à l'essai. Tout ce qui l'entoure est
// masqué à l'impression : seul le document produit par l'outil (lettre,
// quittance) part sur papier.
//
// Les enveloppes `contents` ne créent pas de boîte : l'en-tête reste collé en
// haut de page, et `print:hidden` les retire du papier.

export function CoquilleOutil({
  titre,
  chapo,
  children,
  apres,
}: {
  titre: string;
  chapo: ReactNode;
  children: ReactNode;
  /** Précisions affichées sous l'outil (sources, limites). */
  apres?: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--creme)] print:bg-white">
      <div className="contents print:hidden">
        <EnTetePublic />
      </div>
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-4 py-6 sm:px-7 sm:py-10 print:max-w-none print:p-0">
        <div className="space-y-3 print:hidden">
          <nav aria-label="Fil d'Ariane" className="text-[13px] text-[var(--texte-secondaire)]">
            <Link href="/outils" className="lien-discret">
              ← Outils gratuits
            </Link>
          </nav>
          <div className="entete-page !mb-0">
            <h1 className="text-balance font-heading text-[26px] font-bold leading-[1.15] tracking-[-0.015em] text-[var(--encre)] sm:text-[32px]">
              {titre}
            </h1>
          </div>
          <p className="mesure-lecture text-[15px] leading-relaxed text-[var(--texte-secondaire)]">{chapo}</p>
        </div>
        {children}
        {apres && <div className="mesure-lecture space-y-3 text-[14px] leading-relaxed text-[var(--texte-secondaire)] print:hidden">{apres}</div>}
        <AppelEssai />
      </main>
      <div className="contents print:hidden">
        <PiedPublic courant="/outils" />
      </div>
    </div>
  );
}

/** L'invitation à créer un compte, sous chaque outil. */
export function AppelEssai() {
  return (
    <section className="vitrine-bandeau print:hidden" aria-labelledby="appel-essai">
      <h2 id="appel-essai" className="max-w-[26ch] text-balance font-heading text-[22px] font-bold leading-[1.2] text-[var(--sur-marque)] sm:text-[26px]">
        Ce calcul, Gerimmo le fait chaque mois pour vous
      </h2>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--sur-marque)]/85">
        Quittances envoyées d&apos;elles-mêmes, révisions de loyer préparées à la date anniversaire, relances
        d&apos;impayés, aide à la déclaration : la gestion locative tenue au carré. Essai gratuit de {JOURS_ESSAI} jours,
        sans carte bancaire.
      </p>
      <Link
        href="/inscription"
        className="mt-6 inline-flex min-h-11 items-center rounded-[10px] bg-[var(--ivoire)] px-5 py-2.5 text-[14px] font-semibold text-[var(--encre)] hover:bg-[var(--marque-clair)]"
      >
        Créer mon compte — {JOURS_ESSAI} jours d&apos;essai
      </Link>
    </section>
  );
}
