import { cn } from "@/lib/utils";

// La roue de chargement commune (recette Tahir 09/09 : « un spinner après
// avoir cliqué sur enregistrer, à généraliser ») — hérite de currentColor.
//
// ELLE PORTE SA TAILLE, depuis le 12/09. Elle n'en avait aucune et comptait sur
// le `[&_svg]:size-4` des boutons : posée ailleurs — dans un paragraphe, une
// fenêtre, une carte — un SVG sans dimension prend TOUTE la largeur de son
// conteneur. Constat au navigateur : une roue de quatre cents pixels au milieu
// de la fenêtre du lot. `size-4` est un défaut, pas un plafond : `cn` laisse
// n'importe quel `size-*` de l'appelant le remplacer.
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("size-4 shrink-0 animate-spin", className)}
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
