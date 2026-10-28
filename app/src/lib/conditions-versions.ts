// LES VERSIONS DES CONDITIONS (24/10/2026, plan de conformité du 23/10, constat R12).
//
// Ce qui a été accepté ne doit plus pouvoir changer. Deux mécanismes, deux empreintes à ne pas confondre :
//
// 1. L'ARCHIVE (table `versions_conditions`, ajout seul). Le super-administrateur archive la page PUBLIÉE : l'action
//    serveur lit /conditions en ligne, telle qu'un visiteur la reçoit (identité de l'éditeur lue en base comprise), en
//    extrait le texte contractuel (`extraireTexteContractuel`), le normalise (`normaliserHtml`) et le range avec son
//    empreinte SHA-256 — que la base recalcule. Quiconque relit une version archivée peut refaire le calcul :
//    empreinte = SHA-256 (hexadécimal) des octets UTF-8 de `texte_html`, tel qu'il est rangé.
//
// 2. LA GARDE DU CODE (`conditions-versions.json`, test tests/conditions-empreinte.test.ts). En intégration continue,
//    la page est rendue sous plusieurs identités FICTIVES et FIXES (une par branche du texte qui dépend de l'identité :
//    médiateur désigné ou non, coordonnées manquantes, identité vide…) ; l'empreinte de ces textes contractuels,
//    débarrassés des classes et des styles (`formeDeReference`), et de la liste figée des sous-traitants
//    (`listeFigeeSousTraitants`) — `empreinteDeGarde` — doit être celle que le fichier JSON donne pour la version. Un mot changé sans nouvelle version fait
//    échouer le test. Cette empreinte de référence ne vaut que pour le code : elle diffère de celle de l'archive, qui
//    porte l'identité réelle.
//
// Pourquoi le rendu plutôt que la source des pages : le texte des conditions vient aussi d'autres fichiers (date de la
// version, régime de TVA et prestataires de lib/editeur.ts, paragraphes du médiateur de components/coquille-legale.tsx),
// qu'une empreinte de page.tsx seule ne verrait pas ; et un commentaire ou un import réordonné ne change pas le contrat.
// Le rendu est aussi déterministe : identité figée, aucune date du jour dans la page.
//
// Ce module ne lit pas la base lui-même, sauf `lireVersionArchivee` / `listerVersionsArchivees`, qui prennent le
// client de l'appelant (la lecture est publique). Il importe `node:crypto` : réservé au serveur et aux tests.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import versions from "./conditions-versions.json";
import { aujourdhuiParis } from "./dates";
import {
  CONDITIONS_ARTISANS_DATE,
  CONDITIONS_ARTISANS_VERSION,
  CONDITIONS_DATE,
  CONDITIONS_VERSION,
  sousTraitantsClient,
  type Prestataire,
} from "./editeur";

/** Les documents qui s'archivent. Les règles des espaces invités s'acceptent sans version archivée. */
export const DOCUMENTS_CONDITIONS = ["conditions_clients", "conditions_artisans"] as const;
export type DocumentConditions = (typeof DOCUMENTS_CONDITIONS)[number];

export const LIBELLE_DOCUMENT: Record<DocumentConditions, string> = {
  conditions_clients: "Conditions générales d’utilisation et de vente",
  conditions_artisans: "Conditions de l’espace artisan",
};

export function estDocumentConditions(valeur: unknown): valeur is DocumentConditions {
  return typeof valeur === "string" && (DOCUMENTS_CONDITIONS as readonly string[]).includes(valeur);
}

/**
 * Les documents dont une page est publiée aujourd'hui, la version que le code y affiche et le fichier de la page.
 * Les conditions de l'espace artisan (plan de conformité du 23/10, R10) y entrent dès que leur version est fixée
 * (CONDITIONS_ARTISANS_VERSION) : la garde du code les empreinte et l'archivage les range comme les conditions clients.
 */
export const DOCUMENTS_PUBLIES: readonly {
  document: DocumentConditions;
  chemin: string;
  version: string;
  dateAffichee: string;
  fichier: string;
}[] = [
  {
    document: "conditions_clients",
    chemin: "/conditions",
    version: CONDITIONS_VERSION,
    dateAffichee: CONDITIONS_DATE,
    fichier: "src/app/conditions/page.tsx",
  },
  ...(CONDITIONS_ARTISANS_VERSION && CONDITIONS_ARTISANS_DATE
    ? [
        {
          document: "conditions_artisans" as const,
          chemin: "/conditions/artisans",
          version: CONDITIONS_ARTISANS_VERSION,
          dateAffichee: CONDITIONS_ARTISANS_DATE,
          fichier: "src/app/conditions/artisans/page.tsx",
        },
      ]
    : []),
];

/** L'attribut qui délimite le texte contractuel dans la page (components/coquille-legale.tsx). */
export const ATTRIBUT_TEXTE = "data-texte-contractuel";
/** La version affichée par la page, portée par le même élément. */
export const ATTRIBUT_VERSION = "data-version";
/**
 * L'identité de l'éditeur avec laquelle la page a été rendue, portée par le même élément, HORS du texte archivé
 * (relecture adverse du 24/10, I1) : « 1 » si la page a pu la lire en base, « 0 » si elle a été rendue sans (texte
 * dégradé : mentions « à venir », encadré « Document en cours de finalisation ») ; et son empreinte
 * (`empreinteIdentite`). L'action d'archivage compare cette empreinte à celle de l'identité qu'elle lit elle-même.
 */
export const ATTRIBUT_IDENTITE_LUE = "data-identite-lue";
export const ATTRIBUT_IDENTITE_EMPREINTE = "data-identite-empreinte";

/** Une version telle que le code la déclare (conditions-versions.json). */
export type VersionDeclaree = {
  date_effet: string;
  nature: "substantielle" | "technique";
  resume_modifications: string;
  /** Empreinte de référence du texte rendu avec l'identité fictive des tests : garde du code, pas l'empreinte archivée. */
  empreinte_reference: string;
  /** Les empreintes de référence relevées avant celle-ci sous la même version (la plus ancienne d'abord). */
  empreintes_precedentes?: string[];
  /**
   * Pourquoi l'empreinte a été relevée de nouveau sans changer de version, avec la décision qui l'autorise. Obligatoire
   * dès que `empreintes_precedentes` n'est pas vide (tests/conditions-empreinte.test.ts).
   */
  note?: string;
};

// Le JSON n'a pas de type : sa forme est vérifiée par tests/conditions-empreinte.test.ts (nature, dates, empreintes).
const DECLAREES = versions as unknown as Partial<Record<DocumentConditions, Record<string, VersionDeclaree>>>;

/** Toutes les versions déclarées par le code, pour la vérification de forme. */
export function versionsDeclarees(): [DocumentConditions, string, VersionDeclaree][] {
  return Object.entries(DECLAREES).flatMap(([document, parVersion]) =>
    Object.entries(parVersion ?? {}).map(([version, v]) => [document as DocumentConditions, version, v] as [DocumentConditions, string, VersionDeclaree])
  );
}

/** Ce que le code déclare d'une version, ou `null`. */
export function versionDeclaree(document: DocumentConditions, version: string): VersionDeclaree | null {
  return DECLAREES[document]?.[version] ?? null;
}

// ── Normalisation et empreinte ─────────────────────────────────────────────────────────────────────────────────

/**
 * La forme rangée dans l'archive : commentaires HTML retirés (React en sème entre deux textes voisins, sans effet sur
 * la lecture), composition Unicode NFC, blancs HTML (espace, tabulation, retours) réduits à une espace. Les espaces
 * insécables de la typographie française ne sont PAS des blancs HTML : elles restent.
 */
export function normaliserHtml(html: string): string {
  return html
    .normalize("NFC")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[ \t\n\r\f]+/g, " ")
    .trim();
}

/** La forme de la garde du code : la forme rangée, sans attributs de présentation (classes, styles). */
export function formeDeReference(html: string): string {
  return normaliserHtml(html).replace(/ (?:class|style)="[^"]*"/g, "");
}

/** SHA-256 hexadécimal des octets UTF-8 d'un texte, comme `encode(sha256(convert_to(t, 'UTF8')), 'hex')` en base. */
export function sha256Hex(texte: string): string {
  return createHash("sha256").update(texte, "utf8").digest("hex");
}

/**
 * La liste figée des sous-traitants : ce que le code déclare, sans les coordonnées saisies en base. Depuis la V1
 * (plan de conformité du 23/10, R11), ce sont les seuls sous-traitants ultérieurs des annexes « article 28 »
 * (`sousTraitantsClient`, rôle propre au Client compris), et non plus tous les prestataires du site.
 */
export function listeFigeeSousTraitants(liste: readonly Prestataire[] = sousTraitantsClient()) {
  return liste.map((p) => ({
    cle: p.cle,
    nom: p.nom,
    role: p.role,
    localisation: p.localisation,
    documentation: p.documentation ?? null,
  }));
}

/** L'empreinte de la garde du code : texte contractuel rendu (forme de référence) et liste figée des sous-traitants. */
export function empreinteDeReference(
  texteContractuel: string,
  sousTraitants: ReturnType<typeof listeFigeeSousTraitants> = listeFigeeSousTraitants()
): string {
  return sha256Hex(`${formeDeReference(texteContractuel)}\n--- sous-traitants ---\n${JSON.stringify(sousTraitants)}`);
}

// ── Reconstitution d'une page rendue en flux ───────────────────────────────────────────────────────────────────

/** La balise fermante qui referme l'élément `balise` dont la balise ouvrante finit à `debut` : position et longueur. */
function fermetureDe(page: string, debut: number, balise = "div"): { index: number; longueur: number } | null {
  const motif = new RegExp(`<(\\/?)${balise}\\b[^>]*>`, "gi");
  motif.lastIndex = debut;
  let profondeur = 1;
  for (let m = motif.exec(page); m; m = motif.exec(page)) {
    profondeur += m[1] ? -1 : 1;
    if (profondeur === 0) return { index: m.index, longueur: m[0].length };
  }
  return null;
}

/**
 * Le commentaire `<!--/$-->` qui referme la frontière d'attente ouverte juste avant `debut`, compté comme le fait le
 * script `$RV` de React (frontières imbriquées `$`, `$?`, `$~`, `$!`, activités `&`) ; -1 s'il manque.
 */
function finDeFrontiere(page: string, debut: number): number {
  const commentaires = /<!--([\s\S]*?)-->/g;
  commentaires.lastIndex = debut;
  let profondeur = 0;
  for (let m = commentaires.exec(page); m; m = commentaires.exec(page)) {
    const marque = m[1];
    if (marque === "/$" || marque === "/&") {
      if (profondeur === 0) return m.index;
      profondeur--;
    } else if (marque === "$" || marque === "$?" || marque === "$~" || marque === "$!" || marque === "&") {
      profondeur++;
    }
  }
  return -1;
}

/**
 * Les enveloppes d'un segment caché, selon le contexte où React l'insère (`startSegment*` de react-dom/server) :
 * `<div hidden id="S:n">` dans le corps, `<table hidden id>`, `<table hidden><tbody id>` (lignes d'un tableau, comme
 * l'annexe des prestataires), `<table hidden><tr id>`, `<table hidden><colgroup id>`, et `<svg|math … id>`.
 */
const SEGMENT_CACHE =
  /<(div|table) hidden(?:="")? id="(S:[0-9a-zA-Z]+)">|<table hidden(?:="")?><(tbody|tr|colgroup) id="(S:[0-9a-zA-Z]+)">|<(svg|math) aria-hidden="true" style="display:none" id="(S:[0-9a-zA-Z]+)">/g;
const MARQUE_A_REMPLIR = /<template id="(P:[0-9a-zA-Z]+)"><\/template>|<!--\$\?--><template id="(B:[0-9a-zA-Z]+)"><\/template>/g;
/** Ce qu'une page entièrement reconstituée ne contient plus : marque vide, segment caché, frontière en attente ou en erreur. */
const RESTE_DE_FLUX = /<template\b|\sid="[PSB]:[0-9a-zA-Z]+"|<!--\$[?!~]-->/;

/**
 * La page telle qu'un navigateur l'affiche une fois le flux arrivé (relecture adverse du 24/10, B1).
 *
 * Next.js envoie la page EN FLUX (React 19, Fizz) : l'ossature d'abord, avec des marques vides
 * `<template id="P:n"></template>` à la place des passages pas encore prêts et, pour une frontière d'attente
 * (`loading.tsx`, `<Suspense>`), `<!--$?--><template id="B:n"></template>` suivi du texte d'attente ; puis chaque
 * passage dans un segment caché (`<div hidden id="S:n">`, ou `<table hidden><tbody id="S:n">` pour des lignes de
 * tableau, voir SEGMENT_CACHE), que le navigateur remet en place par `$RS("S:n","P:n")` (le passage remplace
 * la marque) ou `$RC("B:n","S:n")` (le passage remplace le texte d'attente de la frontière). Cette fonction rejoue ces
 * instructions sur le texte, sans exécuter aucun script : chaque segment n'est remis qu'une fois, à la place que
 * l'instruction lui donne, et ses propres marques sont remplies à leur tour.
 *
 * Ce qui ne peut pas être remis en place (segment ou instruction absents, frontière rendue par le navigateur après une
 * erreur, `$RX`) reste tel quel : `extraireTexteContractuel` refuse alors le texte (motif « incomplet »).
 */
export function reconstituerFlux(page: string): string {
  const passages = new Map<string, string>();
  const frontieres = new Map<string, string>();
  for (const script of page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const m of script[1].matchAll(/\$RS\("(S:[0-9a-zA-Z]+)","(P:[0-9a-zA-Z]+)"\)/g)) passages.set(m[2], m[1]);
    for (const m of script[1].matchAll(/\$R[CR]\("(B:[0-9a-zA-Z]+)","(S:[0-9a-zA-Z]+)"/g)) frontieres.set(m[1], m[2]);
  }

  // Les segments cachés, retirés de la page : ils n'y reviennent qu'à la place que leur instruction leur donne.
  const segments = new Map<string, string>();
  let ossature = "";
  let curseur = 0;
  const motifSegment = new RegExp(SEGMENT_CACHE.source, "g");
  for (let m = motifSegment.exec(page); m; m = motifSegment.exec(page)) {
    const balise = (m[1] ?? m[3] ?? m[5]).toLowerCase();
    const id = m[2] ?? m[4] ?? m[6];
    const debut = m.index + m[0].length;
    const fin = fermetureDe(page, debut, balise);
    if (!fin) break;
    let apres = fin.index + fin.longueur;
    // Les lignes et groupes de colonnes sont enveloppés d'un `<table hidden>` qui se referme juste après eux.
    if (m[3]) {
      if (!/^<\/table>/i.test(page.slice(apres, apres + 8))) break;
      apres += "</table>".length;
    }
    if (!segments.has(id)) segments.set(id, page.slice(debut, fin.index));
    ossature += page.slice(curseur, m.index);
    curseur = apres;
    motifSegment.lastIndex = curseur;
  }
  ossature += page.slice(curseur);
  if (segments.size === 0) return page;

  const utilises = new Set<string>();
  const prendre = (segment: string | undefined): string | null => {
    if (!segment || utilises.has(segment)) return null;
    const contenu = segments.get(segment);
    if (contenu === undefined) return null;
    utilises.add(segment);
    return contenu;
  };
  const remplir = (html: string, profondeur: number): string => {
    if (profondeur > 256) return html;
    const motif = new RegExp(MARQUE_A_REMPLIR.source, "g");
    let sortie = "";
    let i = 0;
    for (let m = motif.exec(html); m; m = motif.exec(html)) {
      if (m[1]) {
        const contenu = prendre(passages.get(m[1]));
        if (contenu === null) continue;
        sortie += html.slice(i, m.index) + remplir(contenu, profondeur + 1);
        i = m.index + m[0].length;
      } else {
        const fin = finDeFrontiere(html, m.index + m[0].length);
        if (fin < 0) continue;
        const contenu = prendre(frontieres.get(m[2]));
        if (contenu === null) continue;
        // Le texte d'attente disparaît ; la frontière devient une frontière achevée (`<!--$-->…<!--/$-->`).
        sortie += html.slice(i, m.index) + "<!--$-->" + remplir(contenu, profondeur + 1);
        i = fin;
        motif.lastIndex = fin;
      }
    }
    return sortie + html.slice(i);
  };
  return remplir(ossature, 0);
}

/**
 * L'empreinte d'une identité d'éditeur telle que les pages l'affichent (`identiteDepuisValeurs`) : SHA-256 de ses
 * paires clé-valeur, triées par clé. La page la pose sur le texte contractuel ; l'action la recalcule depuis la base.
 * Une révision ne suffirait pas : anon, qui rend la page publique, ne lit pas la colonne `revision`.
 */
export function empreinteIdentite(identite: Record<string, string | null>): string {
  const paires = Object.keys(identite)
    .sort()
    .map((cle) => [cle, identite[cle] ?? null]);
  return sha256Hex(JSON.stringify(paires));
}

/**
 * L'empreinte de la garde du code (relecture adverse du 24/10, I3) : le texte contractuel rendu sous CHAQUE variante
 * fictive de l'identité (médiateur désigné ou non, coordonnées manquantes, adresse de contact seule, identité vide…),
 * chacun sous la forme de référence et précédé du nom de sa variante, puis la liste figée des sous-traitants. Un seul
 * rendu laissait hors de la garde les passages qui n'apparaissent qu'avec certaines identités (le paragraphe du
 * médiateur désigné, que la décision du 23/10 activera sans changer de version).
 */
export function empreinteDeGarde(
  rendus: readonly { variante: string; html: string }[],
  sousTraitants: ReturnType<typeof listeFigeeSousTraitants> = listeFigeeSousTraitants()
): string {
  const textes = rendus.map((r) => `--- ${r.variante} ---\n${formeDeReference(r.html)}`).join("\n");
  return sha256Hex(`${textes}\n--- sous-traitants ---\n${JSON.stringify(sousTraitants)}`);
}

// ── Liste blanche du balisage archivé ──────────────────────────────────────────────────────────────────────────

/**
 * Relecture adverse du 24/10 (M1) : une liste de refus se contourne (`<img/onerror=…>`, `javascript&#58;`, `<svg>`,
 * `<meta http-equiv=refresh>`, `<style>`…), et la politique de sécurité du site admet les scripts en ligne. Le texte
 * rangé et affiché n'admet donc que ce que React écrit pour les conditions : ces balises, ces attributs entre guillemets
 * doubles, et des liens vers une page du site, une ancre, une adresse web ou une adresse électronique.
 */
const BALISES_ADMISES = new Set([
  "div", "section", "p", "h1", "h2", "h3", "h4", "b", "strong", "i", "em", "span", "small", "sup", "sub", "br",
  "a", "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  "blockquote", "abbr", "code", "hr",
]);
const ATTRIBUTS_ADMIS = new Set(["class", "data-libelle", "title", "aria-label", "aria-hidden", "colspan", "rowspan", "scope", "lang", "dir"]);
/** Un lien : chemin du site (pas `//`), ancre, adresse web ou électronique ; aucune entité autre que `&amp;`, aucun blanc. */
function lienAdmis(valeur: string): boolean {
  if (/[\s\\]|[\u0000-\u001f\u007f]|&(?!amp;)/.test(valeur)) return false;
  return /^(?:https:\/\/|http:\/\/|mailto:|#|\/(?![/\\]))/i.test(valeur);
}

/** Le texte ne contient-il que le balisage admis (voir BALISES_ADMISES) ? Sert à l'extraction et à l'affichage. */
export function balisageAdmis(html: string): boolean {
  const balise = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z][a-zA-Z0-9-]*="[^"<>]*")*)\s*(\/?)>/y;
  for (let i = html.indexOf("<"); i !== -1; ) {
    balise.lastIndex = i;
    const m = balise.exec(html);
    if (!m) return false;
    const nom = m[2].toLowerCase();
    if (!BALISES_ADMISES.has(nom)) return false;
    if (m[1] && (m[3] || m[4])) return false;
    for (const a of m[3].matchAll(/\s+([a-zA-Z][a-zA-Z0-9-]*)="([^"<>]*)"/g)) {
      const attribut = a[1].toLowerCase();
      if (attribut === "href" || attribut === "rel") {
        if (nom !== "a" || (attribut === "href" && !lienAdmis(a[2]))) return false;
      } else if (!ATTRIBUTS_ADMIS.has(attribut)) {
        return false;
      }
    }
    i = html.indexOf("<", m.index + m[0].length);
  }
  return true;
}

// ── Extraction du texte contractuel d'une page ─────────────────────────────────────────────────────────────────

export type Extraction =
  | {
      ok: true;
      html: string;
      version: string | null;
      /** La page a-t-elle pu lire l'identité de l'éditeur en base au moment du rendu ? */
      identiteLue: boolean;
      /** L'empreinte de l'identité affichée (`empreinteIdentite`), si la page l'a lue. */
      identiteEmpreinte: string | null;
    }
  | { ok: false; motif: "absent" | "plusieurs" | "non_ferme" | "incomplet" | "contenu_actif" };

/**
 * Le texte contractuel d'une page HTML : le contenu de l'unique `<div data-texte-contractuel="<document>">`, normalisé.
 * La page est d'abord reconstituée (`reconstituerFlux`) : le texte est celui qu'un navigateur affiche, pas l'ossature
 * du flux. Un texte qui garde une marque de flux (passage jamais arrivé) est refusé : rien d'incomplet ne s'archive.
 * React échappe `<` dans les textes et les attributs : une balise `div` du flux est une vraie balise, et l'élément se
 * referme au `</div>` qui ramène la profondeur à zéro. Refuse un texte dont le balisage sort de la liste blanche
 * (`balisageAdmis` : script, cadre, image, style, gestionnaire d'événement, lien qui n'est pas une adresse web…) : la
 * page des versions l'afficherait tel quel.
 */
export function extraireTexteContractuel(pagePubliee: string, document: DocumentConditions): Extraction {
  const page = reconstituerFlux(pagePubliee);
  const ouverture = new RegExp(`<div\\b[^>]*\\b${ATTRIBUT_TEXTE}="${document}"[^>]*>`, "g");
  const trouves = [...page.matchAll(ouverture)];
  if (trouves.length === 0) return { ok: false, motif: "absent" };
  if (trouves.length > 1) return { ok: false, motif: "plusieurs" };
  const [balise] = trouves;
  const debut = (balise.index ?? 0) + balise[0].length;
  const attribut = (nom: string) => new RegExp(`\\s${nom}="([^"]*)"`).exec(balise[0])?.[1] ?? null;
  const version = attribut(ATTRIBUT_VERSION);
  const identiteLue = attribut(ATTRIBUT_IDENTITE_LUE) === "1";
  const empreinte = attribut(ATTRIBUT_IDENTITE_EMPREINTE);
  const identiteEmpreinte = identiteLue && empreinte && /^[0-9a-f]{64}$/.test(empreinte) ? empreinte : null;
  const fin = fermetureDe(page, debut);
  if (!fin) return { ok: false, motif: "non_ferme" };
  const brut = page.slice(debut, fin.index);
  if (RESTE_DE_FLUX.test(brut)) return { ok: false, motif: "incomplet" };
  const html = normaliserHtml(brut);
  if (!balisageAdmis(html)) return { ok: false, motif: "contenu_actif" };
  return { ok: true, html, version, identiteLue, identiteEmpreinte };
}

// ── Lecture des versions archivées (lecture publique) ──────────────────────────────────────────────────────────

export type VersionArchivee = {
  document: DocumentConditions;
  version: string;
  date_effet: string;
  nature: "substantielle" | "technique";
  publiee_le: string;
  empreinte_sha256: string;
  resume_modifications: string;
};

const COLONNES_LISTE = "document, version, date_effet, nature, publiee_le, empreinte_sha256, resume_modifications";

/** Toutes les versions archivées, les plus récentes d'abord. `null` si la lecture échoue. */
export async function listerVersionsArchivees(db: SupabaseClient): Promise<VersionArchivee[] | null> {
  const { data, error } = await db
    .from("versions_conditions")
    .select(COLONNES_LISTE)
    .order("document")
    .order("date_effet", { ascending: false })
    .order("publiee_le", { ascending: false });
  return error ? null : ((data ?? []) as VersionArchivee[]);
}

/** Une version archivée, texte compris ; `null` si elle n'existe pas, `undefined` si la lecture échoue. */
export async function lireVersionArchivee(
  db: SupabaseClient,
  document: DocumentConditions,
  version: string
): Promise<(VersionArchivee & { texte_html: string }) | null | undefined> {
  const { data, error } = await db
    .from("versions_conditions")
    .select(`${COLONNES_LISTE}, texte_html`)
    .eq("document", document)
    .eq("version", version)
    .maybeSingle();
  if (error) return undefined;
  return (data as (VersionArchivee & { texte_html: string }) | null) ?? null;
}

/** Le jour de Paris (AAAA-MM-JJ) d'un instant ; `null` s'il est illisible. */
export function jourDeParis(instant: string | Date): string | null {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  return aujourdhuiParis(d);
}

/**
 * Le jour (Paris) où le texte d'une version a été relevé, s'il est POSTÉRIEUR à sa date d'effet ; `null` sinon
 * (relecture adverse du 24/10, I2). Une version archivée après sa date d'effet range le texte publié le jour du relevé :
 * sous la même version, des corrections ont pu intervenir entre-temps, et les pages des versions le disent.
 */
export function releveApresEffet(v: { date_effet: string; publiee_le: string }): string | null {
  const jour = jourDeParis(v.publiee_le);
  return jour && jour > v.date_effet ? jour : null;
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « 30 septembre 2026 » pour la date « 2026-09-30 » (jour civil, sans fuseau) ; la valeur telle quelle sinon. */
export function dateEnLettres(jour: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour);
  if (!m) return jour;
  const mois = MOIS[Number(m[2]) - 1];
  return mois ? `${Number(m[3])} ${mois} ${m[1]}` : jour;
}
