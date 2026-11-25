// La garde de souscription (lot B3, 19/10/2026) : ce qui doit être vrai AVANT
// d'ouvrir un paiement, en plus des clés Stripe et du régime de TVA.
//
// Deux conditions de contrat, vérifiées par le serveur (actions/abonnement.ts)
// et dites par l'écran (abonnement-2026.tsx, formulaire-souscription.tsx) avec
// les MÊMES phrases :
//  1. le vendeur est identifié — les faits requis de lib/editeur.ts, lus dans
//     `supervision_identite` par-dessus le code (lib/editeur-serveur.ts), et
//     la mention « EI » accolée au nom d'un entrepreneur individuel.
//     Pour TOUTE première souscription (particulier ou agence), ce contrôle
//     ne se lève pas : pas de vente sans vendeur identifié (décision du
//     dirigeant du 24/11/2026, Q7 ; relecture D7R-04 pour l'agence). Le
//     superadmin peut le lever depuis les paramètres pour une hausse de
//     capacité seulement ; le serveur lit cette décision en base.
//  1 bis. le médiateur de la consommation est désigné — pour la première
//     souscription d'un PARTICULIER seulement, et PAR DÉFAUT. Reprise du
//     24/11/2026 (décision de pilotage) : le recueil fourni par le dirigeant
//     contient les articles L. 612-1 et L. 616-1 du code de la consommation
//     (le professionnel garantit au consommateur le recours effectif à une
//     médiation et lui communique les coordonnées du médiateur). Un
//     professionnel n'est pas concerné.
//     Seconde reprise du 24/11/2026 (relecture T4R-02) : ouvrir quand même aux
//     particuliers est une décision À PART du superadmin, datée par la base
//     (`vente_particuliers_sans_mediateur_le`), prise sur la carte qui cite ces
//     deux articles, case « j'ai lu » cochée. Le bouton « Lever le blocage »
//     ne l'ouvre plus : une levée enregistrée avant ce lot (elle ne visait
//     alors que les hausses) n'ouvre donc rien aux particuliers.
//  2. le compte qui clique a accepté LA VERSION EN VIGUEUR des conditions
//     générales (`acceptations_cgu`, ajout seul). Exigée pour la souscription
//     initiale seulement (arbitrage du 19/10) : une hausse de capacité porte
//     sur un contrat déjà formé.
//
// Ce module n'importe rien du serveur : le formulaire client et les tests
// l'utilisent tel quel. Les lectures en base vivent dans
// lib/garde-souscription-serveur.ts.

import { CONDITIONS_VERSION, defautsVendeur, faitsManquants, mediateurDesigne, type FaitEditeur } from "@/lib/editeur";

/**
 * Le refus tant que les mentions légales de l'éditeur manquent. Même phrase
 * dans l'action et à l'écran. Elle commence comme les motifs Stripe et TVA
 * (« Le paiement en ligne n'est pas encore ouvert », apostrophe droite comme
 * eux : le parcours local e2e/abonnement.spec.ts s'y accroche) et ne prend
 * aucune des formes que la recette relève comme une erreur d'écran
 * (e2e/recette-production/outils.ts, MESSAGES_D_ERREUR) : la recette la lit
 * telle quelle, par son texte exact.
 *
 * Correction du 19/10 : la phrase est servie SANS « Votre essai continue. »
 * dès que l'essai ne court plus — compte gelé en lecture seule à la fin de
 * l'essai, ou client déjà abonné qui demande une hausse.
 */
export const MOTIF_IDENTITE_EDITEUR =
  "Le paiement en ligne n'est pas encore ouvert : les mentions légales de l'éditeur sont en cours de publication.";

/** La même phrase pendant l'essai : il continue, rien n'est perdu. */
export const MOTIF_IDENTITE_EDITEUR_ESSAI = `${MOTIF_IDENTITE_EDITEUR} Votre essai continue.`;

/** Le refus tant que le compte n'a pas accepté la version en vigueur des conditions. */
export const MOTIF_CONDITIONS_A_ACCEPTER = "Acceptez la version en vigueur des conditions générales avant de poursuivre.";

/** Quand la version lue à l'écran n'est plus celle du serveur (page restée ouverte pendant un déploiement). */
export const ERREUR_CONDITIONS_PERIMEES =
  "Les conditions ont changé depuis l’affichage : rechargez la page, puis acceptez la version en vigueur.";

/** Même phrase qu'à l'ouverture d'un espace propriétaire (actions/auth.ts). */
export const ERREUR_ACCEPTATION_CONDITIONS =
  "L’acceptation des conditions n’a pas pu être enregistrée. Réessayez dans un instant.";

/**
 * L'état du compte qui lit le motif. `enEssai` est vrai quand l'essai COURT
 * encore : statut « essai » ET écriture ouverte. Un essai arrivé à son terme
 * garde le statut « essai » (public.org_ecriture_ouverte ferme à la date,
 * sans changement de statut) : il n'est plus « en essai » au sens de cette
 * phrase.
 */
export type ContexteGarde = {
  enEssai: boolean;
  /** `false` seulement si le superadmin a levé le blocage (lu en base) ; absent ou illisible : actif. Ne concerne que les hausses. */
  blocageIdentiteActif?: boolean;
  /**
   * `true` seulement si le superadmin a décidé de vendre aux particuliers sans médiateur (décision datée, lue en
   * base) ; absent, retiré ou illisible : la première souscription d'un particulier attend le médiateur.
   */
  venteSansMediateurDecidee?: boolean;
  /** Vrai pour toute première souscription, quel que soit le client : le vendeur doit être identifié, blocage levé ou non. */
  premiereSouscription?: boolean;
  /** Vrai pour la première souscription d'un particulier (tarif « propriétaire ») : elle est aussi une première souscription. */
  nouvelleSouscriptionParticulier?: boolean;
};

/**
 * Le refus fait au particulier tant qu'aucun médiateur de la consommation n'est saisi. Elle commence comme les autres
 * motifs (« Le paiement en ligne n'est pas encore ouvert »). Seconde reprise du 24/11/2026 (relecture T4R-08) :
 * « les coordonnées du médiateur de la consommation de Gerimmo doivent être publiées » laissait entendre qu'un
 * médiateur existe déjà ; la phrase dit désormais qu'il reste à désigner.
 */
export const MOTIF_MEDIATEUR =
  "Le paiement en ligne n'est pas encore ouvert aux particuliers. Un médiateur de la consommation doit d'abord être désigné, et ses coordonnées publiées, avant la première souscription.";

/**
 * Le motif qui ferme le paiement, ou `null`.
 *  - Vendeur incomplet : ferme toute première souscription, blocage levé ou non ; ferme une hausse tant que le blocage
 *    est actif. Le détail des manques n'est pas dit au client : il est affiché au dirigeant (/admin/sante,
 *    /admin/parametres).
 *  - Médiateur non saisi : ferme la première souscription d'un particulier, sauf décision distincte et datée du
 *    superadmin (`venteSansMediateurDecidee`). Le blocage levé n'y change rien (relecture T4R-02).
 * Pendant l'essai, la phrase ajoute « Votre essai continue. » ; gelé ou abonné, elle s'arrête avant.
 */
export function motifIdentiteEditeur(editeur: Record<string, FaitEditeur>, { enEssai, blocageIdentiteActif, venteSansMediateurDecidee, premiereSouscription, nouvelleSouscriptionParticulier }: ContexteGarde): string | null {
  const blocageLeve = blocageIdentiteActif === false;
  const premiere = Boolean(premiereSouscription || nouvelleSouscriptionParticulier);
  if ((!blocageLeve || premiere) && defautsVendeur(editeur).length > 0) {
    return enEssai ? MOTIF_IDENTITE_EDITEUR_ESSAI : MOTIF_IDENTITE_EDITEUR;
  }
  if (nouvelleSouscriptionParticulier && venteSansMediateurDecidee !== true && !mediateurDesigne(editeur)) {
    return enEssai ? `${MOTIF_MEDIATEUR} Votre essai continue.` : MOTIF_MEDIATEUR;
  }
  return null;
}

/**
 * Ce que /admin/sante dit de l'identité du vendeur, avec la MÊME vérité que la garde (relecture T4R-05) : la page
 * lisait les seuls faits requis et annonçait « L'identité requise est complète » pour un entrepreneur individuel dont
 * le nom ne porte pas « EI », alors que la garde fermait tout. `horsFaits` : ce qui ferme la vente sans être un fait
 * requis des pages légales (type de vendeur non choisi, mention « EI » absente).
 */
export function etatVendeurPourLaSante(
  editeur: Record<string, FaitEditeur>,
  { blocageIdentiteActif, venteSansMediateurDecidee }: Pick<ContexteGarde, "blocageIdentiteActif" | "venteSansMediateurDecidee">,
): { defauts: string[]; horsFaits: string[]; phrase: string } {
  const manquants = faitsManquants(editeur);
  const defauts = defautsVendeur(editeur);
  const horsFaits = defauts.filter((d) => !manquants.includes(d));
  const mediateur = mediateurDesigne(editeur)
    ? "Le médiateur de la consommation est saisi."
    : venteSansMediateurDecidee === true
      ? "Aucun médiateur de la consommation n’est saisi : les mentions légales disent qu’aucun n’est désigné. Vous avez décidé, dans les paramètres, de vendre quand même aux particuliers ; cette décision se retire au même endroit."
      : "Reste le médiateur de la consommation : tant qu’il n’est pas saisi, les mentions légales disent qu’aucun n’est désigné, et la première souscription d’un particulier reste fermée, sauf décision de votre part enregistrée dans les paramètres (« Vente aux particuliers sans médiateur de la consommation »).";
  const phrase = defauts.length === 0
    ? `L’identité du vendeur est complète. ${mediateur}`
    : manquants.length === 0
      ? `Les faits requis par les pages légales sont fournis, mais l’identité du vendeur n’est pas complète : il manque ${horsFaits.join(", ")}. Toute première souscription reste fermée${blocageIdentiteActif === false ? "" : ", comme les augmentations payantes"}.`
      : blocageIdentiteActif === false
        ? "Tant qu’un fait « manquant » n’est pas fourni, les pages légales affichent l’encadré « Document en cours de finalisation ». Le blocage des abonnements est levé dans les paramètres : ces manques ne ferment plus les augmentations payantes ; toute première souscription reste fermée."
        : "Tant qu’un fait « manquant » n’est pas fourni, les pages légales affichent l’encadré « Document en cours de finalisation » et le paiement en ligne reste fermé.";
  return { defauts, horsFaits, phrase };
}

/**
 * Ce que /admin/journaux écrit pour une modification du réglage des abonnements (registre `supervision_identite`, états
 * avant et après tels que la base les a enregistrés). Seconde reprise du 24/11/2026 (relecture T4R-02) : la ligne du
 * blocage ne parle plus du médiateur (elle écrivait « médiateur absent » même quand il était saisi) ; la décision de
 * vendre aux particuliers sans médiateur a sa propre ligne, qui dit l'état RÉEL du médiateur à cette date, lu dans
 * l'identité enregistrée avec elle.
 */
export function lignesJournalReglage(avant: Record<string, unknown> | null | undefined, apres: Record<string, unknown> | null | undefined): string[] {
  const lignes: string[] = [];
  if (!apres) return lignes;
  if (typeof apres.blocage_souscription_identite === "boolean" && avant?.blocage_souscription_identite !== apres.blocage_souscription_identite) {
    lignes.push(`Blocage des abonnements (identité du vendeur incomplète : augmentations payantes) : ${apres.blocage_souscription_identite ? "réactivé" : "levé"}.`);
  }
  const decision = (etat: Record<string, unknown> | null | undefined) => (typeof etat?.vente_particuliers_sans_mediateur_le === "string" ? etat.vente_particuliers_sans_mediateur_le : null);
  if (decision(avant) !== decision(apres) && Boolean(decision(avant)) !== Boolean(decision(apres))) {
    const valeurs = apres.valeurs && typeof apres.valeurs === "object" ? (apres.valeurs as Record<string, unknown>) : {};
    const faits: Record<string, FaitEditeur> = {};
    for (const [cle, v] of Object.entries(valeurs)) faits[cle] = typeof v === "string" ? v : null;
    const etatMediateur = mediateurDesigne(faits) ? "un médiateur de la consommation était saisi" : "aucun médiateur de la consommation n’était saisi";
    lignes.push(`Vente aux particuliers sans médiateur de la consommation : ${decision(apres) ? "décision prise" : "décision retirée"} (à cette date, ${etatMediateur}).`);
  }
  return lignes;
}

/** Vrai si la valeur est la version en vigueur — égalité stricte, jamais une comparaison d'ordre. */
export function estLaVersionEnVigueur(version: unknown): boolean {
  return version === CONDITIONS_VERSION;
}
