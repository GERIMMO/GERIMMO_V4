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
  return declaree?.nature === "substantielle" && !VERSIONS_SANS_ACCORD_EXPRES.includes(version);
}

/**
 * « Annuler la résiliation » exige-t-il d'abord l'accord à la version en vigueur ? Oui à partir de la date d'effet
 * (jour de Paris) d'une version qui exige l'accord exprès : sans lui, la tâche quotidienne reposerait la
 * non-reconduction le lendemain, sans un mot (relecture adverse du 24/10, défaut 3). Jamais pour une version publiée
 * avant cette règle (2026-09-30), une version technique ou non déclarée.
 */
export function repriseExigeAccord(params: { version?: string; declaree?: VersionDeclaree | null; aujourdhui: string }): boolean {
  const version = params.version ?? CONDITIONS_VERSION;
  const declaree = params.declaree === undefined ? versionDeclaree("conditions_clients", version) : params.declaree;
  return Boolean(declaree) && accordExpresRequis(version, declaree) && params.aujourdhui >= declaree!.date_effet;
}

/** Le refus de la reprise sans accord : la case apparaît sous le bouton, le même geste enregistre l'accord. */
export function messageRepriseSansAccord(dateVersion: string): string {
  return `Pour poursuivre votre abonnement, acceptez la version du ${dateVersion} des conditions générales : cochez la case ci-dessous, puis validez de nouveau. Sans cet accord, votre abonnement n’est pas reconduit.`;
}

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
  if (!declaree) return null;
  const dateEffet = dateEnLettres(declaree.date_effet);
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
