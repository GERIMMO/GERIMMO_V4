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
 */

export function EnTetePublic({ compact = false }: { compact?: boolean }) {
  return (
    <div className="sticky top-0 z-30 border-b border-[var(--filet)] bg-[var(--ivoire)]/90 backdrop-blur">
      <div
        className={`mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-7 ${
          compact ? "py-2.5" : "py-3"
        }`}
      >
        <Link href="/" aria-label="Gerimmo — accueil" className="flex min-h-11 items-center">
          <MarqueGerimmo />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {/* Sous 640 px, le trio logo + connexion + action ne tient pas dans la
              largeur : le journal cède la place (il reste au pied de page et en
              section dédiée), l'action principale ne cède jamais. */}
          <Link
            href="/journal"
            className="hidden rounded-lg px-3 py-2.5 text-[13.5px] font-medium text-[var(--texte-secondaire)] hover:bg-[var(--survol)] hover:text-[var(--encre)] sm:inline-block"
          >
            Journal
          </Link>
          <Link
            href="/connexion"
            className="rounded-lg px-3 py-2.5 text-[13.5px] font-medium text-[var(--texte-secondaire)] hover:bg-[var(--survol)] hover:text-[var(--encre)]"
          >
            Se connecter
          </Link>
          <Link href="/inscription" className="btn-or !py-2 text-[13px]">
            Créer mon compte
          </Link>
        </nav>
      </div>
    </div>
  );
}

export function PiedPublic() {
  return (
    <footer className="border-t border-[var(--filet)] bg-[var(--ivoire)]">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-7">
        <MarqueGerimmo />
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[var(--texte-secondaire)]">
          <Link href="/journal" className="-my-2.5 py-2.5 hover:text-[var(--encre)]">
            Journal
          </Link>
          <Link href="/connexion" className="-my-2.5 py-2.5 hover:text-[var(--encre)]">
            Se connecter
          </Link>
          <Link href="/inscription" className="-my-2.5 py-2.5 hover:text-[var(--encre)]">
            Créer mon compte
          </Link>
          <Link href="/#agences" className="-my-2.5 py-2.5 hover:text-[var(--encre)]">
            Devis agence
          </Link>
          <Link href="/mentions-legales" className="-my-2.5 py-2.5 hover:text-[var(--encre)]">
            Mentions légales
          </Link>
          <Link href="/conditions" className="-my-2.5 py-2.5 hover:text-[var(--encre)]">
            Conditions générales
          </Link>
          <Link href="/confidentialite" className="-my-2.5 py-2.5 hover:text-[var(--encre)]">
            Confidentialité
          </Link>
          <span className="text-[var(--libelle)]">© Gerimmo {new Date().getFullYear()}</span>
        </nav>
      </div>
    </footer>
  );
}
