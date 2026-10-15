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
//     appareil ne le relit pas ;
//   · l'ANCIENNE clé (« gerimmo-edl-brouillon-<état des lieux> », sans compte) n'est jamais effacée à l'aveugle : l'ancienne
//     grille ne l'écrivait que pour des lignes non envoyées et ne l'effaçait qu'après un envoi réussi, donc une ancienne clé
//     porte, en pratique, des relevés jamais envoyés (RM-19.1.1, 19.1.6). Le compte qui rouvre CET état des lieux la reprend
//     et la réécrit sous sa propre clé (`chargerBrouillon`) ; tant qu'elle n'est pas reprise elle est conservée et comptée dans
//     l'avertissement de déconnexion ; elle ne part que vide, illisible, ou quand l'état des lieux est signé ;
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
  // Une ancienne clé reprise par un compte reçoit 1 en attendant que la grille compte exactement (jamais 0 : elle porte des relevés).
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

/**
 * Que faire du brouillon trouvé à l'ouverture de la grille (RM-19.1.1, RM-19.1.9, D15) ?
 *  · état des lieux signé : figé, il n'a plus de ligne à envoyer — le brouillon part ;
 *  · pas de brouillon : rien ;
 *  · l'empreinte du serveur a changé depuis la saisie : modifié ailleurs, on signale (jamais de verrou), le brouillon reste ;
 *  · même empreinte : le brouillon est plus récent que le serveur. S'il ne diffère plus de la version synchronisée il ne
 *    protège plus rien et part (sans quoi la déconnexion le garderait et en avertirait à tort) ; sinon on le restaure.
 */
export type RepriseBrouillon =
  | { action: "aucune" }
  | { action: "effacer" }
  | { action: "restaurer"; etats: Record<string, string>; commentaires: Record<string, string> }
  | { action: "conflit"; brouillon: BrouillonEdl };

export function decisionReprise(entree: {
  signe: boolean;
  brouillon: BrouillonEdl | null;
  /** Empreinte de la grille telle que la page la reçoit du serveur. */
  empreinteServeur: string;
  /** La saisie affichée à l'ouverture. */
  saisie: SaisieGrille;
  /** La dernière version synchronisée. */
  synchronise: SaisieGrille;
}): RepriseBrouillon {
  if (entree.signe) return { action: "effacer" };
  const b = entree.brouillon;
  if (!b) return { action: "aucune" };
  if (b.empreinteServeur !== entree.empreinteServeur) return { action: "conflit", brouillon: b };
  const fusion: SaisieGrille = {
    etats: { ...entree.saisie.etats, ...b.etats },
    commentaires: { ...entree.saisie.commentaires, ...b.commentaires },
  };
  if (lignesEnAttente(fusion, entree.synchronise) === 0) return { action: "effacer" };
  return { action: "restaurer", etats: b.etats, commentaires: b.commentaires };
}

/**
 * Après chaque saisie (RM-19.1.1) : écrire le brouillon tant qu'il reste des lignes non synchronisées, l'effacer dès qu'il n'y
 * en a plus (à condition d'en avoir écrit un : on ne touche pas à celui qu'un conflit retient), ne rien faire sur un état des
 * lieux signé.
 */
export function actionBrouillon(entree: { signe: boolean; attente: number; dejaEcrit: boolean }): "ecrire" | "effacer" | "rien" {
  if (entree.signe) return "rien";
  if (entree.attente === 0) return entree.dejaEcrit ? "effacer" : "rien";
  return "ecrire";
}

/** Le brouillon écrit : la saisie, l'empreinte du serveur au moment de la saisie, et combien de lignes il garde sans les avoir envoyées. */
export function construireBrouillon(entree: {
  saisie: SaisieGrille;
  empreinteServeur: string;
  attente: number;
  maintenant: Date;
}): BrouillonEdl {
  return {
    etats: entree.saisie.etats,
    commentaires: entree.saisie.commentaires,
    enregistreLe: entree.maintenant.toISOString(),
    empreinteServeur: entree.empreinteServeur,
    enAttente: entree.attente,
  };
}

/** Préfixe des brouillons rattachés à un compte (D15). Distinct de « gerimmo: » (purge aveugle de lib/copies-locales.ts). */
export const PREFIXE_BROUILLON_EDL = "gerimmo-edl-brouillon:";
/** L'ancienne clé, sans compte (avant le 14/10/2026) : reprise par le compte qui rouvre l'état des lieux, jamais effacée tant qu'elle porte des relevés. */
export const PREFIXE_BROUILLON_EDL_ANCIEN = "gerimmo-edl-brouillon-";

export const cleBrouillonEdl = (compteId: string, edlId: string) =>
  `${PREFIXE_BROUILLON_EDL}${encodeURIComponent(compteId)}:${encodeURIComponent(edlId)}`;
export const cleAncienBrouillonEdl = (edlId: string) => `${PREFIXE_BROUILLON_EDL_ANCIEN}${edlId}`;

function lireBrouillon(cle: string): BrouillonEdl | null {
  const brut = localStorage.getItem(cle);
  if (!brut) return null;
  const b = JSON.parse(brut) as BrouillonEdl;
  if (!b || typeof b !== "object" || !b.etats || !b.commentaires) return null;
  return b;
}

// localStorage peut être absent ou refusé (navigation privée, quota) : le
// brouillon est un filet, jamais une exigence — tout échoue en silence.
// Sans compte, aucun brouillon : il ne peut être rattaché à personne.
//
// Le brouillon du compte d'abord. À défaut, l'ancien brouillon de CET état des lieux (clé sans compte, saisi avant la mise à
// jour) est repris par le compte qui l'ouvre : réécrit sous la clé du compte, puis l'ancienne clé est retirée. Si l'écriture est
// refusée, l'ancienne clé reste (rien n'est perdu) et le brouillon est rendu quand même.
export function chargerBrouillon(compteId: string, edlId: string): BrouillonEdl | null {
  if (!compteId) return null;
  try {
    const rattache = lireBrouillon(cleBrouillonEdl(compteId, edlId));
    if (rattache) return rattache;
    const ancien = lireBrouillon(cleAncienBrouillonEdl(edlId));
    if (!ancien) return null;
    const repris: BrouillonEdl = { ...ancien, enAttente: typeof ancien.enAttente === "number" && ancien.enAttente > 0 ? ancien.enAttente : 1 };
    try {
      localStorage.setItem(cleBrouillonEdl(compteId, edlId), JSON.stringify(repris));
      localStorage.removeItem(cleAncienBrouillonEdl(edlId));
    } catch {
      // quota plein ou stockage refusé : l'ancienne clé reste, la prochaine ouverture réessaie
    }
    return repris;
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

// Efface le brouillon du compte ET l'ancienne clé de CET état des lieux : quand on efface, la version synchronisée fait foi
// (envoi réussi, retour à l'identique, choix de la version du serveur, état des lieux signé).
export function effacerBrouillon(compteId: string, edlId: string): void {
  if (!compteId) return;
  try {
    localStorage.removeItem(cleBrouillonEdl(compteId, edlId));
    localStorage.removeItem(cleAncienBrouillonEdl(edlId));
  } catch {
    // rien à faire
  }
}

type Stockage = Pick<Storage, "length" | "key" | "removeItem" | "getItem">;

/**
 * Ce qu'une purge a fait : brouillons effacés, brouillons gardés parce qu'ils portent des lignes jamais envoyées, dont
 * `anciens` : ceux de l'ancien format, saisis avant la mise à jour et liés à aucun compte (comptés aussi dans `conserves`).
 */
export type BilanBrouillonsEdl = { efface: number; conserves: number; anciens: number };

/**
 * D15 : efface les brouillons d'état des lieux qui ne portent AUCUNE ligne non synchronisée, garde les autres.
 *
 *  · un brouillon rattaché à un compte est gardé si, et seulement si, `enAttente` annonce au moins une ligne non envoyée ;
 *    illisible, sans ce compteur ou à zéro, il n'a rien à protéger et part ;
 *  · l'ancienne clé sans compte est gardée dès qu'elle porte un état ou un commentaire saisi : l'ancienne grille ne l'écrivait
 *    que pour des lignes non envoyées (et l'effaçait après l'envoi), elle ne se détruit pas à l'aveugle. Le compte qui rouvre
 *    cet état des lieux la reprend (`chargerBrouillon`). Illisible ou sans aucune saisie, elle part ;
 *  · les brouillons gardés sont comptés : l'appelant en avertit la personne.
 * Au mieux : jamais d'erreur (stockage refusé ou absent), jamais d'attente.
 */
export function purgerBrouillonsEdl(stockage: Stockage | undefined = stockageLocal()): BilanBrouillonsEdl {
  const bilan: BilanBrouillonsEdl = { efface: 0, conserves: 0, anciens: 0 };
  if (!stockage) return bilan;
  try {
    const cles: string[] = [];
    for (let i = 0; i < stockage.length; i++) {
      const k = stockage.key(i);
      if (k) cles.push(k);
    }
    for (const k of cles) {
      const ancien = k.startsWith(PREFIXE_BROUILLON_EDL_ANCIEN);
      if (!ancien && !k.startsWith(PREFIXE_BROUILLON_EDL)) continue;
      const brut = stockage.getItem(k);
      if (ancien ? porteDesReleves(brut) : lignesNonSynchronisees(brut) > 0) {
        bilan.conserves++;
        if (ancien) bilan.anciens++;
      } else {
        stockage.removeItem(k);
        bilan.efface++;
      }
    }
  } catch {
    // stockage refusé : rien à effacer, rien à garder
  }
  return bilan;
}

/**
 * Ce que la page de connexion dit après une déconnexion qui laisse des relevés d'état des lieux non envoyés sur l'appareil.
 * `anciens` : combien de ces copies ont été saisies avant la mise à jour, donc ne sont liées à aucun compte.
 */
export function messageBrouillonsConserves(nombre: number, anciens = 0): string {
  const sujet = nombre === 1 ? "Un état des lieux contient des relevés" : `${nombre} états des lieux contiennent des relevés`;
  const base = `Vous êtes déconnecté. ${sujet} qui n’ont pas été envoyés : ils restent sur cet appareil et ne sont repris que depuis votre compte. Reconnectez-vous pour les envoyer ; sur un appareil partagé, faites-le avant de le quitter.`;
  if (anciens <= 0) return base;
  const lesquels = anciens >= nombre ? "Ces relevés ont été saisis" : "Certains relevés ont été saisis";
  return `${base} ${lesquels} avant la mise à jour de Gerimmo et ne sont pas liés à un compte : la personne qui rouvre cet état des lieux les retrouve.`;
}

// Vrai si l'ancien brouillon (état des lieux → saisie) contient au moins un état ou un commentaire non vide.
function porteDesReleves(brut: string | null): boolean {
  if (!brut) return false;
  try {
    const b = JSON.parse(brut) as { etats?: unknown; commentaires?: unknown } | null;
    if (!b || typeof b !== "object") return false;
    return [b.etats, b.commentaires].some(
      (saisie) => saisie !== null && typeof saisie === "object" && Object.values(saisie).some((v) => typeof v === "string" && v.trim() !== "")
    );
  } catch {
    return false;
  }
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
