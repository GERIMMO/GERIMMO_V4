// Le parrainage — la forme du code, le lien qui le porte, et ce qu'il rapporte.
//
// POURQUOI IL EXISTE (wiki : « Expansion territoriale autonome », 19/09). Pour
// les particuliers, Gerimmo n'a pas le droit de démarcher : le seul moteur est
// le bouche-à-oreille, et il ne se mesure que si l'on sait qui a amené qui.
//
// L'AVANTAGE. Décidé le 19/09 (« un mois pour vous, un mois pour lui »),
// suspendu le 28-29/09 avec la nouvelle grille (« pas de cumul »), puis
// RÉACTIVÉ le 30/09/2026 pour le seul parrain : **1 mois offert au parrain à
// la conversion de chaque filleul**. La conversion, c'est la première facture
// non nulle payée du filleul (grille du 28/09) — jamais sa simple inscription,
// sinon on financerait des organisations fictives ouvertes avec son propre
// code. Le parrain déjà abonné reçoit un avoir de son mensuel courant (annuel
// ÷ 12) déduit de sa prochaine facture ; encore en essai, un mois d'essai de
// plus. Le filleul n'a pas d'avantage supplémentaire : il garde l'essai
// ordinaire (2 mois jusqu'au 31/12/2026 — offre de lancement —, puis 1 mois).
// La grille historique garde sa mécanique d'origine (trente jours).
//
// Les durées historiques vivent aussi en base (`parrainage_jours_filleul`,
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

/** L'essai du filleul de la grille historique, code entré : trente jours AU
 * TOTAL — jamais moins que l'essai ordinaire (`dureeEssai()`, 2 mois pendant
 * l'offre de lancement), que la base garde s'il est plus long. Sans objet sur
 * la grille du 28/09/2026. */
export const JOURS_ESSAI_FILLEUL = 30;
/** Grille historique : ce que gagne le parrain encore en essai, trente jours. */
export const JOURS_OFFERTS_PARRAIN = 30;
/** Grille du 28/09/2026 (décision du 30/09) : un mois offert au parrain. */
export const MOIS_OFFERTS_PARRAIN = 1;

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
  // État hérité du 28/09 (avantage en attente d'arbitrage) : conservé pour
  // d'éventuelles anciennes lignes.
  if (a.etat === "en_attente") {
    return a.nature === "essai_filleul"
      ? "Recommandation enregistrée — avantage en cours de révision avec la nouvelle grille"
      : "Parrainage enregistré — avantage en cours de révision avec la nouvelle grille";
  }
  if (a.etat === "sans_objet") {
    if (a.nature === "essai_filleul" && a.jours === 0) {
      return "Code de parrainage enregistré — pas d'avantage pour le filleul : l'essai ordinaire s'applique";
    }
    return a.nature === "essai_filleul"
      ? "Essai déjà ouvert ou abonnement en cours : rien à rallonger."
      : "Filleul converti — aucun montant à créditer à ce moment-là.";
  }
  if (a.nature === "essai_filleul") return `Essai porté à ${a.jours} jours`;
  if (a.nature === "essai_parrain") {
    return a.jours ? `Un mois d'essai offert (+${a.jours} jours)` : "Un mois d'essai offert";
  }
  const montant = eur(a.montant_cents ?? 0);
  return a.etat === "applique"
    ? `Un mois offert — ${montant} portés à votre solde`
    : `Un mois offert — ${montant} déduits de votre prochaine facture`;
}

/** La promesse, telle que le profil l'affiche en titre de carte. */
export const PROMESSE_PARRAIN = "1 mois offert à la conversion de chaque filleul";

/**
 * Le programme, tel qu'on l'explique à chaque organisation (décision du
 * 30/09/2026). Texte fixe, vrai avant comme après la fin de l'offre de
 * lancement (FIN_OFFRE_LANCEMENT dans tarifs.ts) : il ne dépend pas du jour
 * du rendu.
 */
export const PARRAINAGE_PROGRAMME =
  "Partagez votre code : quand une organisation inscrite avec lui paie sa première facture, vous recevez un mois offert — un avoir égal à votre mensuel courant (un douzième de l'annuel), déduit de votre prochaine facture, ou un mois d'essai de plus si vous êtes encore en essai. Une récompense par filleul. Votre filleul garde l'essai ordinaire — 2 mois pour toute inscription jusqu'au 31 décembre 2026 (offre de lancement), 1 mois ensuite —, sans avantage supplémentaire.";
