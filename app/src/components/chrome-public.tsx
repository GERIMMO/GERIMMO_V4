import Link from "next/link";
import { MarqueGerimmo } from "@/components/marque-gerimmo";

/**
 * Bandeau et pied de page des écrans PUBLICS (vitrine, journal, mentions).
 * Ils vivaient en double dans la vitrine ; le journal les aurait fait vivre en
 * triple, et ils auraient divergé au premier changement. Une seule définition.
 */

export function EnTetePublic({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-7 ${
        compact ? "py-3" : "py-3.5"
      }`}
    >
      <Link href="/" aria-label="Gerimmo — accueil">
        <MarqueGerimmo surEncre />
      </Link>
      <nav className="flex items-center gap-1 sm:gap-3">
        {/* Sous 640 px, le trio logo + connexion + action ne tient pas dans la
            largeur : le journal cède la place (il reste au pied de page et en
            section dédiée), l'action principale ne cède jamais. */}
        <Link
          href="/journal"
          className="hidden px-2 py-3 text-[13px] text-[var(--sur-encre)]/75 hover:text-[var(--sur-encre)] sm:inline-block"
        >
          Journal
        </Link>
        <Link
          href="/connexion"
          className="px-2 py-3 text-[13px] text-[var(--sur-encre)]/80 hover:text-[var(--sur-encre)]"
        >
          Se connecter
        </Link>
        <Link href="/inscription" className="btn-or !py-1.5 text-[13px]">
          Créer mon compte
        </Link>
      </nav>
    </div>
  );
}

export function PiedPublic() {
  return (
    <footer className="border-t border-[var(--filet)]">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-7">
        <MarqueGerimmo />
        <nav className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
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
          <Link href="/confidentialite" className="-my-2.5 py-2.5 hover:text-[var(--encre)]">
            Confidentialité
          </Link>
          <span>© Gerimmo {new Date().getFullYear()}</span>
        </nav>
      </div>
    </footer>
  );
}
