/** Le périmètre demandé par le dirigeant le 24/10 : logement et bâtiment.
 * Le titre officiel fait foi ; un résumé IA qui ajoute « bailleur » ne suffit pas.
 * Ces limites portent sur les propositions automatiques, jamais sur les urgences.
 */
export const LIMITE_VEILLES = 5;
export const LIMITE_ARTICLES = 2;

const normaliser = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’‘]/g, "'");
const mots = (s: string) => new RegExp(`(?<![a-z0-9])(?:${s})(?![a-z0-9])`, "i");
const LOGEMENT = mots("logements?|loyers?|locati(?:f|fs|ve|ves)|colocations?|locataires?|bailleurs?|copropriet(?:e|es|aire|aires)|dpe|diagnostics? immobiliers?|apl|aides? au logement|habitation|hlm|treve hivernale|depots? de garantie|etats? des lieux|visale|immobili(?:er|ers|ere|eres)|passoires? thermiques?|maprimerenov|renovation energetique|taxe fonciere|taxe d'habitation|irl|quittances?|baux|bail|location(?:s)? (?:meublee?s?|nue?s?|saisonniere?s?|de logement?s?)");
const BATIMENT = mots("batiments?|btp|rge|decennale|plombiers?|electriciens?|chauffagistes?|couvreurs?|macons?|menuisiers?|pompes? a chaleur|chauffe-eau");
const BESOIN_METIER = mots("artisan(?:s)?|assurances?|garanties?|qualifications?|certifications?|travaux|chantiers?|devis|factures?|tva|aides?|primes?|normes?|securite|renovation|installation|entretien|reparation|obligations?|responsabilite");
const HORS_CIBLE = mots("kinesitherapeutes?|aah|allocation aux adultes handicapes|taxe sur les salaires|cvae|fonds de commerce|baux commerciaux|bail commercial|location de (?:voitures?|vehicules?|materiel)");

export function sujetDansPerimetre(titre: string): boolean {
  const t = normaliser(titre);
  return !HORS_CIBLE.test(t) && (LOGEMENT.test(t) || (BATIMENT.test(t) && BESOIN_METIER.test(t)));
}

export type MotifReserve = "hors_perimetre" | "plafond";
/** Ne change aucun statut : les éléments non prioritaires restent accessibles. */
export function selectionnerDemandes<T extends { source: string; titre: string }>(demandes: T[]) {
  const decisions: T[] = [];
  const reserve: { decision: T; motif: MotifReserve }[] = [];
  let veilles = 0, articles = 0;
  for (const d of demandes) {
    if (d.source === "veille" && !sujetDansPerimetre(d.titre)) reserve.push({ decision: d, motif: "hors_perimetre" });
    else if ((d.source === "veille" && veilles++ >= LIMITE_VEILLES) || (d.source === "publication" && articles++ >= LIMITE_ARTICLES)) reserve.push({ decision: d, motif: "plafond" });
    else decisions.push(d);
  }
  return { decisions, reserve };
}
