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

// La promesse « un mois pour vous, un mois pour lui » n'est plus affichée
// (décision du porteur du 29/09 : pas de cumul avec la grille, pour aucune
// organisation). Les durées ci-dessus restent le miroir de la base, que le
// test `avantage-parrainage` compare ; l'écran affiche PARRAINAGE_EN_REVISION.

export type NatureAvantage = "essai_filleul" | "essai_parrain" | "avoir_parrain";
export type EtatAvantage = "a_appliquer" | "applique" | "sans_objet" | "en_attente";

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
  // Grille du 28/09/2026 : l'avantage est enregistré, pas appliqué, tant que
  // le porteur n'a pas arbitré son articulation avec la nouvelle grille.
  if (a.etat === "en_attente") {
    return a.nature === "essai_filleul"
      ? "Recommandation enregistrée — avantage en cours de révision avec la nouvelle grille"
      : "Parrainage enregistré — avantage en cours de révision avec la nouvelle grille";
  }
  if (a.etat === "sans_objet") {
    if (a.nature === "essai_filleul" && a.jours === 0) {
      return "Recommandation enregistrée — sans avantage tarifaire (pas de cumul avec la grille)";
    }
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

/**
 * Ce que l'on dit du programme à une organisation de la grille du 28/09/2026 :
 * pas de cumul (décision du porteur). Les recommandations sont enregistrées,
 * sans avantage tarifaire ; les avantages déjà acquis restent acquis.
 */
export const PARRAINAGE_EN_REVISION =
  "Vos recommandations sont enregistrées. Le parrainage n'ouvre pas d'avantage tarifaire : l'essai gratuit est de 14 jours pour tous, sans cumul avec la grille. Les avantages déjà acquis sont conservés.";
