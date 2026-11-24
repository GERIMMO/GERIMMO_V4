// Lot T3 (R24-A1) — information de la caution d'un loyer impayé.
//
// Article 2303 du code civil (recueil fourni par le dirigeant, version en vigueur depuis le 1er janvier 2022, non
// recontrôlé) : « Le créancier professionnel est tenu d'informer toute caution personne physique de la défaillance du
// débiteur principal dès le premier incident de paiement non régularisé dans le mois de l'exigibilité de ce paiement, à
// peine de déchéance de la garantie des intérêts et pénalités échus entre la date de cet incident et celle à laquelle elle
// en a été informée. »
//
// CE QUE GERIMMO FAISAIT : la caution n'est informée que par l'e-mail automatique de la SECONDE relance, dont le délai se
// règle de 2 à 90 jours, qui attend la confirmation du propriétaire, se tait sous plan d'apurement ou sous le seuil, et
// dont l'envoi est aujourd'hui fermé. Rien ne garantissait donc une information dans le mois, et rien ne le disait.
//
// CE QUE GERIMMO FAIT MAINTENANT : il ne change pas le circuit d'envoi (fermé, et dont la valeur de preuve est une question
// posée au juriste) ; il affiche, sur les loyers d'un bail qui a une caution, la date à ne pas dépasser, et dit ce qu'il ne
// fait pas. Lecture prudente retenue pour la date : un mois après l'échéance du plus ancien terme impayé (même quantième,
// ramené en fin de mois). NON TRANCHÉ : le bailleur particulier est-il un « créancier professionnel » ? un e-mail suffit-il ?
import { ajouterMois } from "@/lib/delai-conge-bailleur";

export type TermeSuiviCaution = { date_echeance: string; montant_du: number; montant_couvert: number };

export type RappelInformationCaution = {
  /** Échéance du plus ancien terme échu et non soldé. */
  echeance: string;
  /** Un mois après cette échéance : la date à ne pas dépasser, par prudence. */
  limite: string;
  /** Vrai quand cette date est passée. */
  depassee: boolean;
};

/** Le rappel à afficher, ou `null` : pas de caution au bail, ou aucun terme échu impayé. `aujourdhui` : jour de Paris. */
export function rappelInformationCaution(termes: readonly TermeSuiviCaution[], cautionAuBail: boolean, aujourdhui: string): RappelInformationCaution | null {
  if (!cautionAuBail) return null;
  const echeance = termes
    .filter((t) => t.date_echeance < aujourdhui && Number(t.montant_couvert) < Number(t.montant_du))
    .map((t) => t.date_echeance.slice(0, 10))
    .sort()[0];
  if (!echeance) return null;
  const limite = ajouterMois(echeance, 1);
  return { echeance, limite, depassee: aujourdhui > limite };
}

export const TEXTE_ARTICLE_2303 =
  "Article 2303 du code civil : le créancier professionnel doit informer la caution personne physique dès le premier incident de paiement non régularisé dans le mois de son exigibilité ; à défaut, il perd, à l’égard de la caution, les intérêts et pénalités échus entre l’incident et le jour où elle est informée.";

export const LIMITES_INFORMATION_CAUTION =
  "Gerimmo ne sait pas si cette règle vous concerne (elle vise le créancier professionnel) et ne vérifie pas que la caution a été informée. Son e-mail automatique à la caution, quand il est ouvert, ne part qu’avec la seconde relance : informez-la vous-même, par écrit, et gardez-en la preuve.";
