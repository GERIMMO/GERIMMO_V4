// Lectures fiscales : ne jamais afficher un montant calculé sur une lecture peut-être tronquée.
//
// Décisions X12 et X21 du 14/10/2026 (fiches FIN-12 et VER-TS-05). L'API de lecture rend au plus 1 000 lignes par requête
// (réglage « Max rows » de Supabase, 1 000 par défaut) et ne signale RIEN quand elle en coupe : un récapitulatif calculé
// sur les 1 000 premières lignes sous-évalue les recettes, fait apparaître des loyers « à qualifier », et se recopie sur
// une déclaration. Deux règles, ici une fois pour toutes :
//
//   1. on lit ce qu'il faut, pas l'organisation entière : qualifications et captures d'encaissement se lisent par
//      identifiants des écritures déjà lues (de l'année, et du lot pour le document), par paquets, pour que ni l'adresse
//      de la requête ni le plafond de lignes ne deviennent un risque ;
//   2. une lecture qui rend autant de lignes que le plafond est peut-être coupée : on n'affiche aucun montant et on le dit,
//      en nommant la lecture, sans renvoyer à une « période » que l'écran ne permet pas de régler.

/** Le plafond de lignes d'une lecture de l'API : une lecture qui l'atteint est peut-être tronquée. */
export const LIMITE_LIGNES_API = 1000;

/** La limite telle qu'on l'écrit aux utilisateurs (« 1 000 », avec une espace insécable). */
export const LIMITE_LIGNES_AFFICHEE = "1 000";

/** Identifiants par requête : ~3,7 ko d'adresse, très loin des limites des serveurs, et au plus 100 captures par paquet. */
export const TAILLE_PAQUET_IDENTIFIANTS = 100;

/** Vrai quand la lecture a rendu autant de lignes que le plafond : elle est peut-être coupée. */
export function lectureTronquee(lignes: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(lignes) && lignes.length >= LIMITE_LIGNES_API;
}

type EcritureAvecOrigine = { id?: string | null; contre_ecriture_de?: string | null };

/**
 * Les pièces dont on lit les qualifications et les captures : les écritures elles-mêmes, et les écritures d'origine de leurs
 * contre-écritures (qui reprennent la qualification et la capture de l'origine, même datée d'une autre année).
 */
export function identifiantsDesEcritures(ecritures: readonly EcritureAvecOrigine[]): string[] {
  const ids = new Set<string>();
  for (const e of ecritures) {
    if (e.id) ids.add(e.id);
    if (e.contre_ecriture_de) ids.add(e.contre_ecriture_de);
  }
  return [...ids];
}

type Reponse<T> = { data: T[] | null; error: { message: string } | null };
export type LectureParIdentifiants<T> = { data: T[] | null; error: { message: string } | null; tronquee: boolean };

/**
 * Lit par paquets d'identifiants. `lire(paquet)` fait UNE requête bornée à ces identifiants. Rend toutes les lignes, la première
 * erreur rencontrée (alors sans ligne), et si l'un des paquets a atteint le plafond. Sans identifiant, aucune requête n'est faite.
 */
export async function lireParIdentifiants<T>(
  identifiants: readonly string[],
  lire: (paquet: string[]) => PromiseLike<Reponse<T>>,
): Promise<LectureParIdentifiants<T>> {
  const paquets: string[][] = [];
  for (let i = 0; i < identifiants.length; i += TAILLE_PAQUET_IDENTIFIANTS) paquets.push(identifiants.slice(i, i + TAILLE_PAQUET_IDENTIFIANTS));
  const reponses = await Promise.all(paquets.map((p) => lire(p)));
  const erreur = reponses.find((r) => r.error)?.error ?? null;
  if (erreur) return { data: null, error: erreur, tronquee: false };
  const data = reponses.flatMap((r) => r.data ?? []);
  return { data, error: null, tronquee: reponses.some((r) => lectureTronquee(r.data)) };
}

const enumerer = (mots: readonly string[]) => (mots.length < 2 ? mots.join("") : `${mots.slice(0, -1).join(", ")} et ${mots[mots.length - 1]}`);

/**
 * « la lecture des qualifications fiscales a atteint la limite de 1 000 lignes et peut être incomplète » : la phrase commune à
 * l'écran et au document. `libelles` nomme chaque lecture (« des écritures de 2026 », « des qualifications fiscales »…).
 */
export function phraseLimiteAtteinte(libelles: readonly string[]): string {
  const uniques = [...new Set(libelles)];
  const plusieurs = uniques.length > 1;
  const sujet = plusieurs ? `les lectures ${enumerer(uniques)}` : `la lecture ${uniques[0]}`;
  return `${sujet} ${plusieurs ? "ont" : "a"} atteint la limite de ${LIMITE_LIGNES_AFFICHEE} lignes et ${plusieurs ? "peuvent" : "peut"} être incomplète${plusieurs ? "s" : ""}`;
}

/** Où signaler le problème : la limite ne se règle ni depuis l'écran, ni depuis le document. */
const OU_SIGNALER = "signalez-le depuis Aide et retours";

/** L'écran « Récapitulatif fiscal » : aucun montant, et pourquoi. */
export function messageEcranLectureTronquee(libelles: readonly string[]): { titre: string; explication: string } {
  return {
    titre: `Aucun montant n’est affiché : ${phraseLimiteAtteinte(libelles)}.`,
    explication:
      "Ce n’est pas une année sans recettes ni charges : un récapitulatif calculé sur une lecture incomplète donnerait des montants faux, " +
      `à recopier sur une déclaration. Cette limite ne se règle pas depuis cet écran : ${OU_SIGNALER}.`,
  };
}

/** Le document « Récapitulatif annuel · location nue » : refusé, avec la raison exacte. */
export function messageDocumentLectureTronquee(annee: number, libelles: readonly string[]): string {
  return (
    `Le récapitulatif ${annee} de ce lot ne peut pas être produit : ${phraseLimiteAtteinte(libelles)}. ` +
    "Aucun montant n’est imprimé, pour ne pas faire recopier un chiffre faux sur une déclaration. " +
    `Cette limite ne se règle pas dans ce document : ${OU_SIGNALER}.`
  );
}
