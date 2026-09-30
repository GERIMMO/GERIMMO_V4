import Link from "next/link";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { AppelEssai } from "@/components/outils/coquille-outil";
import { PucesGratuit, TuileIcone, TuileOutil, outilsPresentes } from "@/components/outils/icones-outils";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";

export const metadata = metadonneesPubliques({
  titre: "Outils gratuits pour propriétaires bailleurs — Gerimmo",
  description:
    "Calcul de la révision de loyer (IRL), quittance de loyer à imprimer, comparateur GLI / Visale, simulateur LMNP, rentabilité locative : des outils gratuits, sans compte.",
  chemin: "/outils",
});

// Les outils gratuits (29/09, vitrine du 30/09) : ouverts à tous, sans
// compte, et rien de ce qu'on y saisit n'est envoyé à nos serveurs. Le
// catalogue vit dans lib/outils/catalogue.ts (partagé avec l'accueil et le
// plan du site) ; icônes et accroches dans components/outils/icones-outils.tsx.
export default function PageOutils() {
  const outils = outilsPresentes();
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--creme)]">
      <EnTetePublic />
      <main className="flex-1">
        <header className="vitrine-hero">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-10 pb-12 sm:px-7 sm:pt-16 sm:pb-16 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="eyebrow !text-[var(--marque-sombre)]">Pour les propriétaires bailleurs</p>
              <h1 className="outil-vitrine-titre mt-3 max-w-[16ch] text-balance font-heading font-extrabold leading-[1.06] text-[var(--encre)]">
                Outils gratuits
              </h1>
              <p className="mt-5 max-w-xl text-[16.5px] leading-relaxed text-[var(--texte-secondaire)]">
                Les calculs de la gestion locative, prêts en une minute : révision de loyer, quittance, garantie des
                loyers, fiscalité du meublé, rentabilité. Sans compte et sans inscription ; rien de ce que vous saisissez
                n&apos;est envoyé à nos serveurs.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <PucesGratuit />
                <span className="outil-puce !bg-[var(--marque-clair)] !text-[var(--marque-sombre)]">Résultat immédiat</span>
              </div>
            </div>
            <div className="hidden lg:block" aria-hidden>
              <div className="vitrine-cadre">
                <div className="grid grid-cols-3 gap-3">
                  {outils.map((o) => (
                    <div key={o.chemin} className="flex aspect-square items-center justify-center rounded-2xl border border-[var(--filet)] bg-[var(--ivoire)] shadow-[var(--ombre-portee)]">
                      <TuileOutil chemin={o.chemin} taille="lg" />
                    </div>
                  ))}
                  <div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-[var(--or-filet)] bg-[var(--ivoire)]/60">
                    <TuileIcone nom="outils" taille="lg" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-6xl space-y-12 px-4 py-10 sm:px-7 sm:py-14">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {outils.map((o) => (
              <li key={o.chemin} className="min-w-0">
                <Link href={o.chemin} className="vitrine-carte group flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <TuileOutil chemin={o.chemin} />
                    <PucesGratuit />
                  </div>
                  <h2 className="outil-h2 mt-5 font-heading font-bold leading-snug text-[var(--encre)] group-hover:text-[var(--marque-sombre)]">
                    {o.titre}
                  </h2>
                  <p className="mt-2 text-[14.5px] font-medium leading-snug text-[var(--corps)]">{o.accroche}</p>
                  <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-[var(--texte-secondaire)]">{o.resume}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[var(--marque-sombre)]">
                    Ouvrir l&apos;outil
                    <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                      →
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <AppelEssai />
        </div>
      </main>
      <PiedPublic courant="/outils" />
    </div>
  );
}
