// Brouillon local de la grille d'état des lieux (module 19 — mobile).
//
// RM-19.1.1 : sauvegarde locale automatique, sans action de l'agent.
// RM-19.1.2 : synchronisation au retour du réseau seulement.
// RM-19.1.8 : le brouillon ne survit ni au vidage du cache ni au changement
//             d'appareil — localStorage, assumé.
// RM-19.1.9 : un EDL modifié ailleurs est signalé, jamais verrouillé — le
//             brouillon mémorise l'empreinte du serveur au moment de la
//             saisie ; si elle a changé au retour, on prévient avant d'écraser.

export type SaisieGrille = {
  etats: Record<string, string>;
  commentaires: Record<string, string>;
};

export type BrouillonEdl = SaisieGrille & {
  enregistreLe: string;
  empreinteServeur: string;
};

// Empreinte stable de l'état serveur de la grille (id + état + commentaire,
// triés par id) — djb2, court et suffisant pour détecter « modifié ailleurs ».
export function empreinteGrille(
  lignes: { id: string; etat: string | null; commentaire: string | null }[]
): string {
  const base = lignes
    .map((l) => `${l.id}|${l.etat ?? ""}|${l.commentaire ?? ""}`)
    .sort()
    .join("\n");
  let h = 5381;
  for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Nombre de lignes dont la saisie diffère d'une référence (la dernière
// version synchronisée) — alimente l'indicateur permanent RM-19.1.6.
export function lignesEnAttente(saisie: SaisieGrille, reference: SaisieGrille): number {
  const ids = new Set([...Object.keys(saisie.etats), ...Object.keys(saisie.commentaires)]);
  let n = 0;
  for (const id of ids) {
    if (
      (saisie.etats[id] ?? "") !== (reference.etats[id] ?? "") ||
      (saisie.commentaires[id] ?? "") !== (reference.commentaires[id] ?? "")
    ) {
      n++;
    }
  }
  return n;
}

const cle = (edlId: string) => `gerimmo-edl-brouillon-${edlId}`;

// localStorage peut être absent ou refusé (navigation privée, quota) : le
// brouillon est un filet, jamais une exigence — tout échoue en silence.
export function chargerBrouillon(edlId: string): BrouillonEdl | null {
  try {
    const brut = localStorage.getItem(cle(edlId));
    if (!brut) return null;
    const b = JSON.parse(brut) as BrouillonEdl;
    if (!b || typeof b !== "object" || !b.etats || !b.commentaires) return null;
    return b;
  } catch {
    return null;
  }
}

export function sauverBrouillon(edlId: string, brouillon: BrouillonEdl): void {
  try {
    localStorage.setItem(cle(edlId), JSON.stringify(brouillon));
  } catch {
    // quota plein ou stockage refusé : la saisie en mémoire reste la référence
  }
}

export function effacerBrouillon(edlId: string): void {
  try {
    localStorage.removeItem(cle(edlId));
  } catch {
    // rien à faire
  }
}
