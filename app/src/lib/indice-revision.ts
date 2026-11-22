// L'INDICE DE LA RÉVISION ANNUELLE, PROPOSÉ AU LIEU D'ÊTRE RECOPIÉ (audit palier 1 du 22/11/2026, P1-13).
//
// Jusque-là, le bailleur relevait l'indice sur le site de l'Insee et le tapait à chaque révision, alors que l'outil
// public de Gerimmo lisait déjà la série officielle. Ici, on choisit dans cette série l'indice à proposer pour UN bail.
//
// AUCUNE VALEUR D'INDICE DANS LE CODE : tout vient de la série lue chez l'Insee (lib/outils/irl-insee.ts). Et aucune
// règle nouvelle : le choix est celui de l'outil public (`choisirIndices` — même trimestre que l'indice de référence,
// dernière année publiée après lui), et la référence se lit comme la base la lit dans `reviser_loyer` (l'indice de la
// dernière révision, à défaut celui figé au bail). La base reste seule juge : la proposition se vérifie avant de valider.

import { numeroTrimestreIrl } from "@/lib/baux";
import { choisirIndices, type CodeTrimestre, type ObservationIrl } from "@/lib/outils/irl-insee";

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
    }
  /** Le trimestre ou l'année de l'indice de référence ne se lisent pas sur le bail. */
  | { etat: "sans_reference" }
  /** Aucun indice de ce trimestre n'est publié après l'indice de référence. */
  | { etat: "pas_encore_publie"; trimestre: 1 | 2 | 3 | 4; anneeReference: number }
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

export function proposerIndice(o: {
  serie: ObservationIrl[] | null;
  /** L'indice de référence figé au bail : son trimestre (« T2 2025 ») et sa valeur. */
  irlTrimestreBail: string | null;
  irlValeurBail: number | string | null;
  revisions: RevisionPassee[];
}): PropositionIndice {
  const parDate = [...o.revisions].sort((a, b) => a.date_effet.localeCompare(b.date_effet));
  const premiere = parDate[0], derniere = parDate.at(-1);
  // Le trimestre : celui du bail ; à défaut (bail ancien), celui que sa première révision a fixé.
  const trimestre = (numeroTrimestreIrl(o.irlTrimestreBail) ?? numeroTrimestreIrl(premiere?.irl_trimestre)) as 1 | 2 | 3 | 4 | null;
  // L'année de référence : celle de la dernière révision ; sans révision, celle du bail.
  const anneeReference = derniere ? anneeTrimestreIrl(derniere.irl_trimestre) : anneeTrimestreIrl(o.irlTrimestreBail);
  if (!trimestre || !anneeReference) return { etat: "sans_reference" };
  if (!o.serie || o.serie.length === 0) return { etat: "indisponible" };

  const { reference, nouveau } = choisirIndices(o.serie, { trimestre: `T${trimestre}` as CodeTrimestre, annee: anneeReference });
  if (!nouveau) return { etat: "pas_encore_publie", trimestre, anneeReference };
  return {
    etat: "propose",
    trimestre,
    annee: nouveau.annee,
    valeur: nouveau.valeur,
    referencePubliee: reference?.valeur ?? null,
    referenceBail: derniere ? nombre(derniere.irl_nouveau) : nombre(o.irlValeurBail),
    anneeReference,
  };
}

/** « 146.2 » s'écrit « 146,20 » : deux décimales, comme l'Insee le publie. */
export function indiceEnClair(v: number): string {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
