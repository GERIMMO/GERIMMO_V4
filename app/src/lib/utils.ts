import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Raccourcit un texte à `max` caractères au plus, sans couper un mot : on
 * s'arrête au dernier espace et l'on ajoute « … ». Sert aux descriptions des
 * moteurs de recherche et des aperçus de partage (29/09 : la description d'un
 * article du journal s'arrêtait au milieu d'un mot).
 */
export function couperAuMot(texte: string, max = 160): string {
  const propre = texte.replace(/\s+/g, " ").trim();
  if (propre.length <= max) return propre;
  const coupe = propre.slice(0, max - 1);
  const espace = coupe.lastIndexOf(" ");
  const base = espace > max / 2 ? coupe.slice(0, espace) : coupe;
  return `${base.replace(/[\s,;:.—–-]+$/u, "")}…`;
}
