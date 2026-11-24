// L'INDICE DE LA RÉVISION ANNUELLE, PROPOSÉ AU LIEU D'ÊTRE RECOPIÉ (audit palier 1 du 22/11/2026, P1-13).
//
// Jusque-là, le bailleur relevait l'indice sur le site de l'Insee et le tapait à chaque révision, alors que l'outil
// public de Gerimmo lisait déjà la série officielle. Ici, on choisit dans cette série l'indice à proposer pour UN bail.
//
// AUCUNE VALEUR D'INDICE DANS LE CODE : tout vient de la série lue chez l'Insee (lib/outils/irl-insee.ts). Le choix suit
// la base (`reviser_loyer`) : même trimestre que l'indice de référence, année de l'échéance (voir `indiceAttendu`), et la
// référence se lit comme elle la lit (l'indice de la dernière révision, à défaut celui figé au bail). La base reste
// seule juge : la proposition se vérifie avant de valider.
//
// Reprise du lot D2 (24/11/2026) : quand l'indice proposé est postérieur de plus d'un an à l'indice de référence, la
// révision d'une année n'a pas été faite. Elle n'est pas rattrapée : la base calcule sur un an et exige l'indice du même
// trimestre de l'année précédente. La proposition le rend donc aussi (`precedent`).
//
// Troisième reprise du lot D2 (24/11/2026) : l'indice proposé n'est plus « le dernier publié » mais CELUI DE L'ÉCHÉANCE
// à laquelle la demande est rattachée (`indiceAttendu`, miroir de la règle B de la migration 20261124170000). Exemple du
// relecteur : bail du 01/01/2024, indice du bail T3 2023 ; le 28/10/2025, la révision encore possible est celle du
// 01/01/2025, son indice est le T3 2024 — pas le T3 2025, déjà publié, qui est celui de la révision suivante.

import { derniereDateAnniversaire, indicePrecedentExige, numeroTrimestreIrl } from "@/lib/baux";
import type { ObservationIrl } from "@/lib/outils/irl-insee";

export type RevisionPassee = { date_effet: string; irl_trimestre: string | null; irl_nouveau: number | string | null };

export type PropositionIndice =
  | {
      etat: "propose";
      trimestre: 1 | 2 | 3 | 4;
      annee: number;
      valeur: number;
      /** Ce que l'Insee publie pour le trimestre et l'année de l'indice de référence du bail (null : absent de la série). */
      referencePubliee: number | null;
      /** L'indice de référence enregistré sur le bail (ou celui de sa dernière révision). */
      referenceBail: number | null;
      anneeReference: number;
      /** La date de révision (date anniversaire du bail) à laquelle la demande est rattachée : l'indice est le sien. */
      echeance: string;
      /**
       * Reprise du lot D2 (24/11/2026). Rempli seulement quand la base exige l'indice du même trimestre de l'année
       * précédente (aucune révision enregistrée pour l'année de bail précédente, ou indice de référence plus ancien de
       * plus d'un an) : la révision se calcule alors sur un an avec lui. `valeur` est celle que publie l'Insee (null :
       * absente de la série, à saisir à la main). null dans le cas normal.
       */
      precedent: { annee: number; valeur: number | null } | null;
    }
  /** Le trimestre ou l'année de l'indice de référence ne se lisent pas sur le bail, ou le bail n'a pas de date de début. */
  | { etat: "sans_reference" }
  /** L'indice de l'échéance n'est pas (encore) dans la série publiée. */
  | { etat: "pas_encore_publie"; trimestre: 1 | 2 | 3 | 4; annee: number; anneeReference: number }
  /** L'indice de l'échéance est déjà l'indice de référence du bail : le loyer le porte déjà, rien à réviser pour elle. */
  | { etat: "deja_applique"; trimestre: 1 | 2 | 3 | 4; annee: number; echeance: string }
  /** La série n'a pas pu être lue chez l'Insee. */
  | { etat: "indisponible" };

/** « T2 2025 » → 2025. Miroir de `trimestre_irl_annee` (base) : la première année à quatre chiffres du libellé. */
export function anneeTrimestreIrl(libelle: string | null | undefined): number | null {
  const m = /((?:19|20)[0-9]{2})/.exec(libelle ?? "");
  return m ? Number(m[1]) : null;
}

const nombre = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Deux indices sont « le même » au centième près : c'est la précision de la série publiée. */
export function memeIndice(a: number | null, b: number | null): boolean {
  return a !== null && b !== null && Math.round(a * 100) === Math.round(b * 100);
}

/**
 * Le premier jour qui suit le trimestre : T1 de l'année A → 1er avril A ; T2 → 1er juillet A ; T3 → 1er octobre A ;
 * T4 → 1er janvier A+1. REPÈRE DE CALENDRIER, pas une règle de droit : l'indice d'un trimestre n'est jamais publié
 * avant la fin de ce trimestre.
 */
export function lendemainDuTrimestre(trimestre: number, annee: number): string {
  return trimestre === 4 ? `${annee + 1}-01-01` : `${annee}-${String(3 * trimestre + 1).padStart(2, "0")}-01`;
}

export type IndiceAttendu = {
  trimestre: 1 | 2 | 3 | 4;
  annee: number;
  /** La date de révision à laquelle la demande est rattachée (la première du bail tant qu'aucune n'est atteinte). */
  echeance: string;
  /**
   * true : le bail porte son indice d'origine, la base n'accepte QUE cet indice (règle B1).
   * false : l'année ne se compte pas depuis l'indice du bail ; `annee` est le dernier indice de ce trimestre terminé à
   * l'échéance, et la base accepte aussi celui de l'année d'avant (règle B2).
   */
  exact: boolean;
};

/**
 * Troisième reprise du lot D2 (24/11/2026) — QUEL INDICE POUR QUELLE ÉCHÉANCE. Miroir de la règle B de `reviser_loyer`
 * (migration 20261124170000), dont l'en-tête dit la règle complète :
 *  - B1, le bail porte son indice d'origine (trimestre et année lisibles, trimestre terminé au début du bail, année du
 *    début du bail ou année d'avant) : l'indice de la n-ième échéance est celui du même trimestre, n années plus tard ;
 *  - B2, sinon : le dernier indice de ce trimestre dont le trimestre était terminé à la date de l'échéance.
 * null quand le bail n'a pas de date de début ou que le trimestre ne se lit nulle part.
 */
export function indiceAttendu(o: {
  dateDebut: string | null | undefined;
  irlTrimestreBail: string | null | undefined;
  /** Les révisions du bail : pour un bail ancien sans trimestre lisible, la première a fixé le trimestre. */
  revisions: { date_effet: string; irl_trimestre?: string | null }[];
  dateDemande: string;
}): IndiceAttendu | null {
  if (!o.dateDebut) return null;
  const debut = o.dateDebut.slice(0, 10);
  const anneeDebut = Number(debut.slice(0, 4));
  // L'échéance : la dernière date anniversaire atteinte à la date de la demande ; avant la première, la première.
  const echeance = derniereDateAnniversaire(debut, o.dateDemande.slice(0, 10)) ?? derniereDateAnniversaire(debut, `${anneeDebut + 1}-12-31`);
  if (!echeance) return null;
  const n = Number(echeance.slice(0, 4)) - anneeDebut;
  const trimestreBail = numeroTrimestreIrl(o.irlTrimestreBail);
  const anneeBail = anneeTrimestreIrl(o.irlTrimestreBail);
  if (trimestreBail && anneeBail !== null && anneeBail >= anneeDebut - 1 && lendemainDuTrimestre(trimestreBail, anneeBail) <= debut) {
    return { trimestre: trimestreBail as 1 | 2 | 3 | 4, annee: anneeBail + n, echeance, exact: true };
  }
  const premiere = [...o.revisions].sort((a, b) => a.date_effet.localeCompare(b.date_effet))[0];
  const trimestre = (trimestreBail ?? numeroTrimestreIrl(premiere?.irl_trimestre)) as 1 | 2 | 3 | 4 | null;
  if (!trimestre) return null;
  const anneeEcheance = Number(echeance.slice(0, 4));
  const annee = lendemainDuTrimestre(trimestre, anneeEcheance) <= echeance ? anneeEcheance : anneeEcheance - 1;
  return { trimestre, annee, echeance, exact: false };
}

export function proposerIndice(o: {
  serie: ObservationIrl[] | null;
  /** L'indice de référence figé au bail : son trimestre (« T2 2025 ») et sa valeur. */
  irlTrimestreBail: string | null;
  irlValeurBail: number | string | null;
  revisions: RevisionPassee[];
  /** Le début du bail et la date de la demande : ils disent à quelle échéance la révision est rattachée. */
  dateDebut: string | null;
  dateDemande: string;
}): PropositionIndice {
  const parDate = [...o.revisions].sort((a, b) => a.date_effet.localeCompare(b.date_effet));
  const derniere = parDate.at(-1);
  // L'année de référence : celle de la dernière révision ; sans révision, celle du bail.
  const anneeReference = derniere ? anneeTrimestreIrl(derniere.irl_trimestre) : anneeTrimestreIrl(o.irlTrimestreBail);
  const attendu = indiceAttendu(o);
  if (!attendu || !anneeReference) return { etat: "sans_reference" };
  if (!o.serie || o.serie.length === 0) return { etat: "indisponible" };

  const { trimestre, annee, echeance } = attendu;
  // Le loyer porte déjà cet indice (ou un plus récent) : la base refuserait, il n'y a rien à réviser pour cette échéance.
  if (annee <= anneeReference) return { etat: "deja_applique", trimestre, annee, echeance };
  const publie = (a: number) => o.serie!.find((i) => i.trimestre === `T${trimestre}` && i.annee === a)?.valeur ?? null;
  const valeur = publie(annee);
  if (valeur === null) return { etat: "pas_encore_publie", trimestre, annee, anneeReference };
  // L'indice précédent est rendu chaque fois que la base l'exige (règle C de la migration) : la série est lue en entier.
  const precedentExige =
    indicePrecedentExige(o.dateDebut, o.dateDemande, o.revisions, { anneeIndice: annee, anneeIndiceBail: anneeTrimestreIrl(o.irlTrimestreBail) }) ||
    annee > anneeReference + 1;
  return {
    etat: "propose",
    trimestre,
    annee,
    valeur,
    referencePubliee: publie(anneeReference),
    referenceBail: derniere ? nombre(derniere.irl_nouveau) : nombre(o.irlValeurBail),
    anneeReference,
    echeance,
    precedent: precedentExige ? { annee: annee - 1, valeur: publie(annee - 1) } : null,
  };
}

/** « 146.2 » s'écrit « 146,20 » : deux décimales, comme l'Insee le publie. */
export function indiceEnClair(v: number): string {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
