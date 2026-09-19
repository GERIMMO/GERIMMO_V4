// Le parrainage — la forme du code, le lien qui le porte, et ce qu'il rapporte.
//
// POURQUOI IL EXISTE (wiki : « Expansion territoriale autonome », 19/09). Pour
// les particuliers, Gerimmo n'a pas le droit de démarcher : le seul moteur est
// le bouche-à-oreille, et il ne se mesure que si l'on sait qui a amené qui.
//
// L'AVANTAGE, décidé le 19/09 : **un mois pour vous, un mois pour lui**. Le
// filleul entre un code et son essai passe de quatorze à trente jours, tout de
// suite. Le parrain reçoit un mois quand son filleul devient client PAYANT —
// jamais à sa simple inscription, sinon on financerait des organisations
// fictives ouvertes avec son propre code. Selon qu'il est encore en essai ou
// déjà abonné, ce mois lui arrive en jours d'essai ou en avoir sur sa facture.
//
// Les durées vivent aussi en base (`parrainage_jours_filleul`,
// `parrainage_jours_parrain`) : là elles s'appliquent, ici elles s'affichent.
// Les deux doivent dire la même chose — le test `avantage-parrainage` compare.

/** Huit caractères hexadécimaux en capitales, tels que la base les engendre. */
export const FORME_CODE = /^[0-9A-F]{8}$/;

/**
 * Lit un code tel qu'une personne l'a tapé ou collé : espaces, tirets et
 * minuscules pardonnés ; « O » lu comme zéro, parce qu'un code hexadécimal ne
 * contient pas de O et que la confusion est la plus fréquente.
 */
export function normaliserCode(saisie: string | null | undefined): string | null {
  const c = (saisie ?? "")
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0");
  return FORME_CODE.test(c) ? c : null;
}

/** Le lien d'inscription qui porte le code : `/inscription?parrain=…`. */
export function lienDeParrainage(site: string, code: string): string {
  return `${site.replace(/\/+$/, "")}/inscription?parrain=${encodeURIComponent(code)}`;
}

/** Le code porté par une adresse d'inscription, s'il a la bonne forme. */
export function codeDeLaRecherche(recherche: URLSearchParams | Record<string, string | string[] | undefined>): string | null {
  const brut =
    recherche instanceof URLSearchParams
      ? recherche.get("parrain")
      : Array.isArray(recherche.parrain)
        ? recherche.parrain[0]
        : recherche.parrain;
  return normaliserCode(brut);
}

// ── L'avantage, tel qu'on l'annonce ────────────────────────────────────────

/** L'essai ordinaire, sans code : quatorze jours. */
export const JOURS_ESSAI_ORDINAIRE = 14;
/** L'essai du filleul, code entré : trente jours AU TOTAL. */
export const JOURS_ESSAI_FILLEUL = 30;
/** Ce que gagne le parrain quand son filleul devient payant : trente jours. */
export const JOURS_OFFERTS_PARRAIN = 30;

/** La promesse, en une phrase — la même partout où on la fait. */
export const PROMESSE_PARRAINAGE =
  "Un mois pour vous, un mois pour lui : votre filleul démarre avec 30 jours d'essai au lieu de 14, et vous recevez un mois offert dès qu'il devient client.";

export type NatureAvantage = "essai_filleul" | "essai_parrain" | "avoir_parrain";
export type EtatAvantage = "a_appliquer" | "applique" | "sans_objet";

export type AvantageParrainage = {
  nature: NatureAvantage;
  jours: number | null;
  montant_cents: number | null;
  etat: EtatAvantage;
};

/**
 * Ce qu'une ligne du registre veut dire pour la personne qui la lit. Un
 * « sans objet » se dit aussi : un avantage qu'on n'a pas pu accorder doit
 * s'expliquer, pas disparaître de la liste.
 */
export function libelleAvantage(a: AvantageParrainage, eur: (cents: number) => string): string {
  if (a.etat === "sans_objet") {
    return a.nature === "essai_filleul"
      ? "Essai déjà ouvert ou abonnement en cours : rien à rallonger."
      : "Aucun montant à créditer au moment de l'acquisition.";
  }
  if (a.nature === "essai_filleul") return `Essai porté à ${a.jours} jours`;
  if (a.nature === "essai_parrain") return `${a.jours} jours d'essai offerts`;
  const montant = eur(a.montant_cents ?? 0);
  return a.etat === "applique"
    ? `Un mois offert — ${montant} portés à votre solde`
    : `Un mois offert — ${montant} déduits de votre prochaine facture`;
}
