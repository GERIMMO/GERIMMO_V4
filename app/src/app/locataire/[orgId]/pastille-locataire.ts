// Une seule pastille dans l'espace locataire : .loc-tag.
//
// L'espace locataire garde l'identité plus douce de la maquette v10 — c'est
// voulu. Le défaut relevé le 11/09 est d'avoir MÉLANGÉ les deux systèmes sur
// un même écran : .loc-tag (sans-serif, 12 px, gras) à côté de .puce (Plex
// Mono, interlettrage) venue de l'espace agence.
//
// Les tables partagées (COULEURS_STATUT_APPEL_LOYER, COULEURS_ETAT_LOCATAIRE)
// servent aussi l'espace agence et ne bougent pas : elles rendent des classes
// .puce. Cette table les traduit à l'entrée de la zone, une fois.
//
// .loc-tag n'a pas de variante neutre dans globals.css : `puce-grise` (mois
// simplement pas encore dû, incident pas encore qualifié) prend la variante
// `bleu` — l'ardoise calme de la charte, qui dit « en cours, rien à faire ».
const EQUIVALENCES: Record<string, string> = {
  "puce puce-loue": "loc-tag vert",
  "puce puce-prep": "loc-tag ambre",
  "puce puce-rouge": "loc-tag rouge",
  "puce puce-encre": "loc-tag bleu",
  "puce puce-grise": "loc-tag bleu",
};

/**
 * Bord gauche d'ÉTAT d'une carte de l'espace (Design System « Maison », 20/11).
 *
 * Une carte est blanche, avec un filet : un bord gauche coloré n'y est admis
 * que s'il porte un état métier qui demande l'attention — un retard, un geste
 * attendu, une urgence. Les bords « de marque », « dossier en cours » ou
 * « tout va bien » étaient du décor : ils ont été retirés.
 *
 * Le `!` est requis : le filet de `.loc-carte` est posé hors couche par les
 * feuilles communes, ce qui rendait ces bords invisibles depuis leur arrivée.
 * 3 px, comme les cartes `data-tone` de l'espace de gestion.
 */
export const BORD_ETAT = {
  attention: "!border-l-[3px] !border-l-[color:var(--warning)]",
  urgence: "!border-l-[3px] !border-l-[color:var(--destructive)]",
} as const;

/**
 * Bouton d'urgence (en-tête de l'espace, numéros à appeler) : un seul dessin
 * pour le même geste, 44 px de haut.
 */
export const BOUTON_URGENCE =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--rayon-bouton)] border border-destructive bg-[var(--carte)] px-3 text-sm font-semibold whitespace-nowrap text-destructive transition-colors duration-[var(--duree-rapide)] hover:bg-[var(--destructive-soft)]";

/** Traduit une classe .puce de lib/ en pastille de l'espace locataire. */
export function tagLocataire(classePuce: string | undefined): string {
  return EQUIVALENCES[classePuce ?? ""] ?? "loc-tag bleu";
}
