// Lire un relevé de banque exporté (audit palier 1, P2-05).
//
// Le propriétaire télécharge le relevé de son compte sur le site de sa banque (CSV, ou OFX « Money ») et le donne à
// l'écran de pointage. Ce module le lit SUR L'APPAREIL : il ne dépend d'aucune API serveur, et le fichier ne quitte pas
// le navigateur. On n'en retient que les CRÉDITS (ce qui est entré sur le compte) ; les débits sont comptés, pas lus.
//
// Règle de prudence, la même que `saisie-montant.ts` : une date ou un montant qui ne se lit pas sans deviner est
// compté comme « illisible », jamais arrondi ni interprété (« 1.234 » : mille deux cent trente-quatre, ou un euro
// vingt-trois ?).

/** Un crédit du relevé. */
export type LigneReleve = {
  /** Position parmi les crédits lus, dans l'ordre du fichier (sert de clé d'affichage). */
  position: number;
  /** Jour de l'opération, AAAA-MM-JJ. */
  date: string;
  libelle: string;
  /** Montant crédité, en centimes (toujours > 0). */
  centimes: number;
  /** Rang parmi les crédits de MÊME jour, même montant et même libellé (0 pour le premier) : deux virements jumeaux restent deux lignes. */
  rang: number;
};

export type ReleveLu = {
  format: "csv" | "ofx";
  lignes: LigneReleve[];
  /** Opérations au débit (sorties d'argent) : ignorées. */
  debits: number;
  /** Lignes dont la date ou le montant ne se lit pas : ignorées, et dites. */
  illisibles: number;
  /** Vrai quand le fichier dépassait la limite et n'a été lu qu'en partie. */
  tronque: boolean;
};

export type LectureReleve = ReleveLu | { erreur: string };

/** Au-delà, on ne lit pas : un relevé de plusieurs années se découpe. */
export const TAILLE_MAX_RELEVE = 2 * 1024 * 1024;
/** Nombre d'opérations lues au plus. */
export const OPERATIONS_MAX_RELEVE = 3000;
const LIBELLE_MAX = 200;
/** Un loyer ne dépasse pas ce montant : au-delà, ce n'est pas une ligne à pointer (même borne que la base). */
const CENTIMES_MAX = 999_999_999;

/** Majuscules, sans accent, ponctuation ramenée à une espace : ce qui se compare d'un libellé ou d'un nom. */
export function normaliserTexte(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function nettoyerLibelle(brut: string): string {
  // Les caractères de contrôle d'un export (tabulations, retours) deviennent une espace.
  return brut.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, LIBELLE_MAX);
}

/** Un entier écrit en chiffres, lu chiffre à chiffre (jamais `Number(texte)` : « 1e3 », « 0x10 »). */
function entier(chiffres: string): number | null {
  if (!/^\d{1,12}$/.test(chiffres)) return null;
  let n = 0;
  for (const c of chiffres) n = n * 10 + (c.charCodeAt(0) - 48);
  return n;
}

function jourValide(annee: number, mois: number, jour: number): string | null {
  if (annee < 1990 || annee > 2100 || mois < 1 || mois > 12 || jour < 1) return null;
  const bissextile = (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
  const jours = [31, bissextile ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mois - 1];
  if (jour > jours) return null;
  return `${String(annee).padStart(4, "0")}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

/**
 * Lit une date de relevé : JJ/MM/AAAA (ou « - », « . »), JJ/MM/AA, AAAA-MM-JJ, AAAAMMJJ. Les banques françaises écrivent
 * le jour d'abord ; une date à l'américaine (MM/JJ) n'est pas devinée.
 */
export function lireDateReleve(brut: string): string | null {
  const texte = brut.trim().replace(/^"|"$/g, "").trim();
  let m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})(?:\s.*)?$/.exec(texte);
  if (m) {
    const jour = entier(m[1]), mois = entier(m[2]), an = entier(m[3]);
    if (jour === null || mois === null || an === null) return null;
    return jourValide(m[3].length === 2 ? 2000 + an : an, mois, jour);
  }
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(texte);
  if (!m) m = /^(\d{4})(\d{2})(\d{2})(?:\d{6})?(?:[.\[].*)?$/.exec(texte);
  if (m) {
    const an = entier(m[1]), mois = entier(m[2]), jour = entier(m[3]);
    if (jour === null || mois === null || an === null) return null;
    return jourValide(an, mois, jour);
  }
  return null;
}

/**
 * Lit un montant de relevé, en centimes signés. Admis : « 800 », « 800,00 », « 800.00 », « 1 234,56 », « 1.234,56 »,
 * « 1,234.56 », un signe devant ou derrière, des parenthèses pour un débit, « € » ou « EUR ». Refusé (null) : tout ce
 * qui laisse un doute sur les décimales (« 1.234 », « 1,234 », trois décimales).
 */
export function lireMontantReleve(brut: string): number | null {
  let texte = brut.replace(/[\s  ]/g, "").replace(/^"|"$/g, "").replace(/€|EUR/gi, "");
  if (!texte) return null;
  let negatif = false;
  if (/^\(.*\)$/.test(texte)) { negatif = true; texte = texte.slice(1, -1); }
  if (/^[+-]/.test(texte)) { negatif = negatif !== (texte[0] === "-"); texte = texte.slice(1); }
  else if (/[+-]$/.test(texte)) { negatif = negatif !== texte.endsWith("-"); texte = texte.slice(0, -1); }
  if (!/^[\d.,]+$/.test(texte) || !/^\d/.test(texte)) return null;
  const virgule = texte.lastIndexOf(","), point = texte.lastIndexOf(".");
  let unites = texte, decimales = "";
  const separateur = Math.max(virgule, point);
  if (separateur >= 0) {
    const apres = texte.slice(separateur + 1);
    const avant = texte.slice(0, separateur);
    const milliers = virgule >= 0 && point >= 0 ? (separateur === virgule ? "." : ",") : null;
    if (apres.length < 1 || apres.length > 2 || !/^\d+$/.test(apres)) return null;
    if (milliers) {
      // Les milliers s'écrivent par groupes de trois : « 1.234,56 » oui, « 12.34,56 » non.
      if (!new RegExp(`^\\d{1,3}(\\${milliers}\\d{3})+$`).test(avant)) return null;
      unites = avant.split(milliers).join("");
    } else {
      if (!/^\d+$/.test(avant)) return null;
      unites = avant;
    }
    decimales = apres;
  }
  const euros = entier(unites);
  const cents = entier(decimales.padEnd(2, "0"));
  if (euros === null || cents === null) return null;
  const centimes = euros * 100 + cents;
  if (centimes > CENTIMES_MAX) return null;
  return negatif ? -centimes : centimes;
}

/** Découpe un texte délimité (guillemets doublés admis, retours à la ligne dans un champ entre guillemets). */
export function decouperDelimite(texte: string, separateur: string): string[][] {
  const lignes: string[][] = [];
  let champ = "", ligne: string[] = [], dansGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') { champ += '"'; i++; } else dansGuillemets = false;
      } else champ += c;
    } else if (c === '"' && champ === "") dansGuillemets = true;
    else if (c === separateur) { ligne.push(champ); champ = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(champ); champ = "";
      lignes.push(ligne); ligne = [];
    } else champ += c;
  }
  if (champ !== "" || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}

type Colonnes = { date: number; libelles: number[]; montant: number; debit: number; credit: number; sens: number };

const EST_DATE = /^DATE( (DE )?(L )?(OPERATION|OPE|COMPTABLE|COMPTABILISATION|ECRITURE|TRANSACTION))?$/;
const EST_DATE_SECOURS = /^DATE/;
const EST_LIBELLE = /^(LIBELLE|LIBELLES|INTITULE|DESCRIPTION|DETAIL|DETAILS|OPERATION|NATURE|REFERENCE|INFORMATIONS?|COMMUNICATION|MOTIF|TIERS|LIBELLE (SIMPLIFIE|OPERATION|COMPLET|DE L OPERATION)|INFORMATIONS COMPLEMENTAIRES|DETAIL DE L OPERATION|NATURE DE L OPERATION)$/;
const EST_MONTANT = /^MONTANT( (EN )?(EUR|EUROS?))?( DE L OPERATION)?$/;
const EST_DEBIT = /^DEBIT( (EN )?(EUR|EUROS?))?$/;
const EST_CREDIT = /^CREDIT( (EN )?(EUR|EUROS?))?$/;

const EST_SENS = /^(SENS|DEBIT CREDIT|D C|TYPE DE MOUVEMENT)$/;
const HORS_LIBELLE = /^(DATE|SOLDE|DEVISE|MONNAIE|NUMERO|N |COMPTE|IBAN|CATEGORIE|SOUS CATEGORIE|POINTAGE)/;

/** Reconnaît la ligne d'en-tête : une colonne de date, et soit « Montant », soit « Crédit ». */
function lireEntete(cellules: string[]): Colonnes | null {
  const noms = cellules.map(normaliserTexte);
  let date = noms.findIndex((n) => EST_DATE.test(n));
  if (date < 0) date = noms.findIndex((n) => EST_DATE_SECOURS.test(n) && !/VALEUR/.test(n));
  if (date < 0) date = noms.findIndex((n) => EST_DATE_SECOURS.test(n));
  const montant = noms.findIndex((n) => EST_MONTANT.test(n));
  const debit = noms.findIndex((n) => EST_DEBIT.test(n));
  const credit = noms.findIndex((n) => EST_CREDIT.test(n));
  const sens = noms.findIndex((n) => EST_SENS.test(n));
  if (date < 0 || (montant < 0 && credit < 0)) return null;
  let libelles = noms.map((n, i) => (EST_LIBELLE.test(n) ? i : -1)).filter((i) => i >= 0);
  // Aucun intitulé connu : le libellé est fait des autres colonnes de texte.
  if (!libelles.length)
    libelles = noms
      .map((n, i) => (i !== date && i !== montant && i !== debit && i !== credit && i !== sens && n !== "" && !HORS_LIBELLE.test(n) ? i : -1))
      .filter((i) => i >= 0);
  return { date, libelles, montant, debit, credit, sens };
}

function compter(texte: string, caractere: string): number {
  let n = 0;
  for (const c of texte) if (c === caractere) n++;
  return n;
}

function numeroter(credits: Omit<LigneReleve, "position" | "rang">[]): LigneReleve[] {
  const vus = new Map<string, number>();
  return credits.map((c, position) => {
    const cle = `${c.date}|${c.centimes}|${normaliserTexte(c.libelle)}`;
    const rang = vus.get(cle) ?? 0;
    vus.set(cle, rang + 1);
    return { ...c, position, rang };
  });
}

function lireCsv(texte: string): LectureReleve {
  const premieres = texte.split(/\r\n|\n|\r/, 40);
  // Le séparateur est celui de la ligne d'en-tête : on essaie chacun sur les premières lignes.
  for (const separateur of [";", "\t", ","]) {
    if (!premieres.some((l) => compter(l, separateur) >= 1)) continue;
    const lignes = decouperDelimite(texte, separateur);
    const rangEntete = lignes.slice(0, 40).findIndex((l) => lireEntete(l) !== null);
    if (rangEntete < 0) continue;
    const colonnes = lireEntete(lignes[rangEntete])!;
    const credits: Omit<LigneReleve, "position" | "rang">[] = [];
    let debits = 0, illisibles = 0, lues = 0, tronque = false;
    for (const cellules of lignes.slice(rangEntete + 1)) {
      if (cellules.every((c) => c.trim() === "")) continue;
      if (lues >= OPERATIONS_MAX_RELEVE) { tronque = true; break; }
      lues++;
      const date = lireDateReleve(cellules[colonnes.date] ?? "");
      let centimes: number | null = null;
      if (colonnes.montant >= 0 && (cellules[colonnes.montant] ?? "").trim() !== "") {
        centimes = lireMontantReleve(cellules[colonnes.montant]);
        // Une colonne « Sens » (D ou C) à côté d'un montant sans signe : « D » en fait une sortie.
        if (centimes !== null && colonnes.sens >= 0 && /^D/.test(normaliserTexte(cellules[colonnes.sens] ?? "")))
          centimes = -Math.abs(centimes);
      } else if (colonnes.credit >= 0) {
        const credit = (cellules[colonnes.credit] ?? "").trim();
        const debit = colonnes.debit >= 0 ? (cellules[colonnes.debit] ?? "").trim() : "";
        if (credit !== "") {
          const lu = lireMontantReleve(credit);
          centimes = lu === null ? null : Math.abs(lu);
        } else if (debit !== "") {
          const lu = lireMontantReleve(debit);
          centimes = lu === null ? null : -Math.abs(lu);
        }
      }
      if (date === null || centimes === null) { illisibles++; continue; }
      if (centimes <= 0) { debits++; continue; }
      const libelle = nettoyerLibelle(colonnes.libelles.map((i) => cellules[i] ?? "").filter((c) => c.trim()).join(" "));
      credits.push({ date, libelle, centimes });
    }
    return { format: "csv", lignes: numeroter(credits), debits, illisibles, tronque };
  }
  return {
    erreur:
      "Ce fichier ne ressemble pas à un relevé : il faut une ligne d’en-tête avec une colonne « Date » et une colonne « Montant » ou « Crédit ». Exportez le relevé au format CSV depuis le site de votre banque.",
  };
}

function lireOfx(texte: string): LectureReleve {
  const blocs = texte.split(/<STMTTRN>/i).slice(1);
  const champ = (bloc: string, nom: string) => {
    const m = new RegExp(`<${nom}>([^<\\r\\n]*)`, "i").exec(bloc);
    return m ? m[1].trim() : "";
  };
  const credits: Omit<LigneReleve, "position" | "rang">[] = [];
  let debits = 0, illisibles = 0, lues = 0, tronque = false;
  for (const brut of blocs) {
    if (lues >= OPERATIONS_MAX_RELEVE) { tronque = true; break; }
    lues++;
    const bloc = brut.split(/<\/STMTTRN>/i)[0];
    const date = lireDateReleve(champ(bloc, "DTPOSTED"));
    // OFX écrit toujours le point décimal, sans séparateur de milliers.
    const montant = champ(bloc, "TRNAMT");
    const centimes = /^[+-]?\d+([.,]\d{1,2})?$/.test(montant) ? lireMontantReleve(montant) : null;
    if (date === null || centimes === null) { illisibles++; continue; }
    if (centimes <= 0) { debits++; continue; }
    const nom = champ(bloc, "NAME"), memo = champ(bloc, "MEMO");
    credits.push({ date, libelle: nettoyerLibelle(memo && memo !== nom ? `${nom} ${memo}` : nom), centimes });
  }
  if (!blocs.length) return { erreur: "Ce fichier OFX ne contient aucune opération." };
  return { format: "ofx", lignes: numeroter(credits), debits, illisibles, tronque };
}

/** Lit le texte d'un relevé exporté : OFX s'il en a la forme, CSV sinon. */
export function lireReleve(texte: string): LectureReleve {
  const contenu = texte.replace(/^﻿/, "");
  if (!contenu.trim()) return { erreur: "Ce fichier est vide." };
  if (/<OFX>|<STMTTRN>/i.test(contenu)) return lireOfx(contenu);
  return lireCsv(contenu);
}

/**
 * Décode les octets d'un relevé : UTF-8 s'il est valide, sinon Windows-1252, l'encodage des exports « Excel » des
 * banques françaises (un « é » y est un seul octet, invalide en UTF-8).
 */
export function decoderReleve(octets: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(octets);
  } catch {
    return new TextDecoder("windows-1252").decode(octets);
  }
}
