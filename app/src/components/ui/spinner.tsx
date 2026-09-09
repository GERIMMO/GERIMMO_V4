import { cn } from "@/lib/utils";

// La roue de chargement commune (recette Tahir 09/09 : « un spinner après
// avoir cliqué sur enregistrer, à généraliser ») — hérite de currentColor et
// de la taille d'icône du bouton qui la porte.
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("animate-spin", className)}
    >
      <circle
        cx="12"
        cy="12"
        r="9.5"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
