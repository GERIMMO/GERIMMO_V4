// Brouillon local de la grille d'état des lieux (module 19 — mobile).
//
// RM-19.1.1 : sauvegarde locale automatique, sans action de l'agent.
// RM-19.1.2 : synchronisation au retour du réseau seulement.
// RM-19.1.8 : le brouillon ne survit ni au vidage du cache ni au changement
//             d'appareil — localStorage, assumé.
// RM-19.1.9 : un EDL modifié ailleurs est signalé, jamais verrouillé — le
//             brouillon mémorise l'empreinte du serveur au moment de la
//             saisie ; si elle a changé au retour, on prévient avant d'écraser.
//
// D15 (VER-SECURITE-01, VER-PR178-06 ; décision du dirigeant du 14/10/2026, option 2 avec rattachement au compte) :
//   · la clé du brouillon porte le COMPTE (« gerimmo-edl-brouillon:<compte>:<état des lieux> ») : le compte suivant sur le même
//     appareil ne le relit pas (l'ancienne clé sans compte n'est plus jamais lue, et elle est effacée) ;
//   · à la déconnexion, un brouillon sans aucune ligne non synchronisée est effacé ; un brouillon qui en garde est CONSERVÉ
//     (on ne détruit jamais des relevés jamais envoyés) et la personne en est avertie (voir `purgerBrouillonsEdl`).
// La clé ne commence volontairement pas par « gerimmo: » : la purge aveugle des autres copies de saisie (lib/copies-locales.ts)
// ne la touche pas.

export type SaisieGrille = {
  etats: Record<string, string>;
  commentaires: Record<string, string>;
};

export type BrouillonEdl = SaisieGrille & {
  enregistreLe: string;
  empreinteServeur: string;
  // Nombre de lignes qui différaient de la dernière version synchronisée à l'enregistrement. Absent (ou 0) : rien à perdre.
  enAttente?: number;
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

/** Préfixe des brouillons rattachés à un compte (D15). Distinct de « gerimmo: » (purge aveugle de lib/copies-locales.ts). */
export const PREFIXE_BROUILLON_EDL = "gerimmo-edl-brouillon:";
/** L'ancienne clé, sans compte (avant le 14/10/2026) : plus jamais lue, effacée dès qu'on la rencontre. */
const PREFIXE_BROUILLON_EDL_ANCIEN = "gerimmo-edl-brouillon-";

export const cleBrouillonEdl = (compteId: string, edlId: string) =>
  `${PREFIXE_BROUILLON_EDL}${encodeURIComponent(compteId)}:${encodeURIComponent(edlId)}`;

// localStorage peut être absent ou refusé (navigation privée, quota) : le
// brouillon est un filet, jamais une exigence — tout échoue en silence.
// Sans compte, aucun brouillon : il ne peut être rattaché à personne.
export function chargerBrouillon(compteId: string, edlId: string): BrouillonEdl | null {
  if (!compteId) return null;
  try {
    const brut = localStorage.getItem(cleBrouillonEdl(compteId, edlId));
    if (!brut) return null;
    const b = JSON.parse(brut) as BrouillonEdl;
    if (!b || typeof b !== "object" || !b.etats || !b.commentaires) return null;
    return b;
  } catch {
    return null;
  }
}

export function sauverBrouillon(compteId: string, edlId: string, brouillon: BrouillonEdl): void {
  if (!compteId) return;
  try {
    localStorage.setItem(cleBrouillonEdl(compteId, edlId), JSON.stringify(brouillon));
  } catch {
    // quota plein ou stockage refusé : la saisie en mémoire reste la référence
  }
}

export function effacerBrouillon(compteId: string, edlId: string): void {
  if (!compteId) return;
  try {
    localStorage.removeItem(cleBrouillonEdl(compteId, edlId));
  } catch {
    // rien à faire
  }
}

type Stockage = Pick<Storage, "length" | "key" | "removeItem" | "getItem">;

/** Ce qu'une purge a fait : brouillons effacés, brouillons gardés parce qu'ils portent des lignes jamais envoyées. */
export type BilanBrouillonsEdl = { efface: number; conserves: number };

/**
 * D15 : efface les brouillons d'état des lieux qui ne portent AUCUNE ligne non synchronisée, garde les autres.
 *
 *  · l'ancienne clé sans compte est effacée (elle ne peut plus être rattachée à personne ni relue) ;
 *  · un brouillon rattaché à un compte est gardé si, et seulement si, `enAttente` annonce au moins une ligne non envoyée ;
 *    illisible, sans ce compteur ou à zéro, il n'a rien à protéger et part ;
 *  · les brouillons gardés sont comptés : l'appelant en avertit la personne.
 * Au mieux : jamais d'erreur (stockage refusé ou absent), jamais d'attente.
 */
export function purgerBrouillonsEdl(stockage: Stockage | undefined = stockageLocal()): BilanBrouillonsEdl {
  const bilan: BilanBrouillonsEdl = { efface: 0, conserves: 0 };
  if (!stockage) return bilan;
  try {
    const cles: string[] = [];
    for (let i = 0; i < stockage.length; i++) {
      const k = stockage.key(i);
      if (k) cles.push(k);
    }
    for (const k of cles) {
      if (k.startsWith(PREFIXE_BROUILLON_EDL_ANCIEN)) {
        stockage.removeItem(k);
        bilan.efface++;
        continue;
      }
      if (!k.startsWith(PREFIXE_BROUILLON_EDL)) continue;
      if (lignesNonSynchronisees(stockage.getItem(k)) > 0) bilan.conserves++;
      else {
        stockage.removeItem(k);
        bilan.efface++;
      }
    }
  } catch {
    // stockage refusé : rien à effacer, rien à garder
  }
  return bilan;
}

/** Ce que la page de connexion dit après une déconnexion qui laisse des relevés d'état des lieux non envoyés sur l'appareil. */
export function messageBrouillonsConserves(nombre: number): string {
  const sujet = nombre === 1 ? "Un état des lieux contient des relevés" : `${nombre} états des lieux contiennent des relevés`;
  return `Vous êtes déconnecté. ${sujet} qui n’ont pas été envoyés : ils restent sur cet appareil et ne sont repris que depuis votre compte. Reconnectez-vous pour les envoyer ; sur un appareil partagé, faites-le avant de le quitter.`;
}

function lignesNonSynchronisees(brut: string | null): number {
  if (!brut) return 0;
  try {
    const n = (JSON.parse(brut) as { enAttente?: unknown } | null)?.enAttente;
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function stockageLocal(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
