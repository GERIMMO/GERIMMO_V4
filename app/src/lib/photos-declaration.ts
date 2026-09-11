// Conservation des photos d'une déclaration d'incident (module 19).
//
// RM-19.2.2 fait de la photo le PREMIER champ, et souvent le seul : « deux
// photos et la pièce suffisent ». Or React 19 réinitialise le formulaire après
// CHAQUE action — refus compris — et un <input type="file"> ne se repeuple pas
// depuis le serveur : les File ne traversent pas l'état d'action (lib/
// formulaires.ts ne repose que les chaînes, et c'est volontaire). Sans filet,
// le locataire qui essuie un refus dans un local à poubelles reprend ses trois
// photos une par une, à genoux devant la fuite. C'est le pire endroit possible
// pour perdre une saisie.
//
// Le remède vit donc côté client : on garde les fichiers choisis en mémoire du
// composant et on les repose dans le champ après la réinitialisation. Même
// intention que le brouillon d'EDL (lib/edl-brouillon.ts) — ne jamais
// redemander ce qui a déjà été saisi — mais pas le même support : une photo ne
// se sérialise pas dans localStorage, elle ne survit qu'au sein de la page.

export function fichiersDuChamp(champ: HTMLInputElement | null): File[] {
  return Array.from(champ?.files ?? []);
}

// Ce qu'il faut remettre dans le champ, ou null s'il n'y a rien à faire.
// On ne repose QUE dans un champ vide : une sélection fraîche du locataire
// prime toujours sur ce qu'on avait mémorisé — sinon un second choix de photos
// serait écrasé par le premier, ce qui serait pire que l'oubli.
export function photosAReposer(
  contenuDuChamp: readonly File[],
  memorisees: readonly File[]
): File[] | null {
  if (memorisees.length === 0) return null;
  if (contenuDuChamp.length > 0) return null;
  return [...memorisees];
}

// Écrire une FileList n'est possible que par un DataTransfer. S'il manque
// (contexte non navigateur, navigateur ancien), les photos sont à reprendre —
// mais le reste de la saisie, lui, tient : on n'interrompt rien.
export function reposerDansLeChamp(champ: HTMLInputElement, fichiers: readonly File[]): boolean {
  try {
    const transfert = new DataTransfer();
    for (const fichier of fichiers) transfert.items.add(fichier);
    champ.files = transfert.files;
    return true;
  } catch {
    return false;
  }
}

// Branche la conservation sur le formulaire qui porte le champ, et rend de quoi
// la débrancher (rien à brancher si le champ est hors formulaire).
//
// Deux faits de plateforme commandent cette écriture, et rien d'autre :
//  1. React 19 réinitialise le <form> après CHAQUE action — refus compris — en
//     appelant son reset() natif (react-dom : requestFormReset à la soumission,
//     recursivelyResetForms au commit) ;
//  2. la spec HTML fait partir l'événement « reset » AVANT le vidage des
//     champs.
// D'où le report d'un tour de boucle : lire le champ dans l'écoute elle-même le
// verrait encore plein, on le prendrait pour une sélection fraîche et on ne
// reposerait rien — le défaut exactement. Passer par l'événement plutôt que par
// un effet nous rend par ailleurs indépendants de l'ordre interne du commit.
export function brancherConservationDesPhotos(
  champ: HTMLInputElement,
  memorisees: readonly File[]
): (() => void) | undefined {
  const formulaire = champ.form;
  if (!formulaire) return undefined;
  const surReinitialisation = () => {
    queueMicrotask(() => {
      const aReposer = photosAReposer(fichiersDuChamp(champ), memorisees);
      if (aReposer) reposerDansLeChamp(champ, aReposer);
    });
  };
  formulaire.addEventListener("reset", surReinitialisation);
  return () => formulaire.removeEventListener("reset", surReinitialisation);
}
