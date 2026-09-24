import Link from "next/link";
import { MarqueGerimmo } from "@/components/marque-gerimmo";

/**
 * Bandeau et pied de page des écrans PUBLICS (vitrine, journal, mentions).
 * Ils vivaient en double dans la vitrine ; le journal les aurait fait vivre en
 * triple, et ils auraient divergé au premier changement. Une seule définition.
 *
 * Charte v3 (17/09) : le bandeau quitte l'aplat marine pour un fond blanc
 * collé en haut de page — la marque en marine, l'action en bleu. La vitrine ne
 * s'ouvre plus sur un bloc sombre : elle respire.
 *
 * 24/09 : un seul en-tête public. Les pages légales avaient le leur (logo et
 * « ← Retour » seulement), l'article une variante compacte à 4 px près ; les
 * deux rejoignent celui-ci.
 */

export function EnTetePublic() {
  return (
    <div className="sticky top-0 z-30 border-b border-[var(--filet)] bg-[var(--ivoire)]/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-7">
        <Link href="/" aria-label="Gerimmo — accueil" className="flex min-h-11 shrink-0 items-center">
          <MarqueGerimmo />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {/* Sous 640 px, le trio logo + connexion + action ne tient pas dans la
              largeur : le journal cède la place (il reste au pied de page et en
              section dédiée), l'action principale ne cède jamais.
              24/09 : à 390 px, « Se connecter » et « Créer mon compte »
              passaient chacun sur deux lignes et l'en-tête montait à 87 px.
              Libellés courts sous 640 px, et jamais de retour à la ligne. */}
          <Link
            href="/journal"
            className="hidden rounded-lg px-3 py-2.5 text-[13.5px] font-medium text-[var(--texte-secondaire)] hover:bg-[var(--survol)] hover:text-[var(--encre)] sm:inline-block"
          >
            Journal
          </Link>
          <Link
            href="/connexion"
            className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-2 text-[13.5px] font-medium text-[var(--texte-secondaire)] hover:bg-[var(--survol)] hover:text-[var(--encre)] sm:px-3"
          >
            <span className="sm:hidden">Connexion</span>
            <span className="hidden sm:inline">Se connecter</span>
          </Link>
          <Link href="/inscription" className="btn-or whitespace-nowrap !px-3 !py-2 text-[13px] sm:!px-4">
            <span className="sm:hidden">S&apos;inscrire</span>
            <span className="hidden sm:inline">Créer mon compte</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}

/** Les liens du pied, dans leur ordre d'affichage. */
const LIENS_PIED: [string, string][] = [
  ["/journal", "Journal"],
  ["/connexion", "Se connecter"],
  ["/inscription", "Créer mon compte"],
  ["/#agences", "Devis agence"],
  ["/mentions-legales", "Mentions légales"],
  ["/conditions", "Conditions générales"],
  ["/confidentialite", "Confidentialité"],
];

/**
 * `courant` : le chemin de la page affichée. Son lien est marqué
 * (aria-current, encre) au lieu de recharger la page sans le dire — relevé
 * du 24/09 sur les pages légales.
 */
export function PiedPublic({ courant }: { courant?: string }) {
  return (
    <footer className="border-t border-[var(--filet)] bg-[var(--ivoire)]">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-7">
        <MarqueGerimmo />
        {/* 24/09 : chaque lien porte sa propre cible de 44 px. L'ancien
            -my-2.5 py-2.5 n'en donnait que ~40, et les pages légales avaient
            un pied à part, en 12 px, sans aucune zone de toucher. */}
        <nav className="flex flex-wrap items-center gap-x-5 text-[13px] text-[var(--texte-secondaire)]">
          {LIENS_PIED.map(([href, libelle]) => {
            const actif = href === courant;
            return (
              <Link
                key={href}
                href={href}
                aria-current={actif ? "page" : undefined}
                className={`inline-flex min-h-11 items-center hover:text-[var(--encre)] ${
                  actif ? "font-medium text-[var(--encre)]" : ""
                }`}
              >
                {libelle}
              </Link>
            );
          })}
          <span className="inline-flex min-h-11 items-center text-[var(--libelle)]">
            © Gerimmo {new Date().getFullYear()}
          </span>
        </nav>
      </div>
    </footer>
  );
}
