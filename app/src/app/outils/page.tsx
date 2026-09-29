import Link from "next/link";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { AppelEssai } from "@/components/outils/coquille-outil";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";
import { OUTILS } from "@/lib/outils/catalogue";

export const metadata = metadonneesPubliques({
  titre: "Outils gratuits pour propriétaires bailleurs — Gerimmo",
  description:
    "Calcul de la révision de loyer (IRL), quittance de loyer à imprimer, comparateur GLI / Visale, simulateur LMNP, rentabilité locative : des outils gratuits, sans compte.",
  chemin: "/outils",
});

// Les outils gratuits (29/09) : ouverts à tous, sans compte, et rien de ce
// qu'on y saisit ne quitte le navigateur. Le catalogue vit dans
// lib/outils/catalogue.ts (partagé avec l'accueil et le plan du site).
export default function PageOutils() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--creme)]">
      <EnTetePublic />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-6 sm:px-7 sm:py-10">
        <div className="entete-page !mb-0">
          <h1 className="font-heading text-[26px] font-bold leading-[1.15] tracking-[-0.015em] text-[var(--encre)] sm:text-[32px]">
            Outils gratuits
          </h1>
        </div>
        <p className="mesure-lecture text-[15px] leading-relaxed text-[var(--texte-secondaire)]">
          Pour les propriétaires bailleurs : les calculs de la gestion locative, sans compte et sans inscription. Rien de
          ce que vous saisissez n&apos;est envoyé à nos serveurs.
        </p>
        <ul className="grid gap-4 sm:grid-cols-2">
          {OUTILS.map((o) => (
            <li key={o.chemin} className="min-w-0">
              <Link href={o.chemin} className="vitrine-carte group block h-full">
                <h2 className="font-heading text-[17px] font-bold leading-snug text-[var(--encre)] group-hover:text-[var(--marque-sombre)]">
                  {o.titre}
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--texte-secondaire)]">{o.resume}</p>
                <span className="mt-3 inline-block text-[13.5px] font-semibold text-[var(--marque-sombre)]">Ouvrir l&apos;outil →</span>
              </Link>
            </li>
          ))}
        </ul>
        <AppelEssai />
      </main>
      <PiedPublic courant="/outils" />
    </div>
  );
}
