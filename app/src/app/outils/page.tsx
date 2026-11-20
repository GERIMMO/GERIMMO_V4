import Link from "next/link";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { AppelEssai } from "@/components/outils/coquille-outil";
import { PucesGratuit, TuileOutil, outilsPresentes } from "@/components/outils/icones-outils";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";

export const metadata = metadonneesPubliques({
  titre: "Outils gratuits pour propriétaires bailleurs — Gerimmo",
  description:
    "Calcul de la révision de loyer (IRL), quittance de loyer à imprimer, comparateur GLI / Visale, simulateur LMNP, rentabilité locative : des outils gratuits, sans compte.",
  chemin: "/outils",
});

export const revalidate = 3600;

// Les outils gratuits (29/09, vitrine du 30/09) : ouverts à tous, sans
// compte, et rien de ce qu'on y saisit n'est envoyé à nos serveurs. Le
// catalogue vit dans lib/outils/catalogue.ts (partagé avec l'accueil et le
// plan du site) ; icônes et accroches dans components/outils/icones-outils.tsx.
export default function PageOutils() {
  const outils = outilsPresentes();
  return (
    <div className="site-public flex min-h-full flex-1 flex-col">
      <EnTetePublic />
      <main className="flex-1">
        {/* Design System « Maison » (20/11) : même en-tête que /tarifs, /agences et /journal (`public-page-intro`),
            h1 à la taille commune ; la grille de tuiles décoratives et la lueur du héros sont retirées. */}
        <header className="public-page-intro">
          <div className="public-conteneur">
            <p className="eyebrow">Pour les propriétaires bailleurs</p>
            <h1>Outils gratuits</h1>
            <p>
              Les calculs de la gestion locative, prêts en une minute : révision de loyer, quittance, garantie des
              loyers, fiscalité du meublé, rentabilité. Sans compte et sans inscription ; rien de ce que vous saisissez
              n&apos;est envoyé à nos serveurs.
            </p>
            <div className="public-page-reperes">
              <PucesGratuit />
              <span className="outil-puce">Résultat immédiat</span>
            </div>
          </div>
        </header>

        <div className="public-conteneur space-y-12 py-10 sm:py-14">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {outils.map((o) => (
              <li key={o.chemin} className="min-w-0">
                <Link href={o.chemin} className="vitrine-carte group flex h-full flex-col">
                  <TuileOutil chemin={o.chemin} />
                  <h2 className="mt-5">{o.titre}</h2>
                  <p className="mt-2 text-[14px] font-medium leading-snug text-[var(--corps)]">{o.accroche}</p>
                  <p className="mt-2 flex-1 text-[13px] leading-relaxed text-[var(--texte-secondaire)]">{o.resume}</p>
                  <span className="public-lien mt-3">
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
