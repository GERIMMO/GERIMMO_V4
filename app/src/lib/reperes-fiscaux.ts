/**
 * Audit palier 1, P2-09 — les deux valeurs du régime micro-foncier citées par l'aide du récapitulatif fiscal.
 *
 * Elles étaient écrites en dur dans le texte de l'écran (« 15 000 € », « 30 % »). Elles vivent maintenant dans un
 * réglage du superviseur (`reperes_fiscaux_reglage`, migration 20261123090000), avec la date de leur dernière
 * vérification. Ce module lit ce réglage et compose les phrases : il ne calcule rien, et le récapitulatif non plus
 * (ni impôt, ni droit au micro-foncier).
 *
 * Règle tenue ici : une valeur qui n'a pas exactement la forme attendue n'est jamais affichée. Réglage illisible ou
 * réponse inattendue → `null`, et la phrase d'aide ne cite alors aucun chiffre.
 *
 * Décision du 24/11/2026 (Q38) : la source du contrôle (la page officielle où le superviseur a lu les deux valeurs) est
 * enregistrée avec sa date (migration 20261124190000) et affichée aux propriétaires avec elle.
 *
 * Module sans import : il sert aussi bien à l'écran du propriétaire (serveur) qu'au panneau de la console (navigateur).
 */

export type ReperesFiscaux = {
  /** Plafond de recettes brutes du micro-foncier, en euros entiers. */
  plafondEuros: number;
  /** Abattement forfaitaire du micro-foncier, en pour cent entier. */
  abattementPourcent: number;
  /** Jour (AAAA-MM-JJ) où le superviseur a confirmé ces deux valeurs ; `null` : jamais confirmées. */
  verifieLe: string | null;
  /** Où le superviseur a lu ces deux valeurs ce jour-là (texte qu'il a saisi) ; `null` : aucune source enregistrée. */
  source: string | null;
};

/** Les mêmes bornes que la contrainte de la table : une ligne de 10 à 300 caractères. */
export const BORNES_SOURCE_REPERES = { min: 10, max: 300 } as const;

/** La source saisie par le superviseur → une ligne propre, ou `null` si elle n'a pas la forme attendue. */
export function lireSourceSaisie(brut: unknown): string | null {
  if (typeof brut !== "string") return null;
  const propre = brut.trim();
  if (propre.length < BORNES_SOURCE_REPERES.min || propre.length > BORNES_SOURCE_REPERES.max) return null;
  // Aucun caractère de contrôle (retour à la ligne, tabulation) : la source s'affiche dans une phrase.
  return /[\u0000-\u001f\u007f]/.test(propre) ? null : propre;
}

/** Les mêmes bornes que les contraintes de la table : au-delà, c'est une faute de frappe, pas une valeur. */
export const BORNES_REPERES_FISCAUX = {
  plafondEuros: { min: 1000, max: 1_000_000 },
  abattementPourcent: { min: 1, max: 99 },
} as const;

const JOUR_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function entierEntre(v: unknown, bornes: { min: number; max: number }): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= bornes.min && v <= bornes.max;
}

/** Ce que rend `reperes_fiscaux()` → des valeurs sûres, ou `null` dès qu'un champ n'a pas la forme attendue. */
export function lireReponseReperes(data: unknown): ReperesFiscaux | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const plafond = d.micro_foncier_plafond_euros;
  const abattement = d.micro_foncier_abattement_pourcent;
  const verifie = d.verifie_le ?? null;
  const source = d.source ?? null;
  if (!entierEntre(plafond, BORNES_REPERES_FISCAUX.plafondEuros)) return null;
  if (!entierEntre(abattement, BORNES_REPERES_FISCAUX.abattementPourcent)) return null;
  if (verifie !== null && (typeof verifie !== "string" || !JOUR_ISO.test(verifie))) return null;
  if (source !== null && (typeof source !== "string" || lireSourceSaisie(source) !== source)) return null;
  return { plafondEuros: plafond, abattementPourcent: abattement, verifieLe: verifie, source };
}

type ClientLecture = { rpc: (nom: "reperes_fiscaux_avec_source") => PromiseLike<{ data: unknown; error: unknown }> };

/** Lit le réglage. Toute panne (base, droit, forme) rend `null` : l'écran reste lisible, sans chiffre. */
export async function chargerReperesFiscaux(db: ClientLecture): Promise<ReperesFiscaux | null> {
  try {
    const reponse = await db.rpc("reperes_fiscaux_avec_source");
    if (!reponse || reponse.error) return null;
    return lireReponseReperes(reponse.data);
  } catch {
    return null;
  }
}

/** « 15 000 € » : un montant en euros entiers, espaces insécables (le « € » ne part pas seul à la ligne). */
export function eurosEntiers(n: number): string {
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
}

/** « 2026-11-23 » → « 23/11/2026 ». */
function jourEnFrancais(iso: string): string {
  const m = JOUR_ISO.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * Les deux phrases de l'aide du récapitulatif fiscal.
 *  - `regle` : ce que dit le régime, avec les valeurs enregistrées — ou sans aucun chiffre si le réglage est illisible ;
 *  - `verification` : d'où viennent ces valeurs et ce qui fait foi. Sans date enregistrée, la phrase le dit : elle ne
 *    présente jamais une valeur comme vérifiée. Avec une source enregistrée (Q38), elle la cite telle que saisie.
 * Les deux-points portent une espace insécable : sur téléphone, « : » partait seul en début de ligne.
 */
export function phrasesMicroFoncier(reperes: ReperesFiscaux | null): { regle: string; verification: string } {
  if (!reperes) {
    return {
      regle: "Régime micro-foncier\u00A0: sous un plafond de recettes brutes fixé par la loi, seule la ligne des recettes vous sert (abattement forfaitaire).",
      verification: "Le plafond et le taux en vigueur ne peuvent pas être affichés pour le moment\u00A0: ils figurent dans la notice officielle.",
    };
  }
  const regle = `Régime micro-foncier\u00A0: si vos recettes brutes n’excèdent pas ${eurosEntiers(reperes.plafondEuros)}, seule la ligne des recettes vous sert (abattement automatique de ${reperes.abattementPourcent} %).`;
  return {
    regle,
    verification: reperes.verifieLe
      ? `Plafond et abattement vérifiés par Gerimmo le ${jourEnFrancais(reperes.verifieLe)}${reperes.source ? ` (source\u00A0: ${reperes.source})` : ""}. Une loi de finances peut les modifier\u00A0: la notice officielle fait foi.`
      : "Aucune date de vérification n’est enregistrée pour ce plafond et cet abattement\u00A0: contrôlez-les dans la notice officielle avant de vous en servir.",
  };
}

export type EtatVerificationReperes = "jamais" | "a_reverifier" | "verifie";

/**
 * Pour la console : ces valeurs sont-elles à contrôler ? Une loi de finances s'applique par année civile : une
 * vérification datée d'une année précédente est à refaire.
 */
export function etatVerification(reperes: ReperesFiscaux, aujourdHui: string): EtatVerificationReperes {
  if (!reperes.verifieLe) return "jamais";
  return reperes.verifieLe.slice(0, 4) < aujourdHui.slice(0, 4) ? "a_reverifier" : "verifie";
}

/** Le libellé court de cet état (puce du panneau, carte de résumé). */
export function libelleVerification(reperes: ReperesFiscaux | null, aujourdHui: string): string {
  if (!reperes) return "État indisponible";
  const etat = etatVerification(reperes, aujourdHui);
  if (etat === "jamais") return "Jamais vérifiés";
  const jour = jourEnFrancais(reperes.verifieLe as string);
  return etat === "a_reverifier" ? `À revérifier (vérifiés le ${jour})` : `Vérifiés le ${jour}`;
}

/**
 * Une saisie du superviseur → un entier dans les bornes, ou `null`. Lecture stricte : des chiffres, avec des espaces
 * de milliers tolérées (« 15 000 »), rien d'autre — ni virgule, ni signe, ni « 1e4 ».
 */
export function lireEntierSaisi(brut: unknown, bornes: { min: number; max: number }): number | null {
  if (typeof brut !== "string") return null;
  const propre = brut.replace(/[\s  ]/g, "");
  if (!/^[0-9]{1,7}$/.test(propre)) return null;
  // Sept chiffres au plus, tous vérifiés : la valeur se compose chiffre à chiffre, sans conversion permissive.
  let n = 0;
  for (const chiffre of propre) n = n * 10 + (chiffre.charCodeAt(0) - 48);
  return n >= bornes.min && n <= bornes.max ? n : null;
}
