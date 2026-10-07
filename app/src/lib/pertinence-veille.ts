// LA PERTINENCE D'UNE VEILLE POUR LE JOURNAL (constat du 06/10/2026).
//
// Le 29/09, le journal a relayé « Amorcer un plan de décarbonation : un guide
// national pour les entreprises » : la collecte de veille sert aussi les
// artisans, ses mots-clés sont larges, et l'étude IA marquait le sujet
// « artisan, bailleur, agence ». Le filtre posé le 29/09 ne lisait que le
// titre, en dur dans le code. Désormais :
//  - les mots inclus et exclus vivent dans `marketing_reglages` (le
//    superviseur les modifie depuis l'écran marketing) ;
//  - on lit le titre ET le résumé de l'étude ;
//  - un mot exclu l'emporte sur tout ;
//  - les publics de l'étude doivent viser bailleurs, agences ou locataires :
//    un sujet « artisans seuls » n'a pas sa place dans un journal de gestion
//    locative.
// Sans sujet pertinent, le créneau bascule sur la veine éditoriale.

export const PUBLICS_JOURNAL = ["bailleur", "agence", "locataire"] as const;

export type SujetVeilleCandidat = {
  titre: string;
  resume?: string | null;
  publics?: string[] | null;
};

export type MotsPertinence = { inclus: string[]; exclus: string[] };

/** Minuscules, sans accents, blancs réduits : « Décarbonation » = « decarbonation ». */
export function normaliserTexte(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`´]/g, "'")
    .toLowerCase()
    .replace(/[  \s]+/g, " ")
    .trim();
}

function echapper(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Un mot-clé est un mot entier (ou une suite de mots), pluriel admis. */
function motifDe(mot: string): RegExp | null {
  const base = normaliserTexte(mot);
  if (!base) return null;
  return new RegExp(`(?<![a-z0-9])${echapper(base)}(?:s|x|es)?(?![a-z0-9])`, "i");
}

export function motsTrouves(texte: string, mots: string[]): string[] {
  const t = normaliserTexte(texte);
  return mots.filter((m) => motifDe(m)?.test(t));
}

export type VerdictPertinence = { pertinent: boolean; motif: string; inclus: string[]; exclus: string[] };

/** Le verdict, avec son motif : il se lit dans le journal technique. */
export function evaluerPertinence(sujet: SujetVeilleCandidat, mots: MotsPertinence): VerdictPertinence {
  const texte = `${sujet.titre}\n${sujet.resume ?? ""}`;
  const exclus = motsTrouves(texte, mots.exclus);
  const inclus = motsTrouves(texte, mots.inclus);
  if (exclus.length) return { pertinent: false, motif: `mot exclu : ${exclus.join(", ")}`, inclus, exclus };
  if (!inclus.length) return { pertinent: false, motif: "aucun mot du logement ou de la location", inclus, exclus };
  const publics = sujet.publics ?? [];
  if (publics.length && !publics.some((p) => (PUBLICS_JOURNAL as readonly string[]).includes(p))) {
    return { pertinent: false, motif: `publics hors journal : ${publics.join(", ")}`, inclus, exclus };
  }
  return { pertinent: true, motif: `mots : ${inclus.slice(0, 5).join(", ")}`, inclus, exclus };
}

export function estSujetPertinent(sujet: SujetVeilleCandidat, mots: MotsPertinence): boolean {
  return evaluerPertinence(sujet, mots).pertinent;
}

/** « logement, loyer ; bail » → ["logement", "loyer", "bail"] (saisie du superviseur). */
export function lireMots(brut: string): string[] {
  return [...new Set(brut.split(/[\n,;]+/).map((m) => m.trim()).filter((m) => m.length >= 2 && m.length <= 60))].slice(0, 300);
}
