/**
 * Base de données simulée EN MÉMOIRE, qui applique réellement les filtres.
 *
 * Les maquettes d'avant renvoyaient la table entière quel que soit le filtre (`eq`, `gte`, `in`… ne faisaient rien) et `maybeSingle()`
 * renvoyait toujours la première ligne : retirer un filtre d'organisation, d'année ou de lot ne faisait tomber aucun test. Ici :
 *  · `eq`, `neq`, `is`, `not`, `in`, `gt`, `gte`, `lt`, `lte` retirent vraiment les lignes qui ne conviennent pas ;
 *  · `order`, `limit`, `range` trient et découpent ; `select("a, b")` ne rend que les colonnes demandées ;
 *  · `maybeSingle()` / `single()` refusent plusieurs lignes comme PostgREST ;
 *  · tout ce qui n'est pas simulé (`or`, `ilike`, `update`…) LÈVE une erreur au lieu de passer pour un succès silencieux ;
 *  · chaque lecture est consignée (table, filtres, valeurs) pour pouvoir affirmer qu'un filtre est posé : voir `filtresDe` et
 *    `lecturesSansFiltre`.
 * Les lignes de test portent leurs colonnes réelles (notamment `organization_id`) : un filtre d'organisation oublié laisse alors passer
 * les lignes d'une autre organisation, et le test le voit.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type Ligne = Record<string, unknown>;
export type Filtre = { op: string; col: string; val: unknown };
export type Lecture = { table: string; colonnes: string; filtres: Filtre[]; ordre: { col: string; croissant: boolean }[]; limite: number | null; plage: [number, number] | null };
export type Ecriture = { table: string; op: string; valeurs: unknown };
type Reponse = { data: unknown; error: { message: string } | null };

export type OptionsBase = {
  /** Fonctions SQL appelables (`supabase.rpc`). Toute autre est refusée. */
  rpc?: Record<string, (args: Record<string, unknown>) => Reponse | Promise<Reponse>>;
  /** Remplace l'ajout par défaut (la ligne est ajoutée à la table) : utile pour simuler un refus. */
  inserer?: (table: string, valeurs: unknown) => { error: { message: string } | null } | void;
};

const NON_SIMULEES = ["or", "ilike", "like", "contains", "containedBy", "overlaps", "textSearch", "match", "filter", "csv", "returns", "abortSignal"];
const ECRITURES_NON_SIMULEES = ["update", "upsert", "delete"];

function comparer(a: unknown, b: unknown): number {
  if (typeof a === "number" || typeof b === "number") return Number(a) - Number(b);
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function convient(ligne: Ligne, f: Filtre): boolean {
  const v = ligne[f.col];
  switch (f.op) {
    case "eq": return v === f.val;
    case "neq": return v !== f.val;
    case "is": return f.val === null ? v === null || v === undefined : v === f.val;
    case "in": return (f.val as unknown[]).includes(v);
    case "gt": return v != null && comparer(v, f.val) > 0;
    case "gte": return v != null && comparer(v, f.val) >= 0;
    case "lt": return v != null && comparer(v, f.val) < 0;
    case "lte": return v != null && comparer(v, f.val) <= 0;
    case "not.is": return !convient(ligne, { ...f, op: "is" });
    case "not.eq": return !convient(ligne, { ...f, op: "eq" });
    case "not.in": return !convient(ligne, { ...f, op: "in" });
    default: throw new Error(`Filtre non simulé : ${f.op}`);
  }
}

export function baseSimulee(tables: Record<string, Ligne[]>, options: OptionsBase = {}) {
  const lectures: Lecture[] = [];
  const ecritures: Ecriture[] = [];

  function from(table: string) {
    const lecture: Lecture = { table, colonnes: "*", filtres: [], ordre: [], limite: null, plage: null };
    let lue = false;
    const executer = (): Ligne[] => {
      if (!lue) { lectures.push(lecture); lue = true; }
      let lignes = (tables[table] ?? []).filter((l) => lecture.filtres.every((f) => convient(l, f)));
      for (const { col, croissant } of [...lecture.ordre].reverse()) {
        lignes = [...lignes].sort((a, b) => {
          if (a[col] == null && b[col] == null) return 0;
          if (a[col] == null) return 1;
          if (b[col] == null) return -1;
          return (croissant ? 1 : -1) * comparer(a[col], b[col]);
        });
      }
      if (lecture.plage) lignes = lignes.slice(lecture.plage[0], lecture.plage[1] + 1);
      if (lecture.limite !== null) lignes = lignes.slice(0, lecture.limite);
      if (lecture.colonnes === "*") return lignes.map((l) => ({ ...l }));
      if (lecture.colonnes.includes("(")) throw new Error(`Lecture imbriquée non simulée : ${lecture.colonnes}`);
      const colonnes = lecture.colonnes.split(",").map((c) => c.trim()).filter(Boolean);
      return lignes.map((l) => Object.fromEntries(colonnes.map((c) => [c, l[c]])));
    };
    const requete: Record<string, unknown> = {
      select(colonnes = "*") { lecture.colonnes = colonnes; return requete; },
      order(col: string, opts?: { ascending?: boolean }) { lecture.ordre.push({ col, croissant: opts?.ascending !== false }); return requete; },
      limit(n: number) { lecture.limite = n; return requete; },
      range(de: number, a: number) { lecture.plage = [de, a]; return requete; },
      not(col: string, op: string, val: unknown) { lecture.filtres.push({ op: `not.${op}`, col, val }); return requete; },
      maybeSingle: async (): Promise<Reponse> => {
        const lignes = executer();
        if (lignes.length > 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
        return { data: lignes[0] ?? null, error: null };
      },
      single: async (): Promise<Reponse> => {
        const lignes = executer();
        if (lignes.length !== 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
        return { data: lignes[0], error: null };
      },
      then(resolve: (r: Reponse) => unknown, rejeter?: (e: unknown) => unknown) {
        try { return Promise.resolve({ data: executer(), error: null } as Reponse).then(resolve, rejeter); }
        catch (e) { return Promise.reject(e).then(resolve, rejeter); }
      },
      insert(valeurs: unknown) {
        ecritures.push({ table, op: "insert", valeurs });
        const surcharge = options.inserer?.(table, valeurs);
        if (!surcharge) (tables[table] ??= []).push(...(Array.isArray(valeurs) ? valeurs : [valeurs]) as Ligne[]);
        return Promise.resolve({ data: null, error: surcharge?.error ?? null });
      },
    };
    for (const op of ["eq", "neq", "is", "in", "gt", "gte", "lt", "lte"]) {
      requete[op] = (col: string, val: unknown) => { lecture.filtres.push({ op, col, val }); return requete; };
    }
    for (const op of NON_SIMULEES) requete[op] = () => { throw new Error(`Opération non simulée : ${op} (la base simulée ne laisse rien passer en silence)`); };
    for (const op of ECRITURES_NON_SIMULEES) requete[op] = (valeurs?: unknown) => { ecritures.push({ table, op, valeurs }); throw new Error(`Écriture non simulée : ${op} sur ${table}`); };
    return requete;
  }

  const client = {
    from,
    rpc: async (nom: string, args: Record<string, unknown> = {}) => {
      const fonction = options.rpc?.[nom];
      if (!fonction) throw new Error(`Fonction non simulée : ${nom}`);
      return fonction(args);
    },
  } as unknown as SupabaseClient;
  return { client, lectures, ecritures, tables };
}

export type BaseSimulee = ReturnType<typeof baseSimulee>;

/** Les filtres posés par la (les) lecture(s) de cette table, tous appels confondus. */
export const filtresDe = (base: BaseSimulee, table: string): Filtre[] => base.lectures.filter((l) => l.table === table).flatMap((l) => l.filtres);

/** Les lectures de tables à organisation qui ne sont pas bornées à l'organisation donnée (liste vide = toutes le sont). */
export function lecturesSansFiltreOrganisation(base: BaseSimulee, orgId: string, horsOrganisation: string[] = ["organizations"]): string[] {
  return base.lectures
    .filter((l) => !horsOrganisation.includes(l.table) && !l.filtres.some((f) => f.op === "eq" && f.col === "organization_id" && f.val === orgId))
    .map((l) => l.table);
}
