// Lire le tableur d'une agence — quel que soit le tableur, et quoi qu'on y lise.
//
// UN TABLEUR, PAS UN FORMAT. Une agence qui reprend son parc ou ses soldes part
// d'un export de son ancien outil, ou d'un fichier qu'elle tient elle-même :
// dans les deux cas un tableur, enregistré en CSV. Le séparateur est donc
// détecté (Excel francophone écrit des points-virgules), les guillemets sont
// honorés, et l'en-tête est reconnu sans tenir compte des accents ni de la
// casse — personne ne retapera « quote_part » à l'identique.
//
// CE FICHIER NE SAIT RIEN DU MÉTIER. Il a été extrait de `import-parc.ts` le
// 18/09, le jour où la reprise comptable a eu besoin de la même lecture pour
// d'autres colonnes. Copié, il aurait divergé au premier correctif — et les
// correctifs, ici, viennent tous du même endroit : le fichier que le client
// dépose, et qui n'est jamais tout à fait celui qu'on attendait.

/** Une colonne du gabarit : clé interne, libellé affiché, obligatoire ou non. */
export type Colonne = readonly [cle: string, libelle: string, requise: boolean];

export type LigneCsv = Record<string, string>;

export type LectureCsv =
  | { erreur: string }
  | { lignes: LigneCsv[]; inconnues: string[]; manquantes: string[] };

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

/**
 * Découpe une ligne CSV en respectant les guillemets.
 * `"Durand; fils";Paul` rend deux champs, pas trois.
 */
export function decouper(ligne: string, sep: string): string[] {
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

/** Le gabarit d'un jeu de colonnes : en-tête, plus une ligne d'exemple. */
export function gabarit(colonnes: readonly Colonne[], exemple: readonly string[]): string {
  const entete = colonnes.map(([, libelle]) => libelle).join(";");
  // Le BOM : sans lui, Excel ouvre les accents de travers.
  return `﻿${entete}\n${exemple.join(";")}\n`;
}

/** Lit un CSV selon un jeu de colonnes, et dit ce qu'il n'a pas compris. */
export function lire(colonnes: readonly Colonne[], contenu: string): LectureCsv {
  const parEntete = new Map<string, string>(
    colonnes.flatMap(([cle, libelle]) => [
      [normaliser(cle), cle],
      [normaliser(sansParenthese(libelle)), cle],
    ])
  );
  const cleDeLEntete = (entete: string): string | null =>
    parEntete.get(normaliser(entete)) ?? parEntete.get(normaliser(sansParenthese(entete))) ?? null;

  const texte = contenu.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const brutes = texte.split("\n").filter((l) => l.trim().length > 0);
  if (brutes.length === 0) return { erreur: "Le fichier est vide." };

  // Le séparateur : Excel francophone écrit des points-virgules, les exports
  // anglo-saxons des virgules.
  //
  // On ne peut PAS se contenter de « celui qui découpe le plus l'en-tête » :
  // un libellé de colonne qui contient des virgules — « Type (appartement,
  // maison, immeuble…) » — ferait gagner la virgule sur un fichier pourtant
  // séparé par des points-virgules, et tout le fichier serait lu de travers.
  // On demande donc l'ACCORD entre l'en-tête et la première ligne de données :
  // le bon séparateur est celui qui découpe les deux en autant de champs.
  const candidats = [";", ",", "\t"].map((s) => ({
    s,
    n: decouper(brutes[0], s).length,
    accord: brutes.length > 1 && decouper(brutes[1], s).length === decouper(brutes[0], s).length,
  }));
  const sep = candidats
    .filter((c) => c.n > 1)
    .sort((a, b) => Number(b.accord) - Number(a.accord) || b.n - a.n)[0]?.s ?? ";";

  const entetes = decouper(brutes[0], sep);
  const cles = entetes.map(cleDeLEntete);
  const inconnues = entetes.filter((_, i) => cles[i] === null && entetes[i] !== "");
  const presentes = new Set(cles.filter(Boolean) as string[]);
  const manquantes = colonnes
    .filter(([cle, , requise]) => requise && !presentes.has(cle))
    .map(([, libelle]) => libelle);
  if (presentes.size === 0) {
    return {
      erreur:
        "Aucune colonne reconnue : la première ligne du fichier doit porter les en-têtes du gabarit.",
    };
  }

  const lignes: LigneCsv[] = [];
  for (const brute of brutes.slice(1)) {
    const champs = decouper(brute, sep);
    const ligne: LigneCsv = {};
    cles.forEach((cle, i) => {
      if (cle) ligne[cle] = champs[i] ?? "";
    });
    // Une ligne entièrement vide (ligne de séparation dans le tableur) n'est
    // pas une erreur : elle n'existe pas.
    if (Object.values(ligne).some((v) => v !== "")) lignes.push(ligne);
  }
  return { lignes, inconnues, manquantes };
}
