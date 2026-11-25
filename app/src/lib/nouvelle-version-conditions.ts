// UNE NOUVELLE VERSION DES CONDITIONS CLIENTS : L'ÉCRAN ET LA NON-RECONDUCTION (plan de conformité du 23/10/2026,
// lot 1A, constat R19).
//
// 1. L'ÉCRAN « Nos conditions générales évoluent ». Il s'affiche au responsable d'un espace (propriétaire, admin d'agence)
//    dont la DERNIÈRE acceptation des conditions clients porte une autre version que CONDITIONS_VERSION. Un compte qui
//    n'a aucune acceptation enregistrée ne le voit pas (rien à comparer : la souscription exige déjà la version en
//    vigueur, lib/garde-souscription.ts). Le 24/10/2026, chaque acceptation porte la version en vigueur (2026-09-30) :
//    l'écran ne s'affiche pour personne. « Plus tard » le masque jusqu'à la prochaine connexion. Il ne bloque rien.
//
// 2. L'ACCORD EXPRÈS. Pour une version SUBSTANTIELLE (conditions-versions.json), publiée avec la règle de l'accord exprès
//    (article 16 de la V1, vague « textes »), l'abonnement d'un Client qui n'a pas accepté à la date d'effet n'est pas
//    reconduit : la tâche quotidienne des abonnements pose `cancel_at_period_end` chez Stripe
//    (lib/non-reconduction-conditions.ts), pas avant un mois plein après l'archivage de la version (préavis). La période
//    payée court jusqu'à son terme ; rien n'est bloqué entre-temps.
//    Les versions publiées AVANT cette règle (`VERSIONS_SANS_ACCORD_EXPRES`) n'y donnent jamais lieu : leur article 16
//    ne prévoit pas la non-reconduction, et le contrat ne peut pas prendre fin pour une raison qu'il ne nomme pas.
//    À relire par le juriste (source non ouverte le 23/10/2026) : la règle « accord exprès, sinon non-reconduction »
//    vient du plan (R212-1 3°, R212-4, R212-5 du code de la consommation, non relus sur Légifrance). Elle s'applique ici
//    à tout Client, sans chercher s'il est consommateur : la solution la plus protectrice (plan, § 0).

// 3. L'ACCORD AU PROCHAIN ACTE (décision du dirigeant du 24/11/2026, Q15 : « nouvelle version des conditions, accord
//    exprès du client »). Une version déclarée `accord_au_prochain_acte` s'adresse aussi au Client déjà abonné : il
//    voit l'écran (rappel à chaque connexion), donne son accord par une case NON cochée par défaut, à côté du lien vers
//    le texte ; la base garde la date, la version et l'empreinte du texte archivé (`acceptations_cgu`). Tant qu'il n'a
//    pas répondu, RIEN n'est coupé et rien n'est programmé : jamais de non-reconduction pour une telle version. Son
//    accord lui est redemandé au prochain acte qui touche son contrat : changement de formule, de capacité ou de
//    périodicité, reprise après une résiliation (actions/abonnement.ts). C'est l'option la plus prudente : la version du
//    24/11/2026 ne change ni le prix ni la durée, seuls cas pour lesquels son article 16 prévoit la non-reconduction.
//    Question laissée au dirigeant : veut-il, pour une version future qui toucherait le prix ou la durée, la règle 2 ?

import { dateEnLettres, versionDeclaree, type VersionDeclaree } from "@/lib/conditions-versions";
import { CONDITIONS_DATE, CONDITIONS_VERSION } from "@/lib/editeur";
import { dateParis } from "@/lib/heure-paris-calcul";

/**
 * Les versions des conditions clients publiées avant la règle de l'accord exprès. Leur article 16 dit encore que « la
 * poursuite de l'utilisation après cette date vaut acceptation » : aucune non-reconduction ne se fonde sur elles, et
 * l'écran ne l'annonce pas.
 */
export const VERSIONS_SANS_ACCORD_EXPRES: readonly string[] = ["2026-09-30"];

/** La version exige-t-elle l'accord exprès du Client, faute de quoi l'abonnement n'est pas reconduit ? */
export function accordExpresRequis(version: string, declaree: VersionDeclaree | null): boolean {
  return declaree?.nature === "substantielle" && !declaree.nouvelles_souscriptions_uniquement && !declaree.accord_au_prochain_acte && !VERSIONS_SANS_ACCORD_EXPRES.includes(version);
}

/**
 * La version demande-t-elle l'accord exprès du Client déjà abonné par simple rappel, puis à son prochain acte
 * contractuel, SANS non-reconduction (règle 3 de l'en-tête) ? Le drapeau « nouvelles souscriptions uniquement »
 * l'emporte : une telle version ne s'adresse pas aux abonnés.
 */
export function accordAuProchainActe(declaree: VersionDeclaree | null): boolean {
  return declaree?.nature === "substantielle" && declaree.accord_au_prochain_acte === true && !declaree.nouvelles_souscriptions_uniquement;
}

/**
 * « Annuler la résiliation » exige-t-il d'abord l'accord à la version en vigueur ? Oui à partir de la date d'effet
 * (jour de Paris) d'une version qui exige l'accord exprès : sans lui, la tâche quotidienne reposerait la
 * non-reconduction le lendemain, sans un mot (relecture adverse du 24/10, défaut 3). Jamais pour une version publiée
 * avant cette règle (2026-09-30), une version technique ou non déclarée.
 *
 * Décision Q15 du 24/11/2026 : la même question vaut pour tout acte contractuel d'un Client déjà abonné (reprise,
 * changement de formule, de capacité ou de périodicité), et la réponse est oui aussi pour une version qui demande
 * l'accord « au prochain acte ».
 */
export function repriseExigeAccord(params: { version?: string; declaree?: VersionDeclaree | null; aujourdhui: string }): boolean {
  const version = params.version ?? CONDITIONS_VERSION;
  const declaree = params.declaree === undefined ? versionDeclaree("conditions_clients", version) : params.declaree;
  return Boolean(declaree) && (accordExpresRequis(version, declaree) || accordAuProchainActe(declaree)) && params.aujourdhui >= declaree!.date_effet;
}

/** Le refus de la reprise sans accord : la case apparaît sous le bouton, le même geste enregistre l'accord. */
export function messageRepriseSansAccord(dateVersion: string): string {
  return `Pour poursuivre votre abonnement, acceptez la version du ${dateVersion} des conditions générales : cochez la case ci-dessous, puis validez de nouveau. Sans cet accord, votre abonnement n’est pas reconduit.`;
}

/**
 * Le refus d'un acte contractuel sans accord, pour une version « au prochain acte » (Q15) : aucune menace de
 * non-reconduction, puisqu'il n'y en a pas. La case apparaît sous le bouton ; le même geste enregistre l'accord.
 */
export function messageActeSansAccord(dateVersion: string): string {
  return `Cette démarche modifie votre contrat : acceptez d’abord la version du ${dateVersion} des conditions générales. Cochez la case ci-dessous, puis validez de nouveau.`;
}

/** Q15 : l'accord exprès se donne par une case non cochée par défaut ; sans elle, rien n'est enregistré. */
export const REFUS_CASE_NOUVELLE_VERSION = "Cochez la case « J’ai lu et j’accepte » pour donner votre accord à la nouvelle version.";
/** Q15 : l'accord n'est enregistré que sur une version archivée — c'est l'archive qui porte le texte publié et son empreinte. */
export const REFUS_VERSION_NON_ARCHIVEE = "Votre accord ne peut pas être enregistré pour le moment : cette version n’est pas encore archivée. Votre abonnement continue et vos données restent accessibles ; réessayez plus tard.";

/** L'abonnement de l'espace, tel que `mon_abonnement` le rend au responsable ; `null` sans abonnement ou sans lecture. */
export type AbonnementCourant = { souscrit: boolean; periode_fin: string | null; annulation_demandee: boolean } | null;

export type NouvelleVersion = {
  version: string;
  /** « 30 septembre 2026 » : la désignation de la version, celle du chapeau des conditions. */
  dateVersion: string;
  /** La date d'effet, en lettres. */
  dateEffet: string;
  /** Les deux paragraphes de l'écran (textes du plan, § 3, lot 1A). */
  paragraphes: string[];
  accordExpres: boolean;
};

/** Le jour de Paris d'un instant de la base, ou `null`. */
function jourDe(instant: string | null): string | null {
  if (!instant) return null;
  const d = new Date(instant);
  return Number.isNaN(d.getTime()) ? null : dateParis(d);
}

/** « Résumé des changements : … . » sans double point final. */
function sansPointFinal(texte: string): string {
  return texte.trim().replace(/[.\s]+$/u, "");
}

/**
 * Ce que l'écran dit, ou `null` s'il ne s'affiche pas : aucune acceptation enregistrée, dernière acceptation sur la
 * version en vigueur, ou version en vigueur non déclarée (conditions-versions.json, garde de tests/conditions-empreinte).
 */
export function nouvelleVersionAAccepter(params: {
  derniereVersionAcceptee: string | null;
  abonnement?: AbonnementCourant;
  version?: string;
  dateVersion?: string;
  declaree?: VersionDeclaree | null;
}): NouvelleVersion | null {
  const version = params.version ?? CONDITIONS_VERSION;
  const { derniereVersionAcceptee } = params;
  if (derniereVersionAcceptee === null || derniereVersionAcceptee === version) return null;
  const declaree = params.declaree === undefined ? versionDeclaree("conditions_clients", version) : params.declaree;
  if (!declaree || (params.abonnement?.souscrit && declaree.nouvelles_souscriptions_uniquement)) return null;
  const dateEffet = dateEnLettres(declaree.date_effet);
  // Q15 : pour un Client déjà abonné et une version « au prochain acte », l'écran ne dit pas que la version s'applique
  // déjà à lui (son accord est demandé), et il dit ce qui se passe sans réponse : rien n'est coupé.
  if (params.abonnement?.souscrit && accordAuProchainActe(declaree)) {
    return {
      version,
      dateVersion: params.dateVersion ?? CONDITIONS_DATE,
      dateEffet,
      paragraphes: [
        `Une nouvelle version des conditions générales d’utilisation et de vente, datée du ${dateEffet}, est en ligne. ` +
          `Résumé des changements : ${sansPointFinal(declaree.resume_modifications)}.`,
        // Reprise D4 (relecture D4R-02) : l'écran ne dit plus « rien ne change ». L'article 16, second alinéa, fait
        // s'appliquer à la date annoncée les changements autres que le prix, la durée ou les caractéristiques
        // essentielles : l'écran renvoie à l'article, sans trancher ce qui en relève (question au juriste).
        "Votre accord est demandé pour cette nouvelle version. Tant que vous ne l’avez pas donné, votre abonnement continue et vos données restent accessibles ; l’article 16 des conditions générales précise ce qui s’applique à la date annoncée. " +
          "Il vous sera redemandé à votre prochaine démarche sur votre abonnement (changement de formule, de capacité ou de périodicité, reprise après une résiliation).",
      ],
      accordExpres: false,
    };
  }
  const paragraphes = [
    `Une nouvelle version des conditions générales d’utilisation et de vente s’applique à compter du ${dateEffet}. ` +
      `Résumé des changements : ${sansPointFinal(declaree.resume_modifications)}.`,
  ];
  const accordExpres = accordExpresRequis(version, declaree);
  const abonnement = params.abonnement ?? null;
  if (accordExpres && abonnement?.souscrit) {
    // La période qui court à la date d'effet : celle qui finit ce jour-là ou après. Une fin antérieure (abonnement
    // mensuel renouvelé d'ici là) ne la désigne pas : la phrase dit alors « le terme de la période en cours à cette date ».
    const fin = jourDe(abonnement.periode_fin);
    const jusquA = fin && fin >= declaree.date_effet ? `jusqu’au ${dateEnLettres(fin)}` : "jusqu’au terme de la période en cours à cette date";
    paragraphes.push(
      `Sans votre accord à cette date, la version précédente continue de s’appliquer ${jusquA}, puis votre abonnement n’est pas reconduit ; vos données restent consultables et exportables.`
    );
  }
  return { version, dateVersion: params.dateVersion ?? CONDITIONS_DATE, dateEffet, paragraphes, accordExpres };
}

/**
 * Ce que dit la confirmation de l'accord quand l'abonnement est déjà programmé pour ne pas être reconduit (accord donné
 * après la date d'effet, ou résiliation demandée) : l'accord ne relance rien de lui-même, le Client choisit.
 */
export function messageAccordEnregistre(dateVersion: string, abonnement: AbonnementCourant): string {
  const base = `Votre acceptation de la version du ${dateVersion} des conditions générales est enregistrée.`;
  if (!abonnement?.souscrit || !abonnement.annulation_demandee) return base;
  const fin = jourDe(abonnement.periode_fin);
  return `${base} Votre abonnement est programmé pour prendre fin${fin ? ` le ${dateEnLettres(fin)}` : " à sa prochaine échéance"} : vous pouvez le poursuivre depuis « Mon abonnement ».`;
}
