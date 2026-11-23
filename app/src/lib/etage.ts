// L'étage d'un lot tel qu'il s'imprime (documents) et s'affiche (écrans). Module sans dépendance : les composants clients
// l'importent comme les modèles de documents (communs.ts le réexporte).
//
// Le champ est libre (« Étage — Facultatif ») : on y lit « 3 », « 1er, porte droite », « 2e étage, porte gauche », « RDC »,
// « Rez-de-jardin », « sous-sol »… Le mot « étage » ne complète qu'un numéro : après un ordinal (« 1er » → « 1er étage »),
// devant un nombre seul (« 3 » → « étage 3 »). Une saisie qui le dit déjà, ou un niveau nommé (RDC, rez-de-jardin, sous-sol,
// combles…), s'imprime telle quelle. Phase 3 : « étage 2e étage » (C09, C26, C63, C84), « étage sous-sol » (reprise du lot 35).
//
// `nomLot` : le nom du lot imprimé juste avant (« Studio meublé — 1er étage »). Quand il nomme déjà le même niveau, l'étage
// n'est pas redit : « Studio meublé — 1er étage, porte droite », plus « …, étage 1er, porte droite » (reprise du lot 35).
//
// Phase 3, lot 43 (T05) : deux niveaux saisis ensemble (duplex « 1er et 2e ») s'impriment « 1er et 2e étages », plus
// « 1er étage et 2e » ; un nom de lot « Lot 5 étage 2 » nomme le niveau 2 (le numéro du lot n'est pas un étage) : avec l'étage
// « 2 », l'adresse ne dit plus « Lot 5 étage 2, étage 2 ».

const sansAccents = (texte: string) => texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const FIN_DE_MOT = "(?=$|[\\s,;.:()/–—-])";
// Ordinaux au masculin seulement (« étage » est masculin) : « 1re », « première » restent tels que saisis.
const ORDINAL = new RegExp(`^(\\d+\\s?(?:er|e|ème|eme|è|°))${FIN_DE_MOT}`, "i");
const ORDINAUX_EN_LETTRES =
  "premier|second|deuxi[eè]me|troisi[eè]me|quatri[eè]me|cinqui[eè]me|sixi[eè]me|septi[eè]me|huiti[eè]me|neuvi[eè]me|dixi[eè]me|dernier";
const ORDINAL_EN_LETTRES = new RegExp(`^(${ORDINAUX_EN_LETTRES})${FIN_DE_MOT}`, "i");
const NOMBRE = new RegExp(`^-?\\d+${FIN_DE_MOT}`);
// Deux niveaux reliés par « et » (duplex) : « 1er et 2e », « premier et deuxième ».
const UN_ORDINAL = `(?:\\d+\\s?(?:er|e|ème|eme|è|°)|${ORDINAUX_EN_LETTRES})`;
const DEUX_NIVEAUX = new RegExp(`^(${UN_ORDINAL}\\s+et\\s+${UN_ORDINAL})${FIN_DE_MOT}`, "i");
// Le niveau en tête d'une mention : « 4e étage », « étage 3 », « RDC », « rez-de-chaussée ».
const NIVEAU_EN_TETE = /^(?:\d+\s?(?:er|re|ère|ere|e|ème|eme|è|°)?\s+[eé]tage|[eé]tage\s+-?\d+|rdc|rez[\s-]*de[\s-]*chauss[eé]e)/i;

// Le niveau que nomme un texte, pour comparer le nom du lot et le champ Étage : "4" pour « 4e étage » ou « étage 4 », "0" pour
// « RDC » ou « rez-de-chaussée ».
// Un ordinal (« 4e étage ») se lit d'abord, puis « étage 4 », et seulement ensuite un nombre nu devant « étage » : dans
// « Lot 5 étage 2 », le 5 est le numéro du lot, le niveau est 2 (lot 43, T05).
function niveau(texte: string): string | null {
  const lu = sansAccents(texte);
  const m = lu.match(/(-?\d+)\s?(?:er|re|ere|e|eme|°)\s+etage\b/) ?? lu.match(/\betage\s+(-?\d+)/) ?? lu.match(/(-?\d+)\s+etage\b/);
  if (m) return String(Number(m[1]));
  return /\brdc\b|rez[\s-]*de[\s-]*chaussee/.test(lu) ? "0" : null;
}

export function mentionEtage(etage: string | null | undefined, nomLot?: string | null): string | null {
  const saisie = etage?.trim();
  if (!saisie) return null;
  let mention = saisie;
  if (!/etage/.test(sansAccents(saisie))) {
    const duplex = saisie.match(DEUX_NIVEAUX);
    const ordinal = duplex ? null : saisie.match(ORDINAL) ?? saisie.match(ORDINAL_EN_LETTRES);
    if (duplex) mention = `${duplex[1]} étages${saisie.slice(duplex[1].length)}`;
    else if (ordinal) mention = `${ordinal[1]} étage${saisie.slice(ordinal[1].length)}`;
    else if (NOMBRE.test(saisie)) mention = `étage ${saisie}`;
  }
  const tete = nomLot ? mention.match(NIVEAU_EN_TETE) : null;
  if (!tete || !nomLot) return mention;
  const n = niveau(tete[0]);
  if (n === null || niveau(nomLot) !== n) return mention;
  return mention.slice(tete[0].length).replace(/^[\s,;–—-]+/, "") || null;
}
