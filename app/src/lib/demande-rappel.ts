/**
 * « Être rappelé » (20/11/2026) — les règles pures d'une demande de rappel, partagées par l'action serveur, le
 * formulaire public et l'écran des demandes de contact de la console.
 *
 * POURQUOI. Le dirigeant veut répondre aux appels de propriétaires intéressés ; un particulier ne peut être contacté
 * que s'il l'a demandé (décision 8 du 23/10, [[Prospection commerciale]]). Le visiteur laisse donc LUI-MÊME son numéro
 * et son accord : c'est sa demande, pas une prospection.
 *
 * OÙ ELLE VIT. Dans la table des demandes de contact du site (`demandes_devis`), sans migration : mêmes droits (insertion
 * par l'action serveur seule), même limite de débit en base, même durée de conservation, même mention d'information, et
 * le passage de 5 h compte déjà les demandes non traitées. Une demande de rappel se reconnaît à son message, qui commence
 * par `PREFIXE_RAPPEL`.
 */

export const PREFIXE_RAPPEL = "Demande de rappel";

export const CRENEAUX_RAPPEL = {
  indifferent: "Indifférent",
  matin: "Le matin (9 h – 12 h)",
  midi: "Entre 12 h et 14 h",
  apres_midi: "L'après-midi (14 h – 18 h)",
  soir: "En fin de journée (18 h – 20 h)",
} as const;
export type CreneauRappel = keyof typeof CRENEAUX_RAPPEL;

/** Le créneau choisi, ou « indifférent » pour une valeur absente ou inconnue. */
export function creneauRappel(valeur: unknown): CreneauRappel {
  return typeof valeur === "string" && Object.hasOwn(CRENEAUX_RAPPEL, valeur) ? (valeur as CreneauRappel) : "indifferent";
}

/**
 * Un numéro joignable en France, ramené à une forme lisible (« 06 12 34 56 78 », « +33 6 12 34 56 78 ») ; null s'il n'en
 * est pas un. Admis : 10 chiffres commençant par 0 (sauf 00), ou +33 / 0033 suivis de 9 chiffres (sans le 0). Espaces,
 * points, tirets et parenthèses sont tolérés à la saisie.
 */
export function telephoneRappel(saisie: unknown): string | null {
  if (typeof saisie !== "string") return null;
  const brut = saisie.trim();
  if (!brut || brut.length > 40 || /[^\d\s.\-()+]/.test(brut)) return null;
  const chiffres = brut.replace(/[\s.\-()]/g, "");
  const national = /^0[1-9]\d{8}$/.exec(chiffres)?.[0];
  if (national) return national.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  const international = /^(?:\+33|0033)([1-9]\d{8})$/.exec(chiffres)?.[1];
  if (international) return `+33 ${international[0]} ${international.slice(1).replace(/(\d{2})(?=\d)/g, "$1 ").trim()}`;
  return null;
}

/** Le lien d'appel d'un numéro déjà normalisé (« tel:+33612345678 »). */
export function lienAppel(telephone: string): string {
  const chiffres = telephone.replace(/\s/g, "");
  return `tel:${chiffres.startsWith("+") ? chiffres : `+33${chiffres.slice(1)}`}`;
}

/**
 * La page d'où vient la demande : un chemin du site (« /outils/calcul-irl »), sans requête ni fragment, borné à
 * 120 caractères ; « / » sinon. Il sert à savoir quelles pages amènent des demandes, rien d'autre.
 */
export function origineRappel(valeur: unknown): string {
  if (typeof valeur !== "string") return "/";
  const chemin = valeur.split(/[?#]/)[0].trim();
  return /^\/[a-z0-9\-/]{0,119}$/.test(chemin) && !chemin.includes("//") ? chemin : "/";
}

/** Le message enregistré : lisible tel quel dans la console, et reconnaissable par son préfixe. */
export function messageRappel(telephone: string, creneau: CreneauRappel, origine: string): string {
  return `${PREFIXE_RAPPEL} au ${telephone}. Créneau souhaité : ${CRENEAUX_RAPPEL[creneau].toLowerCase()}. Page d'origine : ${origine}.`;
}

/** Une demande de contact est-elle une demande de rappel ? */
export function estDemandeRappel(message: string | null | undefined): boolean {
  return typeof message === "string" && message.startsWith(PREFIXE_RAPPEL);
}
