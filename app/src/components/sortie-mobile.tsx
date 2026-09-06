import Link from "next/link";
import { seDeconnecter } from "@/app/actions/auth";

// Sous 860 px la barre latérale devient un rail d'icônes et son pied (« Mes
// espaces », « Se déconnecter ») disparaît : sans cette sortie de secours dans
// l'en-tête, impossible de se déconnecter depuis un téléphone (audit 06/09).
export function SortieMobile() {
  return (
    <span className="loc-sortie-mobile">
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
