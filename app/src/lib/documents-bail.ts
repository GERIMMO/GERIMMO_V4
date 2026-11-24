import { TYPES_DIAGNOSTIC } from "@/lib/parc";

export function expirationDiagnostic(type: string, realisation: string): string {
  const mois = TYPES_DIAGNOSTIC[type]?.validite_mois;
  if (mois == null || !dateValide(realisation)) return "";
  return echeanceReglementaire(type, realisation, dateApresMois(realisation, mois)) ?? "";
}

// Constat de risque d'exposition au plomb (CREP) qui relève du plomb au-dessus du seuil : il doit dater de moins de
// six ans à la signature du bail (art. L. 1334-7 et R. 1334-11 du code de la santé publique) ; sans plomb au-dessus
// du seuil, il n'a pas de limite de validité (DOC-07).
export const VALIDITE_CREP_POSITIF_MOIS = 72;
export function expirationCrepPositif(realisation: string): string {
  return dateValide(realisation) ? dateApresMois(realisation, VALIDITE_CREP_POSITIF_MOIS) : "";
}

function dateApresMois(realisation: string, mois: number): string {
  const [annee, moisDepart, jour] = realisation.split("-").map(Number);
  const fin = new Date(Date.UTC(annee, moisDepart - 1 + mois, 1));
  const dernier = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth() + 1, 0)).getUTCDate();
  fin.setUTCDate(Math.min(jour, dernier));
  return fin.toISOString().slice(0, 10);
}

// Décret n° 2020-1610 du 17/12/2020, art. 1 (art. D. 134-4-2 du CCH) : un DPE vaut dix ans, sauf ceux réalisés
// avant le 1er juillet 2021 — du 01/01/2013 au 31/12/2017 : valables jusqu'au 31/12/2022 ; du 01/01/2018 au
// 30/06/2021 : jusqu'au 31/12/2024. Le rapport de l'époque imprimait « dix ans » : cette échéance-là ne vaut plus.
// Même règle en base : public.echeance_reglementaire_diagnostic (blocage de mise en location, alertes).
export function plafondDpe(realisation: string | null | undefined): string | null {
  if (!realisation || !dateValide(realisation)) return null;
  if (realisation >= "2013-01-01" && realisation <= "2017-12-31") return "2022-12-31";
  if (realisation >= "2018-01-01" && realisation <= "2021-06-30") return "2024-12-31";
  return null;
}

// L'échéance qui fait foi : celle saisie, ramenée au plafond réglementaire quand il y en a un. Lecture seulement :
// l'échéance enregistrée n'est pas réécrite, elle est plafonnée partout où on la lit.
export function echeanceReglementaire(type: string, realisation: string | null | undefined, expiration: string | null): string | null {
  const plafond = type === "dpe" ? plafondDpe(realisation) : null;
  if (!plafond) return expiration;
  return expiration && expiration < plafond ? expiration : plafond;
}

export function avecEcheanceReglementaire<T extends { type: string; date_realisation: string | null; date_expiration: string | null }>(lignes: T[]): T[] {
  return lignes.map((d) => {
    const echeance = echeanceReglementaire(d.type, d.date_realisation, d.date_expiration);
    return echeance === d.date_expiration ? d : { ...d, date_expiration: echeance };
  });
}

// Refus d'une échéance de DPE postérieure au plafond réglementaire (le formulaire la pré-remplit déjà plafonnée).
export function erreurEcheanceDpe(type: string, realisation: string, expiration: string): string | undefined {
  const plafond = type === "dpe" ? plafondDpe(realisation) : null;
  if (!plafond || !expiration || expiration <= plafond) return undefined;
  const periode = plafond === "2022-12-31"
    ? "entre le 1er janvier 2013 et le 31 décembre 2017"
    : "entre le 1er janvier 2018 et le 30 juin 2021";
  return `Un DPE réalisé ${periode} n’est valable que jusqu’au ${plafond.split("-").reverse().join("/")} (décret n° 2020-1610), même si le rapport indique une date plus lointaine. Corrigez l’échéance.`;
}

function dateValide(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}

export function erreurDiagnosticBail(form: FormData, aujourd: string): string | undefined {
  const type = String(form.get("type") ?? ""), realisation = String(form.get("date_realisation") ?? ""), expiration = String(form.get("date_expiration") ?? "");
  if (!TYPES_DIAGNOSTIC[type]) return "Choisissez le type de diagnostic.";
  if (!dateValide(realisation) || realisation > aujourd) return "Recopiez une date de réalisation valide, non future, figurant sur le rapport.";
  if (expiration && (!dateValide(expiration) || expiration <= realisation)) return "La date d’expiration doit être valide et postérieure à la réalisation.";
  if (TYPES_DIAGNOSTIC[type].validite_mois != null && !expiration) return "Renseignez la date d’expiration indiquée sur le rapport.";
  if (type === "dpe" && !/^[A-G]$/.test(String(form.get("classe_dpe") ?? ""))) return "Renseignez la classe A à G du DPE.";
}

export type DiagnosticBail = {
  id: string; type: string; date_realisation: string; date_expiration: string | null;
  document_id: string | null; classe_dpe: string | null; niveau: "lot" | "bien";
};
export function statutPieceDiagnostic(d: DiagnosticBail, aujourd: string) {
  if (!d.document_id) return { libelle: "Fichier manquant", ton: "attention" };
  if (d.date_expiration && d.date_expiration < aujourd) return { libelle: "Expiré", ton: "attention" };
  if (!d.date_expiration && TYPES_DIAGNOSTIC[d.type]?.validite_mois != null) return { libelle: "Date à compléter", ton: "attention" };
  if (d.type === "dpe" && !d.classe_dpe) return { libelle: "Classe à compléter", ton: "attention" };
  return { libelle: "Disponible", ton: "ok" };
}

// Phase 3 (C01) : le PDF de la notice est un RÉSUMÉ établi par Gerimmo ; son titre de classement le dit. Les résumés déjà
// rangés sous l'ancien titre (« … (annexe au bail) ») restent reconnus : fiche du bail, récapitulatif, signature électronique.
export const TITRE_GED_RESUME_NOTICE = "Résumé de la notice d'information";
export const TITRES_GED_RESUME_NOTICE = [TITRE_GED_RESUME_NOTICE, "Notice d'information (annexe au bail)"];
// Reprise du lot 40 (C01) : un résumé rangé sous l'ancien titre a l'ancien texte (« annexée au contrat », « partie intégrante »,
// « le locataire reconnaît avoir reçu ») : il est reconnu, mais à actualiser avant toute nouvelle préparation de signature.
export const resumeNoticeAActualiser = (piece: { titre: string | null } | null | undefined) => Boolean(piece && piece.titre !== TITRE_GED_RESUME_NOTICE);
// Phase 3, reprise du lot 45 (T15) : parmi les pièces d'un dossier de signature, le résumé rangé sous son titre actuel n'est pas
// une annexe du contrat. La page de garde le liste à part, « Document d'information joint » (ajouterPagesSignature) ; l'envoi
// au prestataire le nomme pour ce qu'il est (nomsFichiersPiecesJointes) ; l'écran de signature le sépare des annexes. Un résumé
// rangé sous l'ancien titre (texte qui se disait annexé au contrat) reste parmi les annexes, comme sur sa page de garde.
export const estResumeNoticeJoint = (piece: { titre: string | null }) => piece.titre === TITRE_GED_RESUME_NOTICE;

// Décision du 24/11/2026 (Q46) : en attendant que Gerimmo joigne lui-même le texte officiel, le BAILLEUR dépose la notice
// d'information (un PDF qu'il s'est procuré). Elle est rangée sous un type à elle et sous ce titre fixe, liée au bail ; la
// signature électronique du bail est bloquée sans elle et la joint comme annexe (annexesSignatureBail). Le titre dit d'où
// vient le fichier : Gerimmo ne vérifie ni son contenu, ni qu'il s'agit de la version en vigueur.
export const TYPE_GED_NOTICE_DEPOSEE = "notice_information";
export const TITRE_GED_NOTICE_DEPOSEE = "Notice d'information (déposée par le bailleur)";
// Dans un dossier de signature, une pièce ne porte que son titre : la notice déposée s'y reconnaît à ce titre, que seul le
// dépôt dédié pose (deposerNoticeBail).
export const estNoticeDeposeeJointe = (piece: { titre: string | null }) => piece.titre === TITRE_GED_NOTICE_DEPOSEE;

export type PieceBail = { id: string; titre: string | null; type: string; purged_at: string | null };
export function classerPiecesBail<T extends PieceBail>(pieces: T[], diagnosticIds: string[], reglementId: string | null) {
  const uniques = [...new Map(pieces.filter(p => !p.purged_at).map(p => [p.id, p])).values()];
  const notices = uniques.filter(p => p.type === "courrier" && TITRES_GED_RESUME_NOTICE.includes(p.titre ?? ""));
  const exclus = new Set([...diagnosticIds, ...notices.map(p => p.id), reglementId]);
  const autres = uniques.filter(p => !exclus.has(p.id) && !["bail", "etat_des_lieux", "diagnostic", "reglement_copropriete", TYPE_GED_NOTICE_DEPOSEE].includes(p.type));
  return { notices, autres };
}

// Phase 3, lot 45 (T14) : actualiser le résumé range un NOUVEAU document lié au bail ; l'ancien y reste lié. Le résumé retenu
// est le plus récent (date de création décroissante, puis identifiant décroissant) sur la fiche du bail comme au récapitulatif
// des pièces ; la signature électronique lit le même en base (annexesSignatureBail, même tri). Sans ce tri, la fiche prenait le
// premier lien lu, souvent l'ancien résumé : « Résumé à actualiser » et l'ancien PDF, quand les deux autres écrans retenaient
// le nouveau.
// Reprise du lot 45 (T14) : la base trie created_at par instant, à la microseconde, et omet une fraction nulle
// (« 2026-11-20T10:00:00+00:00 »). localeCompare (classement ICU) range « . » avant « + » : il prenait cet instant pour plus
// récent que « 2026-11-20T10:00:00.5+00:00 », et la fiche et le récapitulatif retenaient alors un autre résumé que la signature.
// Les dates se comparent donc par instant ; l'identifiant (uuid en minuscules) dans l'ordre des octets, comme `order("id")`.
const INSTANT_BASE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)$/;
function microsecondesBase(instant: string): number | null {
  const m = INSTANT_BASE.exec(instant);
  if (!m) return null;
  const decalage = m[4] === "Z" ? "Z" : `${m[4].slice(0, 3)}:${m[4].slice(3).replace(":", "") || "00"}`;
  const secondes = Date.parse(`${m[1]}T${m[2]}${decalage}`);
  return Number.isNaN(secondes) ? null : secondes * 1000 + Number((m[3] ?? "").padEnd(6, "0").slice(0, 6));
}
const ordreOctets = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
export const plusRecentDAbord = (a: { id: string; created_at: string }, b: { id: string; created_at: string }) => {
  const ia = microsecondesBase(a.created_at), ib = microsecondesBase(b.created_at);
  return (ia !== null && ib !== null ? Math.sign(ib - ia) : ordreOctets(b.created_at, a.created_at)) || ordreOctets(b.id, a.id);
};
export function resumeNoticeRetenu<T extends PieceBail & { created_at: string }>(pieces: T[]): T | undefined {
  return classerPiecesBail([...pieces].sort(plusRecentDAbord), [], null).notices[0];
}

// Q46 : la notice déposée retenue pour un bail est la plus récente de celles qui lui sont liées (même tri que le résumé) :
// la même sur la fiche du bail, au récapitulatif des pièces et dans le dossier de signature.
export function noticeDeposeeRetenue<T extends PieceBail & { created_at: string }>(pieces: T[]): T | undefined {
  return pieces.filter(p => p.type === TYPE_GED_NOTICE_DEPOSEE && !p.purged_at).sort(plusRecentDAbord)[0];
}
