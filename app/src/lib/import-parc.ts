// Le gabarit d'import du parc, et la lecture du fichier déposé.
//
// UN TABLEUR, PAS UN FORMAT. Une agence qui reprend son parc part d'un export
// de son ancien outil ou d'un fichier qu'elle tient elle-même — dans les deux
// cas un tableur, enregistré en CSV. Le séparateur est donc détecté (Excel
// francophone écrit des points-virgules), les guillemets sont honorés, et
// l'en-tête est reconnu sans tenir compte des accents ni de la casse : personne
// ne retapera « quote_part » à l'identique.

/** Les colonnes attendues, dans l'ordre du gabarit. */
export const COLONNES = [
  ["bien", "Nom du bien", true],
  ["type", "Type (appartement, maison, immeuble, local, parking, terrain, autre)", true],
  ["adresse", "Adresse", true],
  ["adresse2", "Complément d'adresse", false],
  ["code_postal", "Code postal", true],
  ["ville", "Ville", true],
  ["annee", "Année de construction", false],
  ["lot", "Nom du lot", true],
  ["etage", "Étage", false],
  ["surface", "Surface (m²)", false],
  ["pieces", "Pièces", false],
  ["proprietaire_nom", "Nom du propriétaire", true],
  ["proprietaire_prenom", "Prénom du propriétaire", false],
  ["proprietaire_email", "Email du propriétaire", false],
  ["quote_part", "Quote-part (%) — 100 si vide", false],
  ["locataire_nom", "Nom du locataire", false],
  ["locataire_prenom", "Prénom du locataire", false],
  ["locataire_email", "Email du locataire", false],
  ["loyer_hc", "Loyer hors charges (€)", false],
  ["charges", "Provision pour charges (€)", false],
  ["depot_garantie", "Dépôt de garantie (€)", false],
  ["date_debut", "Date d'entrée (AAAA-MM-JJ)", false],
  ["jour_echeance", "Jour d'échéance (1 si vide)", false],
] as const satisfies readonly (readonly [string, string, boolean])[];

export type LigneImport = Record<string, string>;

/** Sans accents, sans casse, sans ponctuation : « Quote-part (%) » → quotepart. */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** « Surface (m²) » et « Loyer hors charges (€) » : la parenthèse est une aide
 *  de lecture, pas une partie du nom. On la retire avant de comparer. */
function sansParenthese(texte: string): string {
  return texte.split(" (")[0].split(" —")[0].split("(")[0];
}

const PAR_ENTETE = new Map<string, string>(
  COLONNES.flatMap(([cle, libelle]) => [
    [normaliser(cle), cle],
    [normaliser(sansParenthese(libelle)), cle],
  ])
);

/** L'en-tête tel qu'il est écrit, puis débarrassé de sa parenthèse. */
function cleDeLEntete(entete: string): string | null {
  return (
    PAR_ENTETE.get(normaliser(entete)) ??
    PAR_ENTETE.get(normaliser(sansParenthese(entete))) ??
    null
  );
}

/** Le gabarit, en-tête seul plus une ligne d'exemple. */
export function gabaritCsv(): string {
  const entete = COLONNES.map(([, libelle]) => libelle).join(";");
  const exemple = [
    "Résidence des Tilleuls", "appartement", "12 rue des Tilleuls", "Bâtiment A",
    "75011", "Paris", "1974", "A12", "3e", "42", "2",
    "Durand", "Paul", "paul.durand@exemple.fr", "100",
    "Petit", "Awa", "awa.petit@exemple.fr", "700", "50", "700", "2026-01-01", "1",
  ].join(";");
  // Le BOM : sans lui, Excel ouvre les accents de travers.
  return `﻿${entete}\n${exemple}\n`;
}

/**
 * Découpe une ligne CSV en respectant les guillemets.
 * `"Durand; fils";Paul` rend deux champs, pas trois.
 */
function decouper(ligne: string, sep: string): string[] {
  const champs: string[] = [];
  let courant = "";
  let dansGuillemets = false;
  for (let i = 0; i < ligne.length; i += 1) {
    const c = ligne[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (ligne[i + 1] === '"') {
          courant += '"';
          i += 1;
        } else dansGuillemets = false;
      } else courant += c;
    } else if (c === '"') dansGuillemets = true;
    else if (c === sep) {
      champs.push(courant);
      courant = "";
    } else courant += c;
  }
  champs.push(courant);
  return champs.map((x) => x.trim());
}

export type LectureCsv =
  | { erreur: string }
  | { lignes: LigneImport[]; inconnues: string[]; manquantes: string[] };

export function lireCsv(contenu: string): LectureCsv {
  const texte = contenu.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const brutes = texte.split("\n").filter((l) => l.trim().length > 0);
  if (brutes.length === 0) return { erreur: "Le fichier est vide." };

  // Le séparateur est celui qui découpe le plus l'en-tête : Excel francophone
  // écrit des points-virgules, les exports anglo-saxons des virgules.
  const sep = [";", ",", "\t"]
    .map((s) => ({ s, n: decouper(brutes[0], s).length }))
    .sort((a, b) => b.n - a.n)[0].s;

  const entetes = decouper(brutes[0], sep);
  const cles = entetes.map(cleDeLEntete);
  const inconnues = entetes.filter((_, i) => cles[i] === null && entetes[i] !== "");
  const presentes = new Set(cles.filter(Boolean) as string[]);
  const manquantes = COLONNES.filter(([cle, , requise]) => requise && !presentes.has(cle)).map(
    ([, libelle]) => libelle
  );
  if (presentes.size === 0) {
    return {
      erreur:
        "Aucune colonne reconnue : la première ligne du fichier doit porter les en-têtes du gabarit.",
    };
  }

  const lignes: LigneImport[] = [];
  for (const brute of brutes.slice(1)) {
    const champs = decouper(brute, sep);
    const ligne: LigneImport = {};
    cles.forEach((cle, i) => {
      if (cle) ligne[cle] = champs[i] ?? "";
    });
    // Une ligne entièrement vide (ligne de séparation dans le tableur) n'est
    // pas une erreur : elle n'existe pas.
    if (Object.values(ligne).some((v) => v !== "")) lignes.push(ligne);
  }
  return { lignes, inconnues, manquantes };
}
