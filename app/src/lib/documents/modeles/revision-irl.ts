// 23 — Révision annuelle du loyer (IRL) : nouveau montant, indices retenus,
// note de calcul. Cible : la révision enregistrée.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Fusion,
  assemblerPage,
  cartouches,
  enTete,
  eur,
  faitA,
  blocSignatureEmetteur,
  formaterDateFr,
  moisEnToutesLettres,
  section,
  tableau,
  titre,
  echapper,
} from "../gabarit";
import { deElide } from "@/lib/elision";
import { aujourdhuiParis } from "@/lib/ged";
import {
  chargerContexteBail,
  expediteur,
  nomsBailleurs,
  nomsLocataires,
  adresseLogement,
  referenceCourte,
  signatureOrganisation,
  liensLocataires,
  libelleCharges,
} from "./communs";
import type { Assemblage } from "./index";

export type DonneesRevisionIrl = {
  reference: string;
  dateEffet: string;
  /** Date anniversaire de rattachement (null : révision antérieure au 29/09). */
  dateEcheance?: string | null;
  /** Date de la demande du bailleur (null : révision antérieure au 29/09). */
  dateDemande?: string | null;
  /** Trimestre de l'indice nouveau (« T2 2026 »). */
  trimestreNouveau?: string | null;
  /**
   * Décision Q43 du 24/11/2026 : premier terme (« AAAA-MM-01 ») appelé au loyer révisé, écrit par `reviser_loyer` sur la
   * révision — le premier dont la période commence après la date de la demande et qui n'était pas déjà appelé.
   * null ou absent : révision enregistrée avant cette décision ; le document garde alors sa rédaction d'avant.
   */
  premierTerme?: string | null;
  /**
   * Reprise du lot D2 : jour (de Paris) où la révision a été enregistrée. Une demande antidatée ne fait pas gagner un
   * terme : la lettre dit alors que le premier terme révisé suit aussi cet enregistrement.
   */
  enregistreLe?: string | null;
  /**
   * Reprise du lot D2 : trimestre de l'indice de référence (« T2 2024 ») quand c'est l'indice du même trimestre de l'année
   * précédente, parce que la révision d'une année n'avait pas été faite (`revisions_loyer.irl_reference_trimestre`).
   * null ou absent : cas normal.
   */
  referenceAnneePrecedente?: string | null;
  /** Fin du bail enregistrée (congé), pour dire qu'aucun terme ne suit. */
  dateFinBail?: string | null;
  ancienLoyer: number;
  nouveauLoyer: number;
  irlReference: number | null;
  irlNouveau: number | null;
  /** D'où vient l'indice de référence (W29) : la révision précédente du bail ou l'indice figé au bail ; absent ou null : non établi. */
  origineReference?: OrigineReference | null;
  trimestre: string | null;
  charges: number | null;
  /** 'provision' | 'forfait' — le libellé des charges suit le bail. */
  chargesMode?: string | null;
  bailleurNom: string;
  locatairesNoms: string;
  logementAdresse: string;
  referenceBail: string;
  exp: ReturnType<typeof expediteur>;
  /** Ce que les appels du bail font de la révision (C54) ; null : ils ne permettent pas de le dire ; absent : non lu. */
  application?: ApplicationRevision | null;
  // Signature préenregistrée de l'émetteur (data-URI) — null : zone vierge
  signatureImg?: string | null;
  f: Fusion;
};

// Phase 3 (C54) : la notification disait « loyer révisé à compter du 15/10/2026 » alors que le terme d'octobre, émis le 1er
// au loyer d'avant, n'était ni modifié ni complété : `reviser_loyer` ne change que le loyer du bail, et seuls les termes émis
// ENSUITE le portent, chacun pour le mois entier (generer_appels_loyer_interne ne coupe pas un mois). Le document dit donc ce
// que font les appels : à partir de quel terme le loyer révisé est appelé, et le sort de la période entre la date d'effet et ce
// terme. Ce n'est pas un choix de calcul tranché ici (rendu au dirigeant) : la notification décrit l'existant.
export type AppelRevision = { periode: string; loyer_hc: number | string | null; base_loyer_hc?: number | string | null };
export type ApplicationRevision = {
  /** Premier terme (« AAAA-MM-01 ») appelé au loyer révisé ; null : aucun, le bail prenant fin avant. */
  premierTerme: string | null;
  /** Termes émis au loyer d'avant depuis le mois de la date d'effet : la période non complétée et leur loyer. */
  nonComplete: { du: string; au: string; loyer: number; termes: string[] } | null;
  /** Le premier terme révisé commence avant la date d'effet : jours facturés au loyer révisé avant l'effet. */
  avantEffet: { du: string; au: string } | null;
  /** Loyer révisé égal à l'ancien, au centime (indice inchangé, ou variation effacée à l'arrondi) : aucun terme ne change. */
  inchange?: true;
};

const centimes = (v: number | string | null | undefined) => Math.round(Number(v ?? NaN) * 100);
const jourIso = (d: Date) => d.toISOString().slice(0, 10);
function moisSuivant(periode: string): string {
  const [a, m] = periode.slice(0, 7).split("-").map(Number);
  return jourIso(new Date(Date.UTC(a, m, 1)));
}
function finDuMois(periode: string): string {
  const [a, m] = periode.slice(0, 7).split("-").map(Number);
  return jourIso(new Date(Date.UTC(a, m, 0)));
}
function veille(jour: string): string {
  const d = new Date(`${jour.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return jourIso(d);
}

/**
 * Lit sur les appels du bail ce qu'il advient de la révision. Le loyer d'un appel est sa base mensuelle (base_loyer_hc, à
 * défaut loyer_hc). Rien n'est déduit si le terme du mois de l'effet n'existe pas, ou si un terme porte un autre loyer que
 * l'ancien et le nouveau (avenant, correction) : `null`, et le document s'en tient à la règle générale.
 */
export function applicationRevision(
  dateEffet: string,
  ancienLoyer: number,
  nouveauLoyer: number,
  appels: AppelRevision[],
  dateFinBail?: string | null
): ApplicationRevision | null {
  // Lot 39 (reprise, C54) : un loyer révisé égal à l'ancien ne permet pas de distinguer un terme révisé d'un terme d'avant ; le
  // terme du mois de l'effet, émis à l'ancien loyer, était pris pour « révisé pour le mois entier, avant la date d'effet ».
  if (centimes(nouveauLoyer) === centimes(ancienLoyer)) return { premierTerme: null, nonComplete: null, avantEffet: null, inchange: true };
  const moisEffet = `${dateEffet.slice(0, 7)}-01`;
  const suivants = appels
    .filter((a) => a.periode.slice(0, 10) >= moisEffet)
    .sort((a, b) => a.periode.localeCompare(b.periode));
  if (suivants[0]?.periode.slice(0, 10) !== moisEffet) return null;
  const anciens: string[] = [];
  let premierTerme: string | null = null;
  for (const a of suivants) {
    const loyer = centimes(a.base_loyer_hc ?? a.loyer_hc);
    if (loyer === centimes(nouveauLoyer)) { premierTerme = a.periode.slice(0, 10); break; }
    if (loyer !== centimes(ancienLoyer)) return null;
    anciens.push(a.periode.slice(0, 10));
  }
  if (!premierTerme) {
    // Le terme suivant n'est pas encore émis : il le sera au loyer du bail, révisé — sauf si le bail finit avant.
    const prochain = moisSuivant(anciens[anciens.length - 1]);
    premierTerme = dateFinBail && dateFinBail.slice(0, 10) < prochain ? null : prochain;
  }
  const dernier = anciens[anciens.length - 1];
  return {
    premierTerme,
    nonComplete: anciens.length
      ? { du: dateEffet.slice(0, 10), au: dateFinBail && dateFinBail.slice(0, 10) < finDuMois(dernier) ? dateFinBail.slice(0, 10) : finDuMois(dernier), loyer: ancienLoyer, termes: anciens }
      : null,
    avantEffet: premierTerme === moisEffet && dateEffet.slice(0, 10) > moisEffet ? { du: moisEffet, au: veille(dateEffet) } : null,
  };
}

/** La phrase qui dit ce que font les appels du bail (C54) ; vide si l'application n'a pas été lue. */
function phraseApplication(application: ApplicationRevision | null | undefined, dateFinBail: string | null | undefined, nouveauLoyer: number): string {
  if (application === undefined) return "";
  if (application === null) {
    return `<p>Le loyer révisé s'applique aux termes appelés après l'enregistrement de la révision ; un terme déjà appelé
      n'est pas modifié.</p>`;
  }
  if (application.inchange) return `<p>Le loyer révisé est égal au loyer avant révision : la révision ne modifie le montant d'aucun terme.</p>`;
  const phrases: string[] = [];
  const { premierTerme, nonComplete, avantEffet } = application;
  if (premierTerme) {
    phrases.push(`Le loyer révisé est appelé à compter du terme ${deElide(moisEnToutesLettres(premierTerme))}${
      avantEffet ? `, pour le mois entier, y compris du ${formaterDateFr(avantEffet.du)} au ${formaterDateFr(avantEffet.au)}, avant la date d'effet` : ""
    }.`);
  } else {
    phrases.push(`Aucun terme n'est appelé au loyer révisé : le bail prend fin le ${dateFinBail ? formaterDateFr(dateFinBail) : "—"}.`);
  }
  if (nonComplete) {
    const premier = moisEnToutesLettres(nonComplete.termes[0]);
    const dernier = moisEnToutesLettres(nonComplete.termes[nonComplete.termes.length - 1]);
    const termes = nonComplete.termes.length === 1
      ? `Le terme ${deElide(premier)}, appelé avant l'enregistrement de cette révision, reste`
      : `Les termes ${deElide(premier)} à ${dernier}, appelés avant l'enregistrement de cette révision, restent`;
    // Lot 39 (reprise, C54) : en cas de baisse, « aucun complément n'est appelé » taisait que le terme resté à l'ancien loyer
    // est plus élevé que le loyer révisé ; le document le dit, et qu'aucune déduction n'est faite sur la période.
    phrases.push(centimes(nouveauLoyer) < centimes(nonComplete.loyer)
      ? `${termes} au loyer de ${eur(nonComplete.loyer)}, supérieur au loyer révisé : aucune déduction n'est appliquée pour la
        période du ${formaterDateFr(nonComplete.du)} au ${formaterDateFr(nonComplete.au)}.`
      : `${termes} au loyer de ${eur(nonComplete.loyer)} : aucun complément n'est appelé pour la période du
      ${formaterDateFr(nonComplete.du)} au ${formaterDateFr(nonComplete.au)}.`);
  }
  return `<p>${phrases.join(" ")}</p>`;
}

/**
 * Décision Q43 du 24/11/2026 — ce que la lettre dit d'une révision enregistrée depuis cette décision : le loyer révisé ne
 * s'applique à aucun jour antérieur à la demande ; il s'applique à partir du premier terme dont la période commence après
 * la demande ; les termes d'avant ne changent pas (ni complément, ni déduction). La rédaction est la même en cas de
 * hausse et en cas de baisse de l'indice. Les dates sont celles de la révision, pas une règle générale.
 */
export function phrasePremierTerme(d: {
  premierTerme: string; dateDemande: string | null | undefined; ancienLoyer: number; nouveauLoyer: number; dateFinBail?: string | null;
  enregistreLe?: string | null;
}): string {
  if (centimes(d.nouveauLoyer) === centimes(d.ancienLoyer)) {
    return `<p>Le loyer révisé est égal au loyer avant révision : la révision ne modifie le montant d'aucun terme.</p>`;
  }
  const premierTerme = d.premierTerme.slice(0, 10);
  const dernierInchange = veille(premierTerme);
  const termePrecedent = deElide(moisEnToutesLettres(dernierInchange));
  // Le premier terme après la demande est le mois suivant ; s'il est plus tardif, c'est que des termes étaient déjà appelés.
  const apresDemande = d.dateDemande ? moisSuivant(d.dateDemande) : null;
  // Reprise du lot D2 : une révision enregistrée un mois plus tard que la date de sa demande (demande antidatée) ne
  // s'applique qu'après son enregistrement. La lettre le dit, avec la date — seulement si le premier terme enregistré
  // suit bien cette règle (une révision enregistrée avant la reprise garde sa phrase).
  const apresEnregistrement = d.enregistreLe ? moisSuivant(d.enregistreLe) : null;
  const antidatee = Boolean(apresDemande && apresEnregistrement && apresEnregistrement > apresDemande && premierTerme >= apresEnregistrement);
  const depart = antidatee ? apresEnregistrement : apresDemande;
  const dejaAppeles = Boolean(depart && depart < premierTerme);
  const inchanges = `Le terme ${termePrecedent} et les termes antérieurs ne sont pas modifiés par cette révision
    (loyer avant révision : ${eur(d.ancienLoyer)}).`;
  if (d.dateFinBail && d.dateFinBail.slice(0, 10) < premierTerme) {
    return `<p>Le loyer révisé ne s'applique à aucun jour antérieur à la demande. Il s'appliquerait à partir du terme
      ${deElide(moisEnToutesLettres(premierTerme))} ; le bail prend fin le ${formaterDateFr(d.dateFinBail)}, avant ce terme : aucun terme
      n'est appelé au loyer révisé. ${inchanges}</p>`;
  }
  return `<p>Le loyer révisé ne s'applique à aucun jour antérieur à la demande. Il s'applique à partir du
    <b>terme ${deElide(moisEnToutesLettres(premierTerme))}</b> (période commençant le ${formaterDateFr(premierTerme)}), premier terme
    dont la période commence après la date de la demande${antidatee ? ` et après l'enregistrement de la révision (${formaterDateFr(d.enregistreLe!)})` : ""}${dejaAppeles ? " et qui n'était pas déjà appelé lorsque la révision a été enregistrée" : ""}.
    ${inchanges}</p>`;
}

// « (inchangé) » s'accorde avec le libellé des charges : une provision est inchangée, un forfait inchangé ; sans mode
// connu (« Provision ou forfait de charges »), le montant l'est (phase 3, C55).
export function chargesInchangees(mode: string | null | undefined): string {
  if (mode === "provision") return "inchangée";
  if (mode === "forfait") return "inchangé";
  return "montant inchangé";
}

// Phase 3, lot 52 (W29) : l'origine de l'indice de référence, telle que reviser_loyer l'a choisie (indice de la dernière
// révision appliquée, sinon celui figé au bail). Le document la dit au lieu d'énoncer la règle.
export type OrigineReference = { revisionDu: string; trimestre: string | null } | { bail: true; trimestre: string | null };
export type RevisionPrecedente = { date_effet: string; irl_nouveau: number | string | null; irl_trimestre: string | null };

/**
 * Retrouve l'indice de référence d'une révision comme reviser_loyer l'a pris : l'indice nouveau de la révision précédente du
 * bail (la plus récente avant la date d'effet), sinon l'indice figé au bail. Rien n'est affirmé si la valeur ainsi retrouvée
 * n'est pas celle enregistrée sur la révision (données antérieures à cette règle) : `null`, et le libellé reste la règle.
 */
export function origineReference(
  dateEffet: string,
  irlReference: number | null,
  precedentes: RevisionPrecedente[],
  bail: { irl_valeur: number | string | null; irl_trimestre: string | null }
): OrigineReference | null {
  if (irlReference === null) return null;
  const memeValeur = (v: number | string | null | undefined) => v !== null && v !== undefined && Number(v) === irlReference;
  const precedente = precedentes
    .filter((r) => r.date_effet.slice(0, 10) < dateEffet.slice(0, 10))
    .sort((a, b) => b.date_effet.localeCompare(a.date_effet))[0];
  if (precedente && Number(precedente.irl_nouveau ?? 0) !== 0) {
    return memeValeur(precedente.irl_nouveau) ? { revisionDu: precedente.date_effet.slice(0, 10), trimestre: precedente.irl_trimestre } : null;
  }
  return memeValeur(bail.irl_valeur) ? { bail: true, trimestre: bail.irl_trimestre } : null;
}

function libelleIndiceReference(o: OrigineReference | null | undefined, anneePrecedente?: string | null): string {
  // Reprise du lot D2 : la révision d'une année n'avait pas été faite, le calcul a pris l'indice de l'année précédente.
  if (anneePrecedente) return `Indice de référence (même trimestre de l'année précédente, ${anneePrecedente})`;
  if (!o) return "Indice de référence (dernière révision, à défaut indice figé au bail)";
  const trimestre = o.trimestre ? `, ${o.trimestre}` : "";
  return "bail" in o
    ? `Indice de référence (indice figé au bail${trimestre})`
    : `Indice de référence (indice de la révision du ${formaterDateFr(o.revisionDu)}${trimestre})`;
}

// Phase 3, lot 52 (W27) : un indice s'écrit avec ses deux décimales, comme il est saisi et publié (100,00 et 101,50) ;
// toLocaleString sans option effaçait les zéros de fin (« 100 », « 101,5 »). Une saisie plus fine n'est pas arrondie.
function indice(n: number | null | undefined): string | null {
  return n === null || n === undefined ? null : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

// Phase 3, lot 52 (W26) : la référence d'article ne se coupe pas en fin de ligne (« article 17- » / « 1 I de la loi »).
const ARTICLE_17_1_I = '<span style="white-space:nowrap">article 17-1&nbsp;I</span>';

export function construireRevisionIrl(d: DonneesRevisionIrl) {
  const f = d.f;
  const variation =
    d.irlReference && d.irlNouveau
      ? (((d.irlNouveau - d.irlReference) / d.irlReference) * 100).toLocaleString("fr-FR", {
          maximumFractionDigits: 2,
        }) + "\u00a0%"
      : null;
  const rapport =
    d.irlReference && d.irlNouveau
      ? `${eur(d.ancienLoyer)} × ${indice(d.irlNouveau)} / ${indice(d.irlReference)}`
      : null;

  // Audit 29/09 (art. 17-1 I, rédaction ALUR) : demandée après la date
  // anniversaire, la révision prend effet à la date de la demande — la lettre
  // ne l'annonce jamais « à compter » d'un anniversaire passé.
  const echeance = d.dateEcheance ?? d.dateEffet;
  // Reprise du lot 52 : le jour de Paris, celui que le document imprime. Avec `new Date().toISOString()`, la date imprimée était
  // bien celle de Paris, mais la comparaison avec la date d'effet se faisait sur le jour UTC : entre minuit et 2 h à Paris, le
  // lendemain de la date d'effet, le courrier imprimait ce lendemain sans dire qu'il était établi après cette date.
  const etabliLe = aujourdhuiParis();
  const tardive = Boolean(d.dateDemande && d.dateEcheance && d.dateDemande > d.dateEcheance);
  // Le premier terme révisé imprimé dans le tableau : celui de la révision (Q43) ; à défaut, celui lu sur les appels (C54).
  // Aucun si le loyer ne change pas ou si le bail prend fin avant.
  const premierTermeAppele = d.premierTerme
    ? (centimes(d.nouveauLoyer) === centimes(d.ancienLoyer) || (d.dateFinBail && d.dateFinBail.slice(0, 10) < d.premierTerme.slice(0, 10)) ? null : d.premierTerme)
    : d.application?.premierTerme ?? null;
  // Reprise du lot D2 : une lettre établie alors que le premier terme révisé a déjà commencé le dit, avec les dates réelles.
  const apresPremierTerme = Boolean(d.premierTerme && premierTermeAppele && etabliLe.slice(0, 10) >= premierTermeAppele.slice(0, 10));
  // Décision Q43 du 24/11/2026 : pour une révision qui porte son premier terme, la lettre ne parle plus d'une « date
  // d'effet » en cours de mois ; elle dit la date de révision, la date de la demande et le premier terme révisé.
  const phraseEffet = d.premierTerme
    ? `<p>La révision se rattache à la date de révision annuelle du ${f.date(echeance)}. Le bailleur l'a demandée le
       <b>${f.date(d.dateDemande)}</b>${tardive ? ", après cette date" : ""}.${
        d.dateDemande && d.dateDemande.slice(0, 10) < etabliLe.slice(0, 10)
          ? ` Le présent courrier est établi le ${f.date(etabliLe)}${apresPremierTerme ? `, après le début du premier terme appelé au loyer révisé (période commençant le ${f.date(premierTermeAppele)})` : ""}.`
          : ""
      }</p>`
    : tardive
    ? `<p>La révision se rattache à l'échéance annuelle du ${f.date(echeance)}. Demandée le
       ${f.date(d.dateDemande)}, après cette date anniversaire, elle prend effet à la date de la
       demande, soit le <b>${f.date(d.dateEffet)}</b>, sans effet rétroactif (${ARTICLE_17_1_I} de la
       loi du 6 juillet 1989).</p>`
    : // Phase 3, lot 52 (W25) : la date de la demande enregistrée est dite aussi quand la révision est demandée à l'échéance
      // (ou avant) : un courrier établi après la date d'effet ne la disait pas, et le seul acte daté semblait être ce courrier,
      // à rebours des mentions (« demandée après, elle prend effet à la date de la demande »). Sans date de demande enregistrée
      // (révision antérieure au 29/09), le document le dit quand la date d'effet précède sa propre date, sans rien supposer.
      `<p>${d.dateDemande ? `La révision a été demandée le ${f.date(d.dateDemande)}. Elle` : "La révision"} prend effet à la date anniversaire du bail, le <b>${f.date(d.dateEffet)}</b>.${
        !d.dateDemande && d.dateEffet.slice(0, 10) < etabliLe.slice(0, 10) ? " La date de la demande de révision n'est pas enregistrée dans le dossier." : ""
      }${
        d.dateEffet.slice(0, 10) < etabliLe.slice(0, 10) ? ` Le présent courrier est établi le ${f.date(etabliLe)}, après cette date d'effet.` : ""
      }</p>`;

  // Décision Q43 : les mentions d'une révision d'après le 24/11 disent ce que fait Gerimmo (premier terme après la demande)
  // et le délai d'un an ; elles ne reprennent pas la formule d'un article non lu.
  // Reprise du lot D2 : le renvoi à la fiche Service-Public est retiré de ce courrier adressé au locataire (il reste dans le
  // message de refus et dans l'aide du formulaire, lus par le gérant).
  const mentions = d.premierTerme
    ? `<p>La révision ne peut excéder la variation de l'IRL, apprécié sur le même trimestre que
      l'indice de référence. Le loyer révisé ne s'applique jamais à des jours antérieurs à la demande du bailleur : il
      s'applique au premier terme dont la période commence après la date de cette demande, et un terme déjà appelé n'est
      pas modifié. La révision d'une année peut être demandée pendant un an à compter de la date de révision ; passé ce
      délai, elle n'est plus possible pour cette année-là.</p>`
    : `<p>La révision ne peut excéder la variation de l'IRL, apprécié sur le même trimestre que
      l'indice de référence. Elle prend effet à la date convenue au bail si elle est demandée à
      cette date ; demandée après, elle prend effet à la date de la demande, sans rétroactivité.
      Le bailleur dispose d'un an à compter de la date anniversaire pour en faire la demande —
      passé ce délai, il est réputé y avoir renoncé pour l'année écoulée (${ARTICLE_17_1_I} de la loi
      du 6 juillet 1989, rédaction issue de la loi n° 2014-366 du 24 mars 2014).</p>`;

  const corps = `
    ${enTete(f, d.exp, { libelle: "Contrat", reference: d.referenceBail, etabliLe })}
    ${titre("Révision du loyer", `Échéance annuelle du ${f.date(echeance)}`, [
      "Article 17-1 de la loi n° 89-462 du 6 juillet 1989 — indice de référence des loyers (IRL)",
    ])}
    ${cartouches([
      ["Bailleur", `<div>${d.bailleurNom}</div>`],
      ["Locataire", `<div>${d.locatairesNoms}</div>`],
      ["Logement loué", `<div>${f.champ(d.logementAdresse, "adresse complète, étage, porte")}</div>`],
      ["Bail", `Réf. ${f.champ(d.referenceBail, "référence du bail")}`],
    ])}
    <p>Conformément à la clause de révision du bail, le loyer est révisé chaque année selon la
    variation de l'indice de référence des loyers publié par l'INSEE.</p>
    ${phraseEffet}
    ${d.premierTerme
      ? phrasePremierTerme({ premierTerme: d.premierTerme, dateDemande: d.dateDemande, ancienLoyer: d.ancienLoyer, nouveauLoyer: d.nouveauLoyer, dateFinBail: d.dateFinBail, enregistreLe: d.enregistreLe })
      : phraseApplication(d.application, d.dateFinBail, d.nouveauLoyer)}
    ${/* Reprise du lot D2 : dit de façon neutre, avec les deux indices réellement utilisés (tableau « Indices retenus »). */
      d.referenceAnneePrecedente
        ? `<p>La révision annuelle de l'année précédente n'a pas été appliquée ; elle n'est pas rattrapée. Le calcul porte sur une
          seule année : de l'indice du ${echapper(d.referenceAnneePrecedente)} (même trimestre, année précédente) à l'indice du
          ${echapper(d.trimestreNouveau ?? "trimestre de la révision")}.</p>`
        : ""}
    ${section("Nouveau montant")}
    ${tableau(
      [{ libelle: "Nature" }, { libelle: "Montant", droite: true }],
      [
        ["Loyer hors charges avant révision", f.montant(d.ancienLoyer)],
        [`<b>Loyer hors charges révisé${premierTermeAppele ? `, appelé à compter du terme ${deElide(moisEnToutesLettres(premierTermeAppele))}` : ""}</b>`, `<b>${f.montant(d.nouveauLoyer)}</b>`],
        [`${libelleCharges(d.chargesMode)} (${chargesInchangees(d.chargesMode)})`, f.montant(d.charges, "montant inchangé")],
      ]
    )}
    ${/* Phase 3, lot 52 (W28) : le titre et ce tableau de cinq lignes restent ensemble (comme les compteurs d'un état des lieux,
         lot 51) : coupé, il séparait les deux indices du calcul entre deux pages. */ ""}<div style="break-inside:avoid-page;page-break-inside:avoid">
    ${section("Indices retenus")}
    ${tableau(
      [{ libelle: "Référence" }, { libelle: "Valeur", droite: true }],
      [
        ["Trimestre de référence du bail", f.champ(d.trimestre, "ex. 2e trimestre")],
        ["Trimestre du nouvel indice (même trimestre que la référence)", f.champ(d.trimestreNouveau, "ex. T2 2026")],
        ["Nouvel indice retenu", f.champ(indice(d.irlNouveau), "indice du trimestre de révision")],
        [
          echapper(libelleIndiceReference(d.origineReference, d.referenceAnneePrecedente)),
          f.champ(indice(d.irlReference), "indice de référence"),
        ],
        ["Variation", f.champ(variation, "en pourcentage")],
      ]
    )}
    </div>
    ${section("Note de calcul")}
    <p>${f.champ(rapport, "rapport des indices")} = ${f.montant(d.nouveauLoyer, "montant avant arrondi")}
    (arrondi au centime le plus proche).</p>
    ${section("Mentions")}
    <div class="mentions">
      ${mentions}
    </div>
    ${faitA(f, d.exp.ville, etabliLe)}
    ${blocSignatureEmetteur(d.exp.nom, d.signatureImg ?? null)}
  `;
  return assemblerPage({
    f,
    titreDocument: "Révision du loyer",
    nomPied: "Révision du loyer (IRL)",
    reference: d.reference,
    corps,
  });
}

export async function assemblerRevisionIrl(
  supabase: SupabaseClient,
  orgId: string,
  revisionId: string
): Promise<Assemblage> {
  const { data: r } = await supabase
    .from("revisions_loyer")
    .select("id, bail_id, date_effet, date_echeance, date_demande, premier_terme, irl_trimestre, ancien_loyer, nouveau_loyer, irl_reference, irl_nouveau, irl_reference_trimestre, created_at")
    .eq("id", revisionId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!r) return { erreur: "Révision introuvable." };

  const ctx = await chargerContexteBail(supabase, orgId, r.bail_id);
  if ("erreur" in ctx) return ctx;

  // C54 : les termes émis depuis le mois de la date d'effet disent à partir de quand le loyer révisé est appelé.
  const { data: appels, error: erreurAppels } = await supabase
    .from("appels_loyer")
    .select("periode, loyer_hc, base_loyer_hc")
    .eq("bail_id", r.bail_id)
    .eq("organization_id", orgId)
    .gte("periode", `${String(r.date_effet).slice(0, 7)}-01`)
    .order("periode")
    .limit(36);
  if (erreurAppels) return { erreur: "Les appels de loyer du bail n’ont pas pu être lus. Réessayez avant de générer ce document." };

  // Lot 52 (W29) : les révisions du bail, pour dire d'où vient l'indice de référence. Lecture ratée : le libellé reste la règle.
  const { data: precedentes, error: erreurPrecedentes } = await supabase
    .from("revisions_loyer")
    .select("date_effet, irl_nouveau, irl_trimestre")
    .eq("bail_id", r.bail_id)
    .eq("organization_id", orgId)
    .lt("date_effet", r.date_effet)
    .order("date_effet", { ascending: false })
    .limit(12);
  const irlReference = r.irl_reference === null ? null : Number(r.irl_reference);

  const f = new Fusion();
  const document = construireRevisionIrl({
    reference: referenceCourte("IRL", r.id),
    dateEffet: r.date_effet,
    dateEcheance: r.date_echeance,
    dateDemande: r.date_demande,
    premierTerme: r.premier_terme,
    // Le jour de Paris de l'enregistrement, comme la base l'a lu (`aujourdhui_paris()`).
    enregistreLe: r.created_at ? new Date(r.created_at).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }) : null,
    referenceAnneePrecedente: r.irl_reference_trimestre,
    trimestreNouveau: r.irl_trimestre,
    dateFinBail: ctx.bail.date_fin,
    application: applicationRevision(r.date_effet, Number(r.ancien_loyer), Number(r.nouveau_loyer), (appels ?? []) as AppelRevision[], ctx.bail.date_fin),
    ancienLoyer: Number(r.ancien_loyer),
    nouveauLoyer: Number(r.nouveau_loyer),
    irlReference,
    origineReference: erreurPrecedentes ? null : origineReference(r.date_effet, irlReference, (precedentes ?? []) as RevisionPrecedente[], ctx.bail),
    irlNouveau: r.irl_nouveau === null ? null : Number(r.irl_nouveau),
    trimestre: ctx.bail.irl_trimestre,
    charges: ctx.bail.charges === null ? null : Number(ctx.bail.charges),
    chargesMode: ctx.bail.charges_mode,
    bailleurNom: nomsBailleurs(f, ctx.bailleurs),
    locatairesNoms: nomsLocataires(f, ctx.locataires),
    logementAdresse: adresseLogement(ctx.lot, ctx.bien),
    referenceBail: referenceCourte("BAIL", ctx.bail.id),
    exp: expediteur(ctx),
    signatureImg: await signatureOrganisation(supabase, orgId),
    f,
  });

  return {
    document,
    // Phase 3 (C64) : le titre de classement porte la date au format français, comme le document.
    // Décision Q43 : une révision qui porte son premier terme se classe à la date où le loyer révisé s'applique.
    titreGed: r.premier_terme
      ? `Révision IRL — loyer appliqué à partir du ${formaterDateFr(r.premier_terme)}`
      : `Révision IRL — effet au ${formaterDateFr(r.date_effet)}`,
    nomFichier: `revision-irl-${r.date_effet}`,
    liens: [
      { entite: "bail", entiteId: r.bail_id },
      ...liensLocataires(ctx),
    ],
  };
}
