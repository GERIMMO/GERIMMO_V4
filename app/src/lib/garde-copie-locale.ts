import { lienQuittantLaPage, MESSAGE_QUITTER } from "@/lib/protection-saisie";

/** Les états de la copie locale d'une saisie (components/reprise-locale : useCopieFichiers). */
export type StatutCopie = "vide" | "attente" | "conserve" | "refuse" | "conflit";

/**
 * Refus ou conflit : la copie n'a pas été écrite et rien ne l'écrira avant le départ. La saisie n'existe plus qu'à l'écran,
 * d'où l'alerte « Gardez cet onglet ouvert ». Les autres états n'ont rien à confirmer : « conserve » a déjà sa copie, et
 * « attente » l'aura écrite au démontage du formulaire (useCopieFichiers.vider).
 */
export function saisieSansCopie(statut: StatutCopie): boolean {
  return statut === "refuse" || statut === "conflit";
}

/**
 * Garde de départ d'une saisie protégée par une copie locale (vérification du 14/10, VFL-03). Les formulaires
 * `data-protection-saisie="locale"` sont exclus du garde générique (lib/protection-saisie.ts), qui ne suit que les saisies
 * sans copie. Ici :
 *   - fermeture ou rechargement de l'onglet : avertissement du navigateur tant que la copie est en attente d'écriture,
 *     refusée ou en conflit (comportement d'origine) ;
 *   - lien interne ou retour arrière du navigateur (que `beforeunload` ne voit pas : la navigation reste dans la page) :
 *     la même question que la boîte « quitter la page » des autres formulaires, SEULEMENT tant que la copie manque.
 * Renvoie le nettoyage ; à rappeler quand le statut change.
 */
export function installerGardeCopieLocale(statut: StatutCopie): () => void {
  const sansCopie = saisieSansCopie(statut);
  if (!sansCopie && statut !== "attente") return () => {};
  let departAutorise = false;
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  // Un départ confirmé ici ne doit pas être redemandé par `beforeunload` quand le lien déclenche un vrai chargement.
  const autoriser = () => {
    departAutorise = true;
    clearTimeout(minuterie);
    minuterie = setTimeout(() => { departAutorise = false; }, 1500);
  };
  const avantSortie = (event: BeforeUnloadEvent) => {
    if (!departAutorise) { event.preventDefault(); event.returnValue = ""; }
  };
  const clic = (event: MouseEvent) => {
    if (!sansCopie || !lienQuittantLaPage(event)) return;
    // Même geste que lib/protection-saisie.ts : « Rester » ne laisse pas le clic atteindre le Link de Next.
    if (!window.confirm(MESSAGE_QUITTER)) { event.preventDefault(); event.stopImmediatePropagation(); }
    else autoriser();
  };
  const navigation = (window as Window & { navigation?: EventTarget }).navigation;
  const naviguer = (event: Event) => {
    const e = event as Event & { navigationType?: string; canIntercept?: boolean; hashChange?: boolean };
    if (sansCopie && e.navigationType === "traverse" && e.canIntercept && !e.hashChange) {
      if (!window.confirm(MESSAGE_QUITTER)) e.preventDefault(); else autoriser();
    }
  };
  window.addEventListener("beforeunload", avantSortie);
  if (sansCopie) {
    document.addEventListener("click", clic, true);
    navigation?.addEventListener("navigate", naviguer);
  }
  return () => {
    window.removeEventListener("beforeunload", avantSortie);
    document.removeEventListener("click", clic, true);
    navigation?.removeEventListener("navigate", naviguer);
    clearTimeout(minuterie);
  };
}
