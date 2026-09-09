import Link from "next/link";
import { seDeconnecter } from "@/app/actions/auth";

// Sous 860 px la barre latérale devient un rail d'icônes et son pied (« Mon
// profil », « Mes espaces », « Se déconnecter ») disparaît : sans cette sortie
// de secours dans l'en-tête, impossible de se déconnecter — ni d'atteindre le
// profil (audits 06/09 et 09/09) — depuis un téléphone.
export function SortieMobile({ profilHref }: { profilHref?: string }) {
  return (
    <span className="loc-sortie-mobile">
      {profilHref && (
        <Link href={profilHref} title="Profil" aria-label="Profil">
          <svg viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20a7 7 0 0 1 14 0" />
          </svg>
        </Link>
      )}
      <Link href="/espaces" title="Mes espaces" aria-label="Mes espaces">
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </svg>
      </Link>
      <form action={seDeconnecter}>
        <button type="submit" title="Se déconnecter" aria-label="Se déconnecter">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M9 4h-4v16h4" />
            <path d="M13 8l4 4-4 4M17 12H8" />
          </svg>
        </button>
      </form>
    </span>
  );
}
