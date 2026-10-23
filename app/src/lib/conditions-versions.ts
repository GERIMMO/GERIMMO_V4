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
//    la page est rendue avec une identité FICTIVE et FIXE ; l'empreinte de son texte contractuel, débarrassé des
//    classes et des styles (`formeDeReference`), et de la liste figée des sous-traitants (`listeFigeeSousTraitants`)
//    doit être celle que le fichier JSON donne pour la version en vigueur. Un mot changé sans nouvelle version fait
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
import { CONDITIONS_DATE, CONDITIONS_VERSION, PRESTATAIRES, type Prestataire } from "./editeur";

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
 * Les conditions de l'espace artisan s'ajouteront ici avec leur page (tests/conditions-empreinte.test.ts le réclame
 * dès que src/app/conditions/artisans/page.tsx existe).
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
];

/** L'attribut qui délimite le texte contractuel dans la page (components/coquille-legale.tsx). */
export const ATTRIBUT_TEXTE = "data-texte-contractuel";
/** La version affichée par la page, portée par le même élément. */
export const ATTRIBUT_VERSION = "data-version";

/** Une version telle que le code la déclare (conditions-versions.json). */
export type VersionDeclaree = {
  date_effet: string;
  nature: "substantielle" | "technique";
  resume_modifications: string;
  /** Empreinte de référence du texte rendu avec l'identité fictive des tests : garde du code, pas l'empreinte archivée. */
  empreinte_reference: string;
  /** Pourquoi l'empreinte a été relevée de nouveau sans changer de version, avec la décision qui l'autorise. */
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

/** La liste figée des sous-traitants : ce que le code déclare, sans les coordonnées saisies en base. */
export function listeFigeeSousTraitants(liste: readonly Prestataire[] = PRESTATAIRES) {
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

// ── Extraction du texte contractuel d'une page ─────────────────────────────────────────────────────────────────

export type Extraction =
  | { ok: true; html: string; version: string | null }
  | { ok: false; motif: "absent" | "plusieurs" | "non_ferme" | "contenu_actif" };

/**
 * Le texte contractuel d'une page HTML : le contenu de l'unique `<div data-texte-contractuel="<document>">`, normalisé.
 * React échappe `<` dans les textes et les attributs : une balise `div` du flux est une vraie balise, et l'élément se
 * referme au `</div>` qui ramène la profondeur à zéro. Refuse un texte qui porterait du code actif (script, cadre,
 * gestionnaire d'événement) : la page des versions l'afficherait tel quel.
 */
export function extraireTexteContractuel(page: string, document: DocumentConditions): Extraction {
  const ouverture = new RegExp(`<div\\b[^>]*\\b${ATTRIBUT_TEXTE}="${document}"[^>]*>`, "g");
  const trouves = [...page.matchAll(ouverture)];
  if (trouves.length === 0) return { ok: false, motif: "absent" };
  if (trouves.length > 1) return { ok: false, motif: "plusieurs" };
  const [balise] = trouves;
  const debut = (balise.index ?? 0) + balise[0].length;
  const version = new RegExp(`\\b${ATTRIBUT_VERSION}="([^"]*)"`).exec(balise[0])?.[1] ?? null;
  const divs = /<(\/?)div\b[^>]*>/gi;
  divs.lastIndex = debut;
  let profondeur = 1;
  for (let m = divs.exec(page); m; m = divs.exec(page)) {
    profondeur += m[1] ? -1 : 1;
    if (profondeur === 0) {
      const html = normaliserHtml(page.slice(debut, m.index));
      if (/<(?:script|iframe|object|embed|form)\b|\son[a-z]+\s*=|javascript:/i.test(html)) return { ok: false, motif: "contenu_actif" };
      return { ok: true, html, version };
    }
  }
  return { ok: false, motif: "non_ferme" };
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

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « 30 septembre 2026 » pour la date « 2026-09-30 » (jour civil, sans fuseau) ; la valeur telle quelle sinon. */
export function dateEnLettres(jour: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour);
  if (!m) return jour;
  const mois = MOIS[Number(m[2]) - 1];
  return mois ? `${Number(m[3])} ${mois} ${m[1]}` : jour;
}
