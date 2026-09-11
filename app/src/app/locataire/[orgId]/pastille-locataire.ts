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

/** Traduit une classe .puce de lib/ en pastille de l'espace locataire. */
export function tagLocataire(classePuce: string | undefined): string {
  return EQUIVALENCES[classePuce ?? ""] ?? "loc-tag bleu";
}
