/**
 * Où va le focus quand on appuie sur Tab dans une fenêtre modale (tiroir « Menu »,
 * audit du 13/10, DES-A-09) ?
 *
 * Une fenêtre `aria-modal` doit garder le focus : sans cela, Tab sort vers la page
 * cachée derrière le voile et le clavier ne voit plus ce qu'il touche. La règle est
 * pure — elle ne manipule que la liste ordonnée des contrôles de la fenêtre et celui
 * qui a le focus — pour se tester sans navigateur ; c'est la fenêtre qui lit le DOM.
 *
 * Renvoie le contrôle à focaliser À LA MAIN, ou `null` quand le navigateur peut
 * avancer seul (focus au milieu de la liste) ou qu'il n'y a rien à viser. Un focus
 * hors de la liste (resté sur le bouton qui a ouvert la fenêtre) y rentre par le
 * premier contrôle, ou par le dernier avec Maj+Tab.
 */
export function cibleDeTabulation<T>(
  focalisables: readonly T[],
  actif: T | null | undefined,
  arriere: boolean
): T | null {
  if (focalisables.length === 0) return null;
  const premier = focalisables[0];
  const dernier = focalisables[focalisables.length - 1];
  const rang = actif == null ? -1 : focalisables.indexOf(actif);
  if (rang === -1) return arriere ? dernier : premier;
  if (arriere && rang === 0) return dernier;
  if (!arriere && rang === focalisables.length - 1) return premier;
  return null;
}
