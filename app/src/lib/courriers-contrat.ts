// LES COURRIERS DU CONTRAT (plan de conformité du 23/10/2026, lot 1B) : ce qu'ils disent, mot pour mot.
//
//  · R03 — la confirmation de la souscription sur support durable (une fois par souscription) ;
//  · R04 — l'accusé de la résiliation (un seul, que la résiliation vienne de la page ou du webhook) ;
//  · R01, R37 — l'accusé de la rétractation d'un abonnement (quatre variantes) ou d'un passage à l'annuel ;
//  · R05 — la phrase du médiateur, à la confirmation et à la clôture d'une réclamation.
//
// Décision du dirigeant du 23/10 (médiateur non bloquant) : rien n'attend le médiateur. Ses coordonnées s'affichent si
// elles sont saisies ; sinon la phrase dit exactement « Médiateur de la consommation : adhésion en cours ; ses
// coordonnées figureront dans les mentions légales dès qu'elle sera effective. »
//
// Numéros d'articles : seuls ceux qui existent DÉJÀ avec ce sens dans la version en vigueur des conditions
// (2026-09-30) seraient cités ; les numéros de la future version (8.10, 15.4) ne le sont pas : « les conditions
// générales ». Le formulaire de rétractation reproduit est celui de la version en vigueur, acceptée par le client.
//
// Module pur (gabarits) : tests/courriers-contrat.test.ts. Les envois vivent dans lib/courriers-contrat-envoi.ts.

import { dernierJourRetractation, jourEnLettres } from "@/lib/delai-retractation";
import { dateParis } from "@/lib/heure-paris-calcul";
import { echapperMarque } from "@/lib/marque-organisation";
import { euros, formuleParCode, type Periodicite, type RegimeTva } from "@/lib/tarifs";

export type Courrier = { sujet: string; html: string };
type Faits = Record<string, string | null | undefined>;

/** La phrase exacte du médiateur tant que l'adhésion n'est pas saisie (décision du dirigeant du 23/10). */
export const PHRASE_MEDIATEUR_EN_COURS =
  "Médiateur de la consommation : adhésion en cours ; ses coordonnées figureront dans les mentions légales dès qu'elle sera effective.";

/** « Nom, adresse, site » du médiateur, s'il est saisi (le nom désigne l'organisme, comme sur les pages légales). */
export function coordonneesMediateur(editeur: Faits): string | null {
  const nom = editeur.mediateurNom?.trim();
  if (!nom) return null;
  return [nom, editeur.mediateurAdresse?.trim(), editeur.mediateurSite?.trim()].filter(Boolean).join(", ");
}

/** R03 : le paragraphe de médiation de la confirmation. */
export function phraseMediationConfirmation(editeur: Faits): string {
  const c = coordonneesMediateur(editeur);
  return c
    ? `Médiation : en cas de litige non résolu après une réclamation écrite, vous pouvez saisir gratuitement le médiateur de la consommation : ${c}.`
    : PHRASE_MEDIATEUR_EN_COURS;
}

/** R05 : la phrase ajoutée à la réponse qui clôt une réclamation. */
export function phraseMediateurReclamation(editeur: Faits): string {
  const c = coordonneesMediateur(editeur);
  return c
    ? `Si cette réponse ne vous satisfait pas, vous pouvez saisir gratuitement le médiateur de la consommation : ${c}.`
    : PHRASE_MEDIATEUR_EN_COURS;
}

/** « Prénom Nom EI — adresse — contact — téléphone », sans les faits non saisis. */
export function identiteEditeurEnLigne(editeur: Faits): string {
  return [editeur.denomination, editeur.siege, editeur.email, editeur.telephone].map((v) => v?.trim()).filter(Boolean).join(" — ");
}

/**
 * Le formulaire de rétractation des conditions générales en vigueur (version du 30/09/2026), mot pour mot, avec
 * l'identité de l'éditeur. Les faits non saisis restent signalés comme tels, jamais remplacés.
 */
export function formulaireRetractation(editeur: Faits): string[] {
  const fait = (v: string | null | undefined, quoi: string) => v?.trim() || `[${quoi} à compléter]`;
  return [
    "(Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du contrat.)",
    `À l'attention de ${fait(editeur.denomination, "dénomination de l'éditeur")}, ${fait(editeur.siege, "adresse du siège")}, ${fait(editeur.email, "adresse de contact")} :`,
    "Je vous notifie par la présente ma rétractation du contrat portant sur la prestation de services ci-dessous : abonnement Gerimmo (formule et organisation concernées).",
    "Souscrit le :",
    "Nom du consommateur :",
    "Adresse du consommateur :",
    "Signature du consommateur (uniquement en cas de notification sur papier) :",
    "Date :",
  ];
}

function jourLong(instant: Date | string): string {
  return jourEnLettres(dateParis(typeof instant === "string" ? new Date(instant) : instant));
}

/** « 14 h 05 » à l'heure de Paris. */
export function heureParis(instant: Date): string {
  const [h, m] = instant.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).split(":");
  return `${Number(h)} h ${m}`;
}

/** Quatorze jours après un instant, en toutes lettres (jour de Paris) : l'échéance du remboursement. */
export function quatorzeJoursApres(instant: Date): string {
  const [a, m, j] = dateParis(instant).split("-").map(Number);
  return jourEnLettres(new Date(Date.UTC(a, m - 1, j + 14)).toISOString().slice(0, 10));
}

/** « formule Solo » ; « formule Patrimoine » ; l'offre agence par son nom. */
export function libelleFormule(code: string | null | undefined, estAgence = false): string {
  if (estAgence) return "abonnement agence";
  const f = formuleParCode(code);
  return f ? `formule ${f.nom}` : "abonnement";
}

function enveloppe(titre: string, salutation: string, corps: string, organisation: string): string {
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#111;line-height:1.5">
      <h2 style="font-size:17px">${echapperMarque(titre)}</h2>
      <p>${echapperMarque(salutation)}</p>
      ${corps}
      <p style="color:#555">— Gerimmo, pour ${echapperMarque(organisation)}</p>
    </div>`;
}

const p = (texte: string) => `<p>${echapperMarque(texte)}</p>`;

// ── R03 : la confirmation de la souscription ──────────────────────────────────────────────────────────────────

export type Confirmation = {
  nom: string | null;
  organisation: string;
  estAgence: boolean;
  souscritLe: Date;
  formule: string | null;
  biens: number | null;
  periodicite: Periodicite;
  montantCents: number;
  regime: RegimeTva | null;
  premierPrelevementLe: Date;
  editeur: Faits;
  /** La version acceptée : date de version (« 2026-09-30 ») et instant d'acceptation ; null si introuvable. */
  conditions: { version: string; accepteeLe: Date } | null;
  /** Vrai si le PDF de cette version est joint ; sinon `lienConditions` est donné à sa place. */
  pdfJoint: boolean;
  lienConditions: string | null;
};

function mentionTaxes(regime: RegimeTva | null, estAgence: boolean): string {
  if (!regime) return "";
  if (regime.nature === "franchise") return ", TVA non applicable, art. 293 B du CGI";
  return estAgence ? `, hors taxes, TVA de ${regime.tauxPourcent} % en sus` : `, TVA de ${regime.tauxPourcent} % incluse`;
}

export function courrierConfirmationSouscription(c: Confirmation): Courrier {
  const sujet = "Confirmation de votre abonnement Gerimmo";
  const unite = c.estAgence ? "lot sous mandat" : "bien";
  const jusqua = c.biens ? `, jusqu'à ${c.biens} ${unite}${c.biens > 1 ? "s" : ""}` : "";
  const duree =
    c.periodicite === "annuel"
      ? "douze mois, reconduits tacitement ; nous vous écrirons entre trois mois et un mois avant chaque échéance"
      : "abonnement à durée indéterminée, facturé chaque mois, résiliable à tout moment pour la prochaine échéance";
  const limite = jourEnLettres(dernierJourRetractation(c.souscritLe));
  const conditions = c.conditions
    ? c.pdfJoint
      ? `Vos conditions générales (version du ${jourEnLettres(c.conditions.version)}), acceptées le ${jourLong(c.conditions.accepteeLe)}, sont jointes au format PDF.`
      : `Vos conditions générales (version du ${jourEnLettres(c.conditions.version)}), acceptées le ${jourLong(c.conditions.accepteeLe)}, sont consultables en ligne${c.lienConditions ? ` : ${c.lienConditions}` : "."}`
    : `Les conditions générales d'utilisation et de vente sont consultables en ligne${c.lienConditions ? ` : ${c.lienConditions}` : "."}`;
  const corps = [
    p(`Nous confirmons votre abonnement Gerimmo, souscrit le ${jourLong(c.souscritLe)} pour l'espace ${c.organisation}.`),
    p(`Formule : ${libelleFormule(c.formule, c.estAgence).replace(/^formule /, "")}${jusqua}.`),
    p(`Prix : ${euros(c.montantCents)} ${c.periodicite === "annuel" ? "par an" : "par mois"}${mentionTaxes(c.regime, c.estAgence)}.`),
    p("Paiement : carte bancaire."),
    p(`Premier prélèvement : ${jourLong(c.premierPrelevementLe)}.`),
    p(`Durée : ${duree}.`),
    p(
      `Droit de rétractation : vous pouvez renoncer à cet abonnement, sans motif, jusqu'au ${limite} inclus, avec le bouton « Renoncer au contrat ici » de la page « Mon abonnement » ou avec le formulaire ci-dessous ; vous serez remboursé intégralement sous 14 jours, sur la carte utilisée.`
    ),
    p(phraseMediationConfirmation(c.editeur)),
    p(conditions),
    `<div style="border:1px solid #c9ced6;border-radius:6px;padding:12px 14px;margin:18px 0">
      <p style="margin-top:0"><strong>Formulaire de rétractation</strong></p>
      ${formulaireRetractation(c.editeur).map(p).join("\n      ")}
    </div>`,
    `<p style="color:#555">${echapperMarque(identiteEditeurEnLigne(c.editeur))}</p>`,
  ].join("\n      ");
  return { sujet, html: enveloppe(sujet, c.nom ? `Bonjour ${c.nom},` : "Bonjour,", corps, c.organisation) };
}

// ── R04 : l'accusé de la résiliation ──────────────────────────────────────────────────────────────────────────

export function courrierAccuseResiliation(r: {
  organisation: string;
  formule: string | null;
  estAgence: boolean;
  notifieeLe: Date;
  periodeFin: Date | string;
}): Courrier {
  const sujet = "Votre résiliation Gerimmo est enregistrée";
  const fin = jourLong(r.periodeFin);
  const corps = [
    p(
      `Nous avons bien reçu, le ${jourLong(r.notifieeLe)} à ${heureParis(r.notifieeLe)} (heure de Paris), la résiliation de votre abonnement Gerimmo (${libelleFormule(r.formule, r.estAgence)}, espace ${r.organisation}).`
    ),
    p(`Votre contrat prend fin le ${fin}. D'ici là, votre accès payé reste entier et aucun nouveau prélèvement n'aura lieu.`),
    p("Ensuite, votre compte passe en lecture seule ; rien n'est supprimé du seul fait de la résiliation."),
    p(`Vous pouvez annuler cette résiliation depuis « Mon abonnement » jusqu'au ${fin}.`),
  ].join("\n      ");
  return { sujet, html: enveloppe(sujet, "Bonjour,", corps, r.organisation) };
}

// ── R01, R37 : la rétractation ────────────────────────────────────────────────────────────────────────────────

export type NatureRetractation = "abonnement" | "passage_annuel";

/** La déclaration, telle que le client la signe à l'écran et que l'accusé la reprend. */
export function declarationRetractation(d: {
  nature: NatureRetractation;
  formule: string | null;
  estAgence: boolean;
  organisation: string;
  /** Souscription (abonnement) ou demande de passage (passage à l'annuel). */
  reference: Date;
  nom: string;
}): string {
  return d.nature === "abonnement"
    ? `Je renonce à mon abonnement Gerimmo, ${libelleFormule(d.formule, d.estAgence)}, souscrit le ${jourLong(d.reference)} pour l'espace ${d.organisation}. Nom : ${d.nom}.`
    : `Je renonce au passage de mon abonnement Gerimmo à la formule annuelle, demandé le ${jourLong(d.reference)}, pour l'espace ${d.organisation}. Nom : ${d.nom}.`;
}

export type AccuseRetractation = {
  nature: NatureRetractation;
  organisation: string;
  declaration: string;
  declareeLe: Date;
  montantRembourseCents: number;
  /** Abonnement : fin de l'essai si l'essai court encore (AAAA-MM-JJ), sinon null. */
  essaiFin: string | null;
  /** Passage à l'annuel : l'abonnement était-il déjà passé à l'annuel (échéance annuelle prélevée) ? */
  passageEffectue?: boolean;
  /**
   * Passage à l'annuel effectué : le prix mensuel qui reprend. Le retour au mensuel ouvre un nouveau cycle ce jour-là,
   * et Stripe prélève aussitôt la première mensualité (relecture adverse du 24/10, M7) : l'accusé le dit.
   */
  mensualiteCents?: number | null;
};

export function courrierAccuseRetractation(a: AccuseRetractation): Courrier {
  const sujet = "Accusé de réception de votre rétractation";
  const recu = `Nous avons bien reçu, le ${jourLong(a.declareeLe)} à ${heureParis(a.declareeLe)} (heure de Paris), votre déclaration : « ${a.declaration} »`;
  const remboursement = `Nous vous remboursons ${euros(a.montantRembourseCents)} au plus tard le ${quatorzeJoursApres(a.declareeLe)}, sur la carte utilisée, sans frais.`;
  const lignes: string[] = [recu];
  if (a.nature === "abonnement") {
    lignes.push("Votre abonnement a pris fin à cette date.");
    lignes.push(a.montantRembourseCents > 0 ? remboursement : "Aucun prélèvement n'a eu lieu ; rien ne vous sera prélevé.");
    lignes.push(
      a.essaiFin
        ? `Votre essai gratuit continue jusqu'au ${jourEnLettres(a.essaiFin)} inclus.`
        : "Votre compte passe en lecture seule ; vos données restent consultables et exportables ; rien n'est supprimé."
    );
  } else if (a.passageEffectue) {
    lignes.push("Votre abonnement redevient mensuel à compter de ce jour.");
    lignes.push(
      a.mensualiteCents
        ? `Une première mensualité de ${euros(a.mensualiteCents)} est prélevée ce jour, puis chaque mois à la même date.`
        : "Une première mensualité, au prix mensuel de votre formule, est prélevée ce jour, puis chaque mois à la même date."
    );
    lignes.push(a.montantRembourseCents > 0 ? remboursement : "Aucun prélèvement annuel n'a eu lieu ; rien ne vous sera prélevé à ce titre.");
  } else {
    lignes.push("Votre abonnement reste mensuel : le passage à la formule annuelle n'aura pas lieu.");
    lignes.push("Aucun prélèvement annuel n'a eu lieu ; rien ne vous sera prélevé à ce titre.");
  }
  return { sujet, html: enveloppe(sujet, "Bonjour,", lignes.map(p).join("\n      "), a.organisation) };
}
