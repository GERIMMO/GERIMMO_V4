/**
 * Tests d'intégration — Aucun embed PostgREST ambigu (11/09).
 *
 * Le schéma porte, pour beaucoup de tables, DEUX clés étrangères vers la même
 * cible : la clé simple (`ecritures_lot_id_fkey`) et la clé composite qui
 * garde l'agence cohérente (`ecritures_lot_meme_org_fk`). Quand une requête
 * imbrique cette cible sans dire LAQUELLE suivre, PostgREST refuse d'arbitrer
 * et rend PGRST201 — l'écran affiche alors une erreur, ou pire, un vide qui
 * ressemble à « rien à signaler ».
 *
 * Trois requêtes étaient dans ce cas le 11/09 : l'export CSV du journal de
 * gestion (500), les détentions de la fiche bien, et la veille DPE de
 * l'accueil propriétaire — celle-ci en silence complet.
 *
 * Ce test relit les paires ambiguës DANS LA BASE (elles changent avec le
 * schéma) et les confronte au code source. Il échoue aussi s'il n'arrive pas à
 * lire un `select` : une requête illisible ne doit jamais passer pour une
 * requête saine.
 *
 * Nécessite SUPABASE_DB_URL. Lecture seule.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const RACINE = path.resolve(__dirname, "..", "src");

/** Retire les commentaires sans toucher au contenu des chaînes. */
function sansCommentaires(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < s.length && s[j] !== c) j += s[j] === "\\" ? 2 : 1;
      out += s.slice(i, j + 1);
      i = j + 1;
    } else if (s.startsWith("//", i)) {
      const j = s.indexOf("\n", i);
      i = j < 0 ? s.length : j;
    } else if (s.startsWith("/*", i)) {
      const j = s.indexOf("*/", i);
      i = j < 0 ? s.length : j + 2;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** Contenu de l'appel ouvrant à `s[i] === "("`, et l'indice qui suit. */
function argumentsDe(s: string, i: number): string {
  let d = 0;
  for (let j = i; j < s.length; j += 1) {
    const c = s[j];
    if (c === '"' || c === "'" || c === "`") {
      j += 1;
      while (j < s.length && s[j] !== c) j += s[j] === "\\" ? 2 : 1;
    } else if (c === "(") d += 1;
    else if (c === ")") {
      d -= 1;
      if (d === 0) return s.slice(i + 1, j);
    }
  }
  return s.slice(i + 1);
}

/** Découpe une liste d'arguments JS : virgules hors chaînes et hors groupes. */
function decouperArguments(s: string): string[] {
  const parts: string[] = [];
  let d = 0;
  let cur = "";
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < s.length && s[j] !== c) j += s[j] === "\\" ? 2 : 1;
      cur += s.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") d += 1;
    else if (c === ")" || c === "]" || c === "}") d -= 1;
    if (c === "," && d === 0) {
      parts.push(cur);
      cur = "";
    } else cur += c;
    i += 1;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const CHAINE = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;

/**
 * Concatène les littéraux d'une expression (`"a" + "b"`, gabarit sans `${}`,
 * ou une constante du même fichier). `null` si l'expression reste dynamique :
 * l'appelant doit alors le signaler, jamais l'ignorer.
 */
function litteral(expr: string, constantes: Map<string, string>): string | null {
  const nom = expr.trim();
  if (constantes.has(nom)) return constantes.get(nom)!;
  // Un gabarit qui n'interpole que des constantes connues du fichier reste
  // lisible : `person:persons!fk(${CHAMPS_PERSONNE})` en est un.
  let resolue = expr;
  if (resolue.includes("${")) {
    resolue = resolue.replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (tout, ref: string) =>
      constantes.has(ref) ? constantes.get(ref)! : tout
    );
    if (resolue.includes("${")) return null;
  }
  const morceaux = [...resolue.matchAll(CHAINE)].map((m) => m[1] ?? m[2] ?? m[3]);
  const reste = resolue.replace(CHAINE, "").replace(/[\s+]/g, "");
  if (reste) return null;
  return morceaux.join("");
}

/** Les `const X = "…"` du fichier, pour les `select(COLONNES)`. */
function constantesDe(src: string): Map<string, string> {
  const m = new Map<string, string>();
  const rx = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)(?:\s*\+\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`))*)\s*;/g;
  for (const x of src.matchAll(rx)) {
    const v = litteral(x[2], new Map());
    if (v !== null) m.set(x[1], v);
  }
  return m;
}

/** Découpe un `select` PostgREST au premier niveau de parenthèses. */
function decouperSelect(sel: string): string[] {
  const parts: string[] = [];
  let d = 0;
  let cur = "";
  for (const ch of sel) {
    if (ch === "(") d += 1;
    else if (ch === ")") d -= 1;
    if (ch === "," && d === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

// `!inner` et `!left` choisissent le TYPE de jointure ; ils ne désignent
// aucune clé et ne lèvent donc aucune ambiguïté.
const TYPES_DE_JOINTURE = new Set(["inner", "left"]);

type Embed = { parent: string; cible: string; chemin: string };

function embeds(table: string, sel: string, chemin: string, out: Embed[]): void {
  for (const p of decouperSelect(sel)) {
    const i = p.indexOf("(");
    if (i < 0) continue; // colonne simple
    const corps = p.slice(i + 1, p.lastIndexOf(")"));
    let tete = p.slice(0, i).trim();
    let alias: string | null = null;
    if (tete.includes(":")) {
      const k = tete.indexOf(":");
      alias = tete.slice(0, k).trim();
      tete = tete.slice(k + 1).trim();
    }
    const bouts = tete.split("!").map((x) => x.trim());
    const cible = bouts[0];
    const cle = bouts.slice(1).filter((x) => !TYPES_DE_JOINTURE.has(x));
    const sous = `${chemin} > ${alias ?? cible}`;
    if (cle.length === 0) out.push({ parent: table, cible, chemin: sous });
    embeds(cible, corps, sous, out);
  }
}

function fichiers(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return fichiers(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

type Requete = { fichier: string; table: string; select: string | null };

function requetes(): Requete[] {
  const res: Requete[] = [];
  for (const f of fichiers(RACINE)) {
    const src = sansCommentaires(fs.readFileSync(f, "utf8"));
    const consts = constantesDe(src);
    const rx = /\.from\(\s*["'`]([a-z_0-9]+)["'`]\s*\)/g;
    for (const m of src.matchAll(rx)) {
      const debut = m.index! + m[0].length;
      const reste = src.slice(debut, debut + 4000);
      const s = /\.select\s*\(/.exec(reste);
      if (!s) continue;
      // un autre `.from(` intercalé signale une requête différente
      if (reste.slice(0, s.index).includes(".from(")) continue;
      const args = argumentsDe(reste, s.index + s[0].length - 1);
      const premier = decouperArguments(args)[0] ?? "";
      const ligne = src.slice(0, m.index!).split("\n").length;
      res.push({
        fichier: `${path.relative(path.join(RACINE, ".."), f)}:${ligne}`,
        table: m[1],
        select: litteral(premier, consts),
      });
    }
  }
  return res;
}

describe("embeds PostgREST", () => {
  let db: Client;
  let ambigues: Set<string>;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    const { rows } = await db.query<{ source: string; cible: string }>(`
      select c.conrelid::regclass::text as source, c.confrelid::regclass::text as cible
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      where c.contype = 'f' and n.nspname = 'public'
      group by 1, 2
      having count(*) > 1`);
    ambigues = new Set(rows.map((r) => `${r.source}→${r.cible}`));
  });

  afterAll(async () => {
    await db?.end();
  });

  it("le schéma comporte bien des relations multiples (sinon ce test ne prouve rien)", () => {
    expect(ambigues.size).toBeGreaterThan(0);
  });

  it("chaque select du code est lisible par ce test", () => {
    const illisibles = requetes()
      .filter((r) => r.select === null)
      .map((r) => `${r.fichier} — from(${r.table})`);
    // Un select construit dynamiquement échapperait au contrôle ci-dessous :
    // il doit rester un littéral (ou une constante du fichier).
    expect(illisibles).toEqual([]);
  });

  it("aucune imbrication ne laisse PostgREST arbitrer entre deux clés", () => {
    const fautes: string[] = [];
    for (const r of requetes()) {
      if (r.select === null) continue;
      const out: Embed[] = [];
      embeds(r.table, r.select, r.table, out);
      for (const e of out) {
        if (ambigues.has(`${e.parent}→${e.cible}`)) {
          fautes.push(`${r.fichier} — ${e.parent} → ${e.cible} (${e.chemin}) : préciser !clé`);
        }
      }
    }
    expect(fautes).toEqual([]);
  });
});
