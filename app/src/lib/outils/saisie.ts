// OUTILS GRATUITS — ce qui reste à saisir.
//
// Décision du dirigeant du 25/11/2026 pour l'outil IRL (Q100), appliquée aux quatre autres outils (Q123) : aucun champ
// ne démarre avec une valeur, l'exemple n'est qu'un texte indicatif dans un champ vide, et un résultat ou un document ne
// se produit pas tant qu'un champ requis est vide. Un message dit alors, d'un coup, tout ce qui reste à saisir.

import { lireNombre } from "./nombres";

/** « a », « a et b », « a, b et c ». */
export function enumerer(liste: string[]): string {
  return liste.length <= 1 ? liste.join("") : `${liste.slice(0, -1).join(", ")} et ${liste[liste.length - 1]}`;
}

/**
 * Les libellés des nombres non saisis, ou illisibles, dans l'ordre du formulaire. Un champ vide ne vaut jamais 0 : pour
 * un montant nul, l'utilisateur saisit 0.
 */
export function nombresManquants(champs: ReadonlyArray<readonly [saisie: string, libelle: string]>): string[] {
  return champs.filter(([saisie]) => lireNombre(saisie) == null).map(([, libelle]) => libelle);
}
