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
//
// Reprise du lot 43 : « 5e et dernier » nomme UN étage (le 5e, qui est le dernier) : « 5e et dernier étage », au singulier
// (le lot 43 l'imprimait « 5e et dernier étages », comme un duplex). Un nom de lot qui dit déjà les deux niveaux d'un duplex
// (« Duplex — 1er et 2e étages ») n'est plus suivi de « 1er et 2e étages ». Un niveau suivi de « et … » (« étage 1 et 2 »,
// « 1er étage et 2e ») n'est jamais coupé de la suite : l'adresse imprimait « Studio 2 étage 1, et 2 ».
//
// Phase 3, lot 48 (U02) : le nom du lot se lit aussi quand il écrit « étage » au singulier (« Duplex 1er et 2e étage ») ou nomme
// « 5e et dernier étage », et les niveaux en lettres (« premier et deuxième ») se comparent à ceux en chiffres (« 1er et 2e
// étages »). L'adresse imprimait « Duplex 1er et 2e étage, 1er et 2e étages » ou « T3 5e et dernier étage, 5e et dernier
// étage ». Un nom qui ne dit que « 5e étage » ne couvre pas « 5e et dernier » : la mention reste.

const sansAccents = (texte: string) => texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const FIN_DE_MOT = "(?=$|[\\s,;.:()/–—-])";
// Ordinaux au masculin seulement (« étage » est masculin) : « 1re », « première » restent tels que saisis.
const ORDINAL = new RegExp(`^(\\d+\\s?(?:er|e|ème|eme|è|°))${FIN_DE_MOT}`, "i");
const ORDINAL_CHIFFRES = "\\d+\\s?(?:er|e|ème|eme|è|°)";
// Les ordinaux en lettres qui numérotent un niveau ; « dernier » ne le numérote pas (« 5e et dernier » est un seul étage).
const ORDINAUX_NUMEROTES =
  "premier|second|deuxi[eè]me|troisi[eè]me|quatri[eè]me|cinqui[eè]me|sixi[eè]me|septi[eè]me|huiti[eè]me|neuvi[eè]me|dixi[eè]me";
const ORDINAL_EN_LETTRES = new RegExp(`^(${ORDINAUX_NUMEROTES}|dernier)${FIN_DE_MOT}`, "i");
const NOMBRE = new RegExp(`^-?\\d+${FIN_DE_MOT}`);
// Deux niveaux reliés par « et » (duplex) : « 1er et 2e », « premier et deuxième » → « … étages ». « 5e et dernier » est UN
// étage, le 5e, qui est aussi le dernier → « 5e et dernier étage » (reprise du lot 43).
const UN_NIVEAU = `(?:${ORDINAL_CHIFFRES}|${ORDINAUX_NUMEROTES})`;
const DEUX_NIVEAUX = new RegExp(`^(${UN_NIVEAU}\\s+et\\s+(${UN_NIVEAU}|dernier))${FIN_DE_MOT}`, "i");
// Le niveau en tête d'une mention : « 1er et 2e étages » (duplex, reprise du lot 43), « 4e étage », « étage 3 », « RDC »,
// « rez-de-chaussée ».
// Lot 48 (U02) : aussi « 5e et dernier étage », les niveaux en lettres (« premier et deuxième étages », « premier étage ») et
// « étage » au singulier après deux niveaux.
const NIVEAU_EN_TETE = new RegExp(
  `^(?:${UN_NIVEAU}\\s+et\\s+(?:${UN_NIVEAU}|dernier)\\s+[eé]tages?|\\d+\\s?(?:er|re|ère|ere|e|ème|eme|è|°)?\\s+[eé]tage|(?:${ORDINAUX_NUMEROTES})\\s+[eé]tage|[eé]tage\\s+-?\\d+|rdc|rez[\\s-]*de[\\s-]*chauss[eé]e)`,
  "i"
);
// Ce qui prolonge un niveau au lieu de le clore : « étage 1 et 2 », « 1er étage et 2e », « étage 1 à 3 », « étage 1/2 ».
const SUITE_DU_NIVEAU = /^\s*(?:(?:et|à)(?=\s|$)|&|\/|[-–—]?\s*\d)/i;

// Le niveau que nomme un texte, pour comparer le nom du lot et le champ Étage : "4" pour « 4e étage » ou « étage 4 », "0" pour
// « RDC » ou « rez-de-chaussée ».
// Un ordinal (« 4e étage ») se lit d'abord, puis « étage 4 », et seulement ensuite un nombre nu devant « étage » : dans
// « Lot 5 étage 2 », le 5 est le numéro du lot, le niveau est 2 (lot 43, T05).
// Reprise du lot 43 : deux niveaux (« 1er et 2e étages ») se lisent ensemble, "1 et 2" : un nom de duplex ne se confond ni
// avec son premier niveau seul, ni avec un autre duplex.
// Lot 48 (U02) : les ordinaux en lettres se lisent comme en chiffres (« premier » comme « 1er ») ; deux niveaux se lisent
// aussi devant « étage » au singulier ; « 5e et dernier étage » se lit "5 et dernier".
const EN_CHIFFRES: Record<string, string> = {
  premier: "1er", second: "2e", deuxieme: "2e", troisieme: "3e", quatrieme: "4e", cinquieme: "5e", sixieme: "6e",
  septieme: "7e", huitieme: "8e", neuvieme: "9e", dixieme: "10e",
};
function niveau(texte: string): string | null {
  const lu = sansAccents(texte).replace(new RegExp(`\\b(${Object.keys(EN_CHIFFRES).join("|")})\\b`, "g"), (mot) => EN_CHIFFRES[mot]);
  const deux = lu.match(/(-?\d+)\s?(?:er|re|ere|e|eme|°)\s+et\s+(-?\d+)\s?(?:er|re|ere|e|eme|°)\s+etages?\b/);
  if (deux) return `${Number(deux[1])} et ${Number(deux[2])}`;
  const dernier = lu.match(/(-?\d+)\s?(?:er|re|ere|e|eme|°)\s+et\s+dernier\s+etages?\b/);
  if (dernier) return `${Number(dernier[1])} et dernier`;
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
    if (duplex) mention = `${duplex[1]} ${/^dernier$/i.test(duplex[2]) ? "étage" : "étages"}${saisie.slice(duplex[1].length)}`;
    else if (ordinal) mention = `${ordinal[1]} étage${saisie.slice(ordinal[1].length)}`;
    else if (NOMBRE.test(saisie)) mention = `étage ${saisie}`;
  }
  const tete = nomLot ? mention.match(NIVEAU_EN_TETE) : null;
  if (!tete || !nomLot) return mention;
  const n = niveau(tete[0]);
  const duNom = niveau(nomLot);
  // Le nom couvre la mention s'il dit le même niveau, ou le même suivi de « et dernier » (lot 48, U02).
  if (n === null || (duNom !== n && duNom !== `${n} et dernier`)) return mention;
  const reste = mention.slice(tete[0].length);
  // Un niveau suivi de « et 2 » n'est pas l'étage du nom à lui seul : le retirer laissait « et 2 » (reprise du lot 43).
  if (SUITE_DU_NIVEAU.test(reste)) return mention;
  return reste.replace(/^[\s,;–—-]+/, "") || null;
}
